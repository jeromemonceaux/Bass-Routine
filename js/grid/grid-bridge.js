// js/grid/grid-bridge.js
(function (w) {
  var API = '/api/library';
  var LIB_KEY = 'mp_library_v3';

  function getJSON(k, fb) { try { return JSON.parse(localStorage.getItem(k) || ''); } catch (_) { return fb; } }
  function setJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v || null)); } catch (_) {} }

  // --- Utilitaires d’unicité/dédup ---
  function asId(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }
  function fingerprintGrid(it){
    try{
      var bars = (it && it.bars) || [];
      return (it.title||it.name||'')+'|'+bars.map(function(b){
        var c = Array.isArray(b) ? b : (b && b.chords) || [];
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
      var fp = fingerprintGrid(e); if (seenByFp[fp]) continue;
      a.push(e); if(e.id) seenById[e.id]=a.length-1; seenByFp[fp]=true;
    }
    return a;
  }

  // --- Parse d’un grid_text -> {bars:[[...],[...],...], repeats:{L:Set,R:Set}} ---
  function parseGridTextToModel(txt){
    var bars = [];
    var repL = [], repR = [];
    (String(txt||'').split(/\r?\n/)).forEach(function(line){
      line = String(line||'').trim();
      if (!line) return;
      // sauter titres/sections type "A:", "Bridge:", "Intro:"
      if (/^\s*([A-Z][A-Za-z0-9 ]*):\s*$/.test(line)) return;

      // normalisation espaces | et repères
      line = line.replace(/𝄆/g, ' 𝄆 ').replace(/𝄇/g, ' 𝄇 ');
      // si la ligne est du style | … |, on coupe sur |
      var chunks = line.split('|').map(function(s){ return s.trim(); });

      for (var i=0;i<chunks.length;i++){
        var t = chunks[i];
        if (!t) continue;
        if (t === '𝄆') { repL.push(bars.length+1); continue; }
        if (t === '𝄇') { repR.push(bars.length); continue; }
        // contenu de mesure = suite d’accords séparés par des espaces
        var chords = t.split(/\s+/).filter(Boolean);
        // ignorer mesure purement "—"
        if (chords.length===1 && chords[0]==='—') chords = [];
        if (chords.length || t==='—') bars.push(chords);
      }
    });
    return { bars: bars, repeats: { L: new Set(repL), R: new Set(repR) } };
  }

  // --- Convertit bars [][] -> format séquence du player [{chords:[...], split:bool}, ...] ---
  function barsToSeq(bars){
    return (bars||[]).map(function(ch){
      var arr = Array.isArray(ch) ? ch : (ch && ch.chords) || [];
      return { chords: arr, split: arr.length >= 2 };
    });
  }

  // --- API fetch helpers ---
  function apiGetOne(id){
    return fetch(API + '/' + encodeURIComponent(id)).then(function(r){
      if (!r.ok) { if (r.status===404) return null; throw new Error('HTTP '+r.status); }
      return r.json();
    });
  }
  function apiList(){
    return fetch(API).then(function(r){ if (!r.ok) throw new Error('HTTP '+r.status); return r.json(); });
  }

  // --- Mise à jour de l'état du player + rafraîchissement de l’UI ---
  function applyToPlayer(grid){
    var s = w.state || w.__mp_state__ || (w.__mp_state__={});

    // 1) déduire bars (à partir de grid_text s’il n’y a pas bars)
    var bars = null;
    if (Array.isArray(grid.bars) && grid.bars.length){
      bars = grid.bars.map(function(b){ return Array.isArray(b) ? b : (b && b.chords) || []; });
    } else if (grid.grid_text && String(grid.grid_text).trim()){
      var parsed = parseGridTextToModel(grid.grid_text);
      bars = parsed.bars;
      // on peut stocker les repeats si le player en a besoin plus tard
      s.repeats = parsed.repeats;
    } else {
      bars = [];
    }

    // 2) hydrater l’état
    if (grid.key)  s.key  = grid.key;
    if (grid.mode) s.mode = grid.mode;
    if (grid.tpb)  s.beatsPerBar = grid.tpb;
    if (bars.length) s.measures = bars.length;

    // séquence affichée & jouée
    s.seq  = barsToSeq(bars);
    s.desc = (grid.title || grid.name || grid.id || 'Grille') + (grid.composer ? ' — '+grid.composer : '');

    // 3) accord courant = premier accord de la séquence si dispo
    var first = null;
    for (var i=0;i<s.seq.length;i++){
      var ch = s.seq[i] && s.seq[i].chords;
      if (ch && ch.length){ first = ch[0]; break; }
    }
    s.nowChord = first || ''; // pour header ou player
    s.nowIndex = 0;

    // 4) rafraîchissement UI (fonctionne avec le lecteur existant)
    if (typeof w.updateHeader === 'function') w.updateHeader();
    if (typeof w.renderMain   === 'function') w.renderMain();
    if (typeof w.renderTicker === 'function') w.renderTicker();

    // si le lecteur expose un setter dédié à l’accord courant
    if (typeof w.setNowChord  === 'function') w.setNowChord(s.nowChord);

    return s;
  }

  // --- Charge une grille (DB > local presets) et l’applique au player ---
  function loadGridToReader(id){
    return new Promise(function(resolve, reject){
      if (!id) { reject(new Error('id manquant')); return; }
      apiGetOne(id).then(function(g){
        if (!g) {
          // fallback localStorage (rare) puis presets.json si besoin
          var lib = getJSON(LIB_KEY, []);
          var hit = (lib||[]).find(function(x){ return x && x.id === id; });
          if (!hit) { reject(new Error('Grille introuvable: '+id)); return; }
          resolve(applyToPlayer(hit));
          return;
        }
        // on met en cache local (lib simple)
        var cur = getJSON(LIB_KEY, []);
        setJSON(LIB_KEY, mergeDedup(cur, [g]));
        resolve(applyToPlayer(g));
      }).catch(reject);
    });
  }

  // --- Lecture de l’id dans le hash ---
  function hashGrid(){
    var m = location.hash && location.hash.match(/grid=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  // --- Boot: si #grid présent, chargement auto ---
  w.addEventListener('DOMContentLoaded', function(){
    var id = hashGrid();
    if (id) {
      loadGridToReader(id).catch(function(e){ console.error('[Bridge load]', e); });
    }
  });
  w.addEventListener('hashchange', function(){
    var id = hashGrid();
    if (id) {
      loadGridToReader(id).catch(function(e){ console.error('[Bridge load]', e); });
    }
  });

  // Expose API globale
  w.Bridge = {
    loadGridToReader: loadGridToReader,
    parseGridTextToModel: parseGridTextToModel // si l’éditeur en a besoin
  };
})(window);