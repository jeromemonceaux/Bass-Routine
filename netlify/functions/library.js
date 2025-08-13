// netlify/functions/library.js
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE
const TABLE = 'grids'

function j(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
    }
  })
}
function cors204() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
      'access-control-allow-headers': 'content-type',
    }
  })
}

function supabaseAdmin() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    throw new Error('ENV manquante: SUPABASE_URL ou SUPABASE_SERVICE_ROLE')
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } })
}

// ---------- Localisation robuste de presets.json -----------
function findPresetsPath() {
  const p1 = path.resolve(process.cwd(), 'presets.json')
  if (fs.existsSync(p1)) return p1

  try {
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(__filename)
    const candidates = [
      path.resolve(__dirname, '../../presets.json'),
      path.resolve(__dirname, '../presets.json'),
      path.resolve(__dirname, 'presets.json'),
    ]
    for (const p of candidates) if (fs.existsSync(p)) return p
  } catch (_) {}

  return null
}
function readPresets() {
  const fp = findPresetsPath()
  if (!fp) throw new Error('presets.json introuvable. Vérifie netlify.toml [functions.included_files]')
  let raw
  try { raw = fs.readFileSync(fp, 'utf8') } catch (e) { throw new Error('Lecture presets.json impossible: '+e.message) }
  let data
  try { data = JSON.parse(raw) } catch (e) { throw new Error('JSON invalide dans presets.json: '+e.message) }
  if (!Array.isArray(data)) throw new Error('presets.json doit être un tableau JSON')
  return { data, file: fp, size: Buffer.byteLength(raw, 'utf8') }
}

function normalizeItem(x) {
  if (!x) return null
  const id = String(x.id || '').trim()
  if (!id) return null
  return {
    id,
    title: x.title || x.name || '',
    composer: x.composer || x.author || '',
    style: x.style || '',
    tags: x.tags || [],
    grid_text: x.grid_text || x.grid || '',
    bars: x.bars || null,
    key: x.key || null,
    mode: x.mode || null,
    tpb: x.tpb || null,
  }
}

async function seedManual(sb) {
  const { data, file, size } = readPresets()
  const payload = data.map(normalizeItem).filter(Boolean)
  if (!payload.length) return { inserted: 0, file, size }

  let inserted = 0
  const chunk = 500
  for (let i = 0; i < payload.length; i += chunk) {
    const slice = payload.slice(i, i + chunk)
    const { data: up, error } = await sb.from(TABLE).upsert(slice, { onConflict: 'id' }).select('id')
    if (error) throw new Error('Supabase upsert failed: '+error.message)
    inserted += up?.length || 0
  }
  return { inserted, file, size }
}

async function seedIfEmpty(sb) {
  const head = await sb.from(TABLE).select('id').limit(1)
  if (head.error) throw new Error('Supabase select failed: '+head.error.message)
  if (Array.isArray(head.data) && head.data.length) return { seeded: false, inserted: 0 }

  const res = await seedManual(sb)
  return { seeded: true, ...res }
}

export default async (req) => {
  try {
    if (req.method === 'OPTIONS') return cors204()

    const url = new URL(req.url)
    const parts = url.pathname.split('/').filter(Boolean)
    const i = parts.indexOf('library')
    const tail = i >= 0 ? parts.slice(i + 1) : []
    const sb = supabaseAdmin()

    // ---- DIAG: lecture presets & env ----
    if (req.method === 'GET' && tail[0] === 'diag') {
      const diag = {
        env: {
          SUPABASE_URL: SUPABASE_URL ? SUPABASE_URL.replace(/https?:\/\//,'').split('.')[0]+'…' : null,
          SERVICE_KEY: SUPABASE_SERVICE_ROLE ? 'present' : 'missing'
        },
        presets: (() => {
          try {
            const { data, file, size } = readPresets()
            return { ok: true, file, size, count: data.length }
          } catch (e) {
            return { ok: false, error: e.message }
          }
        })(),
        tableCheck: null
      }

      try {
        const test = await sb.from(TABLE).select('id').limit(1)
        diag.tableCheck = test.error ? { ok:false, error:test.error.message } : { ok:true }
      } catch (e) {
        diag.tableCheck = { ok:false, error: e.message }
      }
      return j(diag)
    }

    // ---- DIAG: juste compter presets sans DB ----
    if (req.method === 'GET' && tail[0] === 'presets') {
      const { data, file, size } = readPresets()
      return j({ file, size, count: data.length, sample: data.slice(0, 3).map(x => x.id) })
    }

    // ---- SEED manuel ----
    if (req.method === 'POST' && tail[0] === 'seed') {
      try {
        const out = await seedManual(sb)
        return j({ ok:true, ...out })
      } catch (e) {
        console.error('[seedManual]', e)
        return j({ ok:false, error: e.message }, 500)
      }
    }

    // ---- LISTE (avec seed auto si vide) ----
    if (req.method === 'GET' && tail.length === 0) {
      try { await seedIfEmpty(sb) } catch (e) { console.warn('[seedIfEmpty]', e.message) }
      const { data, error } = await sb.from(TABLE)
        .select('id,title,composer,style,tags,grid_text')
        .order('title', { ascending: true })
      if (error) return j({ error: error.message }, 500)
      return j(Array.isArray(data) ? data : [])
    }

    // ---- GET one ----
    if (req.method === 'GET' && tail.length === 1) {
      const id = decodeURIComponent(tail[0])
      const { data, error } = await sb.from(TABLE).select('*').eq('id', id).single()
      if (error && error.code !== 'PGRST116') return j({ error: error.message }, 500)
      if (!data) return j(null, 404)
      return j(data)
    }

    // ---- UPSERT one ----
    if (req.method === 'PATCH' && tail.length === 1) {
      const id = decodeURIComponent(tail[0])
      let body = {}
      try { body = await req.json() } catch (_) {}
      const payload = normalizeItem({ ...body, id })
      if (!payload) return j({ error: 'invalid payload' }, 400)
      const { data, error } = await sb.from(TABLE).upsert(payload, { onConflict: 'id' }).select('*').single()
      if (error) return j({ error: error.message }, 500)
      return j(data)
    }

    return new Response('Not found', { status: 404, headers: { 'access-control-allow-origin': '*' } })
  } catch (e) {
    console.error('[library.js fatal]', e)
    return j({ error: String(e.message || e) }, 500)
  }
}