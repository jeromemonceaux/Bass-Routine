// js/grid/parse.js
(function (w) {
  function trimArr(a) { return (a || []).filter(Boolean); }

  // Découpe une ligne " | C7 | F7 | G7 | " en mesures, en ignorant les vides aux extrémités
  function splitBars(line) {
    // retire les symboles de reprise mais on les garde ailleurs si besoin
    const noRep = String(line).replace(/[𝄆𝄇]/g, ' ');
    // scinde sur | et nettoie
    let parts = noRep.split('|').map(s => s.trim());
    // enlève les segments vides en début/fin
    while (parts.length && !parts[0]) parts.shift();
    while (parts.length && !parts[parts.length - 1]) parts.pop();
    return parts;
  }

  const SECTION_RE = /^\s*[\[(]?(Intro|A\d*|A|B\d*|B|C|D|Bridge|Solo|Solos|Refrain|Coda|Segno)\s*[:\])]?\s*$/i;

  function parse(text) {
    const lines = String(text || '').split(/\r?\n/);
    const outBars = [];
    let tpb = 4;
    let key = null, mode = null;

    for (let raw of lines) {
      if (!raw.trim()) continue;
      // ignore lignes de section/titres
      if (SECTION_RE.test(raw)) continue;

      const parts = splitBars(raw);
      for (const cell of parts) {
        if (!cell) continue;
        // multi-accord (séparé par espaces)
        const chords = trimArr(cell.split(/\s+/).map(s => s.trim()));
        outBars.push(chords);
      }
    }

    return {
      key, mode, tpb,
      bars: outBars
    };
  }

  function normalizeText(text) {
    // Normalise en remettant 4 mesures par ligne par défaut
    const p = parse(text);
    const rows = [];
    for (let i = 0; i < p.bars.length; i += 4) {
      const chunk = p.bars.slice(i, i + 4).map(m => (m && m.length ? m.join(' ') : '—'));
      rows.push('| ' + chunk.join(' | ') + ' |');
    }
    return rows.join('\n');
  }

  w.GridParse = { parse, normalizeText };
})(window);