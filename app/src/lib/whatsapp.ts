// TODO: Implement — see architecture docs §6 Key User Flows (WhatsApp notifications)

export async function sendOtp(phone: string, otp: string): Promise<boolean> {
  // TODO: Send OTP via WhatsApp template message
  throw new Error('Not implemented')
}

export async function sendQuote(phone: string, estimateNumber: string, total: number): Promise<boolean> {
  // TODO: Send quote notification via WhatsApp
  throw new Error('Not implemented')
}
