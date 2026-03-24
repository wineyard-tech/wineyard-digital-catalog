/**
 * scripts/load-csv-data.ts
 * Loads Estimate.csv and Invoice.csv exported from Zoho Books into Supabase.
 *
 * Run: npx tsx scripts/load-csv-data.ts
 *
 * Design notes:
 * - Both CSVs repeat header-level data on every line item row.
 *   We group by Estimate ID / Invoice ID to build one DB row per document.
 * - Line items are stored as JSONB arrays matching the CartItem shape used
 *   by the app's catalog types.
 * - Upsert (not insert) keyed on zoho_estimate_id / zoho_invoice_id to be
 *   safe for re-runs.
 * - Numeric fields default to 0 when empty or unparseable.
 * - All string fields are trimmed.
 */

import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";
import fs from "fs";
import path from "path";

// ── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = "https://owbceumuadpclzwtwmzx.supabase.co";
const SUPABASE_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93YmNldW11YWRwY2x6d3R3bXp4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzU2OTEyNCwiZXhwIjoyMDg5MTQ1MTI0fQ.SliNWuM-yP-WmzKkiA63RpXUHWp5sWu4nL0sniMqcgM";

const CSV_DIR = path.join(import.meta.dirname, "../.claude");
const ESTIMATE_CSV = path.join(CSV_DIR, "Estimate.csv");
const INVOICE_CSV = path.join(CSV_DIR, "Invoice.csv");

const BATCH_SIZE = 200; // rows per upsert call

// ── Helpers ──────────────────────────────────────────────────────────────────

function trim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function num(v: unknown): number {
  const n = parseFloat(trim(v));
  return isNaN(n) ? 0 : n;
}

function date(v: unknown): string | null {
  const s = trim(v);
  if (!s) return null;
  // Zoho exports dates as YYYY-MM-DD
  return s;
}

async function upsertBatch<T extends object>(
  supabase: ReturnType<typeof createClient>,
  table: string,
  rows: T[],
  conflictColumn: string
): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error, count } = await supabase
      .from(table)
      .upsert(batch, { onConflict: conflictColumn, count: "exact" });
    if (error) throw new Error(`Upsert failed on ${table}: ${error.message}`);
    inserted += count ?? batch.length;
  }
  return inserted;
}

function parseCsv(filePath: string): Record<string, string>[] {
  const raw = fs.readFileSync(filePath, "utf8");
  return parse(raw, {
    columns: true,           // use first row as header keys
    skip_empty_lines: true,
    relax_quotes: true,
    trim: false,             // we trim field-by-field
    cast: false,             // keep everything as string
  }) as Record<string, string>[];
}

// ── Contact phone lookup ─────────────────────────────────────────────────────

async function buildPhoneMap(
  supabase: ReturnType<typeof createClient>
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("contacts")
    .select("zoho_contact_id, phone");
  if (error) throw new Error(`Failed to fetch contacts: ${error.message}`);
  const map = new Map<string, string>();
  for (const c of data ?? []) {
    if (c.zoho_contact_id) map.set(c.zoho_contact_id, c.phone ?? "");
  }
  return map;
}

// ── Estimates ────────────────────────────────────────────────────────────────

interface EstimateLineItem {
  zoho_item_id: string;
  item_name: string;
  sku: string;
  quantity: number;
  rate: number;
  tax_percentage: number;
  line_total: number;
  hsn_sac?: string;
  item_desc?: string;
  discount?: number;
  discount_amount?: number;
  item_tax_amount?: number;
  image_url: null;
}

interface EstimateRow {
  zoho_estimate_id: string;
  estimate_number: string;
  zoho_contact_id: string | null;
  contact_phone: string;
  status: string;
  date: string | null;
  expiry_date: string | null;
  subtotal: number;
  tax_total: number;
  total: number;
  notes: string | null;
  line_items: EstimateLineItem[];
  zoho_sync_status: string;
}

