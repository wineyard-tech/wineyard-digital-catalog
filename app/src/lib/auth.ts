// TODO: Implement — see architecture docs §9 Authentication Design

export async function createAuthRequest(phone: string): Promise<string> {
  // TODO: Generate OTP + ref_id, store in auth_requests, send via WhatsApp
  throw new Error('Not implemented')
}

export async function verifyOtp(refId: string, otp: string): Promise<string | null> {
  // TODO: Verify OTP, create session, return session token
  throw new Error('Not implemented')
}

export async function getSession(token: string): Promise<any | null> {
  // TODO: Validate session token from cookie, return session payload
  throw new Error('Not implemented')
}
