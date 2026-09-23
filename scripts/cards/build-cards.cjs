// Genera public/cards/*.svg a partir de:
//  - Baraja_española.svg (Basquetteur, CC BY-SA 3.0): números 1-7
//  - Baraja_española_cartas_blancas_sota_caballo_rey.svg (Basquetteur, CC BY-SA 3.0): sotas y reyes
//  - gjenkins20/spanish-playing-cards-svg (CC BY-SA 3.0, vectorización del arte de Basquetteur): caballos
// Las monedas de oros (cabeza GNU en el original) se sustituyen por un oro castellano propio.
const fs = require('fs');
const path = require('path');
const OUT = 'C:/Users/Danel/PROYECTOS/Musazo/public/cards';
fs.mkdirSync(OUT, { recursive: true });

const e1 = require('./e1.json');
const e2 = require('./e2.json');
const SUITS = ['oros', 'copas', 'espadas', 'bastos'];

function roundSeg(s, dec) {
  return s.replace(/-?\d*\.\d+(e-?\d+)?|-?\d+e-?\d+/g, (m) => {
    const v = Number(m);
    if (!isFinite(v)) return m;
    let r = v.toFixed(dec).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
    if (r === '-0') r = '0';
    return r.replace(/^(-?)0\./, '$1.');
  });
}
// No tocar referencias tipo url(#id) ni #id
function roundNums(s, dec) {
  return s
    .split(/(url\(#[^)]*\)|#[\w.:-]+)/)
    .map((seg, i) => (i % 2 ? seg : roundSeg(seg, dec)))
    .join('');
}

const STYLE_DROP = /^(-inkscape|font-|line-height|letter-spacing|word-spacing|text-anchor|writing-mode|marker|enable-background|display:inline|color:|visibility:visible|overflow:visible|baseline-shift|direction|block-progression|text-align|text-decoration|text-indent|text-transform|clip-rule|isolation|mix-blend-mode|color-interpolation|color-rendering|image-rendering|shape-rendering|solid-|paint-order)/;

function optimize(s, pathDec = 2) {
  s = s
    .replace(/<\?xml[^>]*>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<metadata[\s\S]*?<\/metadata>/g, '')
    .replace(/<sodipodi:namedview[\s\S]*?(\/>|<\/sodipodi:namedview>)/g, '')
    .replace(/\s(inkscape|sodipodi):[\w-]+="[^"]*"/g, '')
    .replace(/\sxmlns(:\w+)?="[^"]*"/g, '');
  s = s.replace(/(\s)([\w:-]+)="([^"]*)"/g, (all, sp, name, val) => {
    if (name === 'id' || /href$/.test(name)) return all;
    if (name === 'd' || name === 'points') return `${sp}${name}="${roundNums(val, pathDec)}"`;
    if (/transform/i.test(name)) return `${sp}${name}="${roundNums(val, 5)}"`;
    if (name === 'style') {
      val = val.split(';').filter((p) => p.trim() && !STYLE_DROP.test(p.trim())).join(';');
      return `${sp}style="${roundNums(val, 3)}"`;
    }
    return `${sp}${name}="${roundNums(val, 3)}"`;
  });
  s = s.replace(/>\s+</g, '><').replace(/\s{2,}/g, ' ').trim();
  return s.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"');
}

// ---------- Oro castellano (caja 100x100) ----------
function coinDefs(p) {
  return `<radialGradient id="${p}g1" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#fff6b8"/><stop offset=".45" stop-color="#f7cc2a"/><stop offset="1" stop-color="#d28f00"/></radialGradient><radialGradient id="${p}g2" cx="60%" cy="65%" r="70%"><stop offset="0" stop-color="#f9d44a"/><stop offset="1" stop-color="#e3a70c"/></radialGradient>`;
}
function coin(p) {
  let beads = '';
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    beads += `<circle cx="${(50 + Math.cos(a) * 44.2).toFixed(2)}" cy="${(50 + Math.sin(a) * 44.2).toFixed(2)}" r="1.6" fill="#fff3b0" stroke="#8a5a00" stroke-width=".5"/>`;
  }
  let star = '';
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? 11.5 : 27;
    star += `${(50 + Math.cos(a) * r).toFixed(2)},${(50 + Math.sin(a) * r).toFixed(2)} `;
  }
  return `<circle cx="50" cy="50" r="48" fill="url(#${p}g1)" stroke="#1a1208" stroke-width="2"/>${beads}<circle cx="50" cy="50" r="39.5" fill="none" stroke="#8a5a00" stroke-width="1.3"/><circle cx="50" cy="50" r="31" fill="url(#${p}g2)" stroke="#1a1208" stroke-width="1.3"/><polygon points="${star.trim()}" fill="#f0b21a" stroke="#6b4300" stroke-width="1"/><circle cx="50" cy="50" r="10" fill="#cf2a1f" stroke="#1a1208" stroke-width="1.2"/><circle cx="47" cy="47" r="3.2" fill="#ff9a86" opacity=".8"/>`;
}
function coinAt(p, cx, cy, size) {
  return `<g transform="translate(${(cx - size / 2).toFixed(2)} ${(cy - size / 2).toFixed(2)}) scale(${(size / 100).toFixed(4)})">${coin(p)}</g>`;
}

