/* Checks one screen for problems a person would notice or that break screen readers:
   duplicate ids, controls with no name, fields with no label, images with no alt text, and text too faint to read
   (contrast under 3:1 against what is behind it, in light and dark mode). Used by test/quality.spec.mjs. */
export async function scan(page) {
  return page.evaluate(() => {
    const out = { dupIds: [], noName: [], noLabel: [], noAlt: [], faint: [] };
    const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('[hidden],[aria-hidden="true"]'); };
    const ids = {};
    document.querySelectorAll('[id]').forEach(e => { ids[e.id] = (ids[e.id] || 0) + 1; });
    out.dupIds = Object.keys(ids).filter(k => ids[k] > 1);
    const name = (e) => (e.getAttribute('aria-label') || e.getAttribute('title') || e.innerText || e.value || (e.querySelector('img,svg[aria-label]') && (e.querySelector('img')?.alt || e.querySelector('svg')?.getAttribute('aria-label'))) || '').trim();
    document.querySelectorAll('button, a[href], [role="button"]').forEach(e => { if (vis(e) && !name(e)) out.noName.push(e.outerHTML.slice(0, 90)); });
    document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea').forEach(e => {
      if (!vis(e) || e.closest('.fb-hp')) return;
      const lab = (e.id && document.querySelector('label[for="' + CSS.escape(e.id) + '"]')) || e.closest('label') || e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.getAttribute('title');
      if (!lab) out.noLabel.push(e.outerHTML.slice(0, 90));
    });
    document.querySelectorAll('img').forEach(e => { if (vis(e) && !e.hasAttribute('alt')) out.noAlt.push(e.outerHTML.slice(0, 90)); });
    const parse = (c) => { const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(c); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null; };
    const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const bgOf = (e) => {
      for (let p = e; p; p = p.parentElement) { const c = parse(getComputedStyle(p).backgroundColor); if (c && c[3] > 0.9) return c; if (getComputedStyle(p).backgroundImage !== 'none' && p !== document.body) return null; }
      return parse(getComputedStyle(document.body).backgroundColor) || [255, 255, 255, 1];
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.textContent.trim(); if (t.length < 2) continue;
      const e = n.parentElement; if (!e || seen.has(e) || !vis(e)) continue; seen.add(e);
      if (e.closest('input,textarea,select,option,[disabled],.btn[disabled],button[disabled]')) continue;
      const cs = getComputedStyle(e); const fg = parse(cs.color); const bg = bgOf(e);
      if (!fg || !bg || fg[3] < 0.5 || parseFloat(cs.opacity) < 0.5) continue;
      const a = lum(fg), b = lum(bg); const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      if (ratio < 3) out.faint.push(ratio.toFixed(2) + ' "' + t.slice(0, 40) + '" ' + e.tagName + '.' + String(e.className).slice(0, 30));
    }
    for (const k of Object.keys(out)) out[k] = [...new Set(out[k])].slice(0, 12);
    return out;
  });
}
