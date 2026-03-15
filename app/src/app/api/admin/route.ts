// TODO: Implement — see architecture docs §12 Admin Panel (GET/PATCH /api/admin)
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ todo: true })
}

export async function PATCH() {
  return NextResponse.json({ todo: true })
}
