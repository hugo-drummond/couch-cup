'use client'

import { useState, useMemo } from 'react'
import type { TournamentAdmin } from '@/lib/tournament-dashboard'

const STATUS_PILL: Record<string, string> = {
  registration: 'bg-green-900 text-green-300',
  active: 'bg-[#DC1430] text-white',
  completed: 'bg-[#1e3050] text-[#8A97A8]',
  draft: 'bg-[#162033] text-[#5a6a80]',
  pending: 'bg-[#1e3050] text-[#8A97A8]',
}

function statusPill(status: string): string {
  return STATUS_PILL[status] ?? 'bg-[#1e3050] text-[#8A97A8]'
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })
}

export default function TournamentsDashboard({ tournaments }: { tournaments: TournamentAdmin[] }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [entrantQuery, setEntrantQuery] = useState('')

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase()
    return tournaments.filter(
      (t) => t.name.toLowerCase().includes(q) || (t.game?.toLowerCase().includes(q) ?? false)
    )
  }, [tournaments, searchQuery])

  const selected = selectedId ? tournaments.find((t) => t.id === selectedId) ?? null : null

  const entrants = useMemo(() => {
    if (!selected) return []
    const q = entrantQuery.toLowerCase()
    return selected.entrants.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        (e.gamingId?.toLowerCase().includes(q) ?? false) ||
        (e.email?.toLowerCase().includes(q) ?? false)
    )
  }, [selected, entrantQuery])

  return (
    <div className="max-w-[1600px] mx-auto p-6 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
      {/* Left Rail: Search + Tournament List */}
      <div className="flex flex-col gap-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search tournaments"
          className="bg-[#0F1E33] border border-[rgba(255,255,255,0.08)] text-white rounded px-3 py-2 text-sm focus:outline-none focus:border-[#DC1430] placeholder-[#8A97A8]"
        />

        <div className="flex-1 overflow-y-auto flex flex-col gap-1 max-h-[calc(100vh-200px)]">
          {filtered.length === 0 ? (
            <p className="text-[#8A97A8] text-xs text-center py-4">No tournaments found</p>
          ) : (
            filtered.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setSelectedId(t.id)
                  setEntrantQuery('')
                }}
                className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                  selectedId === t.id
                    ? 'bg-[#0F1E33] border-l-2 border-l-[#DC1430]'
                    : 'hover:bg-[#0F1E33]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium truncate">{t.name}</p>
                  <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${statusPill(t.status)}`}>
                    {t.status}
                  </span>
                </div>
                <p className="text-xs text-[#8A97A8] truncate">
                  {t.game ?? '—'} • {t.entrantCount} entrant{t.entrantCount === 1 ? '' : 's'}
                </p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main Area: Tournament Detail */}
      <div>
        {!selected ? (
          <div className="flex items-center justify-center h-96 text-[#8A97A8]">
            Select a tournament
          </div>
        ) : (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-lg font-display font-semibold">{selected.name}</h2>
              <span className={`px-2 py-1 rounded text-xs font-semibold uppercase tracking-wide ${statusPill(selected.status)}`}>
                {selected.status}
              </span>
            </div>

            {/* Metadata */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              {[
                ['Game', selected.game ?? '—'],
                ['Format', selected.format ?? '—'],
                ['Entry', selected.entry ?? '—'],
                ['Prize', selected.prize ?? '—'],
                ['Max Players', selected.maxParticipants != null ? String(selected.maxParticipants) : '—'],
                ['Slug', selected.slug ?? '—'],
                ['Started', fmtDate(selected.startedAt)],
                ['Ended', fmtDate(selected.endedAt)],
              ].map(([label, value]) => (
                <div key={label} className="bg-[#0F1E33] border border-[rgba(255,255,255,0.08)] rounded-lg p-3">
                  <p className="text-[#8A97A8] text-xs uppercase tracking-wider mb-1">{label}</p>
                  <p className="text-white truncate" title={value}>{value}</p>
                </div>
              ))}
            </div>

            {selected.streamUrl && (
              <div className="text-sm">
                <span className="text-[#8A97A8] text-xs uppercase tracking-wider mr-2">Stream</span>
                <a
                  href={selected.streamUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#DC1430] hover:underline"
                >
                  {selected.streamUrl}
                </a>
              </div>
            )}

            <div className="border-t border-[rgba(255,255,255,0.08)]" />

            {/* Entrants */}
            <div>
              <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
                <h3 className="text-lg font-display font-semibold">Entrants ({selected.entrantCount})</h3>
                <input
                  type="text"
                  value={entrantQuery}
                  onChange={(e) => setEntrantQuery(e.target.value)}
                  placeholder="Filter entrants"
                  className="bg-[#0F1E33] border border-[rgba(255,255,255,0.08)] text-white rounded px-3 py-2 text-sm w-full md:w-64 focus:outline-none focus:border-[#DC1430] placeholder-[#8A97A8]"
                />
              </div>

              {selected.entrantCount === 0 ? (
                <p className="text-[#8A97A8] text-sm">No entrants yet.</p>
              ) : entrants.length === 0 ? (
                <p className="text-[#8A97A8] text-sm">No entrants match.</p>
              ) : (
                <div className="overflow-x-auto border border-[rgba(255,255,255,0.08)] rounded-lg">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[#8A97A8] text-xs uppercase tracking-wider border-b border-[rgba(255,255,255,0.08)]">
                        <th className="px-3 py-2 font-medium">Name</th>
                        <th className="px-3 py-2 font-medium">Gaming ID</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium">Platform</th>
                        <th className="px-3 py-2 font-medium">Country</th>
                        <th className="px-3 py-2 font-medium">Opt-in</th>
                        <th className="px-3 py-2 font-medium">Partner</th>
                        <th className="px-3 py-2 font-medium">Signed up</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entrants.map((e) => (
                        <tr key={`${e.source}-${e.id}`} className="border-b border-[rgba(255,255,255,0.05)] last:border-0">
                          <td className="px-3 py-2 text-white whitespace-nowrap">{e.name}</td>
                          <td className="px-3 py-2 text-[#8A97A8] whitespace-nowrap">{e.gamingId ?? '—'}</td>
                          <td className="px-3 py-2 text-[#8A97A8] whitespace-nowrap">{e.status ?? '—'}</td>
                          <td className="px-3 py-2 text-[#8A97A8] whitespace-nowrap">{e.platform ?? '—'}</td>
                          <td className="px-3 py-2 text-[#8A97A8] whitespace-nowrap">{e.country ?? '—'}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {e.marketingOptIn ? (
                              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-green-900 text-green-300">Yes</span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-[#1e3050] text-[#8A97A8]">No</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-[#8A97A8] whitespace-nowrap">{e.partnerRef ?? '—'}</td>
                          <td className="px-3 py-2 text-[#8A97A8] whitespace-nowrap">{fmtDate(e.signupAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
