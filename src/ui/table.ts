import type { Card } from '../game/cards';
import { LANCE_NAMES, describeJuego, describePares } from '../game/evaluate';
import {
  type Action, type Request, type State, HUMAN, Restart, JUEGOS_TO_WIN, SEAT_NAMES, TEAM_NAMES, WIN_POINTS, teamOf,
} from '../game/engine';
import type { Lance } from '../game/evaluate';
import * as ai from '../game/ai';
import { backHtml, faceHtml } from './cards';
import { DEAL_MS, DeckFx } from './deckfx';
import { Stones } from './stones';
import { isMuted, play, toggleMute } from './sound';

const BASE = import.meta.env.BASE_URL;
const FLIP_MS = 700;
/** Tiempo de cada jugador para decidir. */
export const TURN_MS = 20000;
/** Tiempo para pasar a la siguiente mano o juego. */
const CONTINUE_MS = 15000;

interface TurnTimer {
  total: number;
  start: number;
  deadline: number;
  remaining: number;
  handles: number[];
}

const ICON = {
  book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>',
  restart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  muted: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>',
};

const LAYOUT = `
<div class="app">
  <header class="topbar">
    <img class="brand" src="${BASE}logo-light.png" alt="musazo" width="1400" height="218">
    <div class="scoreboard" data-region="score"></div>
    <div class="top-actions">
      <button class="pill-btn restart-btn" data-action="restart" aria-label="Reiniciar partida">${ICON.restart}<span>Reiniciar</span></button>
      <button class="pill-btn" data-action="rules" aria-label="Reglas del mus">${ICON.book}<span>Reglas</span></button>
      <button class="icon-btn" data-action="mute" aria-label="Sonido"></button>
    </div>
  </header>
  <main class="stage">
    <div class="mat">
      <div class="lances" data-region="lances"></div>
      <div class="seat s2" data-region="seat2"></div>
      <div class="seat s1" data-region="seat1"></div>
      <div class="seat s3" data-region="seat3"></div>
      <div class="center" data-region="center"></div>
      <div class="bottom">
        <div class="controls" data-region="controls"></div>
        <div class="seat s0" data-region="seat0"></div>
      </div>
      <div class="overlay" data-region="overlay"></div>
    </div>
  </main>
  <div class="confirm" hidden>
    <div class="confirm-scrim" data-action="restart-cancel"></div>
    <div class="confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-text">
      <h3 id="confirm-title">¿Reiniciar la partida?</h3>
      <p id="confirm-text">Se perderán los tantos y los juegos de la partida actual y empezaréis de cero.</p>
      <div class="confirm-actions">
        <button class="btn quiet" data-action="restart-cancel">Cancelar</button>
        <button class="btn danger" data-action="restart-confirm">Reiniciar</button>
      </div>
    </div>
  </div>
</div>`;

interface Pending {
  req: Request;
  resolve: (a: Action) => void;
  reject: (e: Error) => void;
}

export class TableUI {
  private regions = new Map<string, HTMLElement>();
  private last = new Map<string, string>();
  private pending: Pending | null = null;
  private selected = new Set<string>();
  private seen = new Map<string, number>();
  private revealAt = 0;
  private amount = 2;
  private handNo = -1;
  private state: State | null = null;
  private deckFx: DeckFx;
  private stones: Stones;
  private timer: TurnTimer | null = null;
  private paused = false;
  private turnKey = '';
  private turnStart = 0;
  onStart: (() => void) | null = null;
  onRules: (() => void) | null = null;
  onRestart: (() => void) | null = null;
  /** Avisa cuando se abre o cierra el diálogo de confirmación (para pausar la partida). */
  onConfirmToggle: ((open: boolean) => void) | null = null;

