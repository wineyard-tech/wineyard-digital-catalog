/**
 * Constant-time string comparison for webhook shared secrets (same length only).
 * Mitigates timing leaks vs `===` when comparing attacker-controlled input.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  const enc = new TextEncoder()
  const ba = enc.encode(a)
  const bb = enc.encode(b)
  let diff = 0
  for (let i = 0; i < ba.length; i++) {
    diff |= ba[i] ^ bb[i]
  }
  return diff === 0
}
