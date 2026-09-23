import type { Card } from '../game/cards';
import { LANCE_NAMES, describeJuego, describePares } from '../game/evaluate';
import {
  type Action, type Request, type State, HUMAN, SEAT_NAMES, TEAM_NAMES, WIN_POINTS, teamOf,
} from '../game/engine';
import { backHtml, faceHtml } from './cards';
import { isMuted, toggleMute } from './sound';

const BASE = import.meta.env.BASE_URL;
const DEAL_MS = 460;
const FLIP_MS = 700;

const ICON = {
  book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>',
  muted: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>',
};

const LAYOUT = `
<div class="app">
  <header class="topbar">
    <img class="brand" src="${BASE}logo-light.png" alt="musazo" width="1400" height="218">
    <div class="scoreboard" data-region="score"></div>
    <div class="top-actions">
      <button class="pill-btn" data-action="rules" aria-label="Reglas del mus">${ICON.book}<span>Reglas</span></button>
      <button class="icon-btn" data-action="mute" aria-label="Sonido"></button>
    </div>
  </header>
  <main class="stage">
    <div class="mat">
      <div class="print" aria-hidden="true"><img src="${BASE}logo-light.png" alt=""></div>
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
</div>`;

interface Pending {
  req: Request;
  resolve: (a: Action) => void;
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
  onStart: (() => void) | null = null;
  onRules: (() => void) | null = null;

  constructor(private root: HTMLElement) {
    root.innerHTML = LAYOUT;
    root.querySelectorAll<HTMLElement>('[data-region]').forEach((el) => this.regions.set(el.dataset.region!, el));
    root.addEventListener('click', (e) => this.onClick(e));
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
    const { resolve } = this.pending;
    this.pending = null;
    this.selected.clear();
    resolve(action);
    this.rerender();
  }

  ask(req: Request, state: State): Promise<Action> {
    return new Promise((resolve) => {
      this.pending = { req, resolve };
      this.amount = 2;
      this.selected.clear();
      this.render(state);
    });
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
    const app = this.root.querySelector('.app')!;
    app.classList.toggle('playing', state.phase !== 'intro');
    app.classList.toggle('reveal', state.reveal);

    this.set('score', this.renderScore(state));
    this.set('lances', this.renderLances(state));
    for (let seat = 0; seat < 4; seat++) this.set(`seat${seat}`, this.renderSeat(state, seat));
    this.set('center', this.renderCenter(state));
    this.set('controls', this.renderControls(state));
    this.set('overlay', this.renderOverlay(state));
  }

  private renderScore(s: State) {
    if (s.phase === 'intro') return '';
    const pct = (t: 0 | 1) => Math.min(100, (s.scores[t] / WIN_POINTS) * 100);
    const gain = (t: 0 | 1) => (s.lastGain[t] ? `<em class="sb-gain">+${s.lastGain[t]}</em>` : '');
    const games = (t: 0 | 1) => (s.games[t] ? `<span class="sb-games" title="Partidas ganadas">${s.games[t]}</span>` : '');
    return `
      <div class="sb-team t0"><span class="sb-name">${TEAM_NAMES[0]}${games(0)}</span><span class="sb-pts">${s.scores[0]}${gain(0)}</span></div>
      <div class="sb-mid" aria-hidden="true">
        <div class="sb-track"><i class="t0" style="width:${pct(0) / 2}%"></i><i class="t1" style="width:${pct(1) / 2}%"></i></div>
        <span class="sb-goal">a ${WIN_POINTS}</span>
      </div>
      <div class="sb-team t1"><span class="sb-pts">${s.scores[1]}${gain(1)}</span><span class="sb-name">${TEAM_NAMES[1]}${games(1)}</span></div>`;
  }

