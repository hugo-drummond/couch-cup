'use client'

import { useMemo, useRef, useState } from 'react'
import { X, Search, Plus, Building2, Check } from 'lucide-react'
import type { CompanyOption, SponsorInput } from './types'
import { STAGES } from './types'

const inputCls =
  'w-full rounded bg-[#0f1e35] border border-[#1e3050] px-3 py-2 text-sm text-white placeholder:text-[#4f627e] focus:outline-none focus:border-[#DC1430]'
const labelCls = 'mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[#8fa3c0]'

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-lg border border-[#1e3050] p-4">
      <legend className="px-2 text-[11px] font-semibold uppercase tracking-wider text-[#DC1430]">
        {title}
      </legend>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </fieldset>
  )
}

function Text({
  label,
  value,
  onChange,
  placeholder,
  full,
  type = 'text',
  required,
}: {
  label: string
  value: string | null
  onChange: (v: string) => void
  placeholder?: string
  full?: boolean
  type?: string
  required?: boolean
}) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <label className={labelCls}>
        {label}
        {required && <span className="text-[#DC1430]"> *</span>}
      </label>
      <input
        type={type}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputCls}
      />
    </div>
  )
}

function Area({
  label,
  value,
  onChange,
}: {
  label: string
  value: string | null
  onChange: (v: string) => void
}) {
  return (
    <div className="col-span-2">
      <label className={labelCls}>{label}</label>
      <textarea
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className={inputCls + ' resize-y'}
      />
    </div>
  )
}

