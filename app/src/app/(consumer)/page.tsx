import MigrationLanding from '@/components/migration/MigrationLanding'

export default function RootPage() {
  const whatsappAdminNumber = process.env.WHATSAPP_ADMIN_NUMBER ?? ''

  return <MigrationLanding whatsappAdminNumber={whatsappAdminNumber} />
}
