(function(w){
  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // Split a line into tokens and collect chords per bar.
  function parseLine(line){
    var bars=[], cur=[];
    var tokens = String(line||'').split('|');
    for (var i=0;i<tokens.length;i++){
      var t = tokens[i].trim();
      if (!t){ // empty from leading/trailing ||
        // commit only if cur has content
        if (cur.length){ bars.push(cur); cur=[]; }
        continue;
      }
      var parts = t.split(/\s+/).filter(Boolean);
      for (var j=0;j<parts.length;j++){
        var p = parts[j].trim();
        if (!p) continue;
        if (/^𝄆$|^𝄇$/.test(p)){ continue; }
        cur.push(p);
      }
      if (cur.length){ bars.push(cur); cur=[]; }
    }
    if (cur.length){ bars.push(cur); }
    return bars;
  }

  function parse(text){
    var lines = String(text||'').split(/\r?\n/);
    var allBars=[]; var htmlLines=[]; var repeats=[]; var measureIndex=0;
    for (var li=0; li<lines.length; li++){
      var raw = lines[li];
      if (!raw.trim()){ htmlLines.push(''); continue; }
      var line = raw.replace(/\s+/g,' ').trim();
      // Normalize double bars / repeats to have separators around them
      line = line.replace(/𝄆/g,' 𝄆 ').replace(/𝄇/g,' 𝄇 ');
      var bars = parseLine(line);
      // Build HTML preview for this line
      var preview = [];
      for (var bi=0; bi<bars.length; bi++){
        var bar = bars[bi];
        measureIndex++;
        var content = bar.length? esc(bar.join(' ')) : '—';
        preview.push('| '+content+' ');
        // repeats detection around measure boundaries
      }
      if (preview.length) preview.push('|');
      allBars = allBars.concat(bars);
      htmlLines.push(preview.join(''));
    }
    // Remove accidental empties (shouldn't have any, but just in case)
    allBars = allBars.filter(function(b){ return Array.isArray(b) && b.length; });
    return { html: htmlLines.join('\n'), bars: allBars, repeats: repeats };
  }

  function toGridText(bars, perLine){
    perLine = perLine || 4;
    var out=[], buf=[];
    for (var i=0;i<(bars||[]).length;i++){
      var cell = (Array.isArray(bars[i]) && bars[i].length)? bars[i].join(' ') : '—';
      buf.push(cell);
      if (buf.length>=perLine){
        out.push('| '+buf.join(' | ')+' |'); buf=[];
      }
    }
    if (buf.length) out.push('| '+buf.join(' | ')+' |');
    return out.join('\n');
  }

  w.GridParse = { parse: parse, toGridText: toGridText };
})(window);
