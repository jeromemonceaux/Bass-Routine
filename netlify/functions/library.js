// netlify/functions/library.js
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ====== ENV & Supabase (Service Role) ======
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;
const TABLE = 'grids';

if (!SUPABASE_URL) console.error('[library] SUPABASE_URL manquant');
if (!SUPABASE_SERVICE_ROLE) console.error('[library] SUPABASE_SERVICE_ROLE manquant');

function sbAdmin() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    throw new Error('ENV manquante: SUPABASE_URL ou SUPABASE_SERVICE_ROLE');
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
    auth: { persistSession: false },
  });
}

function j(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
    },
  });
}
function cors204() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
  });
}

// ====== Seed file resolution ======
// 1) ENV override possible: LIBRARY_SEED_FILE
// 2) sinon on préfère library-seed-200-jazz-latin-funk-soul.json (votre fichier)
// 3) fallback éventuel sur presets.json
function resolveSeedCandidates() {
  const envFile = process.env.LIBRARY_SEED_FILE || '';
  const names = [
    envFile,
    'library-seed-200-jazz-latin-funk-soul.json',
    'presets.json',
  ].filter(Boolean);
  return names;
}

function findSeedPath() {
  const names = resolveSeedCandidates();
  // cwd
  for (const n of names) {
    const p = path.resolve(process.cwd(), n);
    if (fs.existsSync(p)) return p;
  }
  // next to function file
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    for (const n of names) {
      const p = path.resolve(__dirname, '../../', n);
      if (fs.existsSync(p)) return p;
    }
    for (const n of names) {
      const p = path.resolve(__dirname, '../', n);
      if (fs.existsSync(p)) return p;
    }
    for (const n of names) {
      const p = path.resolve(__dirname, n);
      if (fs.existsSync(p)) return p;
    }
  } catch (_) {}
  return null;
}

function readSeed() {
  const fp = findSeedPath();
  if (!fp) throw new Error('Fichier seed introuvable. (LIBRARY_SEED_FILE, library-seed-200-jazz-latin-funk-soul.json ou presets.json)');
  let raw;
  try {
    raw = fs.readFileSync(fp, 'utf8');
  } catch (e) {
    throw new Error('Lecture seed impossible: ' + e.message);
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error('JSON invalide dans seed: ' + e.message);
  }
  if (!Array.isArray(data)) throw new Error('Le seed doit être un tableau JSON');
  return { data, file: fp, size: Buffer.byteLength(raw, 'utf8') };
}

function normalizeItem(x) {
  if (!x) return null;
  const id = String(x.id || '').trim();
  if (!id) return null;
  return {
    id,
    title: x.title || x.name || '',
    composer: x.composer || x.author || '',
    style: x.style || '',
    tags: x.tags || [],
    grid_text: x.grid_text || x.grid || '',
    // champs optionnels, si votre table les a :
    key: x.key ?? null,
    mode: x.mode ?? null,
    tpb: x.tpb ?? null,
    bars: x.bars ?? null,
  };
}

// insert/update en chunks
async function upsertChunked(sb, payload, chunk = 500) {
  let inserted = 0;
  for (let i = 0; i < payload.length; i += chunk) {
    const slice = payload.slice(i, i + chunk);
    const { data: up, error } = await sb.from(TABLE).upsert(slice, { onConflict: 'id' }).select('id');
    if (error) throw new Error(error.message);
    inserted += up?.length || 0;
  }
  return inserted;
}

async function seedManual(sb) {
  const { data, file, size } = readSeed();
  const payload = data.map(normalizeItem).filter(Boolean);
  if (!payload.length) return { inserted: 0, file, size };
  const inserted = await upsertChunked(sb, payload);
  return { inserted, file, size };
}

async function seedIfEmpty(sb) {
  const head = await sb.from(TABLE).select('id').limit(1);
  if (head.error) throw new Error('Supabase select failed: ' + head.error.message);
  if (Array.isArray(head.data) && head.data.length) return { seeded: false, inserted: 0 };
  const res = await seedManual(sb);
  return { seeded: true, ...res };
}

// Remplit uniquement les enregistrements sans grid_text en se basant sur le seed
async function resyncSeed(sb) {
  const { data: dbItems, error: e1 } = await sb.from(TABLE).select('id,grid_text');
  if (e1) throw new Error('select failed: ' + e1.message);

  const have = new Map((dbItems || []).map((r) => [r.id, r.grid_text || '']));

  const { data: seed } = readSeed();
  const todo = [];
  for (const raw of seed) {
    const it = normalizeItem(raw);
    if (!it) continue;
    const current = have.get(it.id);
    // Si en base c'est vide ET dans le seed il y a du contenu => on alimente
    if ((current == null || current === '') && (it.grid_text && it.grid_text.trim())) {
      todo.push({ id: it.id, title: it.title, composer: it.composer, style: it.style, tags: it.tags, grid_text: it.grid_text, key: it.key, mode: it.mode, tpb: it.tpb, bars: it.bars });
    }
  }
  if (!todo.length) return { updated: 0 };
  const updated = await upsertChunked(sb, todo);
  return { updated };
}

export default async (req) => {
  try {
    if (req.method === 'OPTIONS') return cors204();

    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const idx = parts.indexOf('library');
    const tail = idx >= 0 ? parts.slice(idx + 1) : [];

    const sb = sbAdmin();

    // --- WHOAMI (diagnostic rôles/clé) ---
    if (req.method === 'GET' && tail[0] === 'whoami') {
      return j({
        url: SUPABASE_URL?.replace(/^https?:\/\//, '') || null,
        role: 'service', // on utilise la Service Role ici
        hasServiceKey: !!SUPABASE_SERVICE_ROLE,
      });
    }

    // --- DIAG : seed + table ---
    if (req.method === 'GET' && tail[0] === 'diag') {
      const diag = {
        env: {
          SUPABASE_URL: SUPABASE_URL ? SUPABASE_URL.replace(/https?:\/\//, '').split('.')[0] + '…' : null,
          SERVICE_KEY: SUPABASE_SERVICE_ROLE ? 'present' : 'missing',
        },
        seed: (() => {
          try {
            const { file, size, data } = readSeed();
            return { ok: true, file, size, count: data.length };
          } catch (e) {
            return { ok: false, error: e.message };
          }
        })(),
        tableCheck: null,
      };
      try {
        const test = await sb.from(TABLE).select('id').limit(1);
        diag.tableCheck = test.error ? { ok: false, error: test.error.message } : { ok: true };
      } catch (e) {
        diag.tableCheck = { ok: false, error: e.message };
      }
      return j(diag);
    }

    // --- Compter le remplissage ---
    if (req.method === 'GET' && tail[0] === 'counts') {
      const { data, error } = await sb.from(TABLE).select('id, grid_text');
      if (error) return j({ error: error.message }, 500);
      const total = data?.length || 0;
      const withText = (data || []).filter((r) => r.grid_text && r.grid_text.trim()).length;
      return j({ total, withText, withoutText: total - withText });
    }

    // --- SEED manuel (force) ---
    if (req.method === 'POST' && tail[0] === 'seed') {
      try {
        const out = await seedManual(sb);
        return j({ ok: true, ...out });
      } catch (e) {
        console.error('[seedManual]', e);
        return j({ ok: false, error: e.message }, 500);
      }
    }

    // --- RESYNC seed (hydrate uniquement les vides) ---
    if (req.method === 'POST' && tail[0] === 'resync-seed') {
      try {
        const out = await resyncSeed(sb);
        return j({ ok: true, ...out });
      } catch (e) {
        console.error('[resyncSeed]', e);
        return j({ ok: false, error: e.message }, 500);
      }
    }

    // --- LISTE (seed auto si vide) ---
    if (req.method === 'GET' && tail.length === 0) {
      try {
        await seedIfEmpty(sb);
      } catch (e) {
        console.warn('[seedIfEmpty]', e.message);
      }
      const { data, error } = await sb
        .from(TABLE)
        .select('id,title,composer,style,tags,grid_text')
        .order('title', { ascending: true });
      if (error) return j({ error: error.message }, 500);
      return j(Array.isArray(data) ? data : []);
    }

    // --- GET one ---
    if (req.method === 'GET' && tail.length === 1) {
      const id = decodeURIComponent(tail[0]);
      const { data, error } = await sb.from(TABLE).select('*').eq('id', id).single();
      if (error && error.code !== 'PGRST116') return j({ error: error.message }, 500);
      if (!data) return j(null, 404);
      return j(data);
    }

    // --- UPSERT one ---
    if (req.method === 'PATCH' && tail.length === 1) {
      const id = decodeURIComponent(tail[0]);
      let body = {};
      try {
        body = await req.json();
      } catch (_) {}
      const payload = normalizeItem({ ...body, id });
      if (!payload) return j({ error: 'invalid payload' }, 400);
      const { data, error } = await sb.from(TABLE).upsert(payload, { onConflict: 'id' }).select('*').single();
      if (error) return j({ error: error.message }, 500);
      return j(data);
    }

    return new Response('Not found', { status: 404, headers: { 'access-control-allow-origin': '*' } });
  } catch (e) {
    console.error('[library.js fatal]', e);
    return j({ error: String(e.message || e) }, 500);
  }
};