  private renderLances(s: State) {
    if (s.phase === 'intro' || s.reveal) return '';
    const current = s.lance === 'punto' ? 'juego' : s.lance;
    const punto = s.lance === 'punto' || s.records.some((r) => r.lance === 'punto');
    return (['grande', 'chica', 'pares', 'juego'] as const)
      .map((l) => {
        const done = s.records.some((r) => r.lance === l || (l === 'juego' && r.lance === 'punto'));
        const label = l === 'juego' && punto ? 'Punto' : LANCE_NAMES[l];
        return `<span class="lance ${current === l ? 'on' : ''} ${done ? 'done' : ''}">${label}</span>`;
      })
      .join('');
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
      classes.push('dealt');
      style += `;animation-delay:${-age}ms`;
    } else if (faceUp && seat !== HUMAN && this.revealAt && now - this.revealAt < FLIP_MS + i * 70) {
      classes.push('flip');
      style += `;animation-delay:${-(now - this.revealAt) + i * 70}ms`;
    }
    if (seat === HUMAN && this.pending?.req.type === 'discard') classes.push('selectable');
    if (seat === HUMAN && this.selected.has(card.id)) classes.push('selected');
    const html = faceUp ? faceHtml(card.id, classes.join(' '), style) : backHtml(classes.join(' '), style);
    return html.replace('<div class="card', `<div data-id="${card.id}" class="card`);
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
        <span class="avatar">${name[0]}</span><span class="pname">${name}</span>${role ? `<span class="role">${role}</span>` : ''}${mano}
      </div>
      <div class="hand ${seat === HUMAN ? 'mine' : 'mini'}">${hand}</div>
      ${info}
      ${bubble}`;
  }

  private renderCenter(s: State) {
    if (s.phase === 'intro') return '';
    const pile = Math.min(6, Math.ceil(s.deck.length / 6));
    const deck = s.deck.length && !s.reveal
      ? `<div class="deck">${Array.from({ length: pile }, (_, i) => backHtml('', `--k:${i}`)).join('')}</div>`
      : '';
    // Si te toca decidir, los botones ya explican el lance y la apuesta
    if (this.pending && this.pending.req.type !== 'continue') return deck;
    let bet = '';
    if (s.bet && s.phase === 'lance') {
      bet = s.bet.ordago
        ? `<div class="bet ordago">Órdago <small>${TEAM_NAMES[s.bet.team]}</small></div>`
        : `<div class="bet"><b>${s.bet.amount}</b> <small>envite · ${TEAM_NAMES[s.bet.team]}</small></div>`;
    }
    const msg = s.message ? `<div class="msg">${s.message}</div>` : '';
    return `${deck}${msg}${bet}`;
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
    const stepper = (label: string) => `<div class="stepper">
        <button class="btn step" data-action="dec" aria-label="Menos" ${this.amount <= 2 ? 'disabled' : ''}>−</button>
        ${btn('envido', `${label} <b>${this.amount}</b>`, 'gold')}
        <button class="btn step" data-action="inc" aria-label="Más">+</button>
      </div>`;
    switch (p.req.type) {
      case 'mus':
        return `<div class="prompt">¿Pides mus?</div><div class="row">${btn('mus', 'Mus', 'primary')}${btn('corto', 'No hay mus')}</div>`;
      case 'discard': {
        const n = this.selected.size;
        return `<div class="prompt">Toca las cartas que quieres cambiar</div>
          <div class="row"><button class="btn primary" data-action="discard" ${n ? '' : 'disabled'}>Descartar${n ? ` ${n}` : ''}</button></div>`;
      }
      case 'open':
        return `<div class="prompt"><b>${LANCE_NAMES[p.req.lance]}</b> · te toca hablar</div>
          <div class="row">${btn('paso', 'Paso')}${stepper('Envido')}${btn('ordago', 'Órdago', 'danger')}</div>`;
      case 'respond': {
        const bet = p.req.bet;
        const what = bet.ordago ? '¡órdago!' : `envite de ${bet.amount}`;
        const extra = bet.ordago ? '' : `${stepper('Subo')}${btn('ordago', 'Órdago', 'danger')}`;
        return `<div class="prompt"><b>${LANCE_NAMES[p.req.lance]}</b> · ${TEAM_NAMES[bet.team]}: ${what}</div>
          <div class="row">${btn('noquiero', 'No quiero')}${btn('quiero', 'Quiero', 'primary')}${extra}</div>`;
      }
      case 'continue':
        return `<div class="row">${btn('continue', p.req.label, 'primary big')}</div>`;
    }
  }

  private renderOverlay(s: State) {
    if (s.phase === 'intro') {
      const fan = ['1-oros', '12-copas', '11-espadas', '10-bastos', '1-copas'];
      return `<div class="intro">
        <div class="fan">${fan.map((id, i) => faceHtml(id, '', `--f:${i - 2}`)).join('')}</div>
        <img class="intro-logo" src="${BASE}logo-light.png" alt="musazo" width="1400" height="218">
        <p class="tag">Mus a 8 reyes · tú y Maite contra Iñaki y Koldo</p>
        <button class="btn primary big play" data-action="start">Jugar</button>
        <button class="link-btn" data-action="rules">¿Primera vez? Lee las reglas</button>
      </div>`;
    }
    if (s.phase === 'gameover' && s.winner !== null) {
      const won = s.winner === 0;
      return `<div class="panel end ${won ? 'won' : 'lost'}">
        <span class="kicker">${won ? 'Victoria' : 'Derrota'}</span>
        <h2>${won ? '¡Habéis ganado!' : 'Han ganado ellos'}</h2>
        <p class="final"><span class="t0">${s.scores[0]}</span><i>–</i><span class="t1">${s.scores[1]}</span></p>
        ${this.summaryHtml(s)}
        <p class="series">Partidas · Nosotros ${s.games[0]} — ${s.games[1]} Ellos</p>
      </div>`;
    }
    if (s.phase === 'showdown' && s.summary.length) {
      return `<div class="panel"><span class="kicker">Recuento</span>${this.summaryHtml(s)}</div>`;
    }
    return '';
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
