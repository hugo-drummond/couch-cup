'use client'

import { useState, useRef, useCallback, useEffect, KeyboardEvent } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { X, Plus, Minus, Menu } from 'lucide-react'
import LiveStrip from '@/components/LiveStrip'
import TournamentsSection from '@/components/TournamentsSection'

/* ─── Navbar ───────────────────────────────────────────────────────────── */
function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 4)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])
  return (
    <>
      <header
        className="sticky top-0 z-50 transition-all duration-200"
        style={{ borderBottom: scrolled ? '1px solid var(--border)' : '1px solid transparent', background: 'var(--bg)' }}>
        <div style={{ background: 'var(--bg)' }} className="absolute inset-0" />
        <div className="relative mx-auto max-w-[1280px] px-6 flex items-center justify-between" style={{ height: 120 }}>
          <Link href="/" className="flex items-center gap-3 shrink-0">
            <Image src="/images/logo-cropped.png" alt="Couch Cup" width={211} height={148} className="object-contain h-[74px] w-auto translate-y-[10px]" />
          </Link>
          <nav className="flex items-center gap-6">
            <a href="https://discord.gg/Kz4qrFUgKJ" target="_blank" rel="noopener noreferrer"
              className="hidden md:block text-[14px] font-medium transition-colors"
              style={{ color: 'var(--ink-mid)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-mid)')}>
              Discord
            </a>
            <span className="hidden md:block w-px h-4" style={{ background: 'var(--border)' }} />
            <a href="#signup"
              className="text-[14px] font-semibold px-5 py-2.5 rounded-lg transition-all"
              style={{ background: 'var(--accent)', color: '#fff' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-dark)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--accent)')}>
              Sign up
            </a>
            <button onClick={() => setOpen(o => !o)} className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors"
              style={{ color: 'var(--ink)' }}>
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </nav>
        </div>
      </header>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fixed top-[72px] right-4 z-50 rounded-xl shadow-2xl overflow-hidden w-56"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            {[['About', '/about'], ['How it works', '/how-it-works'], ['Blogs', '/blog'], ['Tournament', '/tournament'], ['FAQs', '/#faq'], ['Discord', 'https://discord.gg/Kz4qrFUgKJ']].map(([label, href]) => (
              <a key={label} href={href} onClick={() => setOpen(false)}
                className="block px-5 py-3.5 text-[14px] font-medium transition-colors"
                style={{ color: 'var(--ink)', borderBottom: '1px solid var(--border)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--cream)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                {label}
              </a>
            ))}
          </div>
        </>
      )}
    </>
  )
}


/* ─── Typeform ──────────────────────────────────────────────────────────── */
function TurnstileWidget({ onToken }: { onToken: (t: string) => void }) {
  useEffect(() => {
    (window as any).__turnstileCb = (token: string) => onToken(token)
  }, [onToken])
  return (
    <div
      className="cf-turnstile"
      data-sitekey="0x4AAAAAADRs9X7p5uzgXyPK"
      data-theme="light"
      data-callback="__turnstileCb"
      style={{ marginTop: 16 }}
    />
  )
}

