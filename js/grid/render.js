
import { normalizeGrid } from './parse.js'

export function renderCompas(container, text, colsN=4, showNumbers=false){
  container.innerHTML='';
  const norm=normalizeGrid(text||'');
  const grid=document.createElement('div'); grid.className='grid'; grid.style.setProperty('--cols', colsN);
  let currentSection=null, rowEl=null, cellCount=0, mi=0;
  const repsL=new Set((norm.repeats||[]).filter(r=>r.type==='L').map(r=>r.pos));
  const repsR=new Set((norm.repeats||[]).filter(r=>r.type==='R').map(r=>r.pos));
  function newRow(){ rowEl=document.createElement('div'); rowEl.className='row'; grid.appendChild(rowEl); cellCount=0; }
  (norm.parse.measures||[]).forEach(m=>{
    if(m.section!==currentSection){
      currentSection=m.section;
      const sec=document.createElement('div'); sec.textContent=currentSection?('Section '+currentSection):'Section'; sec.className='pill sec'; grid.appendChild(sec);
      newRow();
    }
    if(!rowEl || cellCount>=colsN) newRow();
    mi++;
    const cell=document.createElement('div'); cell.className='cell';
    const list=document.createElement('div'); list.className='multi';
    if(m.items && m.items.length){ m.items.forEach(ch=>{ const line=document.createElement('div'); line.textContent=ch; list.appendChild(line); }); }
    else { cell.classList.add('empty'); const line=document.createElement('div'); line.textContent='—'; list.appendChild(line); }
    if(showNumbers){ const num=document.createElement('small'); num.textContent=mi; cell.appendChild(num); }
    if(repsL.has(mi)) cell.classList.add('bracketL');
    if(repsR.has(mi)) cell.classList.add('bracketR');
    cell.appendChild(list); rowEl.appendChild(cell); cellCount++;
  });
  container.appendChild(grid);
  return norm;
}
