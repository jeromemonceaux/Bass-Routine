// js/grid/grid-bridge.js
(function (w) {
  'use strict';

  var LIB_KEY = 'mp_library_v3';

  function getJSON(k, fb) {
    try { return JSON.parse(localStorage.getItem(k) || ''); }
    catch (e) { return fb; }
  }
  function setJSON(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v || null)); }
    catch (e) {}
  }

  function fingerprintGrid(it){
    try{
      var bars = (it && it.bars) || [];
      return (it.name||it.title||'')+'|'+bars.map(function(b){
        var c = Array.isArray(b)? b : (b&&b.chords)||[];
        return (c||[]).join(',');
      }).join('|');
    }catch(e){ return it && it.id || Math.random().toString(36).slice(2); }
  }
  function mergeDedup(base, extra){
    var a = (base||[]).slice();
    var seenById = {}; for (var i=0;i<a.length;i++){ var it=a[i]; if(it&&it.id) seenById[it.id]=i; }
    var seenByFp = {}; for (var i=0;i<a.length;i++){ seenByFp[fingerprintGrid(a[i])] = true; }
    for (var j=0;j<(extra||[]).length;j++){
      var e = extra[j]; if(!e) continue;
      if (e.id && seenById[e.id] != null) continue;
      var fp = fingerprintGrid(e);
      if (seenByFp[fp]) continue;
      a.push(e);
      if(e.id) seenById[e.id]=a.length-1;
      seenByFp[fp]=true;
    }
    return a;
  }

  // Convertit un enregistrement DB -> objet lecteur
  function fromDbRecord(rec) {
    var id = rec.id;
    var name = rec.title || rec.name || id;
    var author = rec.composer || rec.author || '';
    var tpb = 4;
    var bars = [];

    if (rec.grid_text && w.GridParse && typeof w.GridParse.parse === 'function') {
      try {
        var p = w.GridParse.parse(rec.grid_text);
        bars = p.bars || [];
        tpb  = p.tpb  || 4;
      } catch(e) {}
    } else if (rec.bars) {
      bars = rec.bars;
    }

    return { id:id, name:name, author:author, tpb:tpb, bars:bars };
  }

  // Importe styles INSP -> librairie locale (optionnel)
  function importStylesToLibrary(){
    var out = [];
    try{
      var IN = (w && w.INSP) ? w.INSP : null;
      if (!IN) return [];
      Object.keys(IN).forEach(function(key){
        var item = IN[key]; if(!item || !item.base || !item.base.length) return;
        var name = item.label || key;
        var id = "style/"+String(name).toLowerCase().replace(/[^a-z0-9]+/g,'-');
        var bars = (item.base||[]).map(function(m){
          if (Array.isArray(m)) return m;
          return String(m||'').trim().split(/\s+/);
        });
        out.push({ id:id, name:'Style · '+name, author:'Style', tpb:4, bars:bars });
      });
    }catch(e){}
    var cur = getJSON(LIB_KEY, []);
    var merged = mergeDedup(cur, out);
    setJSON(LIB_KEY, merged);
    return out;
  }

  // Charge presets.json + merge local + styles
  function seedLibraryIfEmpty() {
    return new Promise(function(resolve){
      var existing = getJSON(LIB_KEY, null);
      if (existing && Array.isArray(existing) && existing.length) {
        try { importStylesToLibrary(); } catch(_){}
        resolve(existing);
        return;
      }
      fetch('./presets.json')
        .then(function(r){ return r.ok ? r.json() : []; })
        .then(function(pres){
          var cur = getJSON(LIB_KEY, []);
          try { importStylesToLibrary(); } catch(_){}
          var merged = mergeDedup(cur, pres||[]);
          setJSON(LIB_KEY, merged);
          resolve(merged);
        })
        .catch(function(){
          try { importStylesToLibrary(); } catch(_){}
          resolve(getJSON(LIB_KEY, [])||[]);
        });
    });
  }

  function getGridById(id) {
    var a = getJSON(LIB_KEY, []);
    for (var i=0;i<a.length;i++){
      if (a[i] && a[i].id === id) return a[i];
    }
    return null;
  }

  // Ajoute/écrase une grille dans la librairie locale
  function upsertLocalGrid(obj){
    var a = getJSON(LIB_KEY, []) || [];
    var out = [];
    var found = false;
    for (var i=0;i<a.length;i++){
      var it = a[i];
      if (it && it.id === obj.id) { out.push(obj); found=true; }
      else out.push(it);
    }
    if (!found) out.push(obj);
    setJSON(LIB_KEY, out);
    return obj;
  }

  // Charge dans le lecteur via l’état global attendu
  function loadGridToReader(id){
    return new Promise(function(resolve, reject){
      try{
        var g = getGridById(id);
        if (!g) return reject(new Error('grid not found: '+id));

        var s = w.state || w.__mp_state__ || {};
        if (g.key)  s.key  = g.key;
        if (g.mode) s.mode = g.mode;
        if (g.tpb)  s.beatsPerBar = g.tpb;
        if (g.bars && g.bars.length) s.measures = g.bars.length;

        var bars = (g.bars||[]).map(function(bar){
          var chords = Array.isArray(bar) ? bar : (bar && bar.chords) || [];
          return { chords: chords, split: chords.length>=2 };
        });

        s.seq  = bars;
        s.desc = (g.name||'') + (g.author ? ' — '+g.author : '');
        w.state = s;

        if (typeof w.updateHeader   === 'function') w.updateHeader();
        if (typeof w.renderMain     === 'function') w.renderMain();
        if (typeof w.renderTicker   === 'function') w.renderTicker();
        if (typeof w.renderFretboardForChord === 'function') {
          var first = (bars[0] && bars[0].chords && bars[0].chords[0]) || null;
          if (first) w.renderFretboardForChord(first);
        }

        resolve(g);
      }catch(err){ reject(err); }
    });
  }

  // Lecture via hash #grid=<id>
  function currentHashGrid(){
    var m = location.hash && location.hash.match(/grid=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
  function applyHashLoad(){
    var id = currentHashGrid();
    if (id) {
      loadGridToReader(id).catch(function(e){ console.error(e); });
    }
  }

  w.addEventListener('DOMContentLoaded', function(){
    seedLibraryIfEmpty().then(applyHashLoad);
  });
  w.addEventListener('hashchange', applyHashLoad);

  // Utilitaires pour la bibliothèque / éditeur
  function playGrid(id){ location.hash = '#grid=' + encodeURIComponent(id); }
  function openEditor(id){ location.href = 'editor.html?id=' + encodeURIComponent(id); }

  // Expose API Bridge
  w.Bridge = {
    seedLibraryIfEmpty: seedLibraryIfEmpty,
    getGridById: getGridById,
    upsertLocalGrid: upsertLocalGrid,
    loadGridToReader: loadGridToReader,
    playGrid: playGrid,
    openEditor: openEditor,
    fromDbRecord: fromDbRecord
  };

})(window);