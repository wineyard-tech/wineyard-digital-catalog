// TODO: Implement — see architecture docs §7 API Design (GET /api/catalog)
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ todo: true })
}
