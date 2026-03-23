// TODO: Implement — see architecture docs §9 Authentication Design (session logout)
import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({ todo: true })
}
