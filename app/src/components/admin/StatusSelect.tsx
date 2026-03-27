'use client'

type EstimateStatus = 'draft' | 'received' | 'quoted' | 'confirmed' | 'fulfilled'

const STATUS_LABELS: Record<EstimateStatus, string> = {
  draft:     'Draft',
  received:  'Received',
  quoted:    'Quoted',
  confirmed: 'Confirmed',
  fulfilled: 'Fulfilled',
}

const STATUS_COLORS: Record<EstimateStatus, { bg: string; color: string }> = {
  draft:     { bg: '#F3F4F6', color: '#6B7280' },
  received:  { bg: '#EFF6FF', color: '#1D4ED8' },
  quoted:    { bg: '#FEF3C7', color: '#92400E' },
  confirmed: { bg: '#DCFCE7', color: '#15803D' },
  fulfilled: { bg: '#F0FDF4', color: '#14532D' },
}

interface StatusSelectProps {
  value: EstimateStatus
  enquiryId: string
  onChange: (id: string, status: EstimateStatus) => void
}

export default function StatusSelect({ value, enquiryId, onChange }: StatusSelectProps) {
  const { bg, color } = STATUS_COLORS[value]
  return (
    <select
      value={value}
      onChange={(e) => onChange(enquiryId, e.target.value as EstimateStatus)}
      style={{
        background: bg,
        color,
        border: 'none',
        borderRadius: 6,
        padding: '4px 8px',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        outline: 'none',
      }}
      aria-label="Update status"
    >
      {Object.entries(STATUS_LABELS).map(([val, label]) => (
        <option key={val} value={val}>{label}</option>
      ))}
    </select>
  )
}