const PHONE_CODES = [
  { code: '+93', label: 'AF +93' }, { code: '+355', label: 'AL +355' }, { code: '+213', label: 'DZ +213' },
  { code: '+376', label: 'AD +376' }, { code: '+244', label: 'AO +244' }, { code: '+54', label: 'AR +54' },
  { code: '+374', label: 'AM +374' }, { code: '+61', label: 'AU +61' }, { code: '+43', label: 'AT +43' },
  { code: '+994', label: 'AZ +994' }, { code: '+1-242', label: 'BS +1-242' }, { code: '+973', label: 'BH +973' },
  { code: '+880', label: 'BD +880' }, { code: '+1-246', label: 'BB +1-246' }, { code: '+375', label: 'BY +375' },
  { code: '+32', label: 'BE +32' }, { code: '+501', label: 'BZ +501' }, { code: '+229', label: 'BJ +229' },
  { code: '+975', label: 'BT +975' }, { code: '+591', label: 'BO +591' }, { code: '+387', label: 'BA +387' },
  { code: '+267', label: 'BW +267' }, { code: '+55', label: 'BR +55' }, { code: '+673', label: 'BN +673' },
  { code: '+359', label: 'BG +359' }, { code: '+226', label: 'BF +226' }, { code: '+257', label: 'BI +257' },
  { code: '+238', label: 'CV +238' }, { code: '+855', label: 'KH +855' }, { code: '+237', label: 'CM +237' },
  { code: '+1', label: 'CA +1' }, { code: '+236', label: 'CF +236' }, { code: '+235', label: 'TD +235' },
  { code: '+56', label: 'CL +56' }, { code: '+86', label: 'CN +86' }, { code: '+57', label: 'CO +57' },
  { code: '+269', label: 'KM +269' }, { code: '+243', label: 'CD +243' }, { code: '+506', label: 'CR +506' },
  { code: '+385', label: 'HR +385' }, { code: '+53', label: 'CU +53' }, { code: '+357', label: 'CY +357' },
  { code: '+420', label: 'CZ +420' }, { code: '+45', label: 'DK +45' }, { code: '+253', label: 'DJ +253' },
  { code: '+1-767', label: 'DM +1-767' }, { code: '+1-809', label: 'DO +1-809' }, { code: '+593', label: 'EC +593' },
  { code: '+20', label: 'EG +20' }, { code: '+503', label: 'SV +503' }, { code: '+240', label: 'GQ +240' },
  { code: '+291', label: 'ER +291' }, { code: '+372', label: 'EE +372' }, { code: '+268', label: 'SZ +268' },
  { code: '+251', label: 'ET +251' }, { code: '+679', label: 'FJ +679' }, { code: '+358', label: 'FI +358' },
  { code: '+33', label: 'FR +33' }, { code: '+241', label: 'GA +241' }, { code: '+220', label: 'GM +220' },
  { code: '+995', label: 'GE +995' }, { code: '+49', label: 'DE +49' }, { code: '+233', label: 'GH +233' },
  { code: '+30', label: 'GR +30' }, { code: '+502', label: 'GT +502' }, { code: '+224', label: 'GN +224' },
  { code: '+245', label: 'GW +245' }, { code: '+592', label: 'GY +592' }, { code: '+509', label: 'HT +509' },
  { code: '+504', label: 'HN +504' }, { code: '+36', label: 'HU +36' }, { code: '+354', label: 'IS +354' },
  { code: '+91', label: 'IN +91' }, { code: '+62', label: 'ID +62' }, { code: '+98', label: 'IR +98' },
  { code: '+964', label: 'IQ +964' }, { code: '+353', label: 'IE +353' }, { code: '+972', label: 'IL +972' },
  { code: '+39', label: 'IT +39' }, { code: '+1-876', label: 'JM +1-876' }, { code: '+81', label: 'JP +81' },
  { code: '+962', label: 'JO +962' }, { code: '+7', label: 'KZ +7' }, { code: '+254', label: 'KE +254' },
  { code: '+686', label: 'KI +686' }, { code: '+965', label: 'KW +965' }, { code: '+996', label: 'KG +996' },
  { code: '+856', label: 'LA +856' }, { code: '+371', label: 'LV +371' }, { code: '+961', label: 'LB +961' },
  { code: '+266', label: 'LS +266' }, { code: '+231', label: 'LR +231' }, { code: '+218', label: 'LY +218' },
  { code: '+423', label: 'LI +423' }, { code: '+370', label: 'LT +370' }, { code: '+352', label: 'LU +352' },
  { code: '+261', label: 'MG +261' }, { code: '+265', label: 'MW +265' }, { code: '+60', label: 'MY +60' },
  { code: '+960', label: 'MV +960' }, { code: '+223', label: 'ML +223' }, { code: '+356', label: 'MT +356' },
  { code: '+222', label: 'MR +222' }, { code: '+230', label: 'MU +230' }, { code: '+52', label: 'MX +52' },
  { code: '+373', label: 'MD +373' }, { code: '+377', label: 'MC +377' }, { code: '+976', label: 'MN +976' },
  { code: '+382', label: 'ME +382' }, { code: '+212', label: 'MA +212' }, { code: '+258', label: 'MZ +258' },
  { code: '+95', label: 'MM +95' }, { code: '+264', label: 'NA +264' }, { code: '+977', label: 'NP +977' },
  { code: '+31', label: 'NL +31' }, { code: '+64', label: 'NZ +64' }, { code: '+505', label: 'NI +505' },
  { code: '+227', label: 'NE +227' }, { code: '+234', label: 'NG +234' }, { code: '+850', label: 'KP +850' },
  { code: '+389', label: 'MK +389' }, { code: '+47', label: 'NO +47' }, { code: '+968', label: 'OM +968' },
  { code: '+92', label: 'PK +92' }, { code: '+507', label: 'PA +507' }, { code: '+675', label: 'PG +675' },
  { code: '+595', label: 'PY +595' }, { code: '+51', label: 'PE +51' }, { code: '+63', label: 'PH +63' },
  { code: '+48', label: 'PL +48' }, { code: '+351', label: 'PT +351' }, { code: '+974', label: 'QA +974' },
  { code: '+40', label: 'RO +40' }, { code: '+7', label: 'RU +7' }, { code: '+250', label: 'RW +250' },
  { code: '+966', label: 'SA +966' }, { code: '+221', label: 'SN +221' }, { code: '+381', label: 'RS +381' },
  { code: '+248', label: 'SC +248' }, { code: '+232', label: 'SL +232' }, { code: '+65', label: 'SG +65' },
  { code: '+421', label: 'SK +421' }, { code: '+386', label: 'SI +386' }, { code: '+252', label: 'SO +252' },
  { code: '+27', label: 'ZA +27' }, { code: '+82', label: 'KR +82' }, { code: '+211', label: 'SS +211' },
  { code: '+34', label: 'ES +34' }, { code: '+94', label: 'LK +94' }, { code: '+249', label: 'SD +249' },
  { code: '+597', label: 'SR +597' }, { code: '+46', label: 'SE +46' }, { code: '+41', label: 'CH +41' },
  { code: '+963', label: 'SY +963' }, { code: '+886', label: 'TW +886' }, { code: '+992', label: 'TJ +992' },
  { code: '+255', label: 'TZ +255' }, { code: '+66', label: 'TH +66' }, { code: '+228', label: 'TG +228' },
  { code: '+676', label: 'TO +676' }, { code: '+1-868', label: 'TT +1-868' }, { code: '+216', label: 'TN +216' },
  { code: '+90', label: 'TR +90' }, { code: '+993', label: 'TM +993' }, { code: '+256', label: 'UG +256' },
  { code: '+380', label: 'UA +380' }, { code: '+971', label: 'AE +971' }, { code: '+44', label: 'GB +44' },
  { code: '+1', label: 'US +1' }, { code: '+598', label: 'UY +598' }, { code: '+998', label: 'UZ +998' },
  { code: '+678', label: 'VU +678' }, { code: '+58', label: 'VE +58' }, { code: '+84', label: 'VN +84' },
  { code: '+967', label: 'YE +967' }, { code: '+260', label: 'ZM +260' }, { code: '+263', label: 'ZW +263' },
]

const QS = [
  { id: 'name', label: 'Full name', type: 'text', placeholder: 'e.g. John Smith', required: true },
  { id: 'email', label: 'Email address', type: 'email', placeholder: 'you@example.com', required: true },
  { id: 'contact', label: 'Faster match coordination', type: 'contact' as const, helper: 'Optional — add your mobile and/or Discord so we can reach you about matches.', required: false },
  { id: 'psn_id', label: 'Epic Games username', type: 'text', placeholder: 'e.g. CoolGamer123', helper: 'Your in-game username, exactly as others need to find you.', required: true },
  { id: 'partner', label: "Your duo partner", type: 'partner' as const, helper: "No partner? Skip this — we'll pair you at the draw. If you name one, add their email so we can reach them.", required: false },
]

