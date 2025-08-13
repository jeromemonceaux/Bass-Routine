/* js/grid/reader-bridge-shim.js
   - Définit window.setTickerFromGrid(grid)
   - Boot depuis #grid=<id>&auto=1 via Bridge
*/
(function(){
  function el(id){ return document.getElementById(id); }
  function firstChordOf(grid){
    if(!grid || !Array.isArray(grid.bars)) return null;
    for (let i=0;i<grid.bars.length;i++){
      const arr = Array.isArray(grid.bars[i]) ? grid.bars[i] : (grid.bars[i] && grid.bars[i].chords) || [];
      if (arr.length) return arr[0];
    }
    return null;
  }

  function renderTickerFromBars(bars){
    const ticker = el('ticker');
    if (!ticker) return;

    const seq = bars.map(m=>{
      const arr = Array.isArray(m) ? m : (m && m.chords) || [];
      const chords = arr.slice(0,2);
      return { chords, split: chords.length>1 };
    });

    ticker.innerHTML = '';
    for (let i=0;i<seq.length;i++){
      const m = seq[i];
      const wrap = document.createElement('div');
      wrap.className='measure'+(i===0?' active':'');
      const num = document.createElement('div');
      num.className='num';
      num.textContent='M'+(i+1);
      wrap.appendChild(num);

      const grid = document.createElement('div');
      grid.className = m.split ? 'halfgrid' : 'mgrid';

      m.chords.forEach((sym, k)=>{
        const d = document.createElement('div');
        d.className='tile';
        if (!m.split && i===0) d.classList.add('active');
        d.textContent = sym;
        d.dataset.bar = i;
        d.dataset.pos = k;
        grid.appendChild(d);
      });

      wrap.appendChild(grid);
      ticker.appendChild(wrap);
    }

    // click select
    ticker.addEventListener('click', function(ev){
      const t = ev.target;
      if (!t || !t.classList.contains('tile')) return;
      const bar = parseInt(t.dataset.bar,10)||0;
      const pos = parseInt(t.dataset.pos,10)||0;

      // visuel actif
      ticker.querySelectorAll('.measure').forEach((n)=>n.classList.remove('active'));
      const m = ticker.children[bar];
      if (m) m.classList.add('active');

      const sym = seq[bar]?.chords?.[pos] || seq[bar]?.chords?.[0] || null;
      if (sym){
        const bigChord = el('bigChord'); if (bigChord) bigChord.textContent = sym;
        if (typeof window.renderFretboardForChord === 'function'){
          try{ window.renderFretboardForChord(sym); }catch(_){}
        }
      }
    }, { once:true }); // une seule liaison (évite accumulations)
  }

  window.setTickerFromGrid = function(grid){
    // Mémorise éventuellement
    try{ window.__currentGrid = grid; }catch(_){}

    // 1) Big chord & manche
    const fc = firstChordOf(grid);
    if (fc){
      const bigChord = el('bigChord'); if (bigChord) bigChord.textContent = fc;
      if (typeof window.renderFretboardForChord === 'function'){
        try{ window.renderFretboardForChord(fc); }catch(_){}
      }
    }

    // 2) Ticker
    renderTickerFromBars(grid.bars||[]);

    // 3) Relancer l’affichage si le player expose d’autres hooks
    if (typeof window.renderTicker === 'function') window.renderTicker();
    if (typeof window.renderMain === 'function') window.renderMain();
  };

  function getHashParam(name){
    const h = location.hash || '';
    const m = h.match(new RegExp('[#&]'+name+'=([^&]+)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  async function bootFromHash(){
    const id = getHashParam('grid');
    if (!id || !window.Bridge || typeof window.Bridge.loadGridToReader!=='function') return;
    try{
      await window.Bridge.loadGridToReader(id);
      const auto = getHashParam('auto');
      if (auto==='1' || auto==='true'){
        if (typeof window.start==='function') window.start();
        else if (typeof window.startPlay==='function') window.startPlay();
        else if (typeof window.play==='function') window.play();
        else if (typeof window.togglePlay==='function') window.togglePlay(true);
      }
    }catch(e){ console.error('bootFromHash:', e); }
  }

  window.addEventListener('hashchange', bootFromHash);
  document.addEventListener('DOMContentLoaded', bootFromHash);
})();
