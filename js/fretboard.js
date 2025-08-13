// Simple fretboard renderer to ensure the neck appears
export function initFretboard() {
  const canvas = document.getElementById('fretboard');
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 600;
  const h = canvas.clientHeight || 200;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // background
  ctx.fillStyle = '#121722';
  ctx.fillRect(0,0,w,h);

  // strings & frets
  const strings = 4; // basse
  const frets = 12;
  const margin = 14;
  const top = margin, bottom = h - margin;
  const left = margin, right = w - margin;

  ctx.strokeStyle = '#2b3242';
  ctx.lineWidth = 2;

  // frets verticales
  for(let f=0; f<=frets; f++){
    const x = left + (right-left) * (f/frets);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
  }

  // cordes horizontales
  for(let s=0; s<strings; s++){
    const y = top + (bottom-top) * (s/(strings-1));
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
  }

  // repères
  ctx.fillStyle = '#5ee0a0';
  const midY = (top+bottom)/2;
  for (let f of [3,5,7,9,12]){
    const x = left + (right-left) * (f/frets);
    const r = (f===12)?5:3;
    if (f===12){
      ctx.beginPath(); ctx.arc(x, midY-10, r, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(x, midY+10, r, 0, Math.PI*2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(x, midY, r, 0, Math.PI*2); ctx.fill();
    }
  }
}
