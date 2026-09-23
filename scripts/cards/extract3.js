(() => {
  const TOL = 3;
  const svg = document.documentElement;
  const ser = new XMLSerializer();
  // Celdas: se localizan por los cuerpos de carta (≈207x318)
  const bodies = [];
  document.querySelectorAll('rect,path,use').forEach((e) => {
    const r = e.getBoundingClientRect();
    if (Math.abs(r.width - 207) < 3 && Math.abs(r.height - 318) < 3 && r.top > -5) bodies.push({ id: e.id, x: r.left, y: r.top, w: r.width, h: r.height });
  });
  const cells = bodies.map((b) => ({ ...b, els: [] }));
  const inside = (r, c) => r.left >= c.x - TOL && r.top >= c.y - TOL && r.right <= c.x + c.w + TOL && r.bottom <= c.y + c.h + TOL;
  function visit(el) {
    if (['defs', 'metadata', 'namedview', 'title'].includes(el.localName)) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    const c = cells.find((c) => inside(r, c));
    if (c) { c.els.push(el); return; }
    if (el.localName !== 'use' && el.children.length) { for (const ch of el.children) visit(ch); return; }
    // Elemento que se sale de su carta (p. ej. índices clonados): va a toda carta que cubra en buena parte
    if (r.width > 700 || r.height > 1000) return;
    const area = r.width * r.height || 1;
    for (const c of cells) {
      const ix = Math.max(0, Math.min(r.right, c.x + c.w) - Math.max(r.left, c.x));
      const iy = Math.max(0, Math.min(r.bottom, c.y + c.h) - Math.max(r.top, c.y));
      if ((ix * iy) / area >= 0.03 && ix * iy > 2000) c.els.push(el);
    }
  }
  for (const ch of svg.children) visit(ch);
  const refsOf = (s) => [...s.matchAll(/url\(#([^)]+)\)/g), ...s.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
  const defs = {};
  function collect(ids, acc) {
    const q = [...ids];
    while (q.length) {
      const id = q.pop(); if (acc.has(id)) continue;
      const el = document.getElementById(id); if (!el) continue;
      acc.add(id);
      if (!defs[id]) {
        const html = ser.serializeToString(el);
        let bb = null; try { const b = el.getBBox(); bb = [b.x, b.y, b.width, b.height]; } catch {}
        defs[id] = { html, bb, transform: el.getAttribute('transform'), tag: el.localName };
      }
      q.push(...refsOf(defs[id].html));
    }
  }
  const out = cells.map((c) => {
    const acc = new Set();
    const nodes = c.els.map((el) => {
      const m = el.getCTM();
      const clone = el.cloneNode(true); clone.removeAttribute('transform');
      const html = `<g transform="matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].map((v) => +v.toFixed(5)).join(',')})">${ser.serializeToString(clone)}</g>`;
      collect(refsOf(html), acc);
      return html;
    });
    return { body: c.id, vb: [c.x, c.y, c.w, c.h], nodes, defIds: [...acc] };
  });
  return JSON.stringify({ cells: out, defs });
})()
