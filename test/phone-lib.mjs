export const report = [];
export let LAST = '';
export async function audit(page, label, w) {
  LAST = label;
  const r = await page.evaluate(() => {
    const W = window.innerWidth, out = { W, docOver: document.documentElement.scrollWidth - W, bodyOver: document.body.scrollWidth - W, wide: [], small: [], tiny: [] };
    const scrolls = e => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const cs = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(cs.overflowX) && p.scrollWidth <= p.clientWidth + 1 || /(auto|scroll)/.test(cs.overflowX)) return true; } return false; };
    document.querySelectorAll('body *').forEach(e => {
      const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const b = e.getBoundingClientRect(); if (!b.width || !b.height) return;
      if (cs.position === 'fixed' && e.closest('#mobilebar') == null) { if (b.right > W + 1 || b.left < -1) out.wide.push('FIXED ' + e.tagName + '.' + String(e.className).slice(0, 20) + ' ' + Math.round(b.left) + '-' + Math.round(b.right)); return; }
      if ((b.right > W + 1 || b.left < -1) && !scrolls(e)) out.wide.push(e.tagName + '.' + String(e.className).slice(0, 24) + '#' + e.id + ' ' + Math.round(b.left) + '-' + Math.round(b.right));
      if (/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(e.tagName) || e.getAttribute('role') === 'button') {
        const vis = b.bottom > 0 && b.top < innerHeight * 3;
        if (vis && (b.height < 38 || b.width < 38) && !(e.tagName === 'A' && e.closest('p, li, .foot, footer, #sitefoot'))) out.small.push(e.tagName + '.' + String(e.className).slice(0, 18) + ' "' + (e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 16) + '" ' + Math.round(b.width) + 'x' + Math.round(b.height));
      }
      if (e.children.length === 0 && (e.innerText || '').trim().length > 2 && parseFloat(cs.fontSize) < 10.5) out.tiny.push(e.tagName + '.' + String(e.className).slice(0, 14) + ' ' + cs.fontSize + ' "' + e.innerText.trim().slice(0, 14) + '"');
    });
    document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, select').forEach(e => { const cs = getComputedStyle(e), b = e.getBoundingClientRect(); if (b.width && cs.display !== 'none' && parseFloat(cs.fontSize) < 16) out.small.push('IOS-ZOOM ' + e.tagName + '#' + e.id + ' ' + cs.fontSize); });
    out.wide = [...new Set(out.wide)].slice(0, 40); out.small = [...new Set(out.small)].slice(0, 40); out.tiny = [...new Set(out.tiny)].slice(0, 3);
    return out;
  });
  const bad = r.docOver > 0 || r.bodyOver > 0 || r.wide.length;
  report.push({ w, label, bad, ...r });
}
