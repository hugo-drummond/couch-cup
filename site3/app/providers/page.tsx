import LegalPage from '@/components/LegalPage'

export const metadata = { title: 'Service Providers — Couch Cup' }

const PROVIDERS = [
  {
    name: 'Vercel Inc.',
    service: 'Website hosting and serverless functions',
    country: 'United States',
    privacy: 'vercel.com/legal/privacy-policy',
  },
  {
    name: 'Supabase Inc.',
    service: 'Database and backend-as-a-service',
    country: 'United States',
    privacy: 'supabase.com/privacy',
  },
  {
    name: 'Amazon Web Services, Inc.',
    service: 'Transactional email (primary)',
    country: 'European Union (Sweden)',
    privacy: 'aws.amazon.com/privacy',
  },
  {
    name: 'Resend Inc.',
    service: 'Transactional email (fallback)',
    country: 'United States',
    privacy: 'resend.com/privacy',
  },
  {
    name: 'Discord Inc.',
    service: 'Community platform',
    country: 'United States',
    privacy: 'discord.com/privacy',
  },
  {
    name: 'YouTube LLC (Google)',
    service: 'Match live streaming',
    country: 'United States',
    privacy: 'policies.google.com/privacy',
  },
]

export default function ProvidersPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Service Providers"
      version="Version 1.1"
      date="17 June 2026"
    >
      <div className="prose-legal">
        <p>
          In accordance with section 18 of the Protection of Personal Information Act, 2013 ("POPIA") and the Couch Cup Privacy Policy, this page lists the third-party service providers that process personal information on behalf of Drummond Holdings (Pty) Ltd trading as Couch Cup, the country in which each provider holds data, and the transfer mechanism relied upon where data is transferred outside South Africa.
        </p>

        <h2>Current service providers</h2>

        <div className="overflow-x-auto mt-6">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #E5E5E5' }}>
                <th style={{ textAlign: 'left', padding: '10px 12px', color: '#525252', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Provider</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', color: '#525252', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Service</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', color: '#525252', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Data location</th>
              </tr>
            </thead>
            <tbody>
              {PROVIDERS.map((p, i) => (
                <tr key={p.name} style={{ borderBottom: '1px solid #E5E5E5', background: i % 2 === 0 ? '#FAFAFA' : '#fff' }}>
                  <td style={{ padding: '12px', fontWeight: 500, color: '#0A0A0A' }}>
                    {p.name}
                  </td>
                  <td style={{ padding: '12px', color: '#525252' }}>{p.service}</td>
                  <td style={{ padding: '12px', color: '#525252' }}>{p.country}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2>Cross-border transfer mechanism</h2>
        <p>
          Most providers listed above are located in the United States; Amazon Web Services processes email data in the European Union (Sweden). Personal information transferred to these providers is protected by one or more of the following mechanisms in accordance with section 72 of POPIA:
        </p>
        <ul>
          <li>Your consent, given at signup in accordance with section 72(1)(b) of POPIA.</li>
          <li>Contractual data protection commitments from the service provider providing an adequate level of protection comparable to POPIA, including Standard Contractual Clauses where applicable, in accordance with section 72(1)(a).</li>
          <li>The service provider's participation in the EU-US Data Privacy Framework or equivalent recognised international frameworks.</li>
        </ul>

        <h2>Updates to this list</h2>
        <p>
          This list is updated when we add or remove service providers. If you have questions about how your personal information is shared with any of these providers, email privacy@couchcup.co.za.
        </p>
      </div>
    </LegalPage>
  )
}
