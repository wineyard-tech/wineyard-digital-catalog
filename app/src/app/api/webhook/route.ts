// TODO: Implement — see architecture docs §7 API Design (WhatsApp webhook verification)
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ todo: true })
}

export async function POST() {
  return NextResponse.json({ todo: true })
}
