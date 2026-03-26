export const dynamic = 'force-dynamic'

import { DoorAdminClient } from './DoorAdminClient'

type Props = { params: Promise<{ doorId: string }> }

export default async function AdminDoorDetailPage({ params }: Props) {
  const { doorId } = await params
  return <DoorAdminClient doorId={doorId} />
}