  constructor(private root: HTMLElement) {
    root.innerHTML = LAYOUT;
    root.querySelectorAll<HTMLElement>('[data-region]').forEach((el) => this.regions.set(el.dataset.region!, el));
    const mat = root.querySelector<HTMLElement>('.mat')!;
    this.stones = new Stones(mat);
    this.deckFx = new DeckFx(mat);
    root.addEventListener('click', (e) => this.onClick(e));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.confirmOpen) this.closeConfirm();
    });
    this.renderMute();
  }

  private renderMute() {
    const b = this.root.querySelector<HTMLButtonElement>('[data-action="mute"]')!;
    b.innerHTML = isMuted() ? ICON.muted : ICON.sound;
    b.setAttribute('aria-pressed', String(isMuted()));
  }

  private onClick(e: Event) {
    const target = e.target as HTMLElement;
    const cardEl = target.closest<HTMLElement>('.s0 .card');
    if (cardEl && this.pending?.req.type === 'discard') {
      const id = cardEl.dataset.id!;
      if (this.selected.has(id)) this.selected.delete(id);
      else this.selected.add(id);
      this.rerender();
      return;
    }
    const btn = target.closest<HTMLElement>('[data-action]');
    if (!btn) return;
    const act = btn.dataset.action!;
    if (act === 'mute') {
      toggleMute();
      this.renderMute();
      return;
    }
    if (act === 'restart') {
      this.openConfirm();
      return;
    }
    if (act === 'restart-cancel') {
      this.closeConfirm();
      return;
    }
    if (act === 'restart-confirm') {
      this.closeConfirm();
      this.onRestart?.();
      return;
    }
    if (act === 'rules') {
      this.onRules?.();
      return;
    }
    if (act === 'start') {
      this.onStart?.();
      return;
    }
    if (act === 'inc' || act === 'dec') {
      this.amount = Math.max(2, Math.min(30, this.amount + (act === 'inc' ? 1 : -1)));
      this.rerender();
      return;
    }
    if (!this.pending) return;
    let action: Action | null = null;
    switch (act) {
      case 'mus': action = { kind: 'mus' }; break;
      case 'corto': action = { kind: 'corto' }; break;
      case 'discard':
        if (this.selected.size === 0) return;
        action = { kind: 'discard', ids: [...this.selected] };
        break;
      case 'paso': action = { kind: 'paso' }; break;
      case 'envido': action = { kind: 'envido', n: this.amount }; break;
      case 'ordago': action = { kind: 'ordago' }; break;
      case 'quiero': action = { kind: 'quiero' }; break;
      case 'noquiero': action = { kind: 'noquiero' }; break;
      case 'continue': action = { kind: 'continue' }; break;
    }
    if (!action) return;
    this.resolvePending(action);
  }

  private resolvePending(action: Action) {
    if (!this.pending) return;
    const { resolve } = this.pending;
    this.pending = null;
    this.selected.clear();
    this.stopTimer();
    resolve(action);
    this.rerender();
  }

  // ---------- Reiniciar ----------

  private get confirmOpen() {
    return !this.root.querySelector<HTMLElement>('.confirm')!.hidden;
  }

  private openConfirm() {
    const el = this.root.querySelector<HTMLElement>('.confirm')!;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('open'));
    el.querySelector<HTMLButtonElement>('[data-action="restart-cancel"].btn')?.focus();
    this.onConfirmToggle?.(true);
  }

  private closeConfirm() {
    const el = this.root.querySelector<HTMLElement>('.confirm')!;
    if (el.hidden) return;
    el.classList.remove('open');
    el.hidden = true;
    this.onConfirmToggle?.(false);
  }

  /** Descarta la decisión pendiente: la partida se ha reiniciado. */
  cancel() {
    const p = this.pending;
    this.pending = null;
    this.selected.clear();
    this.stopTimer();
    p?.reject(new Restart());
    this.rerender();
  }

  ask(req: Request, state: State): Promise<Action> {
    return new Promise((resolve, reject) => {
      this.pending = { req, resolve, reject };
      this.amount = 2;
      this.selected.clear();
      const ms = req.type === 'continue' ? (req.label === 'Nueva partida' ? 0 : CONTINUE_MS) : TURN_MS;
      if (ms) this.startTimer(ms);
      this.render(state);
    });
  }

  // ---------- Temporizador de turno ----------

  private startTimer(ms: number) {
    this.stopTimer();
    const now = performance.now();
    this.timer = { total: ms, start: now, deadline: now + ms, remaining: ms, handles: [] };
    if (!this.paused) this.arm();
  }

  private arm() {
    const tm = this.timer;
    if (!tm) return;
    const left = tm.deadline - performance.now();
    tm.handles.push(window.setTimeout(() => this.onTimeout(), Math.max(0, left)));
    // Avisos sonoros en los últimos 5 segundos (solo cuando decides tú)
    if (this.pending?.req.type !== 'continue') {
      for (let k = 1; k <= 5; k++) {
        const at = left - k * 1000;
        if (at > 0) tm.handles.push(window.setTimeout(() => play('tick'), at));
      }
    }
  }

  private stopTimer() {
    this.timer?.handles.forEach((h) => window.clearTimeout(h));
    this.timer = null;
  }

  /** Pausa (por ejemplo, mientras se leen las reglas). */
  setPaused(p: boolean) {
    if (p === this.paused) return;
    this.paused = p;
    this.root.querySelector('.app')!.classList.toggle('paused', p);
    const tm = this.timer;
    if (!tm) return;
    const now = performance.now();
    if (p) {
      tm.remaining = tm.deadline - now;
      tm.handles.forEach((h) => window.clearTimeout(h));
      tm.handles = [];
    } else {
      tm.deadline = now + tm.remaining;
      tm.start = tm.deadline - tm.total;
      this.arm();
      this.syncTimers();
    }
  }

  /** Se acabó el tiempo: se juega la opción más prudente. */
  private onTimeout() {
    if (!this.pending || !this.state) return;
    const req = this.pending.req;
    let action: Action;
    switch (req.type) {
      case 'mus':
        action = { kind: 'corto' };
        break;
      case 'discard':
        action = this.selected.size ? { kind: 'discard', ids: [...this.selected] } : ai.decide(this.state, HUMAN, req);
        break;
      case 'open':
        action = { kind: 'paso' };
        break;
      case 'respond':
        action = { kind: 'noquiero' };
        break;
      default:
        action = { kind: 'continue' };
    }
    this.resolvePending(action);
  }

  /** Ajusta las animaciones de los relojes al tiempo real restante. */
  private syncTimers() {
    const now = performance.now();
    const tm = this.timer;
    const elapsedOf = (x: TurnTimer) => (this.paused ? x.total - x.remaining : now - x.start);
    const bar = this.root.querySelector<HTMLElement>('.turn-timer i');
    if (bar && tm) {
      bar.style.animationDuration = `${tm.total}ms`;
      bar.style.animationDelay = `${-elapsedOf(tm)}ms`;
    }
    const ring = this.root.querySelector<SVGElement>('.plate .ring circle');
    if (ring) {
      const human = this.state?.turn === HUMAN && tm ? tm : null;
      ring.style.animationDuration = `${human ? human.total : TURN_MS}ms`;
      ring.style.animationDelay = `${-(human ? elapsedOf(human) : now - this.turnStart)}ms`;
    }
  }

  private rerender() {
    if (this.state) this.render(this.state);
  }

  private set(region: string, html: string) {
    if (this.last.get(region) === html) return;
    this.last.set(region, html);
    this.regions.get(region)!.innerHTML = html;
  }

  render(state: State) {
    this.state = state;
    if (state.handNo !== this.handNo) {
      this.handNo = state.handNo;
      this.seen.clear();
    }
    if (state.reveal && !this.revealAt) this.revealAt = performance.now();
    if (!state.reveal) this.revealAt = 0;
    const key = `${state.turn}|${state.phase}|${state.lance}|${state.bet?.amount}|${state.bet?.team}|${this.pending?.req.type ?? ''}`;
    if (key !== this.turnKey) {
      this.turnKey = key;
      this.turnStart = performance.now();
    }
    const app = this.root.querySelector('.app')!;
    app.classList.toggle('playing', state.phase !== 'intro');
    app.classList.toggle('reveal', state.reveal);

    const prev = this.deckFx.snapshot(this.root);
    this.set('score', this.renderScore(state));
    this.set('lances', this.renderLances(state));
    for (let seat = 0; seat < 4; seat++) this.set(`seat${seat}`, this.renderSeat(state, seat));
    this.set('center', this.renderCenter(state));
    this.set('controls', this.renderControls(state));
    this.set('overlay', this.renderOverlay(state));

    this.deckFx.afterRender(state, prev, this.root);
    this.syncTimers();
    this.stones.visible = state.phase !== 'intro';
    if (state.phase !== 'intro') this.stones.setScores(state.scores);
  }

  private renderScore(s: State) {
    if (s.phase === 'intro') return '';
    const pct = (t: 0 | 1) => Math.min(100, (s.scores[t] / WIN_POINTS) * 100);
    const gain = (t: 0 | 1) => (s.lastGain[t] ? `<em class="sb-gain">+${s.lastGain[t]}</em>` : '');
    const games = (t: 0 | 1) =>
      `<span class="sb-juegos" title="Juegos ganados: ${s.games[t]} de ${JUEGOS_TO_WIN}">${Array.from({ length: JUEGOS_TO_WIN }, (_, i) => `<i class="${i < s.games[t] ? 'won' : ''}"></i>`).join('')}</span>`;
    const juego = s.games[0] + s.games[1] + (s.phase === 'gameover' ? 0 : 1);
    return `
      <div class="sb-team t0"><span class="sb-name">${TEAM_NAMES[0]}</span>${games(0)}<span class="sb-pts">${s.scores[0]}${gain(0)}</span></div>
      <div class="sb-mid" aria-hidden="true">
        <div class="sb-track"><i class="t0" style="width:${pct(0) / 2}%"></i><i class="t1" style="width:${pct(1) / 2}%"></i></div>
        <span class="sb-goal">Juego ${juego} · a ${WIN_POINTS}</span>
      </div>
      <div class="sb-team t1"><span class="sb-pts">${s.scores[1]}${gain(1)}</span>${games(1)}<span class="sb-name">${TEAM_NAMES[1]}</span></div>`;
  }

  private renderLances(s: State) {
    if (s.phase === 'intro' || s.reveal) return '';
    const current = s.lance === 'punto' ? 'juego' : s.lance;
    const punto = s.lance === 'punto' || s.records.some((r) => r.lance === 'punto');
    return (['grande', 'chica', 'pares', 'juego'] as const)
      .map((l) => {
        const done = s.records.some((r) => r.lance === l || (l === 'juego' && r.lance === 'punto'));
        const label = l === 'juego' && punto ? 'Punto' : LANCE_NAMES[l];
        const st = this.lanceStatus(s, l);
        return `<div class="lance ${current === l ? 'on' : ''} ${done ? 'done' : ''}"><b>${label}</b><small class="st ${st.cls}">${st.text || '&nbsp;'}</small></div>`;
      })
      .join('');
  }

  /** Qué ha pasado en cada lance: en paso, querido, no querido, órdago… */
  private lanceStatus(s: State, l: Lance): { text: string; cls: string } {
    const rec = s.records.find((r) => r.lance === l || (l === 'juego' && r.lance === 'punto'));
    const short = (t: number) => (t === 0 ? 'Nos.' : 'Ellos');
    if (rec) {
      switch (rec.status) {
        case 'paso':
          return { text: 'En paso', cls: 'muted' };
        case 'querido':
          return { text: `${rec.amount} querido${rec.amount === 1 ? '' : 's'}`, cls: 'gold' };
        case 'noquerido':
          return { text: `No quiero · +${rec.amount} ${short(rec.betTeam!)}`, cls: `t${rec.betTeam}` };
        case 'sinjugada': {
          const team = teamOf(rec.participants[0]);
          return { text: `Solo ${team === 0 ? 'nosotros' : 'ellos'}`, cls: `t${team}` };
        }
        case 'nadie':
          return { text: 'Nadie', cls: 'muted' };
        case 'ordago':
          return { text: 'Órdago querido', cls: 'red' };
      }
    }
    const current = s.lance === 'punto' ? 'juego' : s.lance;
    if (current === l && s.phase === 'lance') {
      if (s.bet?.ordago) return { text: `Órdago · ${short(s.bet.team)}`, cls: 'red' };
      if (s.bet) return { text: `Envite ${s.bet.amount} · ${short(s.bet.team)}`, cls: `t${s.bet.team}` };
      return { text: 'Hablando…', cls: 'muted' };
    }
    return { text: '', cls: '' };
  }

  private cardHtml(s: State, seat: number, card: Card, faceUp: boolean, i: number) {
    const key = `${s.handNo}:${seat}:${card.id}`;
    const now = performance.now();
    let t = this.seen.get(key);
    if (t === undefined) {
      t = now;
      this.seen.set(key, now);
    }
    const age = now - t;
    const classes: string[] = [];
    let style = `--i:${i}`;
    if (age < DEAL_MS) {
      // La animación de reparto (desde el mazo) la hace DeckFx
    } else if (faceUp && seat !== HUMAN && this.revealAt && now - this.revealAt < FLIP_MS + i * 70) {
      classes.push('flip');
      style += `;animation-delay:${-(now - this.revealAt) + i * 70}ms`;
    }
    if (seat === HUMAN && this.pending?.req.type === 'discard') classes.push('selectable');
    if (seat === HUMAN && this.selected.has(card.id)) classes.push('selected');
    const html = faceUp ? faceHtml(card.id, classes.join(' '), style) : backHtml(classes.join(' '), style);
    const born = age < DEAL_MS ? ` data-born="${Math.round(t)}"` : '';
    return html.replace('<div class="card', `<div data-id="${card.id}"${born} class="card`);
  }

  private renderSeat(s: State, seat: number) {
    if (s.phase === 'intro') return '';
    const faceUp = seat === HUMAN || s.reveal;
    const hand = s.hands[seat].map((c, i) => this.cardHtml(s, seat, c, faceUp, i)).join('');
    const b = s.bubbles[seat];
    const bubble = b ? `<div class="bubble ${b.tone}">${b.text}</div>` : '';
    const isTurn = s.turn === seat && !s.reveal;
    const name = SEAT_NAMES[seat];
    const role = seat === 2 ? 'compañera' : seat === HUMAN ? '' : 'rival';
    const mano = s.mano === seat ? '<span class="mano" title="Es mano">mano</span>' : '';
    const info = (seat === HUMAN || s.reveal) && s.hands[seat].length === 4
      ? `<div class="handinfo">${describePares(s.hands[seat])} · ${describeJuego(s.hands[seat])}</div>` : '';
    return `
      <div class="plate team${teamOf(seat)} ${isTurn ? 'turn' : ''}">
        <span class="avatar">${name[0]}${isTurn ? '<svg class="ring" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="16"/></svg>' : ''}</span><span class="pname">${name}</span>${role ? `<span class="role">${role}</span>` : ''}${mano}
      </div>
      <div class="hand ${seat === HUMAN ? 'mine' : 'mini'}">${hand}</div>
      ${info}
      ${bubble}`;
  }

  private renderCenter(s: State) {
    if (s.phase === 'intro') return '';
    // Si te toca decidir, los botones ya explican el lance y la apuesta
    if (this.pending && this.pending.req.type !== 'continue') return '';
    let bet = '';
    if (s.bet && s.phase === 'lance') {
      bet = s.bet.ordago
        ? `<div class="bet ordago">Órdago <small>${TEAM_NAMES[s.bet.team]}</small></div>`
        : `<div class="bet"><b>${s.bet.amount}</b> <small>envite · ${TEAM_NAMES[s.bet.team]}</small></div>`;
    }
    const msg = s.message ? `<div class="msg">${s.message}</div>` : '';
    return `${msg}${bet}`;
  }

  private renderControls(s: State) {
    const p = this.pending;
    if (!p) {
      if (s.turn !== null && s.turn !== HUMAN && s.phase !== 'showdown' && s.phase !== 'deal') {
        return `<div class="waiting">${SEAT_NAMES[s.turn]} está pensando<span class="dots"><i></i><i></i><i></i></span></div>`;
      }
      return '';
    }
    const btn = (action: string, label: string, cls = '') => `<button class="btn ${cls}" data-action="${action}">${label}</button>`;
    const bar = this.timer ? '<div class="turn-timer" aria-hidden="true"><i></i></div>' : '';
    const stepper = (label: string) => `<div class="stepper">
        <button class="btn step" data-action="dec" aria-label="Menos" ${this.amount <= 2 ? 'disabled' : ''}>−</button>
        ${btn('envido', `${label} <b>${this.amount}</b>`, 'gold')}
        <button class="btn step" data-action="inc" aria-label="Más">+</button>
      </div>`;
    switch (p.req.type) {
      case 'mus':
        return `${bar}<div class="prompt">¿Pides mus?</div><div class="row">${btn('mus', 'Mus', 'primary')}${btn('corto', 'No hay mus')}</div>`;
      case 'discard': {
        const n = this.selected.size;
        return `${bar}<div class="prompt">Toca las cartas que quieres cambiar</div>
          <div class="row"><button class="btn primary" data-action="discard" ${n ? '' : 'disabled'}>Descartar${n ? ` ${n}` : ''}</button></div>`;
      }
      case 'open':
        return `${bar}<div class="prompt"><b>${LANCE_NAMES[p.req.lance]}</b> · te toca hablar</div>
          <div class="row">${btn('paso', 'Paso')}${stepper('Envido')}${btn('ordago', 'Órdago', 'danger')}</div>`;
      case 'respond': {
        const bet = p.req.bet;
        const what = bet.ordago ? '¡órdago!' : `envite de ${bet.amount}`;
        const extra = bet.ordago ? '' : `${stepper('Subo')}${btn('ordago', 'Órdago', 'danger')}`;
        return `${bar}<div class="prompt"><b>${LANCE_NAMES[p.req.lance]}</b> · ${TEAM_NAMES[bet.team]}: ${what}</div>
          <div class="row">${btn('noquiero', 'No quiero')}${btn('quiero', 'Quiero', 'primary')}${extra}</div>`;
      }
      case 'continue':
        // El botón va dentro del panel de recuento / resultado para que no quede tapado
        return '';
    }
  }

  private renderOverlay(s: State) {
    if (s.phase === 'intro') {
      const fan = ['1-oros', '12-copas', '11-espadas', '10-bastos', '1-copas'];
      return `<div class="intro">
        <div class="fan">${fan.map((id, i) => faceHtml(id, '', `--f:${i - 2}`)).join('')}</div>
        <img class="intro-logo" src="${BASE}logo-light.png" alt="musazo" width="1400" height="218">
        <p class="tag">Mus a 8 reyes · al mejor de 3 juegos · tú y Maite contra Iñaki y Koldo</p>
        <button class="btn primary big play" data-action="start">Jugar</button>
        <button class="link-btn" data-action="rules">¿Primera vez? Lee las reglas</button>
      </div>`;
    }
    if (s.phase === 'gameover' && s.winner !== null) {
      const won = s.winner === 0;
      const matchOver = s.matchWinner !== null;
      const n = s.games[0] + s.games[1];
      const kicker = matchOver ? (s.matchWinner === 0 ? 'Partida ganada' : 'Partida perdida') : `Juego ${n} · al mejor de 3`;
      const title = matchOver
        ? s.matchWinner === 0 ? '¡Habéis ganado la partida!' : 'Han ganado la partida'
        : won ? 'Juego para vosotros' : 'Juego para ellos';
      const dots = (t: 0 | 1) =>
        Array.from({ length: JUEGOS_TO_WIN }, (_, i) => `<i class="${i < s.games[t] ? 'won' : ''}"></i>`).join('');
      return `<div class="panel end ${won ? 'won' : 'lost'}">
        <span class="kicker">${kicker}</span>
        <h2>${title}</h2>
        <p class="final"><span class="t0">${s.scores[0]}</span><i>–</i><span class="t1">${s.scores[1]}</span></p>
        ${this.summaryHtml(s)}
        <div class="series">
          <span class="sb-juegos t0">${dots(0)}</span>
          <span>Juegos · Nosotros ${s.games[0]} — ${s.games[1]} Ellos</span>
          <span class="sb-juegos t1">${dots(1)}</span>
        </div>
        ${this.continueHtml()}
      </div>`;
    }
    if (s.phase === 'showdown' && s.summary.length) {
      return `<div class="panel"><span class="kicker">Recuento</span>${this.summaryHtml(s)}${this.continueHtml()}</div>`;
    }
    return '';
  }

  /** Botón para seguir (siguiente mano / juego / partida), con su barra de tiempo. */
  private continueHtml() {
    const p = this.pending;
    if (p?.req.type !== 'continue') return '';
    const bar = this.timer ? '<div class="turn-timer" aria-hidden="true"><i></i></div>' : '';
    return `<div class="panel-actions">${bar}<button class="btn primary big" data-action="continue">${p.req.label}</button></div>`;
  }

  private summaryHtml(s: State) {
    if (!s.summary.length) return '';
    return `<table class="summary">${s.summary
      .map((l) => `<tr class="${l.team === null ? '' : `t${l.team}`}">
          <th>${l.label}</th>
          <td class="who">${l.team === null ? '—' : TEAM_NAMES[l.team]}</td>
          <td class="pts">${l.points ? `+${l.points}` : ''}</td>
          <td class="det">${l.detail}</td></tr>`)
      .join('')}</table>`;
  }
}
