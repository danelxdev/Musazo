import type { State } from '../game/engine';
import { backHtml } from './cards';
import { play } from './sound';

/**
 * El mazo sobre el tapete y las cartas en vuelo:
 * - el mazo está delante del que reparte (a la izquierda de la mano);
 * - al empezar la mano se recogen las cartas, el mazo pasa al nuevo repartidor y se baraja;
 * - las cartas salen volando del mazo hacia cada jugador;
 * - los descartes del mus van a un montón junto al mazo.
 */

export const DEAL_MS = 480;

interface Snap {
  rect: DOMRect;
  html: string;
}

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class DeckFx {
  private zone: HTMLElement;
  private deck: HTMLElement;
  private discards: HTMLElement;
  private fx: HTMLElement;
  private lastHand = 0;
  private lastDeckLen = 0;
  private pileN = -1;
  private moveTimer = 0;
  private placeFrame = 0;

  constructor(private mat: HTMLElement) {
    this.zone = document.createElement('div');
    this.zone.className = 'deckzone';
    this.zone.setAttribute('aria-hidden', 'true');
    this.zone.innerHTML = '<div class="discards"></div><div class="deck"></div>';
    this.deck = this.zone.querySelector('.deck')!;
    this.discards = this.zone.querySelector('.discards')!;
    this.fx = document.createElement('div');
    this.fx.className = 'fx-layer';
    mat.append(this.zone, this.fx);
    // El hueco del mazo se mueve cuando cambia el tamaño del tapete o de las manos
    const ro = new ResizeObserver(() => this.place());
    ro.observe(mat);
    mat.querySelectorAll('.seat').forEach((seat) => ro.observe(seat));
  }

  /** Nueva partida: el mazo vuelve a empezar (se baraja al repartir la primera mano). */
  reset() {
    this.lastHand = 0;
    this.lastDeckLen = 0;
    window.clearTimeout(this.moveTimer);
    this.discards.innerHTML = '';
  }

  /** Cambia el mazo de sitio (delante del que reparte). */
  private setSeat(seat: string) {
    this.zone.dataset.seat = seat;
    this.place();
  }

  /**
   * En el móvil cada jugador tiene un hueco reservado para el mazo (.deck-anchor), así no tapa nada:
   * el mazo se coloca encima de ese hueco. Si el hueco no se ve (escritorio), lo coloca el CSS.
   */
  private place() {
    const anchor = this.mat.querySelector<HTMLElement>(`.seat.s${this.zone.dataset.seat} .deck-anchor`);
    const r = anchor?.getBoundingClientRect();
    if (!anchor || !r || !r.width || !anchor.offsetParent) {
      this.zone.style.left = '';
      this.zone.style.top = '';
      this.zone.classList.remove('anchored');
      return;
    }
    const m = this.mat.getBoundingClientRect();
    this.zone.style.left = `${r.left - m.left + r.width / 2}px`;
    this.zone.style.top = `${r.top - m.top + r.height / 2}px`;
    this.zone.classList.add('anchored');
  }

  /** Posición de las cartas de las manos antes de volver a pintarlas. */
  snapshot(root: HTMLElement) {
    const snap = new Map<string, Snap>();
    root.querySelectorAll<HTMLElement>('.seat .hand .card[data-id]').forEach((el) => {
      snap.set(el.dataset.id!, { rect: el.getBoundingClientRect(), html: el.outerHTML });
    });
    return snap;
  }

  afterRender(s: State, prev: Map<string, Snap>, root: HTMLElement) {
    this.zone.classList.toggle('on', s.phase !== 'intro');
    const dealer = String(s.deckSeat);
    const newHand = s.handNo !== this.lastHand;

    if (newHand) {
      const first = this.lastHand === 0;
      this.lastHand = s.handNo;
      window.clearTimeout(this.moveTimer);
      if (first) {
        this.setSeat(dealer);
        window.setTimeout(() => this.shuffle(), 350);
      } else {
        // Se recogen todas las cartas al mazo, el mazo pasa al nuevo repartidor y se baraja
        this.collect(prev);
        this.moveTimer = window.setTimeout(() => {
          this.setSeat(dealer);
          window.setTimeout(() => this.shuffle(), 720);
        }, 450);
      }
    } else {
      if (this.zone.dataset.seat !== dealer) {
        this.setSeat(dealer);
        play('deal');
      } else {
        // Los asientos se vuelven a pintar: el hueco puede haberse movido
        this.place();
      }
      const current = new Set(s.hands.flat().map((c) => c.id));
      let i = 0;
      for (const [id, snap] of prev) if (!current.has(id)) this.discard(snap, i++);
      // Si se acabó el mazo, los descartes vuelven a él barajados
      if (s.deck.length > this.lastDeckLen + 1 && this.discards.childElementCount) this.recycle();
    }
    this.lastDeckLen = s.deck.length;
    this.renderPile(s.phase === 'intro' ? 6 : s.deck.length);
    this.animateDeals(root);
    // Y otra vez cuando el navegador haya colocado todo
    cancelAnimationFrame(this.placeFrame);
    this.placeFrame = requestAnimationFrame(() => this.place());
  }

  private renderPile(len: number) {
    const n = len === 0 ? 0 : Math.max(1, Math.min(6, Math.ceil(len / 6)));
    if (n === this.pileN) return;
    this.pileN = n;
    this.deck.innerHTML = Array.from({ length: n }, (_, k) => backHtml('', `--k:${k}`)).join('');
  }

  private center(r: DOMRect) {
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /** Cartas recién repartidas: salen del mazo del que reparte. */
  private animateDeals(root: HTMLElement) {
    if (reduced()) return;
    const now = performance.now();
    const fresh = [...root.querySelectorAll<HTMLElement>('.seat .hand .card[data-born]')].filter(
      (el) => now - Number(el.dataset.born) < DEAL_MS,
    );
    if (!fresh.length) return;
    const d = this.center(this.deck.getBoundingClientRect());
    const dw = this.deck.getBoundingClientRect().width || 40;
    for (const el of fresh) {
      const r = el.getBoundingClientRect();
      const c = this.center(r);
      const anim = el.animate(
        [
          { transform: `translate(${d.x - c.x}px, ${d.y - c.y}px) rotate(${rnd(-25, 25)}deg) scale(${dw / r.width})`, opacity: 0, offset: 0 },
          { opacity: 1, offset: 0.12 },
        ],
        { duration: DEAL_MS, easing: 'cubic-bezier(.2,.75,.25,1)' },
      );
      anim.currentTime = now - Number(el.dataset.born);
    }
  }

  private ghost(snap: Snap) {
    const m = this.mat.getBoundingClientRect();
    const box = document.createElement('div');
    box.innerHTML = snap.html;
    const g = box.firstElementChild as HTMLElement;
    g.classList.add('ghost');
    g.classList.remove('selected', 'selectable', 'flip');
    Object.assign(g.style, {
      left: `${snap.rect.left - m.left}px`,
      top: `${snap.rect.top - m.top}px`,
      width: `${snap.rect.width}px`,
      height: `${snap.rect.height}px`,
      transform: 'none',
      margin: '0',
    });
    this.fx.appendChild(g);
    return g;
  }

  private flyTo(g: HTMLElement, from: DOMRect, target: DOMRect, o: { delay?: number; duration?: number; rot?: number; flipHalf?: boolean }) {
    const f = this.center(from), t = this.center(target);
    const scale = target.width / from.width;
    const duration = reduced() ? 1 : o.duration ?? 520;
    if (o.flipHalf && g.classList.contains('face')) {
      window.setTimeout(() => {
        g.classList.replace('face', 'back');
        g.innerHTML = '<i></i>';
      }, (o.delay ?? 0) + duration * 0.45);
    }
    return g
      .animate(
        [
          { transform: 'translate(0, 0) rotate(0deg) scale(1)' },
          { transform: `translate(${(t.x - f.x) * 0.5}px, ${(t.y - f.y) * 0.5 - 30}px) rotate(${(o.rot ?? 0) / 2}deg) scale(${(1 + scale) / 2 + 0.08})`, offset: 0.5 },
          { transform: `translate(${t.x - f.x}px, ${t.y - f.y}px) rotate(${o.rot ?? 0}deg) scale(${scale})` },
        ],
        { duration, delay: o.delay ?? 0, easing: 'cubic-bezier(.45,.05,.25,1)', fill: 'forwards' },
      )
      .finished.catch(() => undefined);
  }

  /** Un descarte vuela boca abajo al montón de descartes. */
  private discard(snap: Snap, i: number) {
    const g = this.ghost(snap);
    const rot = rnd(-40, 40);
    const target = this.discards.getBoundingClientRect();
    play('deal');
    this.flyTo(g, snap.rect, target, { delay: i * 70, rot, flipHalf: true }).then(() => {
      g.remove();
      const card = document.createElement('div');
      card.className = 'card back';
      card.innerHTML = '<i></i>';
      card.style.transform = `translate(${rnd(-6, 6)}px, ${rnd(-6, 6)}px) rotate(${rot}deg)`;
      this.discards.appendChild(card);
    });
  }

  /** Fin de mano: todas las cartas y descartes vuelven al mazo. */
  private collect(prev: Map<string, Snap>) {
    const target = this.deck.getBoundingClientRect();
    let i = 0;
    for (const snap of prev.values()) {
      const g = this.ghost(snap);
      this.flyTo(g, snap.rect, target, { delay: i++ * 28, duration: 480, rot: rnd(-12, 12), flipHalf: true }).then(() => g.remove());
    }
    this.recycle();
  }

  /** El montón de descartes vuelve al mazo. */
  private recycle() {
    const target = this.deck.getBoundingClientRect();
    [...this.discards.children].forEach((c, k) => {
      const el = c as HTMLElement;
      const r = el.getBoundingClientRect();
      const g = this.ghost({ rect: r, html: el.outerHTML });
      el.remove();
      this.flyTo(g, r, target, { delay: k * 20, duration: 420 }).then(() => g.remove());
    });
  }

  private shuffle() {
    if (reduced()) return;
    this.deck.classList.remove('shuffle');
    void this.deck.offsetWidth;
    this.deck.classList.add('shuffle');
    play('shuffle');
    window.setTimeout(() => this.deck.classList.remove('shuffle'), 750);
  }
}
