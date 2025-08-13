// js/api/library-client.js
// Client pour /api/library (Netlify Function). Fallback local si indisponible.
const API_BASE = '/api/library';

async function safeJson(res){
  const txt = await res.text();
  try{ return JSON.parse(txt); }catch{ return txt; }
}
function normalizeList(json){
  if(Array.isArray(json)) return json;
  if(json && Array.isArray(json.data)) return json.data;
  return [];
}
function normalizeItem(json){
  if(Array.isArray(json)) return json[0] || null;
  return json?.data ?? json ?? null;
}

export async function getAll(){
  try{
    const res = await fetch(API_BASE, { headers: { 'Accept':'application/json' }});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await safeJson(res);
    const list = normalizeList(json);
    if(list.length) return list;
    throw new Error('liste vide');
  }catch(e){
    // fallback local
    const res2 = await fetch('./data/library.json');
    const json2 = await res2.json();
    return normalizeList(json2);
  }
}

export async function getOne(id){
  try{
    const res = await fetch(`${API_BASE}/${encodeURIComponent(id)}`, { headers: { 'Accept':'application/json' }});
    if(res.status === 404) return null;
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await safeJson(res);
    return normalizeItem(json);
  }catch(e){
    // fallback depuis la liste locale
    const all = await getAll();
    return all.find(x => (x.id===id) || (x.slug===id) || (x.title===id)) || null;
  }
}

export default { getAll, getOne };
