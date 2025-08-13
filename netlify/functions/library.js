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
// 2) sinon on préfère library-seed-200-jazz-latin-funk-soul.json
// 3) fallback: presets.json
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

// ====== Helpers ======
// Convertit un tableau de mesures (bars) en texte de grille compact
function barsToText(bars, tpb = 4) {
  try {
    const arr = Array.isArray(bars) ? bars : [];
    const lines = [];
    let line = [];
    for (let i = 0; i < arr.length; i++) {
      const bar = arr[i];
      const chords = Array.isArray(bar) ? bar : (bar && Array.isArray(bar.chords) ? bar.chords : []);
      const cell = (chords && chords.length) ? chords.join(' ') : '—';
      line.push(cell);
      // 4 mesures par ligne par défaut
      if (line.length >= 4) {
        lines.push('| ' + line.join(' | ') + ' |');
        line = [];
      }
    }
    if (line.length) {
      lines.push('| ' + line.join(' | ') + ' |');
    }
    return lines.join('\n').trim();
  } catch (_) {
    return '';
  }
}
function barsToGridText(bars, perLine = 4) {
  if (!Array.isArray(bars) || !bars.length) return '';
  const lines = [];
  for (let i = 0; i < bars.length; i += perLine) {
    const chunk = bars.slice(i, i + perLine).map(m => {
      const arr = Array.isArray(m) ? m : (m && m.chords) || [];
      return arr.length ? arr.join(' ') : '—';
    });
    lines.push('| ' + chunk.join(' | ') + ' |');
  }
  return lines.join('\n');
}
function normalizeItem(x) {
  if (!x) return null;
  const id = String(x.id || '').trim();
  if (!id) return null;

  // Harmonisation des champs
  const title = x.title || x.name || '';
  const composer = x.composer || x.author || '';
  const style = x.style || '';
  const tags = Array.isArray(x.tags) ? x.tags : (x.tags ? [x.tags] : []);
  const bars = x.bars || null;
  const key = x.key || null;
  const mode = x.mode || null;
  const tpb = x.tpb || null;

  // grid_text source: grid_text > grid > derive(bars)
  let grid_text = x.grid_text || x.grid || '';
  if ((!grid_text || !grid_text.trim()) && bars) {
    grid_text = barsToText(bars, tpb || 4);
  }

  return { id, title, composer, style, tags, grid_text, bars, key, mode, tpb };
}
function minimalPayloadForTable(payloadRow) {
  // Si ta table n’a pas certaines colonnes (ex: bars, key, mode, tpb), enlève-les ici.
  const { id, title, composer, style, tags, grid_text /*, key, mode, tpb, bars*/ } = payloadRow;
  return { id, title, composer, style, tags, grid_text /*, key, mode, tpb, bars*/ };
}

function dedupeById(list) {
  const map = new Map();
  for (const it of list || []) {
    if (it && it.id) map.set(it.id, it); // conserve le dernier
  }
  return Array.from(map.values());
}
// insert/update en chunks
async function upsertChunked(sb, payload, chunk = 300) {
  let inserted = 0;

  // dédup globale
  payload = dedupeById(payload);

  for (let i = 0; i < payload.length; i += chunk) {
    // dédup par tranche (sécurité)
    let slice = dedupeById(payload.slice(i, i + chunk)).map(minimalPayloadForTable);

    try {
      const { data: up, error } = await sb
        .from(TABLE)
        .upsert(slice, { onConflict: 'id' })
        .select('id');

      if (error) throw error;
      inserted += up?.length || 0;

    } catch (e) {
      // Fallback: on tente en unitaire pour identifier l’élément fautif
      if (String(e.message || e).includes('cannot affect row a second time')) {
        for (const row of slice) {
          try {
            const { data: one, error: e1 } = await sb
              .from(TABLE)
              .upsert(row, { onConflict: 'id' })
              .select('id')
              .single();
            if (e1) throw e1;
            inserted += one ? 1 : 0;
          } catch (e2) {
            console.error('[upsert one failed]', row.id, e2.message || e2);
          }
        }
      } else {
        throw e;
      }
    }
  }
  return inserted;
}

