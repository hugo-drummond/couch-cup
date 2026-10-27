'use client'

import { useState } from 'react'
import {
  Building2,
  Briefcase,
  User,
  Globe,
  Mail,
  Phone,
  Link as LinkIcon,
  ChevronRight,
  Pencil,
  Trash2,
  CalendarClock,
} from 'lucide-react'
import type { Sponsor } from './types'
import { stageMeta } from './types'

function Field({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon?: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: string | null
  href?: string | null
}) {
  if (!value) return null
  return (
    <div className="flex items-start gap-2 py-0.5">
      {Icon && <Icon size={12} className="mt-[3px] shrink-0 text-[#5c6f8c]" />}
      <span className="w-[58px] shrink-0 text-[10px] uppercase tracking-wider text-[#5c6f8c] mt-[2px]">
        {label}
      </span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-xs text-[#7aa7ff] hover:underline break-all"
        >
          {value}
        </a>
      ) : (
        <span className="text-xs text-[#d4e0f0] break-words">{value}</span>
      )}
    </div>
  )
}

function Section({
  icon: Icon,
  title,
  defaultOpen = false,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-t border-[#1a2c48]">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className="flex w-full items-center gap-1.5 py-2 text-left text-[#a8bcd8] hover:text-white transition-colors"
      >
        <ChevronRight
          size={13}
          className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <Icon size={13} className="shrink-0 text-[#6f86a8]" />
        <span className="text-[11px] font-semibold uppercase tracking-wider">{title}</span>
      </button>
      {open && <div className="pb-2 pl-1">{children}</div>}
    </div>
  )
}

export default function SponsorCard({
  sponsor: s,
  onEdit,
  onDelete,
  onDragStart,
  onDragEnd,
  dragging,
}: {
  sponsor: Sponsor
  onEdit: (s: Sponsor) => void
  onDelete: (s: Sponsor) => void
  onDragStart: (id: string) => void
  onDragEnd: () => void
  dragging: boolean
}) {
  const meta = stageMeta(s.stage)
  const hasCompany =
    s.company_size || s.company_location || s.company_revenue || s.company_growth || s.company_website || s.company_linkedin
  const hasPosition =
    s.position_title || s.position_start || s.position_department || s.position_seniority || s.position_notes
  const hasContact = s.contact_email || s.contact_phone || s.contact_linkedin

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', s.id)
        onDragStart(s.id)
      }}
      onDragEnd={onDragEnd}
      className={`group relative rounded-lg border border-[#1e3050] bg-[#112038] pl-3 pr-2.5 cursor-grab active:cursor-grabbing transition-opacity ${
        dragging ? 'opacity-40' : 'opacity-100'
      }`}
      style={{ borderLeft: `3px solid ${meta.color}` }}
    >
      {/* Header — Company — Position is the headline */}
      <div className="flex items-start justify-between gap-2 pt-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold leading-tight text-white break-words">
            {s.contact_name || s.company_name}
          </h3>
          {s.position_title && (
            <p className="mt-0.5 text-xs font-medium" style={{ color: meta.color }}>
              {s.position_title}
            </p>
          )}
          {s.contact_name && (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-[#8fa3c0]">
              <Building2 size={11} /> {s.company_name}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onEdit(s)
            }}
            aria-label="Edit"
            className="rounded p-1 text-[#8fa3c0] hover:bg-[#1e3050] hover:text-white"
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(s)
            }}
            aria-label="Delete"
            className="rounded p-1 text-[#8fa3c0] hover:bg-[#3a1420] hover:text-[#ff5c7a]"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="mt-2">
        {hasCompany && (
          <Section icon={Building2} title="Company" defaultOpen>
            <Field label="Size" value={s.company_size} />
            <Field label="Location" value={s.company_location} />
            <Field label="Revenue" value={s.company_revenue} />
            <Field label="Growth" value={s.company_growth} />
            <Field icon={Globe} label="Web" value={s.company_website} href={s.company_website} />
            <Field icon={LinkIcon} label="LinkedIn" value={s.company_linkedin} href={s.company_linkedin} />
          </Section>
        )}

        {hasPosition && (
          <Section icon={Briefcase} title="Position">
            <Field label="Title" value={s.position_title} />
            <Field label="Started" value={s.position_start} />
            <Field label="Dept" value={s.position_department} />
            <Field label="Level" value={s.position_seniority} />
            <Field label="Notes" value={s.position_notes} />
          </Section>
        )}

        {hasContact && (
          <Section icon={User} title="Name">
            <Field
              icon={Mail}
              label="Email"
              value={s.contact_email}
              href={s.contact_email ? `mailto:${s.contact_email}` : null}
            />
            <Field
              icon={Phone}
              label="Phone"
              value={s.contact_phone}
              href={s.contact_phone ? `tel:${s.contact_phone}` : null}
            />
            <Field
              icon={LinkIcon}
              label="LinkedIn"
              value={s.contact_linkedin}
              href={s.contact_linkedin}
            />
          </Section>
        )}
      </div>

      {(s.next_follow_up || s.notes) && (
        <div className="border-t border-[#1a2c48] py-2">
          {s.next_follow_up && (
            <p className="flex items-center gap-1.5 text-[11px] text-[#f59e0b]">
              <CalendarClock size={12} /> Follow up{' '}
              {new Date(s.next_follow_up).toLocaleDateString('en-ZA', {
                day: 'numeric',
                month: 'short',
              })}
            </p>
          )}
          {s.notes && <p className="mt-1 text-[11px] leading-snug text-[#8fa3c0]">{s.notes}</p>}
        </div>
      )}

      {s.updated_at && (
        <div className="border-t border-[#1a2c48] py-2">
          <p className="text-[11px] text-[#5c6f8c]">
            Last edited {new Date(s.updated_at).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      )}
    </div>
  )
}