// Marco con "pintas": oros sin cortes, copas 1, espadas 2, bastos 3 (en coordenadas de carta 207x318)
function frame(suit, ox = 0, oy = 0) {
  const n = { oros: 1, copas: 3, espadas: 5, bastos: 7 }[suit];
  const x0 = ox + 14.5, x1 = ox + 192.5, y0 = oy + 14.5, y1 = oy + 303.5;
  const w = (x1 - x0) / n;
  let d = `M${x0} ${y0}V${y1}M${x1} ${y0}V${y1}`;
  for (let i = 0; i < n; i += 2) {
    d += `M${(x0 + i * w).toFixed(2)} ${y0}H${(x0 + (i + 1) * w).toFixed(2)}M${(x0 + i * w).toFixed(2)} ${y1}H${(x0 + (i + 1) * w).toFixed(2)}`;
  }
  return `<path d="${d}" fill="none" stroke="#000" stroke-width="1"/>`;
}

function wrap(vb, defs, body) {
  return `<svg viewBox="${vb.map((v) => +v.toFixed(2)).join(' ')}"><defs>${defs}</defs>${body}</svg>`;
}

function fromCell(src, cell, overlay = '') {
  const defs = cell.defIds
    .map((id) => {
      const d = src.defs[id];
      if (id === 'card_body') return '<g id="card_body"/>';
      if (id === 'g3014') {
        const [bx, by, bw, bh] = d.bb;
        return `<g id="g3014"${d.transform ? ` transform="${d.transform}"` : ''}><g transform="translate(${bx} ${by}) scale(${bw / 100} ${bh / 100})">${coin('c')}</g></g>`;
      }
      return d.html;
    })
    .join('');
  const extra = cell.defIds.includes('g3014') || overlay.includes('url(#cg1)') ? coinDefs('c') : '';
  // Sin cuerpo de carta: el papel lo pinta la interfaz
  const body = cell.nodes.join('').replace(new RegExp(`<rect[^>]*id="${cell.body}"[^>]*/>`), '');
  return wrap(cell.vb, defs + extra, body + overlay);
}

const written = {};
function write(name, svg, pathDec) {
  const o = optimize(svg, pathDec);
  fs.writeFileSync(path.join(OUT, `${name}.svg`), o);
  written[name] = o.length;
}

// ---------- Números 1-7 ----------
for (const cell of e1.cells) {
  const col = Math.round(cell.vb[0] / 208);
  const row = Math.round(cell.vb[1] / 319);
  const rank = col + 1;
  if (row > 3 || rank > 7) continue;
  const suit = SUITS[row];
  if (suit === 'oros' && rank === 1) {
    // As de oros propio: índices + gran oro con corona de laurel y cinta
    const [x, y] = cell.vb;
    const idx = cell.nodes[1];
    const cx = x + 103.5, cy = y + 157;
    let laurel = '';
    for (const side of [-1, 1]) {
      for (let i = 0; i < 10; i++) {
        const a = (-78 + i * 16) * (Math.PI / 180);
        const lx = cx + side * Math.cos(a) * 77, ly = cy + Math.sin(a) * 77 + 4;
        const rot = side * ((a * 180) / Math.PI) + side * 90 - side * 28;
        laurel += `<ellipse cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" rx="5" ry="11.5" transform="rotate(${rot.toFixed(1)} ${lx.toFixed(1)} ${ly.toFixed(1)})" fill="${i % 2 ? '#5aa33a' : '#48912c'}" stroke="#1d4410" stroke-width=".9"/>`;
      }
    }
    const ribbon = `<path d="M${cx - 36} ${cy + 80} Q${cx} ${cy + 96} ${cx + 36} ${cy + 80} L${cx + 44} ${cy + 94} Q${cx} ${cy + 110} ${cx - 44} ${cy + 94} Z" fill="#c62a1e" stroke="#1a1208" stroke-width="1.2"/><path d="M${cx - 44} ${cy + 94} l-12 6 l8 -12 z M${cx + 44} ${cy + 94} l12 6 l-8 -12 z" fill="#9e1b14" stroke="#1a1208" stroke-width="1"/>`;
    write('1-oros', wrap(cell.vb, coinDefs('c') + e1.defs.text7873.html, frame('oros', x, y) + idx + laurel + ribbon + coinAt('c', cx, cy - 2, 126)));
    continue;
  }
  write(`${rank}-${suit}`, fromCell(e1, cell));
}

