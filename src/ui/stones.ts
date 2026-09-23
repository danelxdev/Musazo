import { play } from './sound';

/**
 * Piedras y amarracos sobre el tapete, como en el mus de verdad:
 * en el centro está el montón; cada pareja coge una piedra por tanto y,
 * al juntar cinco, las devuelve y coge un amarraco (5 tantos).
 * Las piedras van a un lado de la zona de cada pareja y los amarracos al otro.
 */

interface Pt {
  x: number;
  y: number;
}

interface Layout {
  bolsa: Pt;
  bolsaR: number;
  zones: { x: number; y: number; w: number; h: number }[];
  a: Pt[][];
  p: Pt[][];
}

const TEAM_LABEL = ['Nosotros', 'Ellos'];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Stones {
  private layer: HTMLElement;
  private bolsaEl: HTMLElement;
  private zoneEls: HTMLElement[];
  private layout: Layout | null = null;
  private a: HTMLElement[][] = [[], []];
  private p: HTMLElement[][] = [[], []];
  private shown: [number, number] = [0, 0];
  private target: [number, number] = [0, 0];
  private chain: Promise<void>[] = [Promise.resolve(), Promise.resolve()];
  private busy = [false, false];

  constructor(private mat: HTMLElement) {
    this.layer = document.createElement('div');
    this.layer.className = 'stones';
    this.layer.setAttribute('aria-hidden', 'true');
    this.bolsaEl = document.createElement('div');
    this.bolsaEl.className = 'bolsa';
    this.bolsaEl.innerHTML = this.pileHtml();
    this.zoneEls = [0, 1].map((t) => {
      const z = document.createElement('div');
      z.className = `stone-zone t${t}`;
      z.innerHTML = `<span>${TEAM_LABEL[t]}</span>`;
      return z;
    });
    this.layer.append(this.zoneEls[0], this.bolsaEl, this.zoneEls[1]);
    mat.appendChild(this.layer);
    new ResizeObserver(() => this.relayout()).observe(mat);
  }

  set visible(v: boolean) {
    this.layer.classList.toggle('on', v);
  }

  /** Montón decorativo del centro */
  private pileHtml() {
    let h = '';
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    for (let i = 0; i < 18; i++) {
      const a = rnd(0, Math.PI * 2), r = Math.sqrt(Math.random()) * 36;
      h += `<i class="piedra" style="left:${50 + Math.cos(a) * r}%;top:${50 + Math.sin(a) * r}%"></i>`;
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + rnd(-0.3, 0.3), r = rnd(8, 26);
      h += `<i class="amarraco" style="left:${50 + Math.cos(a) * r}%;top:${50 + Math.sin(a) * r}%;rotate:${(a * 180) / Math.PI + 90 + rnd(-25, 25)}deg"></i>`;
    }
    return h;
  }

  private compute(): Layout {
    const W = this.mat.clientWidth;
    const H = this.mat.clientHeight;
    const cy = (parseFloat(getComputedStyle(this.mat).getPropertyValue('--cy')) || 41) / 100;
    const narrow = W < 1150;
    this.layer.classList.toggle('narrow', narrow);
    const bolsaR = narrow ? 26 : 38;
    const aCols = narrow ? 4 : 8, aRows = narrow ? 2 : 1, aStep = narrow ? 12 : 16, aStepY = narrow ? 24 : 0;
    const pCols = narrow ? 3 : 5, pRows = narrow ? 2 : 1, pStep = narrow ? 13 : 19, pStepY = narrow ? 14 : 0;
    const pad = narrow ? 8 : 14, inner = narrow ? 10 : 22;
    const aW = aCols * aStep, pW = pCols * pStep;
    const w = pad * 2 + aW + inner + pW;
    const h = narrow ? 62 : 52;
    const gap = narrow ? 12 : 20;
    const y = H * cy;
    const bolsa = { x: W / 2, y };
    const zones = [
      { x: W / 2 - bolsaR - gap - w, y: y - h / 2, w, h },
      { x: W / 2 + bolsaR + gap, y: y - h / 2, w, h },
    ];
    const grid = (x0: number, cols: number, rows: number, sx: number, sy: number, n: number) =>
      Array.from({ length: n }, (_, i) => ({
        x: x0 + (i % cols) * sx + sx / 2,
        y: y + (Math.floor(i / cols) - (rows - 1) / 2) * sy,
      }));
    // Nosotros: [amarracos | piedras] · montón · Ellos: [piedras | amarracos]
    const a0 = grid(zones[0].x + pad, aCols, aRows, aStep, aStepY, 8);
    const p0 = grid(zones[0].x + pad + aW + inner, pCols, pRows, pStep, pStepY, 6);
    const p1 = grid(zones[1].x + pad, pCols, pRows, pStep, pStepY, 6);
    // Los amarracos de «Ellos» se colocan desde el borde exterior (derecha) hacia dentro
    const ax1 = zones[1].x + pad + pW + inner;
    const a1 = grid(ax1, aCols, aRows, aStep, aStepY, 8).map((pt) => ({ x: 2 * ax1 + aW - pt.x, y: pt.y }));
    return { bolsa, bolsaR, zones, a: [a0, a1], p: [p0, p1] };
  }

  relayout() {
    const L = (this.layout = this.compute());
    Object.assign(this.bolsaEl.style, {
      left: `${L.bolsa.x - L.bolsaR}px`,
      top: `${L.bolsa.y - L.bolsaR}px`,
      width: `${L.bolsaR * 2}px`,
      height: `${L.bolsaR * 2}px`,
    });
    L.zones.forEach((z, t) =>
      Object.assign(this.zoneEls[t].style, { left: `${z.x}px`, top: `${z.y}px`, width: `${z.w}px`, height: `${z.h}px` }),
    );
    for (const t of [0, 1]) {
      if (this.busy[t]) continue;
      this.a[t].forEach((el, i) => this.place(el, L.a[t][i]));
      this.p[t].forEach((el, i) => this.place(el, L.p[t][i]));
    }
  }

  /** La rotación va dentro del transform: si fuera la propiedad `rotate`, giraría también la traslación. */
  private tf(el: HTMLElement, x: number, y: number, scale = 1) {
    return `translate(${x}px, ${y}px) rotate(${el.dataset.r ?? 0}deg) scale(${scale})`;
  }

  private place(el: HTMLElement, pt: Pt) {
    el.style.transform = this.tf(el, pt.x, pt.y);
  }

  private make(kind: 'piedra' | 'amarraco', at: Pt) {
    const el = document.createElement('i');
    el.className = `stone ${kind}`;
    if (kind === 'amarraco') el.dataset.r = ((Math.random() - 0.5) * 16).toFixed(1);
    this.place(el, at);
    this.layer.appendChild(el);
    return el;
  }

  /** Vuelo en arco: sube, crece un poco (como si se levantara) y aterriza. */
  private fly(el: HTMLElement, from: Pt, to: Pt, o: { duration?: number; delay?: number; lift?: number; fadeIn?: boolean; fadeOut?: boolean } = {}) {
    const duration = reduced() ? 1 : o.duration ?? 620;
    const lift = o.lift ?? Math.min(90, 30 + Math.hypot(to.x - from.x, to.y - from.y) * 0.25);
    const frames: Keyframe[] = [];
    const N = 12;
    for (let k = 0; k <= N; k++) {
      const t = k / N;
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t - lift * 4 * t * (1 - t);
      const s = 1 + 0.45 * Math.sin(Math.PI * t);
      let opacity = 1;
      if (o.fadeIn) opacity = Math.min(1, t * 5);
      if (o.fadeOut) opacity = Math.min(1, (1 - t) * 4);
      frames.push({ transform: this.tf(el, x, y, s), opacity, offset: t });
    }
    this.place(el, to);
    const anim = el.animate(frames, { duration, delay: o.delay ?? 0, easing: 'cubic-bezier(.45,.05,.3,1)', fill: 'backwards' });
    return anim.finished.then(() => undefined).catch(() => undefined);
  }

  private flash(at: Pt) {
    const ring = document.createElement('i');
    ring.className = 'stone-flash';
    ring.style.transform = `translate(${at.x}px, ${at.y}px)`;
    this.layer.appendChild(ring);
    ring
      .animate(
        [
          { transform: `translate(${at.x}px, ${at.y}px) scale(.2)`, opacity: 1 },
          { transform: `translate(${at.x}px, ${at.y}px) scale(2.4)`, opacity: 0 },
        ],
        { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)' },
      )
      .finished.finally(() => ring.remove());
  }

  /** Actualiza los tantos de cada pareja; las animaciones se encolan. */
  setScores(scores: [number, number]) {
    if (!this.layout) this.relayout();
    for (const t of [0, 1] as const) {
      if (scores[t] === this.target[t]) continue;
      this.target[t] = scores[t];
      const goal = scores[t];
      this.chain[t] = this.chain[t].then(() => this.animateTo(t, goal));
    }
  }

  private async animateTo(t: 0 | 1, goal: number) {
    this.busy[t] = true;
    try {
      const L = this.layout ?? this.compute();
      if (goal < this.shown[t]) await this.clear(t, L);
      const steps = goal - this.shown[t];
      if (steps > 10) {
        await this.jump(t, goal, L);
      } else {
        for (let i = 0; i < steps; i++) {
          const el = this.make('piedra', L.bolsa);
          const slot = L.p[t][this.p[t].length];
          this.p[t].push(el);
          const landed = this.fly(el, L.bolsa, slot, { fadeIn: true }).then(() => play('stone'));
          this.shown[t]++;
          if (this.p[t].length === 5) {
            await landed;
            await this.convert(t, L);
          } else {
            await sleep(reduced() ? 0 : 170);
            if (i === steps - 1) await landed;
          }
        }
      }
    } finally {
      this.busy[t] = false;
    }
  }

  /** Cinco piedras se juntan, vuelven al montón y la pareja coge un amarraco. */
  private async convert(t: 0 | 1, L: Layout) {
    const stones = this.p[t].splice(0, 5);
    const c = stones.reduce((acc, _el, i) => ({ x: acc.x + L.p[t][i].x / 5, y: acc.y + L.p[t][i].y / 5 }), { x: 0, y: 0 });
    await Promise.all(stones.map((el, i) => this.fly(el, L.p[t][i], c, { duration: 260, lift: 6 })));
    this.flash(c);
    play('chip');
    const back = Promise.all(stones.map((el, i) => this.fly(el, c, L.bolsa, { duration: 520, delay: i * 30, fadeOut: true }).then(() => el.remove())));
    const am = this.make('amarraco', L.bolsa);
    const slot = L.a[t][this.a[t].length];
    this.a[t].push(am);
    await Promise.all([back, this.fly(am, L.bolsa, slot, { duration: 700, delay: 120, fadeIn: true }).then(() => play('stone'))]);
  }

  /** Salto grande (p. ej. órdago): van directamente los amarracos y piedras que falten. */
  private async jump(t: 0 | 1, goal: number, L: Layout) {
    const wantA = Math.floor(goal / 5), wantP = goal % 5;
    const flights: Promise<unknown>[] = [];
    let k = 0;
    while (this.p[t].length > wantP) {
      const el = this.p[t].pop()!;
      flights.push(this.fly(el, L.p[t][this.p[t].length], L.bolsa, { fadeOut: true, delay: k++ * 50 }).then(() => el.remove()));
    }
    while (this.a[t].length < Math.min(8, wantA)) {
      const el = this.make('amarraco', L.bolsa);
      flights.push(this.fly(el, L.bolsa, L.a[t][this.a[t].length], { fadeIn: true, delay: k++ * 80 }).then(() => play('stone')));
      this.a[t].push(el);
    }
    while (this.p[t].length < wantP) {
      const el = this.make('piedra', L.bolsa);
      flights.push(this.fly(el, L.bolsa, L.p[t][this.p[t].length], { fadeIn: true, delay: k++ * 80 }));
      this.p[t].push(el);
    }
    await Promise.all(flights);
    this.shown[t] = goal;
  }

  /** Nueva partida: todo vuelve al montón. */
  private async clear(t: 0 | 1, L: Layout) {
    const all = [
      ...this.a[t].map((el, i) => [el, L.a[t][i]] as const),
      ...this.p[t].map((el, i) => [el, L.p[t][i]] as const),
    ];
    await Promise.all(all.map(([el, from], i) => this.fly(el, from, L.bolsa, { delay: i * 45, fadeOut: true }).then(() => el.remove())));
    this.a[t] = [];
    this.p[t] = [];
    this.shown[t] = 0;
  }
}
