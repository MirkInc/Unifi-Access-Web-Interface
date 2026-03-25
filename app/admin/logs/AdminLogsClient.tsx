'use client'

import { useState } from 'react'
import { ActivityLogTable } from '@/components/ActivityLogTable'

interface Tenant { _id: string; name: string }
interface Props { tenants: Tenant[] }

export function AdminLogsClient({ tenants }: Props) {
  const [selectedTenant, setSelectedTenant] = useState(tenants[0]?._id ?? '')
  const [since, setSince] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7)
    return d.toISOString().split('T')[0]
  })
  const [until, setUntil] = useState(() => new Date().toISOString().split('T')[0])

  const sinceTs = since ? Math.floor(new Date(since).getTime() / 1000) : undefined
  const untilTs = until ? Math.floor(new Date(until + 'T23:59:59').getTime() / 1000) : undefined

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Activity Logs</h1>
        <p className="text-sm text-gray-500 mt-1">View and export access logs from all sites</p>
      </div>

      <div className="card p-5">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-5">
          <div>
            <label className="label">Site</label>
            <select
              className="input w-48"
              value={selectedTenant}
              onChange={(e) => setSelectedTenant(e.target.value)}
            >
              {tenants.map((t) => (
                <option key={t._id} value={t._id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">From</label>
            <input
              type="date"
              className="input w-40"
              value={since}
              onChange={(e) => setSince(e.target.value)}
            />
          </div>
          <div>
            <label className="label">To</label>
            <input
              type="date"
              className="input w-40"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
            />
          </div>
        </div>

        {selectedTenant ? (
          <ActivityLogTable
            key={`${selectedTenant}-${since}-${until}`}
            tenantId={selectedTenant}
            showExport
            since={sinceTs}
            until={untilTs}
          />
        ) : (
          <p className="text-gray-400 text-center py-8">Select a site to view logs</p>
        )}
      </div>
    </div>
  )
}