const REFERRAL_OPTIONS = ['Instagram', 'TikTok', 'Facebook', 'Friend', 'Other']

function Typeform({ compact = false }: { compact?: boolean }) {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [key, setKey] = useState(0)
  const [dir, setDir] = useState<'up' | 'down'>('up')
  const [checks, setChecks] = useState({ age: false, terms: false, indemnity: false, marketing: false })
  const [checkErr, setCheckErr] = useState('')
  const [legalStep, setLegalStep] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState('')
  const [phoneCode, setPhoneCode] = useState('+27')
  const [prize, setPrize] = useState('R500')
  const [participantId, setParticipantId] = useState('')
  const [referralSubmitted, setReferralSubmitted] = useState(false)
  const [referralAck, setReferralAck] = useState(false)
  const [showCountrySelect, setShowCountrySelect] = useState(false)
  const ref = useRef<HTMLInputElement | HTMLSelectElement | null>(null)

  useEffect(() => {
    fetch('https://ipapi.co/json/')
      .then(r => r.json())
      .then(d => {
        if (d.country_name) setAnswers(a => ({ country: d.country_name, ...a }))
        if (d.country_calling_code) setPhoneCode(d.country_calling_code)
        if (d.country_code && d.country_code !== 'ZA') setPrize('$30')
      })
      .catch(() => {})
  }, [])

  const q = QS[Math.min(step, QS.length - 1)]
  const pct = legalStep ? 100 : (step / QS.length) * 100

  useEffect(() => { if (!legalStep) setTimeout(() => ref.current?.focus(), 60) }, [step, legalStep])

  function validate(v: string) {
    if (q.id === 'psn_id') {
      if (!answers.platform_type) return 'Select your platform.'
      if (answers.platform_type === 'Other' && !answers.platform_type_other?.trim()) return 'Please specify your platform.'
      if (!v.trim()) return 'Enter your gaming ID.'
      return ''
    }
    if (q.id === 'partner') {
      const pu = answers.partner_gaming_id ?? ''
      const pe = answers.partner_email ?? ''
      if (pu.trim() && !pe.trim()) return "Add your partner's email so we can reach them."
      if (pe && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pe)) return "That doesn't look like a valid email."
      return ''
    }
    if (q.required && !v.trim()) return 'We need this one.'
    if (q.type === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "That doesn't look like a valid email."
    if (q.id === 'mobile' && v && !/^\d[\d\s\-]{5,}$/.test(v.replace(/\s/g, ''))) return 'Enter your number without the country code.'
    return ''
  }

  function next() {
    const v = answers[q.id] ?? ''
    const e = validate(v)
    if (e) { setError(e); return }
    setError('')
    if (step < QS.length - 1) { setDir('up'); setKey(k => k + 1); setStep(s => s + 1) }
    else setLegalStep(true)
  }

  function back() {
    if (legalStep) { setLegalStep(false); setCheckErr(''); return }
    if (step === 0) return
    setDir('down'); setKey(k => k + 1); setStep(s => s - 1); setError('')
  }

  async function submit() {
    if (!checks.age || !checks.terms || !checks.indemnity) { setCheckErr('Please confirm to continue.'); return }
    setSubmitting(true)
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: answers.name ?? '',
        email: answers.email ?? '',
        mobile: answers.mobile ? `${phoneCode}${answers.mobile}` : '',
        psn_id: answers.psn_id ?? '',
        gaming_id: answers.psn_id ?? '',
        platform_type: answers.platform_type === 'Other' ? (answers.platform_type_other ?? 'Other') : (answers.platform_type ?? ''),
        discord: answers.discord ?? '',
        country: answers.country ?? '',
        partner_gaming_id: answers.partner_gaming_id ?? '',
        partner_email: answers.partner_email ?? '',
        marketing: checks.marketing,
        turnstileToken,
      }),
    })
    const result = await res.json()
    if (result.error === 'rate_limited') {
      setCheckErr('Too many attempts. Please try again in an hour.')
      setSubmitting(false)
      return
    }
    if (result.error === 'captcha') {
      setCheckErr('Security check failed. Please wait a moment and try again.')
      setSubmitting(false)
      return
    }
    if (result.error === 'duplicate') {
      setCheckErr('This email or PSN ID is already registered.')
      setSubmitting(false)
      return
    }
    if (result.error) {
      setCheckErr('Something went wrong. Please try again.')
      setSubmitting(false)
      return
    }
    if (result.id) {
      setParticipantId(result.id)
      setSubmitting(false)
    } else {
      window.location.href = '/thank-you'
    }
  }

  const inputStyle = {
    width: '100%',
    borderBottom: '2px solid var(--ink)',
    background: 'transparent',
    color: 'var(--ink)',
    fontSize: compact ? 16 : 20,
    padding: compact ? '7px 0' : '10px 0',
    outline: 'none',
  }

  return (
    <div>
      {/* Progress */}
      <div className="h-0.5 rounded-full overflow-hidden mb-8" style={{ background: 'var(--border)' }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
      </div>

      {participantId ? (
        <div className="fade-in">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] mb-5" style={{ color: 'var(--ink-light)' }}>You're in!</p>
          <h3 className="text-[20px] font-semibold mb-6" style={{ color: 'var(--ink)' }}>Welcome to Couch Cup</h3>
          <p style={{ fontSize: 14, color: 'var(--ink-mid)', marginBottom: 24, lineHeight: 1.6 }}>Check your email for next steps. In the meantime, tell us how you heard about us?</p>
          <p style={{ fontSize: 13, color: 'var(--ink-light)', marginBottom: 16 }}>Send this to your duo partner — both of you must register.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {REFERRAL_OPTIONS.map(opt => (
              <button
                key={opt}
                onClick={() => {
                  setReferralSubmitted(true)
                  setReferralAck(true)
                  fetch('/api/referral', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: participantId, referral: opt }),
                  }).catch(() => {})
                  setTimeout(() => { window.location.href = '/thank-you' }, 1200)
                }}
                disabled={referralSubmitted}
                style={{
                  padding: '12px 16px',
                  borderRadius: 8,
                  background: 'var(--surface)',
                  color: 'var(--ink)',
                  border: '1px solid var(--border)',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  opacity: referralSubmitted ? 0.5 : 1,
                }}
                onMouseEnter={e => { if (!referralSubmitted) e.currentTarget.style.background = 'var(--cream)' }}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface)')}>
                {opt}
              </button>
            ))}
          </div>
          {referralAck && <p style={{ fontSize: 13, color: 'var(--accent)', marginTop: 12 }}>Thanks!</p>}
          <button onClick={() => { window.location.href = '/thank-you' }} style={{ fontSize: 13, color: 'var(--ink-light)', cursor: 'pointer', marginTop: 8 }}>Skip →</button>
        </div>
      ) : legalStep ? (
        <div className="fade-in">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] mb-5" style={{ color: 'var(--ink-light)' }}>Almost done</p>
          <h3 className="text-[20px] font-semibold mb-6" style={{ color: 'var(--ink)' }}>Confirm to sign up</h3>

          {/* Country chip + selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            {!showCountrySelect ? (
              <>
                <span style={{ fontSize: 13, color: 'var(--ink-light)' }}>Playing from <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{answers.country || 'Unknown'}</span></span>
                <button onClick={() => setShowCountrySelect(true)}
                  style={{ fontSize: 12, color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline', background: 'none', border: 'none', padding: 0 }}>
                  Change
                </button>
              </>
            ) : (
              <select
                value={answers.country ?? ''}
                onChange={e => { setAnswers(a => ({ ...a, country: e.target.value })) }}
                style={{ ...inputStyle, fontSize: 14, paddingBottom: 6 }}>
                <option value="">Select country...</option>
                {['Afghanistan','Albania','Algeria','Andorra','Angola','Antigua and Barbuda','Argentina','Armenia','Australia','Austria','Azerbaijan','Bahamas','Bahrain','Bangladesh','Barbados','Belarus','Belgium','Belize','Benin','Bhutan','Bolivia','Bosnia and Herzegovina','Botswana','Brazil','Brunei','Bulgaria','Burkina Faso','Burundi','Cabo Verde','Cambodia','Cameroon','Canada','Central African Republic','Chad','Chile','China','Colombia','Comoros','Congo','Costa Rica','Croatia','Cuba','Cyprus','Czech Republic','Denmark','Djibouti','Dominica','Dominican Republic','Ecuador','Egypt','El Salvador','Equatorial Guinea','Eritrea','Estonia','Eswatini','Ethiopia','Fiji','Finland','France','Gabon','Gambia','Georgia','Germany','Ghana','Greece','Grenada','Guatemala','Guinea','Guinea-Bissau','Guyana','Haiti','Honduras','Hungary','Iceland','India','Indonesia','Iran','Iraq','Ireland','Israel','Italy','Jamaica','Japan','Jordan','Kazakhstan','Kenya','Kiribati','Kosovo','Kuwait','Kyrgyzstan','Laos','Latvia','Lebanon','Lesotho','Liberia','Libya','Liechtenstein','Lithuania','Luxembourg','Madagascar','Malawi','Malaysia','Maldives','Mali','Malta','Marshall Islands','Mauritania','Mauritius','Mexico','Micronesia','Moldova','Monaco','Mongolia','Montenegro','Morocco','Mozambique','Myanmar','Namibia','Nauru','Nepal','Netherlands','New Zealand','Nicaragua','Niger','Nigeria','North Korea','North Macedonia','Norway','Oman','Pakistan','Palau','Palestine','Panama','Papua New Guinea','Paraguay','Peru','Philippines','Poland','Portugal','Qatar','Romania','Russia','Rwanda','Saint Kitts and Nevis','Saint Lucia','Saint Vincent and the Grenadines','Samoa','San Marino','Sao Tome and Principe','Saudi Arabia','Senegal','Serbia','Seychelles','Sierra Leone','Singapore','Slovakia','Slovenia','Solomon Islands','Somalia','South Africa','South Korea','South Sudan','Spain','Sri Lanka','Sudan','Suriname','Sweden','Switzerland','Syria','Taiwan','Tajikistan','Tanzania','Thailand','Timor-Leste','Togo','Tonga','Trinidad and Tobago','Tunisia','Turkey','Turkmenistan','Tuvalu','Uganda','Ukraine','United Arab Emirates','United Kingdom','United States','Uruguay','Uzbekistan','Vanuatu','Vatican City','Venezuela','Vietnam','Yemen','Zambia','Zimbabwe'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { k: 'age', text: 'I confirm I am 18 or older.', req: true },
              { k: 'terms', text: 'I agree to the Terms and Conditions and Privacy Policy.', req: true },
              { k: 'indemnity', text: 'I acknowledge the Indemnity and Limitation of Liability.', req: true },
              { k: 'marketing', text: 'Send me emails about future Couch Cup tournaments and other promotional material.', req: false },
            ].map(cb => (
              <label key={cb.k} style={{ display: 'flex', gap: 12, cursor: 'pointer', alignItems: 'flex-start' }}>
                <input type="checkbox" checked={checks[cb.k as keyof typeof checks]}
                  onChange={e => setChecks(p => ({ ...p, [cb.k]: e.target.checked }))}
                  style={{ marginTop: 2, width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer', flexShrink: 0 }} />
                <span style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.5 }}>
                  {cb.text}
                  {!cb.req && <span style={{ color: 'var(--ink-light)', marginLeft: 6 }}>(optional)</span>}
                </span>
              </label>
            ))}
          </div>
          {checkErr && <p style={{ marginTop: 12, fontSize: 13, color: '#C0392B' }}>{checkErr}</p>}
          <TurnstileWidget onToken={setTurnstileToken} />
          <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
            <button onClick={submit} disabled={submitting}
              className="font-semibold px-7 py-3 rounded-lg text-[14px] transition-all"
              style={{ background: 'var(--accent)', color: '#fff', opacity: submitting ? 0.7 : 1 }}
              onMouseEnter={e => { if (!submitting) e.currentTarget.style.background = 'var(--accent-dark)' }}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--accent)')}>
              {submitting ? 'Submitting…' : 'Sign up'}
            </button>
            <button onClick={back} style={{ fontSize: 13, color: 'var(--ink-light)', cursor: 'pointer' }}>← Back</button>
          </div>
        </div>
      ) : (
        <div key={key} className={dir === 'up' ? 'form-up' : 'form-down'}>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] mb-5" style={{ color: 'var(--ink-light)' }}>
            {step + 1} of {QS.length}
          </p>
          <label style={{ display: 'block', fontSize: compact ? 17 : 22, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>
            {q.label}
            {q.required ? <span style={{ color: 'var(--accent)', marginLeft: 4 }}>*</span>
              : <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--ink-light)', marginLeft: 8 }}>(optional)</span>}
          </label>
          {q.helper && <p style={{ fontSize: 13, color: 'var(--ink-light)', marginBottom: 20 }}>{q.helper}</p>}
          {!q.helper && <div style={{ height: 20 }} />}

          {q.id === 'psn_id' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <select
                value={answers.platform_type ?? ''}
                onChange={e => { setAnswers(a => ({ ...a, platform_type: e.target.value })); setError('') }}
                style={{ ...inputStyle, fontSize: 16 }}>
                <option value="">Select platform...</option>
                {['PSN ID', 'Xbox Gamertag', 'Epic Games ID', 'Steam Username', 'Battle.net ID', 'Riot ID', 'Other'].map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
              {answers.platform_type === 'Other' && (
                <div>
                  <p style={{ fontSize: 13, color: 'var(--ink-light)', marginBottom: 8 }}>Please specify</p>
                  <input
                    type="text"
                    value={answers.platform_type_other ?? ''}
                    onChange={e => { setAnswers(a => ({ ...a, platform_type_other: e.target.value })); setError('') }}
                    placeholder="e.g. Nintendo Friend Code"
                    style={{ ...inputStyle }} />
                </div>
              )}
              <input
                ref={ref as React.RefObject<HTMLInputElement>}
                type="text"
                value={answers.psn_id ?? ''}
                onChange={e => { setAnswers(a => ({ ...a, psn_id: e.target.value })); setError('') }}
                onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter') next() }}
                placeholder={answers.platform_type && answers.platform_type !== 'Other' ? `Your ${answers.platform_type}` : 'e.g. CoolGamer123'}
                style={{ ...inputStyle }} />
            </div>
          ) : q.id === 'contact' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <p style={{ fontSize: 13, color: 'var(--ink-light)', marginBottom: 12 }}>Mobile number</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select
                    value={phoneCode}
                    onChange={e => setPhoneCode(e.target.value)}
                    style={{ ...inputStyle, width: 110, flexShrink: 0, fontSize: 16 }}>
                    {PHONE_CODES.map(p => <option key={p.code + p.label} value={p.code}>{p.label}</option>)}
                  </select>
                  <input ref={ref as React.RefObject<HTMLInputElement>}
                    type="tel"
                    value={answers.mobile ?? ''}
                    onChange={e => { setAnswers(a => ({ ...a, mobile: e.target.value })); setError('') }}
                    onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter') next() }}
                    placeholder="821234567"
                    style={{ ...inputStyle, flex: 1 }} />
                </div>
              </div>
              <div>
                <p style={{ fontSize: 13, color: 'var(--ink-light)', marginBottom: 12 }}>Discord username</p>
                <input
                  type="text"
                  value={answers.discord ?? ''}
                  onChange={e => { setAnswers(a => ({ ...a, discord: e.target.value })); setError('') }}
                  onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter') next() }}
                  placeholder="username"
                  style={{ ...inputStyle }} />
              </div>
            </div>
          ) : q.id === 'partner' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <p style={{ fontSize: 13, color: 'var(--ink-light)', marginBottom: 12 }}>Partner's Epic username</p>
                <input ref={ref as React.RefObject<HTMLInputElement>}
                  type="text"
                  value={answers.partner_gaming_id ?? ''}
                  onChange={e => { setAnswers(a => ({ ...a, partner_gaming_id: e.target.value })); setError('') }}
                  onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter') next() }}
                  placeholder="e.g. PartnerName"
                  style={{ ...inputStyle }} />
              </div>
              <div>
                <p style={{ fontSize: 13, color: 'var(--ink-light)', marginBottom: 12 }}>Partner's email</p>
                <input
                  type="email"
                  value={answers.partner_email ?? ''}
                  onChange={e => { setAnswers(a => ({ ...a, partner_email: e.target.value })); setError('') }}
                  onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter') next() }}
                  placeholder="partner@example.com"
                  style={{ ...inputStyle }} />
              </div>
            </div>
          ) : (
            <input ref={ref as React.RefObject<HTMLInputElement>}
              type={q.type}
              value={answers[q.id] ?? ''}
              onChange={e => { setAnswers(a => ({ ...a, [q.id]: e.target.value })); setError('') }}
              onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter') next() }}
              placeholder={'placeholder' in q ? q.placeholder : ''}
              style={{ ...inputStyle, '::placeholder': { color: 'var(--border)' } } as React.CSSProperties} />
          )}

          {error && <p style={{ marginTop: 10, fontSize: 13, color: '#C0392B' }}>{error}</p>}

          <div style={{ marginTop: 28, display: 'flex', gap: 12, alignItems: 'center' }}>
            <button onClick={next}
              className="font-semibold px-7 py-3 rounded-lg text-[14px] transition-all"
              style={{ background: 'var(--accent)', color: '#fff' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-dark)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--accent)')}>
              {step === QS.length - 1 ? 'Next' : 'OK'}
              <span style={{ marginLeft: 8, opacity: 0.5, fontSize: 12 }}>Enter ↵</span>
            </button>
            {step > 0 && <button onClick={back} style={{ fontSize: 13, color: 'var(--ink-light)', cursor: 'pointer' }}>← Back</button>}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Broadcast ticker ──────────────────────────────────────────────────────────────────────────── */
const TICKER_ITEMS = ['R500 each — winning duo', 'Free entry', 'Fortnite Duos', 'Registration open', 'Final streamed live on YouTube']

function Ticker() {
  const [countdownText, setCountdownText] = useState('')
  useEffect(() => {
    const updateCountdown = () => {
      const now = Date.now()
      const target = Date.UTC(2026, 7, 27, 22, 0, 0)
      const daysLeft = Math.max(0, Math.ceil((target - now) / 86400000))
      setCountdownText(`${daysLeft} days until the Battle Bus drops`)
    }
    updateCountdown()
    const interval = setInterval(updateCountdown, 60000)
    return () => clearInterval(interval)
  }, [])

  const items = countdownText ? [...TICKER_ITEMS, countdownText] : TICKER_ITEMS
  const row = [...items, ...items]
  return (
    <div aria-hidden style={{ overflow: 'hidden', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'rgba(17,32,56,0.5)' }}>
      <div className="ticker-track">
        {row.map((t, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 28, padding: '11px 14px', fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-light)', whiteSpace: 'nowrap' }}>
            {t}
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
          </span>
        ))}
      </div>
    </div>
  )
}

