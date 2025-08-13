(function(w){
  var API = '/api/library';
  function jget(url){ return fetch(url).then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); }); }
  function jpatch(url, body){
    return fetch(url,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})})
      .then(function(r){ return r.json().then(function(d){ if(!r.ok) throw new Error(d && d.error || ('HTTP '+r.status)); return d; });});
  }

  function loadGridToReader(id){
    return new Promise(function(resolve,reject){
      if (!id) return reject(new Error('id manquant'));
      jget(API+'/'+encodeURIComponent(id)).then(function(g){
        if(!g) throw new Error('Grille introuvable');
        var s = w.state || w.__mp_state__ || (w.__mp_state__={});
        if (g.key) s.key = g.key;
        if (g.mode) s.mode = g.mode;
        if (g.tpb) s.beatsPerBar = g.tpb;
        if (g.bars && g.bars.length) s.measures = g.bars.length;
        var bars = (g.bars||[]); // try raw bars first
        if ((!bars || !bars.length) && g.grid_text){
          try{ bars = (w.GridParse && GridParse.parse(g.grid_text).bars) || []; }catch(_){}
        }
        s.seq = (bars||[]).map(function(bar){
          var chords = Array.isArray(bar) ? bar : (bar && bar.chords) || [];
          return { chords: chords, split: chords.length>=2 };
        });
        s.desc = (g.title||g.name||g.id||'') + (g.composer ? ' — '+g.composer : '');
        if (typeof w.updateHeader==='function') w.updateHeader();
        if (typeof w.renderMain==='function') w.renderMain();
        if (typeof w.renderTicker==='function') w.renderTicker();
        resolve(g);
      }).catch(reject);
    });
  }

  function openInReader(it){
    if (!it || !it.id) return;
    // ensure record exists (id + grid_text if any)
    var payload = { id: it.id, title: it.title||it.name||it.id, composer: it.composer||it.author||'' };
    if (it.grid_text) payload.grid_text = it.grid_text;
    jpatch(API+'/'+encodeURIComponent(it.id), payload).finally(function(){
      var url = 'index.html#grid='+encodeURIComponent(it.id)+'&auto=1';
      w.location.href = url;
    });
  }

  function getGridById(id){ return jget(API+'/'+encodeURIComponent(id)); }

  // Auto-load on hash
  function hashGrid(){
    var m = w.location.hash && w.location.hash.match(/grid=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
  w.addEventListener('DOMContentLoaded', function(){
    var id = hashGrid();
    if (id){ loadGridToReader(id).catch(function(e){ console.error(e); }); }
    w.addEventListener('hashchange', function(){
      var id = hashGrid();
      if (id){ loadGridToReader(id).catch(function(e){ console.error(e); }); }
    });
  });

  w.Bridge = { loadGridToReader: loadGridToReader, openInReader: openInReader, getGridById: getGridById };
})(window);
