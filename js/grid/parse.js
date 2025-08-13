// js/grid/parse.js
(function (w) {
  'use strict';

  // --- Helpers d'accidentels / normalisation ---
  function escapeUnicodeFlatsSharps(s){ return s.replace(/♭/g,'b').replace(/♯/g,'#'); }
  function normalizeChord(sym){
    if(!sym) return '';
    let x = String(sym).trim();

    // cas spéciaux "Bb" / "bb" seuls => B♭
    if (/^(bb|Bb|BB)$/.test(x)) return 'B♭';

    // Racine + alt + reste
    const m = x.match(/^([A-Ga-g])([b♭#♯]?)(.*)$/);
    if (!m) return x;

    let [, r, a, rest] = m;
    r = r.toUpperCase();
    if (a === 'b') a = '♭';
    if (a === '#') a = '♯';

    // Nettoyage des qualificatifs
    rest = rest
      .replace(/maj7/ig,'Δ7')
      .replace(/\bmaj\b/ig,'Δ')
      .replace(/\bM7\b/g,'Δ7')
      .replace(/min/ig,'m')
      .replace(/-7/g,'m7')
      .replace(/dim/ig,'°')
      .replace(/\bo(?=\d|\(|$)/g,'°')
      .replace(/m7b5/ig,'m7♭5');

    // Tensions entre parenthèses / altérations numériques
    rest = rest
      .replace(/b(?=\d)/g,'♭')
      .replace(/#(?=\d)/g,'♯');

    // Inversions / basse
    rest = rest.replace(/\/([A-Ga-g])([b#]|[♭♯])?/g, function(_, n, alt){
      let A = alt || '';
      if (A === 'b') A = '♭';
      if (A === '#') A = '♯';
      return '/'+n.toUpperCase()+A;
    });

    return r + (a||'') + rest;
  }

  // Reconnaissance "assez" tolérante d'un symbole d'accord
  function isRecognizedChord(s){
    if(!s) return false;
    const re = new RegExp(
      '^' +
      '[A-G]' +                // racine
      '(?:[♭♯])?' +            // alt éventuelle
      '(?:m|Δ|°|ø|dim|maj)?' + // qualité
      '(?:6|7|9|11|13)?' +     // extension simple
      '(?:sus[24])?' +         // sus
      '(?:add(?:9|11|13))?' +  // add
      '(?:[♭♯]?\\d{1,2})*' +   // alt numériques enchaînées
      '(?:\\((?:alt|[♭♯]?\\d{1,2})(?:[,\\s]*[♭♯]?\\d{1,2})*\\))?' + // (alt) ou tensions
      '(?:\\/[A-G](?:[♭♯])?)?' + // slash
      '$','u'
    );
    return re.test(s);
  }

  // Détection de lignes de section (A:, B:, Intro:, Bridge:, …)
  var SEC_RE = /^\s*[\[(]?(Intro|A\d*|A|B\d*|B|C|D|Bridge|Solo|Solos|Refrain|Coda|Segno)\s*[:\])]?$/i;

  // Directions (non comptées comme accords)
  var DIR_RE = /(D\.?S\.?\s*al\s*Coda|D\.?S\.?\s*al\s*Fine|D\.?C\.?\s*al\s*Coda|D\.?C\.?\s*al\s*Fine|To\s*Coda|Fine|Segno\s*𝄋|Segno|Coda\s*𝄌|Coda|𝄋|𝄌)/i;

  // Tokenize une ligne en séparant |, 𝄆, 𝄇 et les mots
  function lex(line){
    return String(line)
      .replace(/\|/g,' | ')
      .replace(/𝄆/g,' 𝄆 ')
      .replace(/𝄇/g,' 𝄇 ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  }

  function parse(text){
    var lines = String(text||'').split(/\r?\n/);

    var bars = [];               // Array<Array<string>>
    var sections = [];           // [{index:measureIndex, label:'A'|'B'|...}]
    var repeats = { L:[], R:[] };// positions (1-based) des brackets
    var tpb = 4;

    var cur = [];                // accords accumulés pour la mesure courante
    var measureIndex = 0;
    var currentSection = null;

    function pushBar(){
      // pousse une mesure (même vide) et remet le buffer
      bars.push(cur.slice());
      cur = [];
      measureIndex++;
    }

    for (var li=0; li<lines.length; li++){
      var raw = lines[li];

      // ignorer lignes vides
      if (!raw || !raw.trim()){
        continue;
      }

      // section ?
      var secm = raw.match(SEC_RE);
      if (secm){
        currentSection = (secm[1]||'').toUpperCase().replace(/\d+/g,'');
        // on enregistre la position de section sur la prochaine mesure
        sections.push({ index: measureIndex+1, label: currentSection });
        continue;
      }

      // tolérance pour 𝄆/𝄇 collés aux barres
      var line = raw
        .replace(/𝄆\s*(?!\|)/g,'𝄆 | ')
        .replace(/(?<!\|)\s*𝄇/g,' | 𝄇');

      var toks = lex(line);
      var i = 0;

      while(i < toks.length){
        var t = toks[i];

        if (t === '|'){
          pushBar();
          i++;
          continue;
        }

        if (t === '𝄆'){
          // repeat start à la prochaine mesure (si on est au milieu d'une mesure vide, marque la suivante)
          var posL = (cur.length===0 ? measureIndex+1 : measureIndex+2);
          repeats.L.push(posL);
          i++;
          continue;
        }

        if (t === '𝄇'){
          // repeat end à la mesure en cours (si pas encore poussée, c'est la suivante)
          var posR = (cur.length===0 ? measureIndex : measureIndex+1);
          if (posR<1) posR=1;
          repeats.R.push(posR);
          i++;
          continue;
        }

        // directions (Fine, D.S., etc.) ignorées pour les accords
        if (DIR_RE.test(t)){
          i++;
          continue;
        }

        // Coller les parenthèses si éclatées "(", "♭9", ")"
        if (t === '('){
          var buf = '(';
          i++;
          while(i<toks.length && toks[i]!==')'){
            buf += toks[i];
            i++;
          }
          if (i<toks.length && toks[i]===')'){ buf += ')'; i++; }
          t = buf;
        }

        // Normaliser / vérifier
        var norm = normalizeChord(t);
        // si c'est clairement pas un accord reconnu ET pas une direction, on le laisse passer (tolérance) mais on ne casse pas le parse
        if (!isRecognizedChord(norm) && !DIR_RE.test(norm)){
          // cas “token littéral” (ex: parenthèses d’indication), on n'ajoute pas comme accord
          i++;
          continue;
        }

        cur.push(norm);
        i++;
      }

      // fin de ligne : si la ligne ne se termine pas par '|', on ne pousse pas automatiquement.
      // L’utilisateur est censé délimiter les mesures avec '|'.
      // Mais si la ligne se termine par 𝄇 ou 𝄆, on ne touche pas.
    }

    // Si un contenu reste en buffer sans '|' final, on l’ajoute comme une mesure incomplète.
    if (cur.length || bars.length===0){
      pushBar();
    }

    // Nettoyage : enlever la dernière mesure vide si texte finissait sans accords ni '|'
    if (bars.length && bars[bars.length-1].length===0){
      bars.pop();
      measureIndex--;
    }

    return {
      bars: bars,           // Array<Array<string>>
      tpb: tpb,             // temps par mesure (défaut: 4)
      repeats: repeats,     // {L:[...], R:[...]} positions 1-based
      sections: sections    // [{index,label}]
    };
  }

  // Expose
  w.GridParse = { parse: parse };

})(window);