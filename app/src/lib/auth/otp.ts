// lib/auth/otp.ts
// Pure utilities for OTP generation, bcrypt hashing, and phone validation.
// All functions run in Node.js API route context (not Edge Runtime).

import { randomInt } from 'crypto'
import bcrypt from 'bcryptjs'

const BCRYPT_ROUNDS = 10

/**
 * Generates a cryptographically secure 6-digit OTP string.
 * Uses Node.js crypto.randomInt — never Math.random().
 */
export function generateOTP(): string {
  return String(randomInt(100000, 1000000))
}

/**
 * Hashes an OTP code using bcrypt before DB storage.
 */
export async function hashOTP(otp: string): Promise<string> {
  return bcrypt.hash(otp, BCRYPT_ROUNDS)
}

/**
 * Verifies a plain OTP against its stored bcrypt hash.
 */
export async function verifyOTP(otp: string, hash: string): Promise<boolean> {
  return bcrypt.compare(otp, hash)
}

/**
 * Validates an Indian mobile number in E.164 format.
 * Valid: +91 followed by a 6–9 leading digit and 9 more digits.
 */
export function isValidIndianPhone(phone: string): boolean {
  return /^\+91[6-9]\d{9}$/.test(phone)
}

/**
 * Normalises raw input to E.164 format (+91XXXXXXXXXX).
 * Handles: "9876543210", "91-98765-43210", "+919876543210"
 */
export function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `+91${digits}`
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`
  if (digits.length === 13 && digits.startsWith('091')) return `+${digits.slice(1)}`
  return `+${digits}`
}
