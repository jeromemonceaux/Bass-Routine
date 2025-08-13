// js/grid/grid-bridge.js
(function(){
  'use strict';
  const API = '/api/library';

  function parseBarsFromText(txt){
    try{
      if (window.GridParse && typeof window.GridParse.parse==='function'){
        const res = window.GridParse.parse(String(txt||''));
        return Array.isArray(res.bars) ? res.bars : [];
      }
    }catch(_){}
    // Fallback ultra simple: découpe '|' et ignore sections/symboles
    const lines = String(txt||'').split(/\r?\n/);
    const bars = [];
    for (let raw of lines){
      const line = raw.trim();
      if (!line) continue;
      if (/^\s*[A-Za-z].*:\s*$/.test(line)) continue; // "A:", "Bridge:", etc.
      let parts = line.split('|').map(s=>s.trim()).filter(Boolean);
      for (const p of parts){
        if (!p) continue;
        if (/^(𝄆|𝄇|Fine|To Coda|Segno|Coda|D\.?S\.?|D\.?C\.?)/i.test(p)) continue;
        const chords = p.split(/\s+/).filter(Boolean);
        if (chords.length) bars.push(chords);
      }
    }
    return bars;
  }

  async function fetchOne(id){
    const r = await fetch(API+'/'+encodeURIComponent(id));
    if (!r.ok) throw new Error('HTTP '+r.status);
    return await r.json();
  }

  function fromLocalEditor(id){
    try{
      const raw = localStorage.getItem('jazzgrid:'+id);
      if (!raw) return null;
      return JSON.parse(raw);
    }catch(_){ return null; }
  }

  function toReaderGrid(rec){
    const text = String((rec && rec.grid_text) || '');
    const bars = parseBarsFromText(text);
    return {
      id: rec.id,
      name: rec.title || rec.id || '',
      title: rec.title || rec.id || '',
      author: rec.composer || '',
      tpb: 4,
      bars
    };
  }

  async function loadGridToReader(id){
    // 1) Local (éditeur) d’abord
    let rec = fromLocalEditor(id);
    if (!rec){
      // 2) DB
      rec = await fetchOne(id);
      if (!rec) throw new Error('Grid not found: '+id);
    }
    const grid = toReaderGrid(rec);

    // Injection dans le player
    if (window.Reader && typeof window.Reader.applyGrid==='function'){
      window.Reader.applyGrid(grid);
    }
    // Événement informatif (optionnel)
    try{
      window.dispatchEvent(new CustomEvent('grid:loaded', { detail: grid }));
    }catch(_){}

    return grid;
  }

  function playGrid(id){
    // Redirige vers le player avec auto=1 ; le player (bootFromHash) chargera et jouera
    const url = 'index.html#grid='+encodeURIComponent(id)+'&auto=1';
    location.href = url;
  }

  // Expose
  window.Bridge = window.Bridge || {};
  window.Bridge.loadGridToReader = loadGridToReader;
  window.Bridge.playGrid = playGrid;

  // utilitaire si tu veux enrichir le cache local du lecteur
  window.Bridge.upsertLocalGrid = function(g){
    try{ localStorage.setItem('mp_grid_'+g.id, JSON.stringify(g)); }catch(_){}
    return g;
  };
})();