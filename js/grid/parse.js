/* js/grid/parse.js
   Parseur minimal pour:
   - ignorer les lignes de section (A:, B:, Intro:, Bridge:…)
   - ignorer les directives (D.S., D.C., Segno, Coda, 𝄆, 𝄇, Fine…)
   - extraire des mesures (1 ou 2 accords/mesure)
   - fournir un html de prévisualisation "nettoyé" (sans "𝄆 |", "| 𝄇", "||")
*/
(function(){
  const SECTION_RE = /^\s*[\[(]?(Intro|A\d*|A|B\d*|B|C|D|Bridge|Solo|Solos|Refrain|Coda|Segno)\s*[:\])]?\s*$/i;
  const DIR_RE = /(D\.?S\.?\s*al\s*Coda|D\.?S\.?\s*al\s*Fine|D\.?C\.?\s*al\s*Coda|D\.?C\.?\s*al\s*Fine|To\s*Coda|Fine|Segno\s*𝄋|Segno|Coda\s*𝄌|Coda|𝄋|𝄌)/i;

  function cleanForPreview(str){
    if (!str) return '';
    let s = String(str);
    // Espaces uniformes autour de '|'
    s = s.replace(/\s*\|\s*/g,' | ');
    // Supprimer les combos indésirables : "𝄆 |" et "| 𝄇"
    s = s.replace(/𝄆\s*\|\s*/g,'𝄆 ');
    s = s.replace(/\s*\|\s*𝄇/g,' 𝄇');
    // Nettoyer les pipes doublés "||" -> "| |" (mesures vides explicites)
    s = s.replace(/\|\|/g,'| |');
    // Espaces multiples → simple
    s = s.replace(/\s{2,}/g,' ').trim();
    return s;
  }

  function tokenizeMeasureText(t){
    // t = "Dm7 G7" => ["Dm7","G7"]
    const raw = String(t||'').trim();
    if (!raw) return [];
    const parts = raw.split(/\s+/).filter(Boolean);
    // Coller "(...)" au symbole précédent si présent
    const out = [];
    for (const p of parts){
      if (/^\(.*\)$/.test(p) && out.length){
        out[out.length-1] += p;
      } else {
        out.push(p);
      }
    }
    return out;
  }

  function parse(text){
    const lines = String(text||'').split(/\r?\n/);

    const bars = [];           // ex: [ ["Cm7"], ["Fm7"], ["Dm7b5","G7"], ... ]
    const previewLines = [];   // texte normalisé pour <div id="preview">

    for (let raw of lines){
      const line = String(raw||'').trim();
      if (!line){ previewLines.push(''); continue; }

      // Sections / titres de parties → apparaissent en preview, pas en mesures
      if (SECTION_RE.test(line)){
        previewLines.push(cleanForPreview(line));
        continue;
      }

      // Lignes purement directives (ou mélange accords+directives) :
      // On les laisse apparaître dans la preview (nettoyées), mais
      // on filtre les directives du côté "bars".
      const forPreview = cleanForPreview(line);
      previewLines.push(forPreview);

      // Extraction des mesures : on coupe sur "|"
      const cut = forPreview.split('|').map(s => s.trim());
      for (let seg of cut){
        if (!seg) continue;
        // Ignorer segments qui sont juste des symboles/directives
        if (DIR_RE.test(seg) || seg==='𝄆' || seg==='𝄇') continue;
        if (SECTION_RE.test(seg)) continue;           // au cas où un "A:" traîne dans la ligne
        if (/^\s*[:;]+$/.test(seg)) continue;

        // À ce stade, seg est une mesure candidate: "Dm7", "Dm7 G7", "CΔ (♭9♯11)"...
        const chords = tokenizeMeasureText(seg).filter(tok=>{
          // Filtrer token si c'est une directive isolée
          if (DIR_RE.test(tok) || tok==='𝄆' || tok==='𝄇') return false;
          return true;
        });

        if (!chords.length) continue;
        // On garde max 2 accords / mesure pour un split propre
        bars.push(chords.slice(0,2));
      }
    }

    const html = previewLines.join('\n');
    return { bars, html, repeats:{L:[],R:[]}, sections:[] };
  }

  window.GridParse = { parse, _cleanForPreview: cleanForPreview };
})();
