// TODO: Implement — see architecture docs §9 Authentication Design (OTP verification)
import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({ todo: true })
}
