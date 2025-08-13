// js/grid/grid-bridge.js
(function(){
  'use strict';

  // ——— Helpers parse ———
  function parseUsingGridParse(txt){
    if (!window.GridParse || typeof window.GridParse.parse!=='function') return null;
    try{
      const res = window.GridParse.parse(String(txt||''));
      return {
        bars: Array.isArray(res.bars) ? res.bars : [],
        sections: Array.isArray(res.sections) ? res.sections : [],
        repeats: (res.repeats && typeof res.repeats==='object') ? res.repeats : {L:[],R:[]}
      };
    }catch(_){ return null; }
  }
  function crudeParse(txt){
    const lines = String(txt||'').split(/\r?\n/);
    const bars = []; const sections=[]; const L=[], R=[];
    let idx=0;
    const symRe = /^(𝄆|𝄇|Fine|To Coda|Segno|Coda|D\.?S\.?|D\.?C\.?)/i;
    for (let raw of lines){
      const line = raw.trim();
      if (!line) continue;
      // Section markers: "A:", "Bridge:", "(Intro):", etc.
      const sm = line.match(/^\s*[\[(]?\s*([A-Za-z][A-Za-z0-9 ]*)\s*:\s*[\])]?\s*$/);
      if (sm){ sections.push({ index: idx+1, label: sm[1] }); continue; }
      // bar chunks
      const parts = line.split('|').map(s=>s.trim()).filter(Boolean);
      for (const p of parts){
        if (symRe.test(p)){
          if (/𝄆/.test(p)) L.push(idx+1);
          if (/𝄇/.test(p)) R.push(idx+1);
          continue;
        }
        const chords = p.split(/\s+/).filter(Boolean);
        if (chords.length){ bars.push(chords); idx++; }
      }
    }
    return { bars, sections, repeats:{L,R} };
  }
  function parseAll(txt){ return parseUsingGridParse(txt) || crudeParse(txt); }

  // ——— Fetch helpers ———
  async function fetchOne(id){
    const r = await fetch('/api/library/'+encodeURIComponent(id));
    if(!r.ok) throw new Error('HTTP '+r.status);
    return await r.json();
  }
  function localFromEditor(id){
    try{ const s=localStorage.getItem('jazzgrid:'+id); return s?JSON.parse(s):null; }catch(_){ return null; }
  }

  function toReaderGrid(rec){
    const parsed = parseAll((rec && rec.grid_text) || '');
    return {
      id: rec.id,
      name: rec.title || rec.id || '',
      title: rec.title || rec.id || '',
      author: rec.composer || '',
      tpb: 4,
      bars: parsed.bars || [],
      sections: parsed.sections || [],
      repeats: parsed.repeats || {L:[],R:[]}
    };
  }

  function persistLastGrid(id){
    try{
      const blob = { lastGridId: id };
      localStorage.setItem('mp_settings_v3', JSON.stringify(blob));
      document.cookie = 'mp_settings_v3='+encodeURIComponent(JSON.stringify(blob))+';path=/;SameSite=Lax;max-age='+(3600*24*365);
    }catch(_){}
  }

  async function loadGridToReader(id){
    let rec = localFromEditor(id);
    if (!rec) rec = await fetchOne(id);
    const grid = toReaderGrid(rec);

    if (window.Reader && typeof window.Reader.applyGrid==='function'){
      window.Reader.applyGrid(grid);
    }
    persistLastGrid(grid.id);
    try{ window.dispatchEvent(new CustomEvent('grid:loaded', { detail: grid })); }catch(_){}
    return grid;
  }

  function playGrid(id){
    // Pas d’auto-play : juste le hash.
    persistLastGrid(id);
    location.href = 'index.html#grid='+encodeURIComponent(id);
  }

  async function randomFromLibrary(){
    const r = await fetch('/api/library');
    if (!r.ok) throw new Error('HTTP '+r.status);
    const all = await r.json();
    const withText = (all||[]).filter(x=>x && x.grid_text && x.grid_text.trim());
    const pick = (arr)=> arr[Math.floor(Math.random()*arr.length)];
    const item = (withText.length? pick(withText) : pick(all));
    if(!item) throw new Error('Bibliothèque vide');
    return loadGridToReader(item.id);
  }

  window.Bridge = window.Bridge || {};
  window.Bridge.loadGridToReader = loadGridToReader;
  window.Bridge.playGrid = playGrid;
  window.Bridge.randomFromLibrary = randomFromLibrary;
  window.Bridge.upsertLocalGrid = function(g){
    try{ localStorage.setItem('mp_grid_'+g.id, JSON.stringify(g)); }catch(_){}
    return g;
  };
})();