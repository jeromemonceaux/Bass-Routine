// Shared parser for Bass-Routine (viewer + editor)

export const DIR_RE = /(D\.?S\.?\s*al\s*Coda|D\.?S\.?\s*al\s*Fine|D\.?C\.?\s*al\s*Coda|D\.?C\.?\s*al\s*Fine|To\s*Coda|Fine|Segno\s*𝄋|Segno|Coda\s*𝄌|Coda|𝄋|𝄌)/i;

export function sectionFromLine(line){
  const m=line.match(/^\s*[\[(]?(Intro|A\d*|A|B\d*|B|C|D|Bridge|Solo|Solos|Refrain|Coda|Segno)\s*[:\])]?\s*$/i);
  return m?m[1].toUpperCase():null;
}

export function normalizeChord(s){
  let x=s.trim();
  // "-" shorthand for minor
  x=x.replace(/^([A-Ga-g])-(?!\d)/,(_,r)=>r.toUpperCase()+'m');
  x=x.replace(/#/g,'♯');
  const lone=/^(bb|Bb|BB)$/;
  if(lone.test(x)) return 'B♭';
  const m=x.match(/^([A-Ga-g])([b♭#♯]?)(.*)$/);
  if(m){
    let [_,r,a,rest]=m;
    r=r.toUpperCase();
    if(a==='b') a='♭'; if(a==='#') a='♯';
    rest=rest
      .replace(/maj/gi,'Δ').replace(/\bM7\b/g,'Δ7')
      .replace(/dim/gi,'°').replace(/\bo\b(?=\d|\(|$)/g,'°')
      .replace(/min/gi,'m').replace(/-7/g,'m7')
      .replace(/m7b5/gi,'m7♭5')
      .replace(/b(?=\d)/g,'♭').replace(/\+(?=\d)/g,'♯')
      .replace(/add\s*(\d+)/gi,'add$1')
      .replace(/sus\s*(2|4)/gi,'sus$1')
      .replace(/alt/gi,'alt');
    x=r+(a||'')+rest;
  }
  x=x.replace(/\( *([^)]*) *\)/g,(_,i)=>'('+i.replace(/b(?=\d)/g,'♭').replace(/#(?=\d)/g,'♯').replace(/\s+/g,'').replace(/,/g,'')+')');
  x=x.replace(/\/(.)(b|#)/g,(_,n,a)=>'/'+n.toUpperCase()+(a==='b'?'♭':'♯'));
  return x;
}

export function isRecognizedChord(s){
  const re=new RegExp('^[A-G](?:[♯♭])?(?:m|Δ|°|ø|dim|maj)?(?:6|7|9|11|13)?(?:sus[24])?(?:add(?:9|11|13))?(?:[♭♯]?\d{1,2})*(?:\((?:alt|[♭♯]?\d{1,2})+(?:[♭♯]?\d{1,2})*\))?(?:\/[A-G](?:[♯♭])?)?$','u');
  return re.test(s);
}

export function splitIntoChordTokens(str){
  const raw=str.trim().split(/\s+/);
  const out=[];
  for(const b of raw){
    if(!b) continue;
    if(/^\(.*\)$/.test(b) && out.length && out[out.length-1].type==='chord'){
      out[out.length-1].value += b;
    } else if(/^[()]+$/.test(b)){
      out.push({type:'literal', value:b});
    } else {
      out.push({type:'chord', value:b});
    }
  }
  return out;
}

export function normalizeDirective(d){
  let s=d.replace(/\s+/g,' ').trim();
  s=s.replace(/D\.?S\.?/i,'D.S.').replace(/D\.?C\.?/i,'D.C.');
  s=s.replace(/al\s*Coda/i,'al Coda').replace(/al\s*Fine/i,'al Fine');
  s=s.replace(/To\s*Coda/i,'To Coda');
  return s;
}

export function normalizeGrid(text){
  const lines=text.split(/\r?\n/);
  let htmlLines=[], parse={measures:[]}, repeats=[];
  let currentSection=null;
  for(const raw of lines){
    if(!raw.trim()){ htmlLines.push(''); continue; }
    const sec=sectionFromLine(raw);
    if(sec){
      currentSection=sec.replace(/\d+/g,'');
      htmlLines.push('<span class="pill sec">▶ '+sec.toUpperCase().replace(/\d+/g,'')+'</span>');
      continue;
    }
    let line=raw.replace(/\s+/g,' ').trim();
    const startsRepeat=/𝄆/.test(line), endsRepeat=/𝄇/.test(line);
    // ensure barlines around brackets if missing
    line=line.replace(/𝄆\s*(?!\|)/g,'𝄆 | ').replace(/(?<!\|)\s*𝄇/g,' | 𝄇');
    const parts=[]; let bar=[];
    line.split(/(\|𝄆|𝄇)/g).filter(Boolean).forEach(tok=>{
      const t=tok.trim(); if(!t) return;
      if(t==='|'){ parse.measures.push({section:currentSection, items:[...bar]}); bar=[]; parts.push('|'); return; }
      if(t==='𝄆'||t==='𝄇'){ parts.push(t); return; }
      let rest=t, m;
      while((m=rest.match(DIR_RE))){
        const idx=m.index; const dir=m[0];
        const before=rest.slice(0,idx).trim();
        if(before){
          splitIntoChordTokens(before).forEach(x=>{
            const n=normalizeChord(x.value); const ok=isRecognizedChord(n);
            parts.push(ok?escapeHtml(n):'<span class="warn">'+escapeHtml(n)+'</span>');
            if(ok) bar.push(n);
          });
        }
        parts.push('<span class="pill">'+normalizeDirective(dir)+'</span>');
        rest=rest.slice(idx+dir.length).trim();
      }
      if(rest){
        splitIntoChordTokens(rest).forEach(x=>{
          const n=normalizeChord(x.value); const ok=isRecognizedChord(n);
          parts.push(ok?escapeHtml(n):'<span class="warn">'+escapeHtml(n)+'</span>');
          if(ok) bar.push(n);
        });
      }
    });
    if(bar.length){ parse.measures.push({section:currentSection, items:[...bar]}); bar=[]; }
    if(startsRepeat) repeats.push({pos: parse.measures.length, type:'L'});
    if(endsRepeat) repeats.push({pos: parse.measures.length, type:'R'});
    htmlLines.push(parts.join(' '));
  }
  return {html:htmlLines.join('\n'), parse, repeats};
}

export function escapeHtml(s){ return (''+s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }
