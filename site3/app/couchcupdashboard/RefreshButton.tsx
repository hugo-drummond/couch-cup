'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RefreshButton({ dashKey }: { dashKey: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function refresh() {
    setLoading(true)
    try {
      await fetch(`/api/analytics/snapshot?key=${encodeURIComponent(dashKey)}`, {
        method: 'POST',
      })
    } catch {
      // ignore — re-query below shows whatever landed
    }
    router.refresh()
    setLoading(false)
  }

  return (
    <button
      onClick={refresh}
      disabled={loading}
      className="bg-[#DC1430] text-white text-xs font-semibold px-4 py-1.5 rounded hover:bg-[#b81027] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? 'Refreshing…' : 'Refresh now'}
    </button>
  )
}