function buildEstimateRows(
  csvRows: Record<string, string>[],
  phoneMap: Map<string, string>
): EstimateRow[] {
  // Group by Estimate ID
  const groups = new Map<string, Record<string, string>[]>();
  for (const row of csvRows) {
    const id = trim(row["Estimate ID"]);
    if (!id) continue;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id)!.push(row);
  }

  const result: EstimateRow[] = [];
  for (const [estimateId, rows] of groups) {
    const header = rows[0];
    const rawContactId = trim(header["Customer ID"]);
    // Only reference contacts that actually exist in the DB (FK constraint)
    const contactId = rawContactId && phoneMap.has(rawContactId) ? rawContactId : null;
    const phone = contactId ? (phoneMap.get(contactId) ?? "") : "";

    // sum tax from line items since subtotal in CSV is exclusive but total is inclusive
    const lineItems: EstimateLineItem[] = rows.map((r) => ({
      zoho_item_id: trim(r["Product ID"]),
      item_name: trim(r["Item Name"]),
      sku: trim(r["SKU"]),
      quantity: num(r["Quantity"]),
      rate: num(r["Item Price"]),
      tax_percentage: num(r["Item Tax %"]) || 18,
      line_total: num(r["Item Total"]),
      hsn_sac: trim(r["HSN/SAC"]) || undefined,
      item_desc: trim(r["Item Desc"]) || undefined,
      discount: num(r["Discount"]),
      discount_amount: num(r["Discount Amount"]),
      item_tax_amount: num(r["Item Tax Amount"]),
      image_url: null,
    }));

    const taxTotal = lineItems.reduce(
      (s, li) => s + (li.item_tax_amount ?? 0),
      0
    );

    result.push({
      zoho_estimate_id: estimateId,
      estimate_number: trim(header["Estimate Number"]),
      zoho_contact_id: contactId,
      contact_phone: phone,
      status: trim(header["Estimate Status"]) || "draft",
      date: date(header["Estimate Date"]),
      expiry_date: date(header["Expiry Date"]),
      subtotal: num(header["SubTotal"]),
      tax_total: parseFloat(taxTotal.toFixed(2)),
      total: num(header["Total"]),
      notes: trim(header["Notes"]) || null,
      line_items: lineItems,
      zoho_sync_status: "synced",
    });
  }
  return result;
}

// ── Invoices ─────────────────────────────────────────────────────────────────

interface InvoiceLineItem {
  zoho_item_id: string;
  item_name: string;
  sku: string;
  quantity: number;
  rate: number;
  tax_percentage: number;
  line_total: number;
  hsn_sac?: string;
  item_desc?: string;
  discount?: number;
  discount_amount?: number;
  item_tax_amount?: number;
  brand?: string;
  category_name?: string;
  image_url: null;
}

interface InvoiceRow {
  zoho_invoice_id: string;
  invoice_number: string;
  zoho_contact_id: string | null;
  customer_name: string;
  contact_phone: string;
  status: string;
  date: string | null;
  due_date: string | null;
  issued_date: string | null;
  payment_terms: number;
  payment_terms_label: string | null;
  currency_code: string;
  exchange_rate: number;
  is_inclusive_tax: boolean;
  is_discount_before_tax: boolean;
  entity_discount_percent: number;
  subtotal: number;
  tax_total: number;
  total: number;
  balance: number;
  adjustment: number;
  adjustment_description: string | null;
  adjustment_account: string | null;
  notes: string | null;
  terms_and_conditions: string | null;
  purchase_order: string | null;
  place_of_supply: string | null;
  gst_treatment: string | null;
  gstin: string | null;
  invoice_type: string;
  einvoice_status: string | null;
  branch_id: string | null;
  branch_name: string | null;
  accounts_receivable: string | null;
  tcs_amount: number;
  tds_amount: number;
  shipping_charge: number;
  estimate_number: string | null;
  line_items: InvoiceLineItem[];
  zoho_sync_status: string;
}

