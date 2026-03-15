// TODO: Implement — see architecture docs §5 Data Architecture (pricebook resolution)

export function resolvePrice(baseRate: number, pricebookRate: number | null): number {
  // TODO: Return pricebook rate if available, else base_rate
  throw new Error('Not implemented')
}

export function calculateTax(rate: number, taxPercentage: number = 18): number {
  // TODO: Calculate GST amount
  throw new Error('Not implemented')
}
