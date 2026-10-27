'use client'

import { useState } from 'react'
import type { Player } from '@/lib/player-stats'
import type { TournamentAdmin } from '@/lib/tournament-dashboard'
import PlayerDashboard from './PlayerDashboard'
import TournamentsDashboard from './TournamentsDashboard'

type Tab = 'players' | 'tournaments'

export default function DashboardShell({
  players,
  tournaments,
  dashboardKey,
}: {
  players: Player[]
  tournaments: TournamentAdmin[]
  dashboardKey?: string
}) {
  const [tab, setTab] = useState<Tab>('players')

  return (
    <div className="min-h-screen bg-[#0A1628] text-white">
      {/* Header + Tabs */}
      <div className="border-b border-[rgba(255,255,255,0.08)] px-6">
        <div className="max-w-[1600px] mx-auto flex items-center gap-6">
          {(
            [
              ['players', 'Players'],
              ['tournaments', 'Tournaments'],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`py-4 text-sm font-display font-semibold border-b-2 -mb-px transition-colors ${
                tab === id
                  ? 'border-[#DC1430] text-white'
                  : 'border-transparent text-[#8A97A8] hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'players' ? (
        <PlayerDashboard players={players} dashboardKey={dashboardKey} />
      ) : (
        <TournamentsDashboard tournaments={tournaments} />
      )}
    </div>
  )
}
