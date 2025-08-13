// js/grid/grid-bridge.js
(function (w) {
  var LIB_KEY = 'mp_library_v3';

  function getJSON(k, fb) { try { return JSON.parse(localStorage.getItem(k) || ''); } catch (e) { return fb; } }
  function setJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v || null)); } catch (e) {} }

  function fingerprintGrid(it) {
    try {
      var bars = (it && it.bars) || [];
      return (it.name || it.title || '') + '|' + bars.map(function (b) {
        return (Array.isArray(b) ? b : (b && b.chords) || []).join(',');
      }).join('|');
    } catch (e) { return it && it.id || Math.random().toString(36).slice(2); }
  }
  function mergeDedup(base, extra) {
    var a = (base || []).slice();
    var seenById = {}; for (var i = 0; i < a.length; i++) { var it = a[i]; if (it && it.id) seenById[it.id] = i; }
    var seenByFp = {}; for (var i = 0; i < a.length; i++) { seenByFp[fingerprintGrid(a[i])] = true; }
    for (var j = 0; j < (extra || []).length; j++) {
      var e = extra[j]; if (!e) continue;
      if (e.id && seenById[e.id] != null) continue;
      var fp = fingerprintGrid(e);
      if (seenByFp[fp]) continue;
      a.push(e);
      if (e.id) seenById[e.id] = a.length - 1;
      seenByFp[fp] = true;
    }
    return a;
  }

  function asId(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }

  // Import optionnel depuis INSP (styles embarqués)
  function importStylesToLibrary(tonic, mode) {
    tonic = tonic || 'C'; mode = (mode === 'minor' ? 'minor' : 'major');
    var out = [];
    try {
      var IN = (w && w.INSP) ? w.INSP : null;
      if (!IN) return [];
      Object.keys(IN).forEach(function (key) {
        var item = IN[key]; if (!item || !item.base || !item.base.length) return;
        var name = item.label || key;
        var id = 'style/' + asId(name) + '-' + asId(tonic + '-' + mode);
        // transforme base -> bars via roman/tonic si besoin (optionnel ici)
        var bars = (item.base || []).map(function (b) { return Array.isArray(b) ? b : [String(b)]; });
        out.push({
          id: id,
          name: 'Style · ' + name + ' (' + tonic + ' ' + (mode === 'minor' ? 'minor' : 'major') + ')',
          author: 'Style',
          key: tonic, mode: mode, tpb: 4, bars: bars
        });
      });
    } catch (_) {}
    var cur = getJSON(LIB_KEY, []);
    var merged = mergeDedup(cur, out);
    setJSON(LIB_KEY, merged);
    return out;
  }

  function seedLibraryIfEmpty() {
    return new Promise(function (resolve) {
      try {
        var a = getJSON(LIB_KEY, null);
        if (a && Array.isArray(a) && a.length) {
          try { importStylesToLibrary('C', 'major'); } catch (_) {}
          resolve(a);
          return;
        }
      } catch (_) {}
      fetch('./presets.json')
        .then(function (r) { return r.json(); })
        .then(function (p) {
          var cur = getJSON(LIB_KEY, []);
          var merged = mergeDedup(cur, p || []);
          try { var styles = importStylesToLibrary('C', 'major'); merged = mergeDedup(merged, styles); } catch (_) {}
          setJSON(LIB_KEY, merged);
          resolve(merged);
        })
        .catch(function () {
          try { importStylesToLibrary('C', 'major'); } catch (_) {}
          resolve(getJSON(LIB_KEY, []) || []);
        });
    });
  }

  // Transforme un enregistrement (bars[] OU grid_text) -> {seq,desc,...} pour le lecteur
  function toReaderState(grid) {
    var s = w.state || w.__mp_state__ || {};
    if (grid.key) s.key = grid.key;
    if (grid.mode) s.mode = grid.mode;
    if (grid.tpb) s.beatsPerBar = grid.tpb;

    var bars = null;
    if (Array.isArray(grid.bars) && grid.bars.length) {
      bars = grid.bars;
    } else if (grid.grid_text && w.GridParse && typeof w.GridParse.parse === 'function') {
      try {
        var parsed = w.GridParse.parse(grid.grid_text);
        bars = parsed && parsed.bars;
      } catch (e) { console.warn('[Bridge] parse grid_text failed:', e); }
    }

    if (bars && bars.length) s.measures = bars.length;
    var seq = (bars || []).map(function (bar) {
      var chords = Array.isArray(bar) ? bar : (bar && bar.chords) || [];
      return { chords: chords, split: chords.length >= 2 };
    });
    s.seq = seq;
    s.desc = (grid.title || grid.name || grid.id || '') + (grid.composer || grid.author ? ' — ' + (grid.composer || grid.author) : '');
    return s;
  }

  function applyReaderState(s) {
    try {
      if (typeof w.updateHeader === 'function') w.updateHeader();
      if (typeof w.renderMain === 'function') w.renderMain();
      if (typeof w.renderTicker === 'function') w.renderTicker();
    } catch (e) {
      console.warn('[Bridge] render refresh:', e);
    }
  }

  function getGridByIdLocal(id) {
    var a = getJSON(LIB_KEY, []);
    return (a || []).find(function (x) { return x && x.id === id; }) || null;
  }

  // Charge d’abord la DB (API) puis fallback local/presets
  function fetchGridFromAPI(id) {
    return fetch('/api/library/' + encodeURIComponent(id)).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).catch(function (e) {
      console.warn('[Bridge] API get one failed', e);
      return null;
    });
  }

  function loadGridToReader(id) {
    return new Promise(function (resolve, reject) {
      (async function () {
        try {
          var g = await fetchGridFromAPI(id);
          if (!g) {
            // fallback local
            g = getGridByIdLocal(id);
          }
          if (!g) {
            // dernier recours: presets.json
            try {
              var p = await fetch('./presets.json').then(r => r.json());
              g = (p || []).find(x => x && x.id === id) || null;
            } catch (_) {}
          }
          if (!g) { reject(new Error('grid not found')); return; }

          var s = toReaderState(g);
          // expose pour le player
          w.state = w.__mp_state__ = s;
          applyReaderState(s);
          resolve(g);
        } catch (err) { reject(err); }
      })();
    });
  }

  function hashGrid() {
    var m = location.hash && location.hash.match(/grid=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  w.Bridge = {
    seedLibraryIfEmpty: seedLibraryIfEmpty,
    loadGridToReader: loadGridToReader,
    getGridById: getGridByIdLocal
  };

  w.addEventListener('DOMContentLoaded', function () {
    seedLibraryIfEmpty().then(function () {
      var id = hashGrid();
      if (id) { loadGridToReader(id).catch(function (e) { console.error(e); }); }
    });
  });
  w.addEventListener('hashchange', function () {
    var id = hashGrid();
    if (id) { loadGridToReader(id).catch(function (e) { console.error(e); }); }
  });
})(window);