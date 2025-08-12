const API = '/api/library';

export async function getAll(){
  try{
    const r=await fetch(API, { cache:'no-store' });
    if(!r.ok) throw new Error('HTTP '+r.status);
    return await r.json();
  }catch(e){
    console.warn('[library] fallback Blue Bossa', e);
    return [{
      id:'blue-bossa',
      title:'Blue Bossa',
      composer:'Kenny Dorham',
      style:'Bossa',
      is_public_domain:false,
      grid_text:`A:
𝄆 Cm7 | Fm7 | Dm7b5 G7 | Cm7 |
| Cm7 | Fm7 | Dm7b5 G7 | Cm7 𝄇

B: (Bridge)
| E♭m7 A♭7 | D♭Δ | Dm7b5 G7 | Cm7 |

A:
| Cm7 | Fm7 | Dm7b5 G7 | Cm7 | Fine

D.C. al Fine`
    }];
  }
}

export async function putAll(arr){
  const r=await fetch(API,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(arr)});
  if(!r.ok){ const t=await r.text(); throw new Error('HTTP '+r.status+' '+t); }
  return true;
}

export async function patchOne(id, obj){
  const r=await fetch(API+'/'+encodeURIComponent(id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(obj)});
  if(!r.ok){ const t=await r.text(); throw new Error('HTTP '+r.status+' '+t); }
  return true;
}
