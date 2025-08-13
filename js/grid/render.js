// js/grid/render.js
// Render AST -> HTML grid with sections, bars, chords and repeat signs
export function renderHTML(ast){
  if(!ast || !Array.isArray(ast.sections)) return '<pre class="chart">(grille vide)</pre>';
  const out = [];
  out.push('<div class="grid">');
  for(const sec of ast.sections){
    if(!sec || !Array.isArray(sec.bars) || sec.bars.length===0) continue;
    out.push(`<div class="section"><div class="section-title">${escapeHTML(sec.name||'')}</div>`);
    out.push('<div class="bars">');
    for(const bar of sec.bars){
      const repStart = bar.repeatStart ? ' data-repeat-start="1"' : '';
      const repEnd   = bar.repeatEnd   ? ' data-repeat-end="1"'   : '';
      out.push(`<div class="bar"${repStart}${repEnd}>`);
      if(bar.repeatStart){ out.push('<span class="repeat-start">𝄆</span>'); }
      if(Array.isArray(bar.chords) && bar.chords.length){
        const slots = bar.chords.length;
        out.push('<div class="bar-chords">');
        for(const ch of bar.chords){
          out.push(`<span class="chord" style="flex:1">${escapeHTML(ch)}</span>`);
        }
        out.push('</div>');
      }else{
        out.push('<div class="bar-chords"><span class="chord empty">—</span></div>');
      }
      if(bar.repeatEnd){ out.push('<span class="repeat-end">𝄇</span>'); }
      // markers
      if(Array.isArray(bar.markers) && bar.markers.length){
        const labels = bar.markers.map(m=>m.label).join(' · ');
        out.push(`<div class="markers">${escapeHTML(labels)}</div>`);
      }
      out.push('</div>'); // .bar
    }
    out.push('</div></div>'); // .bars / .section
  }
  out.push('</div>');
  // styles scoped
  out.push(`<style>
  .grid{display:flex;flex-direction:column;gap:.6rem}
  .section{border:1px solid #252a36;border-radius:.6rem;padding:.6rem;background:#0e1218}
  .section-title{font-weight:700;margin:0 0 .4rem 0;opacity:.9}
  .bars{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:.4rem}
  .bar{position:relative;min-height:54px;border:1px solid #2a2f3a;border-radius:.5rem;background:#0b0f16;padding:.4rem .6rem;display:flex;flex-direction:column;justify-content:center}
  .bar-chords{display:flex;gap:.25rem;align-items:center;justify-content:space-between}
  .chord{display:inline-block;text-align:center;font-weight:600}
  .chord.empty{opacity:.35}
  .repeat-start,.repeat-end{position:absolute;top:4px;font-size:12px;opacity:.85}
  .repeat-start{left:6px}
  .repeat-end{right:6px}
  .markers{position:absolute;bottom:4px;right:6px;font-size:11px;opacity:.6}
  </style>`);
  return out.join('');
}

function escapeHTML(s){ return String(s).replace(/[&<>]/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[m])); }

export default { renderHTML };
