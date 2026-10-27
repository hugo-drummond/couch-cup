'use client'

import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import type { CompanyOption, Sponsor, SponsorInput, Stage } from './types'
import { STAGES, EMPTY_SPONSOR } from './types'
import SponsorCard from './SponsorCard'
import SponsorForm from './SponsorForm'
import { createSponsor, updateSponsor, moveSponsor, deleteSponsor } from './actions'

type Editing = { mode: 'new' } | { mode: 'edit'; sponsor: Sponsor } | null

export default function Board({ initial }: { initial: Sponsor[] }) {
  const [sponsors, setSponsors] = useState<Sponsor[]>(initial)
  const [editing, setEditing] = useState<Editing>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overStage, setOverStage] = useState<Stage | null>(null)

  // Unique companies (latest values win) for the form's company picker.
  const companies = useMemo<CompanyOption[]>(() => {
    const map = new Map<string, CompanyOption>()
    for (const s of sponsors) {
      if (!s.company_name) continue
      map.set(s.company_name.toLowerCase(), {
        company_name: s.company_name,
        company_size: s.company_size,
        company_location: s.company_location,
        company_revenue: s.company_revenue,
        company_growth: s.company_growth,
        company_website: s.company_website,
        company_linkedin: s.company_linkedin,
      })
    }
    return [...map.values()].sort((a, b) => a.company_name.localeCompare(b.company_name))
  }, [sponsors])

  async function handleDrop(stage: Stage) {
    const id = draggingId
    setOverStage(null)
    setDraggingId(null)
    if (!id) return
    const current = sponsors.find((s) => s.id === id)
    if (!current || current.stage === stage) return

    // optimistic
    setSponsors((prev) => prev.map((s) => (s.id === id ? { ...s, stage } : s)))
    const { error } = await moveSponsor(id, stage)
    if (error) {
      // revert
      setSponsors((prev) => prev.map((s) => (s.id === id ? { ...s, stage: current.stage } : s)))
      alert(`Could not move card: ${error}`)
    }
  }

  async function handleSave(input: SponsorInput): Promise<string | undefined> {
    if (editing?.mode === 'edit') {
      const { data, error } = await updateSponsor(editing.sponsor.id, input)
      if (error) return error
      if (data) setSponsors((prev) => prev.map((s) => (s.id === data.id ? data : s)))
    } else {
      const { data, error } = await createSponsor(input)
      if (error) return error
      if (data) setSponsors((prev) => [...prev, data])
    }
    setEditing(null)
  }

  async function handleDelete(s: Sponsor) {
    if (!confirm(`Delete ${s.company_name}? This cannot be undone.`)) return
    const prev = sponsors
    setSponsors((p) => p.filter((x) => x.id !== s.id))
    const { error } = await deleteSponsor(s.id)
    if (error) {
      setSponsors(prev)
      alert(`Could not delete: ${error}`)
    }
  }

  return (
    <>
      <div className="mb-5 flex items-center justify-between">
        <p className="text-sm text-[#8fa3c0]">
          {sponsors.length} {sponsors.length === 1 ? 'prospect' : 'prospects'}
        </p>
        <button
          type="button"
          onClick={() => setEditing({ mode: 'new' })}
          className="flex items-center gap-1.5 rounded bg-[#DC1430] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#b81027]"
        >
          <Plus size={16} /> Add prospect
        </button>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((col) => {
          const cards = sponsors.filter((s) => s.stage === col.id)
          const isOver = overStage === col.id
          return (
            <div
              key={col.id}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (overStage !== col.id) setOverStage(col.id)
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverStage(null)
              }}
              onDrop={() => handleDrop(col.id)}
              className={`flex w-[290px] shrink-0 flex-col rounded-xl border bg-[#0b1426]/60 transition-colors ${
                isOver ? 'border-[#DC1430]' : 'border-[#16263f]'
              }`}
            >
              <div className="flex items-center justify-between border-b border-[#16263f] px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: col.color }} />
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#c8d8e8]">
                    {col.label}
                  </span>
                </div>
                <span className="rounded-full bg-[#16263f] px-2 py-0.5 text-[11px] font-medium text-[#8fa3c0]">
                  {cards.length}
                </span>
              </div>

              <div className="flex min-h-[120px] flex-col gap-2.5 p-2.5">
                {cards.map((s) => (
                  <SponsorCard
                    key={s.id}
                    sponsor={s}
                    onEdit={(sp) => setEditing({ mode: 'edit', sponsor: sp })}
                    onDelete={handleDelete}
                    onDragStart={setDraggingId}
                    onDragEnd={() => {
                      setDraggingId(null)
                      setOverStage(null)
                    }}
                    dragging={draggingId === s.id}
                  />
                ))}
                {cards.length === 0 && (
                  <p className="px-1 py-6 text-center text-xs text-[#4f627e]">
                    {isOver ? 'Drop here' : 'Empty'}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {editing && (
        <SponsorForm
          heading={editing.mode === 'edit' ? 'Edit prospect' : 'Add prospect'}
          initial={editing.mode === 'edit' ? sponsorToInput(editing.sponsor) : EMPTY_SPONSOR}
          companies={companies}
          updatedAt={editing.mode === 'edit' ? editing.sponsor.updated_at : null}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </>
  )
}

function sponsorToInput(s: Sponsor): SponsorInput {
  const { id, sort_order, created_at, updated_at, ...rest } = s
  return rest
}