function buildInvoiceRows(
  csvRows: Record<string, string>[],
  phoneMap: Map<string, string>
): InvoiceRow[] {
  const groups = new Map<string, Record<string, string>[]>();
  for (const row of csvRows) {
    const id = trim(row["Invoice ID"]);
    if (!id) continue;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id)!.push(row);
  }

  const result: InvoiceRow[] = [];
  for (const [invoiceId, rows] of groups) {
    const header = rows[0];
    const rawContactId = trim(header["Customer ID"]);
    const contactId = rawContactId && phoneMap.has(rawContactId) ? rawContactId : null;
    const phone = contactId ? (phoneMap.get(contactId) ?? "") : "";

    const lineItems: InvoiceLineItem[] = rows.map((r) => ({
      zoho_item_id: trim(r["Product ID"]),
      item_name: trim(r["Item Name"]),
      sku: trim(r["SKU"]),
      quantity: num(r["Quantity"]),
      rate: num(r["Item Price"]),
      tax_percentage: num(r["Item Tax %"]) || 18,
      line_total: num(r["Item Total"]),
      hsn_sac: trim(r["HSN/SAC"]) || undefined,
      item_desc: trim(r["Item Desc"]) || undefined,
      discount: num(r["Discount"]),
      discount_amount: num(r["Discount Amount"]),
      item_tax_amount: num(r["Item Tax Amount"]),
      brand: trim(r["Brand"]) || undefined,
      category_name: trim(r["Category Name"]) || undefined,
      image_url: null,
    }));

    const taxTotal = lineItems.reduce(
      (s, li) => s + (li.item_tax_amount ?? 0),
      0
    );

    result.push({
      zoho_invoice_id: invoiceId,
      invoice_number: trim(header["Invoice Number"]),
      zoho_contact_id: contactId,
      customer_name: trim(header["Customer Name"]),
      contact_phone: phone,
      status: trim(header["Invoice Status"]) || "draft",
      date: date(header["Invoice Date"]),
      due_date: date(header["Due Date"]),
      issued_date: date(header["Issued Date"]) || null,
      payment_terms: num(header["Payment Terms"]),
      payment_terms_label: trim(header["Payment Terms Label"]) || null,
      currency_code: trim(header["Currency Code"]) || "INR",
      exchange_rate: num(header["Exchange Rate"]) || 1,
      is_inclusive_tax: trim(header["Is Inclusive Tax"]) === "true",
      is_discount_before_tax: trim(header["Is Discount Before Tax"]) === "true",
      entity_discount_percent: num(header["Entity Discount Percent"]),
      subtotal: num(header["SubTotal"]),
      tax_total: parseFloat(taxTotal.toFixed(2)),
      total: num(header["Total"]),
      balance: num(header["Balance"]),
      adjustment: num(header["Adjustment"]),
      adjustment_description: trim(header["Adjustment Description"]) || null,
      adjustment_account: trim(header["Adjustment Account"]) || null,
      notes: trim(header["Notes"]) || null,
      terms_and_conditions: trim(header["Terms & Conditions"]) || null,
      purchase_order: trim(header["PurchaseOrder"]) || null,
      place_of_supply: trim(header["Place of Supply"]) || null,
      gst_treatment: trim(header["GST Treatment"]) || null,
      gstin: trim(header["GST Identification Number (GSTIN)"]) || null,
      invoice_type: trim(header["Invoice Type"]) || "Invoice",
      einvoice_status: trim(header["e-Invoice Status"]) || null,
      branch_id: trim(header["Branch ID"]) || null,
      branch_name: trim(header["Branch Name"]) || null,
      accounts_receivable: trim(header["Accounts Receivable"]) || null,
      tcs_amount: num(header["TCS Amount"]),
      tds_amount: num(header["TDS Amount"]),
      shipping_charge: num(header["Shipping Charge"]),
      estimate_number: trim(header["Estimate Number"]) || null,
      line_items: lineItems,
      zoho_sync_status: "synced",
    });
  }
  return result;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  console.log("Building contact phone lookup map…");
  const phoneMap = await buildPhoneMap(supabase);
  console.log(`  ${phoneMap.size} contacts loaded`);

  // ── Estimates ──
  console.log("\nParsing Estimate.csv…");
  const estCsvRows = parseCsv(ESTIMATE_CSV);
  console.log(`  ${estCsvRows.length} raw CSV rows`);

  const estimateRows = buildEstimateRows(estCsvRows, phoneMap);
  console.log(`  ${estimateRows.length} unique estimates`);

  console.log("Upserting estimates…");
  const estCount = await upsertBatch(
    supabase,
    "estimates",
    estimateRows,
    "zoho_estimate_id"
  );
  console.log(`  ✓ ${estCount} estimates upserted`);

  // ── Invoices ──
  console.log("\nParsing Invoice.csv…");
  const invCsvRows = parseCsv(INVOICE_CSV);
  console.log(`  ${invCsvRows.length} raw CSV rows`);

  const invoiceRows = buildInvoiceRows(invCsvRows, phoneMap);
  console.log(`  ${invoiceRows.length} unique invoices`);

  console.log("Upserting invoices…");
  const invCount = await upsertBatch(
    supabase,
    "invoices",
    invoiceRows,
    "zoho_invoice_id"
  );
  console.log(`  ✓ ${invCount} invoices upserted`);

  // ── Sanity check ──
  console.log("\n── Sanity check ──────────────────────────────────");
  const [{ count: dbEst }, { count: dbInv }] = await Promise.all([
    supabase
      .from("estimates")
      .select("*", { count: "exact", head: true })
      .not("zoho_estimate_id", "is", null),
    supabase
      .from("invoices")
      .select("*", { count: "exact", head: true })
      .not("zoho_invoice_id", "is", null),
  ]);

  console.log(`estimates  in DB  : ${dbEst}`);
  console.log(`estimates  in CSV : ${estimateRows.length}`);
  console.log(
    dbEst === estimateRows.length ? "  ✓ counts match" : "  ✗ MISMATCH"
  );

  console.log(`invoices   in DB  : ${dbInv}`);
  console.log(`invoices   in CSV : ${invoiceRows.length}`);
  console.log(
    dbInv === invoiceRows.length ? "  ✓ counts match" : "  ✗ MISMATCH"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
