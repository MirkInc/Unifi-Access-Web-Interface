import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ tenantId: string }>
}

export default async function SiteAdminPage({ params }: Props) {
  const { tenantId } = await params
  redirect(`/admin/tenants/${tenantId}/doors`)
}
