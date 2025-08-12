
import { createClient } from '@supabase/supabase-js'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,PATCH,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors, ...headers },
  })
}

export default async (request, context) => {
  if (request.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: cors })
  }

  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_KEY
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return json({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE/KEY' }, 500)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

  try {
    const url = new URL(request.url)
    const pathname = url.pathname
    const match = pathname.match(/\/(?:api\/library|\.netlify\/functions\/library)\/?(.*)$/)
    const splat = match?.[1] || ''

    if (request.method === 'PATCH') {
      const itemId = decodeURIComponent(splat || '')
      if (!itemId) return json({ error: 'Missing id in path' }, 400)
      let body
      try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
      if (!body || typeof body !== 'object') return json({ error: 'Body must be an object' }, 400)
      if (!body.id) body.id = itemId

      const { data: row, error: selErr } = await supabase.from('libraries').select('data').eq('id','default').maybeSingle()
      if (selErr) throw selErr
      const lib = Array.isArray(row?.data) ? row.data : []
      const idx = lib.findIndex(x => x && x.id === itemId)
      if (idx >= 0) lib[idx] = { ...lib[idx], ...body }
      else lib.push(body)
      const { error: upErr } = await supabase.from('libraries').upsert({ id:'default', data: lib }).select()
      if (upErr) throw upErr
      return json({ ok:true, id:itemId }, 200)
    }

    if (request.method === 'GET') {
      const { data, error } = await supabase.from('libraries').select('data').eq('id','default').maybeSingle()
      if (error) throw error
      return json(data?.data ?? [], 200)
    }

    if (request.method === 'PUT') {
      let body
      try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
      if (!Array.isArray(body)) return json({ error: 'Body must be an array' }, 400)
      const { error } = await supabase.from('libraries').upsert({ id:'default', data: body }).select()
      if (error) throw error
      return json({ ok:true }, 200)
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (err) {
    return json({ error: err?.message || String(err) }, 500)
  }
}
