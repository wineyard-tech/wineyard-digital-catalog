// TODO: Implement — see architecture docs §7 API Design (POST /api/enquiry)
import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({ todo: true })
}
