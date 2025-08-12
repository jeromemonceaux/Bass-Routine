import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,PATCH,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_KEY; // service_role recommended

function jsonResponse(body, status = 200) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
    body: JSON.stringify(body)
  };
}

export default async function handler(event, context) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return jsonResponse({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE/KEY' }, 500);
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

  try {
    // PATCH /api/library/:id  -> upsert one item into 'default' document
    if (event.httpMethod === 'PATCH') {
      const match = (event.path || '').match(/\/api\/library\/(.+)$/);
      if (!match) return jsonResponse({ error: 'Missing id in path' }, 400);
      const itemId = decodeURIComponent(match[1]);
      if (!itemId) return jsonResponse({ error: 'Invalid id' }, 400);
      let body;
      try { body = JSON.parse(event.body || '{}'); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }
      if (!body || typeof body !== 'object') return jsonResponse({ error: 'Body must be an object' }, 400);
      if (!body.id) body.id = itemId;

      const { data: row, error: selErr } = await supabase
        .from('libraries').select('data').eq('id', 'default').maybeSingle();
      if (selErr) throw selErr;
      const lib = Array.isArray(row?.data) ? row.data : [];
      const idx = lib.findIndex(x => x && x.id === itemId);
      if (idx >= 0) lib[idx] = { ...lib[idx], ...body };
      else lib.push(body);

      const { error: upErr } = await supabase
        .from('libraries').upsert({ id: 'default', data: lib }).select();
      if (upErr) throw upErr;
      return jsonResponse({ ok: true, id: itemId }, 200);
    }

    // GET /api/library
    if (event.httpMethod === 'GET') {
      const { data, error } = await supabase
        .from('libraries').select('data').eq('id', 'default').maybeSingle();
      if (error) throw error;
      return jsonResponse(data?.data ?? [], 200);
    }

    // PUT /api/library
    if (event.httpMethod === 'PUT') {
      let body;
      try { body = JSON.parse(event.body || '[]'); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }
      if (!Array.isArray(body)) return jsonResponse({ error: 'Body must be an array' }, 400);
      const { error } = await supabase
        .from('libraries').upsert({ id: 'default', data: body }).select();
      if (error) throw error;
      return jsonResponse({ ok: true }, 200);
    }

    return jsonResponse({ error: 'Method not allowed' }, 405);
  } catch (err) {
    return jsonResponse({ error: err.message || String(err) }, 500);
  }
}