// Backfill DB: génère grid_text pour les items qui ont des bars mais pas de grid_text
async function backfillGridText(sb) {
  // Récupère les candidates: grid_text NULL ou vide, et bars non NULL
  const { data, error } = await sb
    .from(TABLE)
    .select('id,bars,tpb,grid_text')
    .or('grid_text.is.null,grid_text.eq.')
    .not('bars', 'is', null)
    .limit(5000);

  if (error) throw new Error('select failed: ' + error.message);
  const rows = Array.isArray(data) ? data : [];
  let updated = 0;

  for (const row of rows) {
    const txt = barsToText(row.bars, row.tpb || 4);
    if (txt && txt.trim()) {
      const { error: e2 } = await sb.from(TABLE).update({ grid_text: txt }).eq('id', row.id);
      if (!e2) updated++;
      else console.error('[backfill update failed]', row.id, e2.message);
    }
  }
  return { scanned: rows.length, updated };
}

async function seedManual(sb) {
  const { data, file, size } = readSeed();
  const payloadRaw = data.map(normalizeItem).filter(Boolean);
  const payload = dedupeById(payloadRaw);
  if (!payload.length) return { inserted: 0, file, size, dedupedFrom: payloadRaw.length };

  const inserted = await upsertChunked(sb, payload);
  return { inserted, file, size, dedupedFrom: payloadRaw.length };
}
async function seedIfEmpty(sb) {
  const head = await sb.from(TABLE).select('id').limit(1);
  if (head.error) throw new Error('Supabase select failed: ' + head.error.message);
  if (Array.isArray(head.data) && head.data.length) return { seeded: false, inserted: 0 };
  const res = await seedManual(sb);
  return { seeded: true, ...res };
}
// Hydrate uniquement les records où grid_text est vide (depuis seed). Si le seed n’a que "bars", on génère grid_text.
async function resyncSeed(sb) {
  const { data: dbItems, error: e1 } = await sb.from(TABLE).select('id,grid_text');
  if (e1) throw new Error('select failed: ' + e1.message);

  const have = new Map((dbItems || []).map((r) => [r.id, (r.grid_text || '').trim()]));
  const { data: seed } = readSeed();

  const todo = [];
  for (const raw of seed) {
    const it = normalizeItem(raw);
    if (!it) continue;
    const cur = have.get(it.id);
    const needs = !cur; // vide ou undefined
    if (needs && it.grid_text && it.grid_text.trim()) {
      todo.push(minimalPayloadForTable(it));
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

    // --- WHOAMI ---
    if (req.method === 'GET' && tail[0] === 'whoami') {
      return j({
        url: SUPABASE_URL?.replace(/^https?:\/\//, '') || null,
        role: 'service',
        hasServiceKey: !!SUPABASE_SERVICE_ROLE,
      });
    }

    // ---- BACKFILL (bars -> grid_text) ----
    if (req.method === 'POST' && tail[0] === 'backfill') {
      try {
        const out = await backfillGridText(sb);
        return j({ ok: true, ...out });
      } catch (e) {
        console.error('[backfill]', e);
        return j({ ok: false, error: e.message }, 500);
      }
    }

    // --- DIAG ---
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

    // --- SEED manuel ---
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

    // --- WIPE: vider complètement la table (service role requis) ---
    if (req.method === 'POST' && tail[0] === 'wipe') {
      try {
        // supprime toutes les lignes en filtrant sur un champ non-null
        const { error } = await sb.from(TABLE).delete().neq('id', null);
        if (error) return j({ ok: false, error: error.message }, 500);
        return j({ ok: true });
      } catch (e) {
        console.error('[wipe]', e);
        return j({ ok: false, error: e.message }, 500);
      }
    }

    // --- LISTE (seed auto si vide) ---
    if (req.method === 'GET' && tail.length === 0) {
      try { await seedIfEmpty(sb); } catch (e) { console.warn('[seedIfEmpty]', e.message); }
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
      try { body = await req.json(); } catch (_) {}
      // si l’appelant envoie seulement bars -> on génère grid_text aussi
      if ((!body.grid_text || !String(body.grid_text).trim()) && Array.isArray(body.bars)) {
        body.grid_text = barsToGridText(body.bars);
      }
      const payload = normalizeItem({ ...body, id });
      if (!payload) return j({ error: 'invalid payload' }, 400);
      const { data, error } = await sb.from(TABLE).upsert(minimalPayloadForTable(payload), { onConflict: 'id' }).select('*').single();
      if (error) return j({ error: error.message }, 500);
      return j(data);
    }

    return new Response('Not found', { status: 404, headers: { 'access-control-allow-origin': '*' } });
  } catch (e) {
    console.error('[library.js fatal]', e);
    return j({ error: String(e.message || e) }, 500);
  }
};
