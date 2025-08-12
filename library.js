import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,PATCH,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function jsonResponse(body, status = 200) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
    body: JSON.stringify(body)
  };
}

function textResponse(body, status = 200) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', ...corsHeaders },
    body
  };
}

export default async function handler(event, context) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_KEY; // prefer service_role
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return jsonResponse({ error: 'Missing Supabase env vars (SUPABASE_URL / SUPABASE_SERVICE_ROLE)' }, 500);
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

  const path = event.path || '';
  const matchPatch = path.match(/\/api\/library\/(.+)$/);

  try {
    if (event.httpMethod === 'GET') {
      const { data, error } = await supabase
        .from('libraries')
        .select('data')
        .eq('id', 'default')
        .maybeSingle();
      if (error) throw error;
      const payload = data?.data ?? [];
      return jsonResponse(payload, 200);
    }

    if (event.httpMethod === 'PUT') {
      let body;
      try { body = JSON.parse(event.body || '[]'); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }
      if (!Array.isArray(body)) return jsonResponse({ error: 'Body must be an array' }, 400);

      const { error } = await supabase
        .from('libraries')
        .upsert({ id: 'default', data: body })
        .select();
      if (error) throw error;

      return jsonResponse({ ok: true }, 200);
    }

    if (event.httpMethod === 'PATCH' && matchPatch) {
      const itemId = decodeURIComponent(matchPatch[1]);
      if (!itemId) return jsonResponse({ error: 'Missing :id' }, 400);

      let patch;
      try { patch = JSON.parse(event.body || '{}'); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }
      if (!patch || typeof patch !== 'object') return jsonResponse({ error: 'Body must be an object' }, 400);

      // Load current library
      const { data: row, error: e1 } = await supabase
        .from('libraries')
        .select('data')
        .eq('id', 'default')
        .maybeSingle();
      if (e1) throw e1;
      const lib = Array.isArray(row?.data) ? row.data : [];

      // Upsert item
      const idx = lib.findIndex(x => x && x.id === itemId);
      if (idx >= 0) {
        lib[idx] = { ...lib[idx], ...patch, id: itemId };
      } else {
        lib.push({ id: itemId, ...patch });
      }

      const { error: e2 } = await supabase
        .from('libraries')
        .upsert({ id: 'default', data: lib })
        .select();
      if (e2) throw e2;

      return jsonResponse({ ok: true, id: itemId }, 200);
    }

    return jsonResponse({ error: 'Method not allowed' }, 405);
  } catch (err) {
    return jsonResponse({ error: err.message || String(err) }, 500);
  }
}