function CompanyCombobox({
  value,
  companies,
  onPick,
  onType,
  onNew,
}: {
  value: string
  companies: CompanyOption[]
  onPick: (c: CompanyOption) => void
  onType: (v: string) => void
  onNew: () => void
}) {
  const [open, setOpen] = useState(false)
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const q = value.trim().toLowerCase()
  const matches = useMemo(() => {
    const list = q
      ? companies.filter((c) => c.company_name.toLowerCase().includes(q))
      : companies
    return [...list]
      .sort((a, b) => {
        const an = a.company_name.toLowerCase()
        const bn = b.company_name.toLowerCase()
        const rank = (n: string) => (n === q ? 0 : n.startsWith(q) ? 1 : 2)
        return rank(an) - rank(bn) || an.localeCompare(bn)
      })
      .slice(0, 8)
  }, [companies, q])

  const exact = companies.some((c) => c.company_name.toLowerCase() === q)
  const showList = open && (matches.length > 0 || (q.length > 0 && !exact))

  return (
    <div className="col-span-2">
      <label className={labelCls}>
        Company name<span className="text-[#DC1430]"> *</span>
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5c6f8c]"
          />
          <input
            type="text"
            value={value}
            placeholder="Search or type a company…"
            onChange={(e) => {
              onType(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              blurTimer.current = setTimeout(() => setOpen(false), 120)
            }}
            className={inputCls + ' pl-9'}
            autoComplete="off"
          />
          {showList && (
            <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-[#1e3050] bg-[#0c1830] py-1 shadow-2xl">
              {matches.map((c) => (
                <li key={c.company_name}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      if (blurTimer.current) clearTimeout(blurTimer.current)
                      onPick(c)
                      setOpen(false)
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#d4e0f0] hover:bg-[#16263f]"
                  >
                    <Building2 size={13} className="shrink-0 text-[#6f86a8]" />
                    <span className="truncate">{c.company_name}</span>
                    {c.company_name.toLowerCase() === q && (
                      <Check size={13} className="ml-auto shrink-0 text-[#22c55e]" />
                    )}
                  </button>
                </li>
              ))}
              {q.length > 0 && !exact && (
                <li>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      if (blurTimer.current) clearTimeout(blurTimer.current)
                      onNew()
                      setOpen(false)
                    }}
                    className="flex w-full items-center gap-2 border-t border-[#16263f] px-3 py-2 text-left text-sm text-[#8fa3c0] hover:bg-[#16263f]"
                  >
                    <Plus size={13} className="shrink-0" />
                    Add new company “{value.trim()}”
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={onNew}
          className="flex shrink-0 items-center gap-1.5 rounded border border-[#1e3050] bg-[#0f1e35] px-3 text-sm font-medium text-[#c8d8e8] hover:border-[#DC1430] hover:text-white"
        >
          <Plus size={15} /> New
        </button>
      </div>
    </div>
  )
}

export default function SponsorForm({
  initial,
  heading,
  companies,
  updatedAt,
  onCancel,
  onSave,
}: {
  initial: SponsorInput
  heading: string
  companies: CompanyOption[]
  updatedAt?: string | null
  onCancel: () => void
  onSave: (input: SponsorInput) => Promise<string | undefined>
}) {
  const [form, setForm] = useState<SponsorInput>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | undefined>()

  const set = (k: keyof SponsorInput) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }))

  async function handleSave() {
    if (!form.company_name?.trim()) {
      setError('Company name is required.')
      return
    }
    setSaving(true)
    setError(undefined)
    const err = await onSave(form)
    setSaving(false)
    if (err) setError(err)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="my-8 w-full max-w-2xl rounded-xl border border-[#1e3050] bg-[#0c1830] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#1e3050] px-5 py-4">
          <h2 className="text-base font-bold text-white">{heading}</h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="rounded p-1 text-[#8fa3c0] hover:bg-[#1e3050] hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <Group title="Company">
            <CompanyCombobox
              value={form.company_name}
              companies={companies}
              onType={(v) => setForm((f) => ({ ...f, company_name: v }))}
              onPick={(c) =>
                setForm((f) => ({
                  ...f,
                  company_name: c.company_name,
                  company_size: c.company_size,
                  company_location: c.company_location,
                  company_revenue: c.company_revenue,
                  company_growth: c.company_growth,
                  company_website: c.company_website,
                  company_linkedin: c.company_linkedin,
                }))
              }
              onNew={() =>
                setForm((f) => ({
                  ...f,
                  company_size: null,
                  company_location: null,
                  company_revenue: null,
                  company_growth: null,
                  company_website: null,
                  company_linkedin: null,
                }))
              }
            />
            <Text label="Size" value={form.company_size} onChange={set('company_size')} placeholder="e.g. 200–500" />
            <Text label="Location" value={form.company_location} onChange={set('company_location')} placeholder="e.g. Cape Town" />
            <Text label="Estimated revenue" value={form.company_revenue} onChange={set('company_revenue')} placeholder="e.g. R50m–R100m" />
            <Text label="Growth" value={form.company_growth} onChange={set('company_growth')} placeholder="e.g. +30% YoY" />
            <Text label="Website" value={form.company_website} onChange={set('company_website')} placeholder="https://" />
            <Text label="LinkedIn" value={form.company_linkedin} onChange={set('company_linkedin')} placeholder="https://linkedin.com/company/" />
          </Group>

          <Group title="Position">
            <Text label="Position title" value={form.position_title} onChange={set('position_title')} placeholder="e.g. Head of Marketing" />
            <Text label="Started" value={form.position_start} onChange={set('position_start')} placeholder="e.g. 2022" />
            <Text label="Department" value={form.position_department} onChange={set('position_department')} />
            <Text label="Seniority" value={form.position_seniority} onChange={set('position_seniority')} placeholder="e.g. Director" />
            <Area label="Position notes" value={form.position_notes} onChange={set('position_notes')} />
          </Group>

          <Group title="Contact">
            <Text label="Name" value={form.contact_name} onChange={set('contact_name')} full />
            <Text label="Email" value={form.contact_email} onChange={set('contact_email')} type="email" />
            <Text label="Phone" value={form.contact_phone} onChange={set('contact_phone')} />
            <Text label="LinkedIn" value={form.contact_linkedin} onChange={set('contact_linkedin')} placeholder="https://linkedin.com/in/" full />
          </Group>

          <Group title="Pipeline">
            <div>
              <label className={labelCls}>Stage</label>
              <select
                value={form.stage}
                onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value as SponsorInput['stage'] }))}
                className={inputCls}
              >
                {STAGES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <Text label="Next follow-up" value={form.next_follow_up} onChange={set('next_follow_up')} type="date" />
            {updatedAt && (
              <div className="col-span-2">
                <label className={labelCls}>Last edited</label>
                <p className="text-xs text-[#8fa3c0]">
                  {new Date(updatedAt).toLocaleString('en-ZA', {
                    timeZone: 'Africa/Johannesburg',
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            )}
            <Area label="Notes" value={form.notes} onChange={set('notes')} />
          </Group>

          {error && <p className="text-sm text-[#ff5c7a]">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-[#1e3050] px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded px-4 py-2 text-sm font-medium text-[#8fa3c0] hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded bg-[#DC1430] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#b81027] disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
