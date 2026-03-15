// TODO: Root redirect — see architecture docs §6 Key User Flows
import { redirect } from 'next/navigation'

export default function RootPage() {
  redirect('/catalog')
}
