import type { Metadata } from 'next'
import { getPlayersDashboardData } from '@/lib/player-stats'
import { getTournamentsDashboardData } from '@/lib/tournament-dashboard'
import DashboardShell from './DashboardShell'

const DASHBOARD_KEY = process.env.DASHBOARD_KEY

export const metadata: Metadata = { title: 'Management — Couch Cup' }

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>
}) {
  const params = await searchParams
  const key = params.key

  if (!DASHBOARD_KEY || key !== DASHBOARD_KEY) {
    return (
      <div className="min-h-screen bg-[#0A1628] flex items-center justify-center">
        <form method="GET" className="flex flex-col gap-4 items-center">
          <p className="text-white text-sm">Enter access key</p>
          <input
            name="key"
            type="password"
            autoFocus
            className="bg-[#162033] border border-[#2a3a55] text-white rounded px-4 py-2 w-64 focus:outline-none focus:border-[#DC1430]"
            placeholder="Key"
          />
          <button
            type="submit"
            className="bg-[#DC1430] text-white text-sm font-semibold px-6 py-2 rounded hover:bg-[#b81027] transition-colors"
          >
            Enter
          </button>
        </form>
      </div>
    )
  }

  const [players, tournaments] = await Promise.all([
    getPlayersDashboardData(),
    getTournamentsDashboardData(),
  ])

  return <DashboardShell players={players} tournaments={tournaments} dashboardKey={key} />
}
