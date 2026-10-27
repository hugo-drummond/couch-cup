'use client'

import { useState, useMemo, useEffect } from 'react'
import type { Player, SeasonStats, RoundFact } from '@/lib/player-stats'

const ROUND_LABELS: Record<number, string> = {
  1: 'R16',
  2: 'QF',
  3: 'SF',
  4: 'Final',
}

function getRoundLabel(roundNumber: number): string {
  return ROUND_LABELS[roundNumber] || `Round ${roundNumber}`
}

export default function PlayerDashboard({ players, dashboardKey }: { players: Player[]; dashboardKey?: string }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [selectedGameType, setSelectedGameType] = useState('EA FC')
  const [selectedSeasonIdx, setSelectedSeasonIdx] = useState(0)
  const [selectedRoundNumber, setSelectedRoundNumber] = useState<number | null>(null)
  const [expandedComm, setExpandedComm] = useState<number | null>(null)

  // Editable profile fields (Discord membership / Stream URL / Instagram)
  const [editDiscord, setEditDiscord] = useState(false)
  const [editStream, setEditStream] = useState('')
  const [editInstagram, setEditInstagram] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const filteredPlayers = useMemo(() => {
    return players.filter((p) => {
      const q = searchQuery.toLowerCase()
      return p.name.toLowerCase().includes(q) || (p.psnId?.toLowerCase().includes(q) ?? false)
    })
  }, [players, searchQuery])

  const selectedPlayer = selectedPlayerId ? players.find((p) => p.id === selectedPlayerId) : null
  const season = selectedPlayer && selectedSeasonIdx < selectedPlayer.seasons.length ? selectedPlayer.seasons[selectedSeasonIdx] : null

  // Load editable fields when a player is selected
  useEffect(() => {
    if (!selectedPlayer) return
    setEditDiscord(selectedPlayer.addedToDiscord)
    setEditStream(selectedPlayer.streamUrl ?? '')
    setEditInstagram(selectedPlayer.instagram ?? '')
    setSaveState('idle')
  }, [selectedPlayerId])

  async function saveProfile() {
    if (!selectedPlayer) return
    setSaveState('saving')
    try {
      const res = await fetch('/api/players/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: dashboardKey,
          id: selectedPlayer.id,
          addedToDiscord: editDiscord,
          streamUrl: editStream,
          instagram: editInstagram,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'save failed')
      // Reflect saved values in memory
      selectedPlayer.addedToDiscord = data.addedToDiscord
      selectedPlayer.streamUrl = data.streamUrl
      selectedPlayer.instagram = data.instagram
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }

  // Ensure selected round is valid
  const validRoundNumbers = season?.rounds.map((r) => r.round) ?? []
  const roundNumber = selectedRoundNumber !== null && validRoundNumbers.includes(selectedRoundNumber) ? selectedRoundNumber : null
  const selectedRound = roundNumber !== null ? season?.rounds.find((r) => r.round === roundNumber) : null

  return (
    <div className="max-w-[1600px] mx-auto p-6 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Left Rail: Search + Player List */}
        <div className="flex flex-col gap-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or PSN"
            className="bg-[#0F1E33] border border-[rgba(255,255,255,0.08)] text-white rounded px-3 py-2 text-sm focus:outline-none focus:border-[#DC1430] placeholder-[#8A97A8]"
          />

          {/* Player List */}
          <div className="flex-1 overflow-y-auto flex flex-col gap-1 max-h-[calc(100vh-200px)]">
            {filteredPlayers.length === 0 ? (
              <p className="text-[#8A97A8] text-xs text-center py-4">No players found</p>
            ) : (
              filteredPlayers.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setSelectedPlayerId(p.id)
                    setSelectedRoundNumber(null)
                    setExpandedComm(null)
                  }}
                  className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                    selectedPlayerId === p.id
                      ? 'bg-[#0F1E33] border-l-2 border-l-[#DC1430]'
                      : 'hover:bg-[#0F1E33]'
                  }`}
                >
                  <p className="font-medium truncate">{p.name}</p>
                  <p className="text-xs text-[#8A97A8] truncate">{p.psnId ?? '—'}</p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Main Area: Player Profile */}
        <div>
          {!selectedPlayer ? (
            <div className="flex items-center justify-center h-96 text-[#8A97A8]">
              Select a player
            </div>
          ) : (
            <div className="space-y-6">
              {/* Section 1: Real Name */}
              <div>
                <h2 className="text-lg font-display font-semibold mb-4">Real Name</h2>
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="text-[#8A97A8] text-xs uppercase tracking-wider mb-1">Name</p>
                    <p className="text-white">{selectedPlayer.name}</p>
                  </div>
                  <div>
                    <p className="text-[#8A97A8] text-xs uppercase tracking-wider mb-1">Email</p>
                    <p className="text-white">{selectedPlayer.email}</p>
                  </div>
                  {selectedPlayer.discord && (
                    <div>
                      <p className="text-[#8A97A8] text-xs uppercase tracking-wider mb-1">Discord</p>
                      <p className="text-white">{selectedPlayer.discord}</p>
                    </div>
                  )}
                  {selectedPlayer.phone && (
                    <div>
                      <p className="text-[#8A97A8] text-xs uppercase tracking-wider mb-1">Phone</p>
                      <p className="text-white">{selectedPlayer.phone}</p>
                    </div>
                  )}
                  {(selectedPlayer.platformType || selectedPlayer.psnId) && (
                    <div>
                      <p className="text-[#8A97A8] text-xs uppercase tracking-wider mb-1">Gamer Tag</p>
                      <p className="text-white">
                        {selectedPlayer.platformType && `${selectedPlayer.platformType} — `}
                        {selectedPlayer.psnId ?? '—'}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-[#8A97A8] text-xs uppercase tracking-wider mb-1">Promotional</p>
                    <div className="inline-block">
                      {selectedPlayer.marketingOptIn ? (
                        <span className="px-2 py-1 rounded text-xs font-semibold bg-green-900 text-green-300">
                          Opted in
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded text-xs font-semibold bg-[#1e3050] text-[#8A97A8]">
                          No
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Editable profile fields */}
                  <div className="pt-2 mt-2 border-t border-[rgba(255,255,255,0.08)] space-y-4">
                    <div>
                      <p className="text-[#8A97A8] text-xs uppercase tracking-wider mb-2">Part of Discord</p>
                      <button
                        type="button"
                        onClick={() => setEditDiscord((v) => !v)}
                        className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                          editDiscord
                            ? 'bg-green-900 text-green-300'
                            : 'bg-[#1e3050] text-[#8A97A8] hover:bg-[#26385a]'
                        }`}
                      >
                        {editDiscord ? 'Yes' : 'No'}
                      </button>
                    </div>

                    <div>
                      <p className="text-[#8A97A8] text-xs uppercase tracking-wider mb-1">Stream URL</p>
                      <input
                        type="text"
                        value={editStream}
                        onChange={(e) => setEditStream(e.target.value)}
                        placeholder="https://twitch.tv/..."
                        className="w-full md:w-96 bg-[#0F1E33] border border-[rgba(255,255,255,0.08)] text-white rounded px-3 py-2 text-sm focus:outline-none focus:border-[#DC1430] placeholder-[#5a6a80]"
                      />
                    </div>

                    <div>
                      <p className="text-[#8A97A8] text-xs uppercase tracking-wider mb-1">Instagram</p>
                      <input
                        type="text"
                        value={editInstagram}
                        onChange={(e) => setEditInstagram(e.target.value)}
                        placeholder="handle (no @)"
                        className="w-full md:w-96 bg-[#0F1E33] border border-[rgba(255,255,255,0.08)] text-white rounded px-3 py-2 text-sm focus:outline-none focus:border-[#DC1430] placeholder-[#5a6a80]"
                      />
                      {editInstagram.trim() && (
                        <a
                          href={`https://instagram.com/${editInstagram.trim().replace(/^@/, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#DC1430] text-xs hover:underline ml-1 inline-block mt-1"
                        >
                          open
                        </a>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={saveProfile}
                        disabled={saveState === 'saving'}
                        className="bg-[#DC1430] text-white text-sm font-semibold px-5 py-2 rounded hover:bg-[#b81027] transition-colors disabled:opacity-50"
                      >
                        {saveState === 'saving' ? 'Saving…' : 'Save'}
                      </button>
                      {saveState === 'saved' && <span className="text-green-400 text-xs">Saved</span>}
                      {saveState === 'error' && <span className="text-[#DC1430] text-xs">Save failed</span>}
                    </div>
                  </div>
                </div>

                <div className="border-t border-[rgba(255,255,255,0.08)] my-6" />

                {/* Section 2: Communication */}
                <h2 className="text-lg font-display font-semibold mb-4">Communication</h2>
                <div className="space-y-4">
                  <select
                    value={selectedPlayer.comms.length > 0 ? 'email' : 'all'}
                    onChange={() => {}}
                    className="w-full md:w-48 bg-[#0F1E33] border border-[rgba(255,255,255,0.08)] text-white rounded px-3 py-2 text-sm focus:outline-none focus:border-[#DC1430]"
                  >
                    <option value="all">All</option>
                    <option value="email">Email</option>
                    <option value="discord" disabled>Discord (soon)</option>
                    <option value="meta" disabled>Meta (soon)</option>
                  </select>

                  <div className="space-y-2 text-sm">
                    {selectedPlayer.comms.length === 0 ? (
                      <p className="text-[#8A97A8]">No comms yet.</p>
                    ) : (
                      selectedPlayer.comms.map((c, i) => (
                        <div key={c.url || `${c.at}-${c.subject}`} className="border border-[rgba(255,255,255,0.08)] rounded">
                          <button
                            onClick={() => setExpandedComm(expandedComm === i ? null : i)}
                            className="w-full text-left p-3 hover:bg-[rgba(255,255,255,0.02)] transition-colors"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <p className="text-white font-medium mb-1">{expandedComm === i ? '▾' : '▸'} {c.subject || c.type || 'Message'}</p>
                                <p className="text-[#8A97A8] text-xs">
                                  {c.direction} • {new Date(c.at).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}
                                </p>
                              </div>
                            </div>
                          </button>
                          {c.url && (
                            <div className="px-3 pb-2">
                              <a
                                href={c.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#DC1430] text-xs hover:underline"
                              >
                                view
                              </a>
                            </div>
                          )}
                          {expandedComm === i && (
                            <div className="px-3 pb-3 border-t border-[rgba(255,255,255,0.08)]">
                              {c.bodyHtml && c.bodyHtml.trim() ? (
                                <iframe
                                  sandbox=""
                                  srcDoc={c.bodyHtml}
                                  className="w-full h-96 mt-2 rounded bg-white border border-[rgba(255,255,255,0.08)]"
                                />
                              ) : (
                                <p className="text-[#8A97A8] text-xs mt-2 italic">No stored contents — email sent before logging was added.</p>
                              )}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="border-t border-[rgba(255,255,255,0.08)] my-6" />

                {/* Section 3: Performance */}
                <h2 className="text-lg font-display font-semibold mb-4">Performance</h2>

                {season ? (
                  <div className="space-y-6">
                    {/* Dropdowns */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="text-xs text-[#8A97A8] uppercase tracking-wider block mb-2">
                          Game Type
                        </label>
                        <select
                          value={selectedGameType}
                          onChange={(e) => setSelectedGameType(e.target.value)}
                          className="w-full bg-[#0F1E33] border border-[rgba(255,255,255,0.08)] text-white rounded px-3 py-2 text-sm focus:outline-none focus:border-[#DC1430]"
                        >
                          <option>EA FC</option>
                          <option disabled>Fortnite (no data)</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-xs text-[#8A97A8] uppercase tracking-wider block mb-2">
                          Season
                        </label>
                        <select
                          value={selectedSeasonIdx}
                          onChange={(e) => {
                            setSelectedSeasonIdx(parseInt(e.target.value))
                            setSelectedRoundNumber(null)
                          }}
                          className="w-full bg-[#0F1E33] border border-[rgba(255,255,255,0.08)] text-white rounded px-3 py-2 text-sm focus:outline-none focus:border-[#DC1430]"
                        >
                          {selectedPlayer.seasons.map((s, i) => (
                            <option key={i} value={i}>
                              {s.seasonName}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-xs text-[#8A97A8] uppercase tracking-wider block mb-2">
                          Round
                        </label>
                        <select
                          value={roundNumber ?? ''}
                          onChange={(e) => setSelectedRoundNumber(e.target.value ? parseInt(e.target.value) : null)}
                          className="w-full bg-[#0F1E33] border border-[rgba(255,255,255,0.08)] text-white rounded px-3 py-2 text-sm focus:outline-none focus:border-[#DC1430]"
                        >
                          <option value="">—</option>
                          {season.rounds.map((r) => (
                            <option key={r.round} value={r.round}>
                              {getRoundLabel(r.round)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Fixed Stats KPI Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-[#0F1E33] border border-[rgba(255,255,255,0.08)] rounded-lg p-4">
                        <p className="text-[#8A97A8] text-xs uppercase tracking-wider mb-2">Matches Played</p>
                        <p className="text-3xl font-display font-bold text-white">{season.matchesPlayed}</p>
                      </div>
                      <div className="bg-[#0F1E33] border border-[rgba(255,255,255,0.08)] rounded-lg p-4">
                        <p className="text-[#8A97A8] text-xs uppercase tracking-wider mb-2">Goals Scored</p>
                        <p className="text-3xl font-display font-bold text-white">{season.goalsScored}</p>
                      </div>
                      <div className="bg-[#0F1E33] border border-[rgba(255,255,255,0.08)] rounded-lg p-4">
                        <p className="text-[#8A97A8] text-xs uppercase tracking-wider mb-2">Goals Conceded</p>
                        <p className="text-3xl font-display font-bold text-white">{season.goalsConceded}</p>
                      </div>
                      <div className="bg-[#0F1E33] border border-[rgba(255,255,255,0.08)] rounded-lg p-4">
                        <p className="text-[#8A97A8] text-xs uppercase tracking-wider mb-2">Round Reached</p>
                        <p className="text-3xl font-display font-bold text-white">{getRoundLabel(season.roundReached)}</p>
                      </div>
                    </div>

                    {/* Round Facts */}
                    {selectedRound && (
                      <div className="bg-[#0F1E33] border border-[rgba(255,255,255,0.08)] rounded-lg p-4 space-y-3">
                        <p className="text-xs text-[#8A97A8] uppercase tracking-wider">
                          {getRoundLabel(selectedRound.round)} Details
                        </p>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-[#8A97A8]">Goals Scored:</span>
                            <span className="text-white font-semibold">{selectedRound.goalsScored}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#8A97A8]">Goals Conceded:</span>
                            <span className="text-white font-semibold">{selectedRound.goalsConceded}</span>
                          </div>
                          {selectedRound.opponentPsn && (
                            <div className="flex justify-between">
                              <span className="text-[#8A97A8]">Opponent:</span>
                              <span className="text-white font-semibold">{selectedRound.opponentPsn}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-[#8A97A8]">Stream:</span>
                            {selectedRound.streamLink ? (
                              <a
                                href={selectedRound.streamLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#DC1430] font-semibold hover:underline"
                              >
                                Link
                              </a>
                            ) : (
                              <span className="text-[#8A97A8]">No stream</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[#8A97A8]">No season data available.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
  )
}
