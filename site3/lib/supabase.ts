const PROJECT_REF = 'rnoavvjxiozlyrulffal'
const SUPABASE_URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`

export async function sql<T = Record<string, unknown>>(
  query: string,
  params: (string | number | boolean | null)[] = []
): Promise<T[]> {
  let q = query
  params.forEach((p, i) => {
    const val = p === null ? 'NULL' : `'${String(p).replace(/'/g, "''")}'`
    q = q.replace(new RegExp(`\\$${i + 1}(?!\\d)`, 'g'), () => val)
  })

  const res = await fetch(SUPABASE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_MANAGEMENT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: q }),
  })

  const data = await res.json()
  if (!res.ok || data?.message) throw new Error(data?.message ?? `Supabase error ${res.status}`)
  return data as T[]
}