/* ─── How it works ──────────────────────────────────────────────────────── */
const STEPS = [
  ['Sign up free', 'Takes a minute. No entry fee, no skill check.'],
  ['Get drawn', 'Duos are drawn at random from the entries. Everyone has the same shot.'],
  ['Play from your couch', 'Matches are scheduled around you and streamed live on YouTube.'],
  ['Winning duo takes the cash', 'R500 each, paid by EFT the day after the final.'],
]

function HowItWorks() {
  return (
    <section className="py-20 rule">
      <div className="mx-auto max-w-[1280px] px-6">
        <div className="flex items-baseline justify-between gap-6 mb-10">
          <h2 className="font-display" style={{ fontSize: 'clamp(30px, 4vw, 44px)', fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
            How it works
          </h2>
          <a href="/how-it-works" style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-mid)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
            Full rules →
          </a>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 md:gap-x-8 gap-y-8">
          {STEPS.map(([title, body], i) => (
            <div key={title} style={{ borderTop: '2px solid var(--border)', paddingTop: 18 }}>
              <p className="font-display" style={{ fontSize: 30, fontWeight: 300, fontStyle: 'italic', color: i === STEPS.length - 1 ? 'var(--accent)' : 'var(--ink-light)', lineHeight: 1, marginBottom: 14 }}>
                {String(i + 1).padStart(2, '0')}
              </p>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>{title}</h3>
              <p style={{ fontSize: 14, color: 'var(--ink-mid)', lineHeight: 1.6 }}>{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── Prize + trust band ────────────────────────────────────────────────── */
const TRUST = [
  ['Free entry', 'No fee, no catch, one signup per person.'],
  ['Real cash', 'The winner is paid by EFT the day after the final.'],
  ['No bank details upfront', "We only ask for banking info after you've won. Anyone asking sooner isn't us."],
  ['Everything on stream', 'Every match is streamed live on YouTube, so results are out in the open.'],
]

function TrustBand() {
  return (
    <section className="py-20" style={{ background: 'var(--paper)' }}>
      <div className="mx-auto max-w-[1280px] px-6 grid grid-cols-1 md:grid-cols-[1fr_1.1fr] gap-10 md:gap-16 items-start">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] mb-4" style={{ color: 'var(--accent)' }}>The prize</p>
          <h2 className="font-display" style={{ fontSize: 'clamp(34px, 4.5vw, 52px)', fontWeight: 700, color: 'var(--bg)', letterSpacing: '-0.02em', lineHeight: 1.05 }}>
            R500 each. Real cash,<br /><em style={{ fontWeight: 300 }}>real people.</em>
          </h2>
          <p style={{ fontSize: 16, color: 'var(--paper-mid)', lineHeight: 1.65, maxWidth: 420, marginTop: 18 }}>
            No points, no vouchers. One casual duo walks away with the money, and the whole thing plays out on a live stream.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-7">
          {TRUST.map(([title, body]) => (
            <div key={title} style={{ borderTop: '1px solid rgba(10,22,40,0.15)', paddingTop: 14 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--bg)', marginBottom: 5 }}>{title}</h3>
              <p style={{ fontSize: 14, color: 'var(--paper-mid)', lineHeight: 1.6 }}>{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── FAQ ────────────────────────────────────────────────────────────────── */
const FAQS = [
  { q: 'How does the random draw work?', a: 'On the day signups close, we randomly select names from the waitlist to fill the bracket.' },
  { q: 'How do we prevent cheating?', a: 'Every match must be streamed live on YouTube and the stream link submitted in your match score form. No stream, no result, no advance. Streams save automatically so we can review any disputed result. Disconnect = lose, regardless of score.' },
  { q: "What if I don't get drawn?", a: "You go on the reserve list. If someone who got drawn drops out before their round 1 match, the next person on the list takes their spot. Reserve list members also get first crack at Season 2 signups." },
  { q: 'Do I need to be in South Africa?', a: 'Yes. Season 1 is SA only, 18 and over. Future seasons will open up to other countries.' },
  { q: "What if I don't have Discord?", a: "No problem — matches are coordinated via email by the Tournament Director, so you'll get everything you need in your inbox. We do encourage you to join our Discord though. It's where the community lives and every member helps it grow." },
  { q: 'How do I get paid if I win?', a: "By EFT to your South African bank account, paid the day after the final. We ask for your bank details only after you've won, never before. If anyone asks for banking info before the final, it's not us — block them." },
  { q: 'What happens if I disconnect mid-match?', a: "If you disconnect during a match, you lose. No replays, no restarts, no exceptions. Make sure your platform and internet are stable before you start." },
  { q: 'How do I stream my match?', a: "Create a YouTube account if you don't have one. Enable streaming in YouTube Studio, stream your match from kickoff to the final whistle, then paste your stream link into the score submission page." },
  { q: 'Can I enter more than once?', a: "No. One signup per person. We check for duplicate emails, mobile numbers, and gaming IDs. Duplicates are removed." },
]

function FAQ() {
  const [open, setOpen] = useState<number | null>(null)
  const half = Math.ceil(FAQS.length / 2)
  const Col = ({ items, offset }: { items: typeof FAQS; offset: number }) => {
    const [o, setO] = useState<number | null>(null)
    return (
      <div>
        {items.map((faq, i) => (
          <div key={i} style={{ borderBottom: '1px solid var(--border)' }}>
            <button onClick={() => setO(o === i ? null : i)}
              className="w-full flex items-start justify-between text-left transition-colors"
              style={{ padding: '18px 0', gap: 16 }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink)')}>
              <span style={{ fontSize: 15, fontWeight: 500, color: 'inherit', lineHeight: 1.4 }}>{faq.q}</span>
              {o === i ? <Minus size={15} style={{ flexShrink: 0, marginTop: 2, color: 'var(--ink-light)' }} /> : <Plus size={15} style={{ flexShrink: 0, marginTop: 2, color: 'var(--ink-light)' }} />}
            </button>
            {o === i && (
              <div style={{ paddingBottom: 18, paddingRight: 32 }}>
                <p style={{ fontSize: 14, color: 'var(--ink-mid)', lineHeight: 1.7 }}>{faq.a}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    )
  }
  return (
    <section id="faq" className="py-24 rule scroll-mt-24">
      <div className="mx-auto max-w-[1280px] px-6">
        <h2 className="font-display mb-12" style={{ fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
          FAQs
        </h2>
        {/* Desktop: 2-col full list. Mobile: first 4 + "See all" link */}
        <div className="hidden md:grid md:grid-cols-2" style={{ gap: '0 64px' }}>
          <Col items={FAQS.slice(0, half)} offset={0} />
          <Col items={FAQS.slice(half)} offset={half} />
        </div>
        <div className="md:hidden">
          <Col items={FAQS.slice(0, 4)} offset={0} />
          <a href="/faq" style={{ display: 'inline-block', marginTop: 20, fontSize: 14, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>
            See all FAQs →
          </a>
        </div>
      </div>
    </section>
  )
}

/* ─── Footer ─────────────────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer style={{ background: 'var(--surface)', color: 'var(--ink)' }} className="py-16">
      <div className="mx-auto max-w-[1280px] px-6">
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr] gap-10 md:gap-12">

          {/* Brand col */}
          <div>
            <Image src="/images/logo-transparent.png" alt="Couch Cup" width={105} height={72} className="object-contain object-left mb-5" />
            <p style={{ fontSize: 14, color: 'rgba(240,244,248,0.6)', lineHeight: 1.65 }}>South Africa's free online gaming tournament.</p>
            <p style={{ fontSize: 13, color: 'rgba(240,244,248,0.4)', marginTop: 8 }}>Operated by Drummond Holdings (Pty) Ltd</p>
            <a href="mailto:hello@couchcup.co.za"
              style={{ display: 'inline-block', marginTop: 14, fontSize: 14, color: 'rgba(240,244,248,0.7)', textDecoration: 'none', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(240,244,248,0.7)')}>
              hello@couchcup.co.za
            </a>
          </div>

          {/* Socials + Legal: side by side on mobile, separate cols on desktop */}
          <div className="grid grid-cols-2 md:contents gap-8">
            {[
              { head: 'Socials', links: [['Instagram', 'https://instagram.com/couchcup'], ['TikTok', 'https://tiktok.com/@couchcup'], ['YouTube', 'https://www.youtube.com/@couchcupp'], ['Discord', 'https://discord.gg/Kz4qrFUgKJ']] },
              { head: 'Legal', links: [['Terms', '/terms'], ['Privacy', '/privacy'], ['Providers', '/providers'], ['PAIA', '/paia'], ['Rules', '/rules']] },
            ].map(col => (
              <div key={col.head}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(240,244,248,0.4)', marginBottom: 14 }}>{col.head}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {col.links.map(([label, href]) => (
                    <a key={label} href={href} target={href.startsWith('http') ? '_blank' : undefined}
                      style={{ fontSize: 14, color: 'rgba(240,244,248,0.7)', textDecoration: 'none', transition: 'color 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'rgba(240,244,248,0.7)')}>
                      {label}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>

        </div>
        <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid rgba(244,237,226,0.1)' }}>
          <p style={{ fontSize: 13, color: 'rgba(244,237,226,0.35)' }}>© 2026 Drummond Holdings (Pty) Ltd. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}

/* ─── Floating Discord ───────────────────────────────────────────────────── */
function FloatingDiscord() {
  return (
    <a href="https://discord.gg/Kz4qrFUgKJ" target="_blank" rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-xl transition-all duration-200"
      style={{ background: '#5865F2' }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.background = '#4752c4' }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.background = '#5865F2' }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.033.055a19.89 19.89 0 0 0 5.993 3.03.077.077 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
      </svg>
    </a>
  )
}

/* ─── Home page ──────────────────────────────────────────────────────────── */
export default function Home() {
  const [prize, setPrize] = useState('R500')
  useEffect(() => {
    fetch('https://ipapi.co/json/')
      .then(r => r.json())
      .then(d => { if (d.country_code && d.country_code !== 'ZA') setPrize('$30') })
      .catch(() => {})
  }, [])

  return (
    <>
      <Navbar />

      <main>
        {/* Hero + form */}
        <section id="signup" className="scroll-mt-20 hero-bg" style={{ position: 'relative', overflow: 'hidden' }}>
          {/* Centre-circle motif — kickoff mark behind the headline */}
          <div aria-hidden style={{
            position: 'absolute', left: '-180px', top: '50%', transform: 'translateY(-50%)',
            width: 640, height: 640, borderRadius: '50%',
            border: '1.5px solid rgba(200,216,232,0.07)', pointerEvents: 'none',
          }} />
          <div aria-hidden style={{
            position: 'absolute', left: '52px', top: '50%', transform: 'translateY(-50%)',
            width: 176, height: 176, borderRadius: '50%',
            border: '1.5px solid rgba(200,216,232,0.05)', pointerEvents: 'none',
          }} />

          <div className="relative mx-auto max-w-[1280px] px-6 py-10 md:py-20">
            {/* Two-col on desktop, single col on mobile */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_460px] gap-8 md:gap-16 items-center">

              {/* Left */}
              <div>
                <div className="rise flex items-center gap-2.5 mb-6">
                  <span className="live-dot" />
                  <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent)' }}>Season 2 — Fortnite Duos · Fri 28 Aug</span>
                </div>
                <h1 className="rise font-display" style={{
                  fontSize: 'clamp(46px, 7.5vw, 96px)',
                  fontWeight: 700,
                  color: 'var(--ink)',
                  letterSpacing: '-0.03em',
                  lineHeight: 0.95,
                }}>
                  Win {prize} each<br />
                  <em style={{ fontStyle: 'italic', fontWeight: 300 }}>from your <span style={{ color: 'var(--accent)' }}>couch</span>.</em>
                </h1>
                <p className="rise-3" style={{ fontSize: 17, color: 'var(--ink-mid)', lineHeight: 1.65, maxWidth: 460, marginTop: 24 }}>
                  Free online gaming tournaments for casual players. Grab a partner, get drawn into the bracket, and the last duo standing takes the cash.
                </p>
                <div className="rise-4 flex flex-wrap gap-x-6 gap-y-2 mt-6">
                  {['Free entry', 'Duos drawn at random', 'Final streamed live'].map(t => (
                    <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 600, color: 'var(--ink-light)' }}>
                      <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--ink-light)' }} />{t}
                    </span>
                  ))}
                </div>
                <div className="rise-4 hidden md:flex flex-wrap gap-3 mt-9">
                  <a href="#signup"
                    className="inline-flex items-center justify-center font-semibold px-6 py-3.5 rounded-lg text-[15px] transition-all whitespace-nowrap"
                    style={{ background: 'var(--accent)', color: '#fff' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-dark)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--accent)')}>
                    Register for Season 2 →
                  </a>
                  <a href="/how-it-works" className="inline-flex items-center justify-center font-medium px-6 py-3.5 rounded-lg text-[15px] transition-all whitespace-nowrap"
                    style={{ background: 'transparent', color: 'var(--ink)', border: '1px solid var(--border)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--cream)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    How it works
                  </a>
                </div>
              </div>

              {/* Right — form */}
              <div className="rise-3 self-start w-full">
                <div className="rounded-xl p-6 md:p-8" style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderTop: '3px solid var(--accent)',
                  boxShadow: '0 24px 60px rgba(3,8,18,0.45)',
                }}>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] mb-3" style={{ color: 'var(--accent)' }}>Season 2 — registration open</p>
                  <p className="font-display" style={{ fontSize: 'clamp(24px, 3vw, 32px)', fontWeight: 700, color: 'var(--ink)', marginBottom: 8, lineHeight: 1.1, letterSpacing: '-0.02em' }}>Get your duo in.</p>
                  <p style={{ fontSize: 15, color: 'var(--ink-mid)', lineHeight: 1.6, marginBottom: 24 }}>Fortnite Duos, Friday 28 August. Free entry, R500 each for the winning duo. Register solo — bring a partner or we'll pair you.</p>
                  <Typeform compact />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Broadcast ticker */}
        <Ticker />

        {/* Matchday — current round scoreboard */}
        <LiveStrip />

        {/* Tournaments — Current / Past tabs */}
        <TournamentsSection />

        {/* How it works */}
        <HowItWorks />

        {/* Prize + trust */}
        <TrustBand />

        {/* CTA */}
        <section className="py-8 mt-8">
          <div className="mx-auto max-w-[1280px] px-6">
            <a href="#signup" className="block rounded-2xl py-16 px-8 md:px-12 text-center transition-all"
              style={{ background: 'var(--accent)', cursor: 'pointer', textDecoration: 'none' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-dark)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--accent)')}>
              <h2 className="font-display" style={{ fontSize: 'clamp(34px, 5vw, 48px)', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.05, marginBottom: 16 }}>
                Season 2 is open for registration.
              </h2>
              <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.85)', marginBottom: 28, lineHeight: 1.5 }}>
                Fortnite Duos drops Friday 28 August. Free entry, duos drawn at random. Get your name in.
              </p>
              <span className="inline-block font-semibold text-[15px] px-7 py-3.5 rounded-lg" style={{ background: '#fff', color: 'var(--accent)' }}>
                Register for Season 2 →
              </span>
            </a>
          </div>
        </section>

        {/* FAQ */}
        <FAQ />
      </main>

      <Footer />
      <FloatingDiscord />
    </>
  )
}