// ---------- Sotas y reyes ----------
for (const cell of e2.cells) {
  const [x, y] = cell.vb;
  const rank = x < 300 ? 10 : x > 600 ? 12 : 11;
  if (rank === 11) continue;
  const suit = SUITS[[217, 550, 879, 1222].findIndex((v) => Math.abs(v - y) < 20)];
  let overlay = '';
  if (suit === 'oros' && rank === 12) overlay = coinAt('c', x + 162.5, y + 48, 50);
  if (suit === 'oros' && rank === 10) overlay = coinAt('c', x + 64, y + 52, 48);
  // Reyes clonados: el índice inferior quedó fuera de la carta en el original; se replica girado
  let c = cell;
  if (rank === 12 && suit === 'oros') {
    // Quita los clones de índice de los otros reyes y replica el índice superior abajo
    const nodes = cell.nodes.filter((n) => !(n.includes('<use') && n.includes('href="#g3304"')));
    const idx = nodes.find((n) => n.includes('id="use3300"'));
    c = { ...cell, nodes };
    if (idx) overlay += `<g transform="rotate(180 ${x + 103.5} ${y + 159})">${idx}</g>`;
  } else if (rank === 12) {
    const i = cell.nodes.findIndex((n) => n.includes('href="#g3304"') || n.includes('id="g3304"'));
    if (i >= 0) {
      const idx = cell.nodes[i];
      const clip = `<clipPath id="ic"><rect x="${x}" y="${y}" width="52" height="52"/></clipPath>`;
      const clipped = `<g clip-path="url(#ic)">${idx}</g>`;
      const nodes = cell.nodes.slice();
      nodes[i] = clip + clipped;
      c = { ...cell, nodes };
      overlay += `<g transform="rotate(180 ${x + 103.5} ${y + 159})">${clipped}</g>`;
    }
  }
  write(`${rank}-${suit}`, fromCell(e2, c, overlay));
}

// ---------- Caballos ----------
const GJ = { oros: 'coins', copas: 'cups', espadas: 'swords', bastos: 'clubs' };
const KX = 207 / 66.88, KY = 318 / 102.08;
for (const suit of SUITS) {
  const s = fs.readFileSync(`gj_${GJ[suit]}_11.svg`, 'utf8');
  let inner = s.slice(s.indexOf('>', s.indexOf('<svg')) + 1, s.lastIndexOf('</svg>'));
  // Quita las capas de fondo claras (el papel lo pinta la interfaz)
  inner = inner.replace(/<path[^>]*?style="fill:#([0-9a-f]{6})"[^>]*?\/>/gi, (m, hex) => {
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const light = Math.min(r, g, b) > 195 && Math.max(r, g, b) - Math.min(r, g, b) < 14;
    return light ? '' : m;
  });
  const clip = `<clipPath id="kc"><rect x="16.5" y="16.5" width="174" height="285"/></clipPath>`;
  const overlay = suit === 'oros' ? coinAt('c', 49.5 * KX, 16.3 * KY, 17.9 * KX) : '';
  const body = `<g clip-path="url(#kc)"><g transform="scale(${KX.toFixed(5)} ${KY.toFixed(5)})">${inner}</g></g>${frame(suit)}${overlay}`;
  write(`11-${suit}`, wrap([0, 0, 207, 318], clip + (overlay ? coinDefs('c') : ''), body), 1);
}

let total = 0;
for (const v of Object.values(written)) total += v;
console.log(Object.keys(written).length, 'cartas,', (total / 1024).toFixed(0), 'KB');
console.log(Object.entries(written).map(([k, v]) => `${k}:${(v / 1024).toFixed(0)}`).join(' '));
