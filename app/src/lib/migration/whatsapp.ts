export function formatWhatsAppDisplayNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '')

  if (digits.length === 12 && digits.startsWith('91')) {
    return `+91-${digits.slice(2)}`
  }

  if (digits.length === 10) {
    return `+91-${digits}`
  }

  if (raw.startsWith('+')) {
    return raw
  }

  return digits ? `+${digits}` : raw
}

export function toWhatsAppHref(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits ? `https://wa.me/${digits}` : ''
}
