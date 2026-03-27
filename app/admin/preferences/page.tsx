import { PortalUrlsClient } from './PortalUrlsClient'
import { LogoutAllClient } from './LogoutAllClient'

export default function AdminPreferencesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Preferences</h1>
        <p className="text-sm text-gray-500 mt-1">Global application settings</p>
      </div>
      <PortalUrlsClient />
      <LogoutAllClient />
    </div>
  )
}
