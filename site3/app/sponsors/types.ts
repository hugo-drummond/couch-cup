export type Stage = 'connection_request_sent' | 'connection_request_accepted' | 'post_interaction' | 'messaging' | 'meeting_booked' | 'signed' | 'lost'

export const STAGES: { id: Stage; label: string; color: string }[] = [
  { id: 'connection_request_sent', label: 'Connection Request Sent', color: '#8fa3c0' },
  { id: 'connection_request_accepted', label: 'Connection Request Accepted', color: '#6366f1' },
  { id: 'post_interaction', label: 'Post Interaction', color: '#0ea5e9' },
  { id: 'messaging', label: 'Messaging', color: '#14b8a6' },
  { id: 'meeting_booked', label: 'Meeting Booked', color: '#f59e0b' },
  { id: 'signed', label: 'Signed', color: '#22c55e' },
  { id: 'lost', label: 'Lost', color: '#64748b' },
]

export const stageMeta = (s: string) => STAGES.find((x) => x.id === s) ?? STAGES[0]

export const SPONSOR_COLS =
  'id, stage, sort_order, company_name, company_size, company_location, company_revenue, company_growth, company_website, company_linkedin, position_title, position_start, position_department, position_seniority, position_notes, contact_name, contact_email, contact_phone, contact_linkedin, notes, next_follow_up, created_at, updated_at'

export type Sponsor = {
  id: string
  stage: Stage
  sort_order: number

  company_name: string
  company_size: string | null
  company_location: string | null
  company_revenue: string | null
  company_growth: string | null
  company_website: string | null
  company_linkedin: string | null

  position_title: string | null
  position_start: string | null
  position_department: string | null
  position_seniority: string | null
  position_notes: string | null

  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  contact_linkedin: string | null

  notes: string | null
  next_follow_up: string | null

  created_at: string
  updated_at: string
}

// Fields the form writes (everything except server-managed columns).
export type SponsorInput = Omit<Sponsor, 'id' | 'sort_order' | 'created_at' | 'updated_at'>

// A reusable company (name + its company-level fields) for the picker.
export type CompanyOption = Pick<
  Sponsor,
  | 'company_name'
  | 'company_size'
  | 'company_location'
  | 'company_revenue'
  | 'company_growth'
  | 'company_website'
  | 'company_linkedin'
>

export const EMPTY_SPONSOR: SponsorInput = {
  stage: 'connection_request_sent',
  company_name: '',
  company_size: null,
  company_location: null,
  company_revenue: null,
  company_growth: null,
  company_website: null,
  company_linkedin: null,
  position_title: null,
  position_start: null,
  position_department: null,
  position_seniority: null,
  position_notes: null,
  contact_name: null,
  contact_email: null,
  contact_phone: null,
  contact_linkedin: null,
  notes: null,
  next_follow_up: null,
}
