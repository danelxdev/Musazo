import './counter.css';
import { isMuted, play, toggleMute, unlockAudio } from '../ui/sound';
import * as S from './state';
import type { Lance, Tally, Team } from './state';
import { bindHold } from './hold';
import { confetti, flyStones, replay, ripple, rollNumber, toast, vibrate } from './fx';

/**
 * Contador de tantos para jugar con cartas de verdad (en la calle, en el bar…)
 * cuando no hay piedras ni amarracos a mano. Se guarda en el navegador, así que
 * sobrevive a recargar la página o a bloquear el móvil.
 */

const KEY = 'musazo:contador';
const HASH = '#contador';
const UNDO_MAX = 40;
/** Pasos de deshacer que se guardan en el navegador (el resto solo vive en memoria). */
const UNDO_SAVED = 15;
const HOLD_MS = 1300;
const LOGO = `${import.meta.env.BASE_URL}logo-light.png`;
const TEAM_COLOR = ['#f2c14e', '#8db2ec'];

const ICON = {
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  gear: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
  book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7v14M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4zM13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  restart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V11M12 20V4M19 20v-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>',
  muted: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>',
  expand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  shrink: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5L8 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 2L5 13.5h6L10 22l9-12h-6.2z" fill="currentColor"/></svg>',
};

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function fmtDur(ms: number) {
  const min = Math.round(ms / 60000);
  if (min < 1) return '< 1 min';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

const fmtTime = (at: number) => new Date(at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

function load(): { tally: Tally; undo: Tally[] } {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (S.isTally(data?.tally)) {
      return { tally: { ...S.fresh(), ...data.tally }, undo: Array.isArray(data.undo) ? data.undo.filter(S.isTally) : [] };
    }
  } catch {
    // Sin almacenamiento (modo privado, etc.): se empieza de cero
  }
  return { tally: S.fresh(), undo: [] };
}

interface TeamRefs {
  root: HTMLElement;
  name: HTMLElement;
  games: HTMLElement;
  hot: HTMLElement;
  pts: HTMLElement;
  num: HTMLElement;
  goal: HTMLElement;
  am: HTMLElement;
  pi: HTMLElement;
  bar: HTMLElement;
  ordago: HTMLButtonElement;
}

export class CounterView {
  private el: HTMLElement;
  private board: HTMLElement;
  private teams: TeamRefs[];
  private lances = new Map<Lance, HTMLElement>();
  private resultEl: HTMLElement;
  private toasts: HTMLElement;
  private tally: Tally;
  private undo: Tally[];
  /** Lo último que se pintó, para animar solo lo que cambia. */
  private drawn: { pts: [number, number]; pieces: [number, number][]; result: string } = {
    pts: [0, 0],
    pieces: [[0, 0], [0, 0]],
    result: '',
  };
  /** Mientras las piedras vuelan, el marcador de esa pareja espera a que aterricen. */
  private inFlight: Team | null = null;
  private resultDelay = 0;
  private pushed = false;
  private lastFocus: HTMLElement | null = null;
  private wake: WakeLockSentinel | null = null;
  onToggle: ((open: boolean) => void) | null = null;
  /** Abre las reglas (van por encima del contador). */
  onRules: (() => void) | null = null;
  /** Mientras devuelva true (p. ej. con las reglas abiertas) el contador no atiende al teclado. */
  blocked: () => boolean = () => false;

  constructor(host: HTMLElement) {
    ({ tally: this.tally, undo: this.undo } = load());
    this.el = document.createElement('section');
    this.el.className = 'counter';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-modal', 'true');
    this.el.setAttribute('aria-label', 'Contador de tantos');
    this.el.tabIndex = -1;
    this.el.hidden = true;
    this.el.innerHTML = this.skeleton();
    host.appendChild(this.el);

    this.board = this.el.querySelector('.cx-board')!;
    this.resultEl = this.el.querySelector('.cx-result')!;
    this.toasts = this.el.querySelector('.cx-toasts')!;
    this.teams = ([0, 1] as const).map((t) => {
      const root = this.el.querySelector<HTMLElement>(`.cx-team.t${t}`)!;
      const q = (sel: string) => root.querySelector<HTMLElement>(sel)!;
      return {
        root, name: q('.cx-name'), games: q('.cx-games'), hot: q('.cx-hot'), pts: q('.cx-pts'), num: q('.cx-num'),
        goal: q('.cx-goal'), am: q('.cx-amarracos'), pi: q('.cx-piedras'), bar: q('.cx-track i'),
        ordago: q('.cx-ordago') as HTMLButtonElement,
      };
    });
    this.el.querySelectorAll<HTMLElement>('.cx-lance').forEach((row) => this.lances.set(row.dataset.lance as Lance, row));
    this.teams.forEach((refs, t) => this.bindOrdago(refs.ordago, t as Team));

    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('pointerdown', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('.cx-btn, .cx-step, .cx-send, .cx-lance-val, .cx-pts');
      if (b && !(b as HTMLButtonElement).disabled) ripple(b, e);
    });
    // Nombres de las parejas: se editan en su sitio
    this.teams.forEach(({ name }, t) => {
      const input = name as HTMLInputElement;
      input.addEventListener('focus', () => input.select());
      input.addEventListener('input', () => (input.size = Math.max(4, input.value.length + 1)));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') {
          e.stopPropagation();
          input.value = this.tally.names[t];
          input.blur();
        }
      });
      input.addEventListener('change', () => this.commit(S.rename(this.tally, t as Team, input.value)));
      input.addEventListener('blur', () => (input.value = this.tally.names[t]));
    });
    this.el.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveSettings();
    });
    document.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('popstate', () => {
      if (location.hash === HASH) this.show();
      else {
        this.pushed = false;
        this.hide();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.isOpen) void this.keepAwake();
    });
    document.addEventListener('fullscreenchange', () => this.renderTools());
  }

  private skeleton() {
    const team = (t: Team) => `
      <article class="cx-team t${t}" aria-label="Pareja ${t + 1}">
        <div class="cx-top">
          <label class="cx-name-wrap" title="Toca para cambiar el nombre">
            <input class="cx-name" data-team="${t}" maxlength="18" autocomplete="off" spellcheck="false" enterkeyhint="done" aria-label="Nombre de la pareja ${t + 1}">
            ${ICON.pencil}
          </label>
          <span class="cx-games sb-juegos"></span>
          <span class="cx-hot" aria-live="polite"></span>
          <button class="cx-ordago" data-team="${t}" aria-label="Órdago: mantén pulsado para dar el juego a esta pareja">
            <span class="cx-ordago-fill" aria-hidden="true"></span>
            ${ICON.bolt}<span class="cx-ordago-txt">Órdago</span>
          </button>
        </div>
        <div class="cx-score">
          <button class="cx-pts" data-c="add" data-team="${t}" data-n="1" aria-label="Sumar 1" title="Toca para sumar 1"><span class="cx-num" aria-live="polite">0</span><small class="cx-goal"></small></button>
          <div class="cx-tray" role="img">
            <div class="cx-amarracos"></div>
            <div class="cx-piedras"></div>
          </div>
        </div>
        <div class="cx-track" aria-hidden="true"><i></i></div>
        <div class="cx-pad">
          <button class="cx-btn minus" data-c="sub" data-team="${t}" aria-label="Quitar un tanto">−1</button>
          ${[1, 2, 5].map((n) => `<button class="cx-btn" data-c="add" data-team="${t}" data-n="${n}" aria-label="Sumar ${n}">+${n}</button>`).join('')}
        </div>
      </article>`;
    const lance = (l: Lance) => `
      <div class="cx-lance" data-lance="${l}">
        <button class="cx-send to0" data-c="send" data-team="0" data-lance="${l}">${ICON.arrow}</button>
        <span class="cx-lance-name">${S.LANCE_LABEL[l]}${l === 'juego' ? '<small>o punto</small>' : ''}</span>
        <button class="cx-lance-val" data-c="bump" data-lance="${l}" data-n="2" aria-label="${S.LANCE_LABEL[l]}: sumar 2" title="Toca para sumar 2">
          <span class="cx-lance-num">0</span><sup aria-hidden="true">+2</sup>
        </button>
        <div class="cx-steps">
          <button class="cx-step minus" data-c="bump" data-lance="${l}" data-n="-1" aria-label="${S.LANCE_LABEL[l]}: quitar 1">−1</button>
          ${[1, 5].map((n) => `<button class="cx-step" data-c="bump" data-lance="${l}" data-n="${n}" aria-label="${S.LANCE_LABEL[l]}: sumar ${n}">+${n}</button>`).join('')}
        </div>
        <button class="cx-send to1" data-c="send" data-team="1" data-lance="${l}">${ICON.arrow}</button>
      </div>`;
    return `
      <header class="cx-head">
        <img src="${LOGO}" alt="musazo" class="cx-logo" width="1400" height="218">
        <span class="cx-title">Contador</span>
        <div class="cx-tools"></div>
      </header>
      <div class="mat cx-board">
        ${team(0)}
        <section class="cx-mano" aria-label="Lances de la mano">
          <div class="cx-mano-head">
            <span class="cx-kicker">Lances de la mano</span>
            <b class="cx-hand"></b>
          </div>
          ${S.LANCES.map(lance).join('')}
          <button class="cx-nexthand" data-c="hand">${ICON.next}<span>Mano terminada</span></button>
        </section>
        ${team(1)}
      </div>
      <footer class="cx-foot">
        <button class="pill-btn" data-c="undo" aria-label="Deshacer">${ICON.undo}<span>Deshacer</span></button>
        <div class="cx-status"><b></b><span aria-live="polite"></span></div>
        <button class="pill-btn" data-c="reset" aria-label="Empezar de cero">${ICON.restart}<span>De cero</span></button>
      </footer>
      <div class="cx-slam" aria-hidden="true"></div>
      <div class="cx-result" hidden></div>
      <div class="cx-toasts"></div>
      <div class="confirm cx-dialog" data-dialog="settings" hidden></div>
      <div class="cx-sheet cx-dialog" data-dialog="stats" hidden></div>`;
  }

  get isOpen() {
    return !this.el.hidden;
  }

  // ---------- Abrir y cerrar ----------

  /** Abre el contador y deja la dirección en /#contador (el botón «atrás» del móvil lo cierra). */
  open() {
    if (location.hash !== HASH) {
      history.pushState(null, '', HASH);
      this.pushed = true;
    }
    this.show();
  }

  close() {
    if (this.pushed) {
      this.pushed = false;
      history.back();
    } else {
      history.replaceState(null, '', location.pathname + location.search);
      this.hide();
    }
  }

  private show() {
    if (this.isOpen) return;
    unlockAudio();
    this.lastFocus = document.activeElement as HTMLElement;
    this.drawn = { pts: [...this.tally.points], pieces: [[-1, -1], [-1, -1]], result: this.resultKey() };
    this.teams.forEach((r, t) => {
      r.num.textContent = String(this.tally.points[t]);
      r.num.dataset.value = String(this.tally.points[t]);
    });
    this.sync();
    this.renderTools();
    this.el.hidden = false;
    requestAnimationFrame(() => this.el.classList.add('open'));
    this.el.focus();
    void this.keepAwake();
    this.onToggle?.(true);
  }

  private hide() {
    if (!this.isOpen) return;
    this.closeDialog();
    this.el.classList.remove('open');
    this.el.hidden = true;
    void this.wake?.release().catch(() => undefined);
    this.wake = null;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    this.lastFocus?.focus();
    this.onToggle?.(false);
  }

  /** Que no se apague la pantalla mientras se juega. */
  private async keepAwake() {
    if (!('wakeLock' in navigator) || (this.wake && !this.wake.released)) return;
    try {
      this.wake = await navigator.wakeLock.request('screen');
    } catch {
      this.wake = null;
    }
  }

  // ---------- Entrada ----------

  private onKey(e: KeyboardEvent) {
    if (!this.isOpen || this.blocked()) return;
    if (e.key === 'Escape') {
      if (this.openDialog) this.closeDialog();
      else this.close();
      return;
    }
    const typing = (e.target as HTMLElement).closest('input, textarea');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing && !this.openDialog) {
      e.preventDefault();
      this.back();
    }
  }

  private onClick(e: Event) {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-c]');
    if (!btn || (btn as HTMLButtonElement).disabled) return;
    const team = Number(btn.dataset.team) as Team;
    const lance = btn.dataset.lance as Lance;
    const n = Number(btn.dataset.n);
    switch (btn.dataset.c) {
      case 'close': this.close(); break;
      case 'add': this.add(team, n); break;
      case 'sub':
        this.tap();
        play('stone');
        this.commit(S.subPoint(this.tally, team));
        break;
      case 'bump':
        if (n < 0 && !this.tally.pending[lance]) break;
        this.tap();
        play(n < 0 ? 'stone' : 'call');
        this.commit(S.bumpLance(this.tally, lance, n));
        replay(this.lances.get(lance)!.querySelector('.cx-lance-num')!, 'pop');
        break;
      case 'send': this.send(lance, team); break;
      case 'hand': this.nextHand(); break;
      case 'undo': this.back(); break;
      case 'next':
        this.commit(S.nextGame(this.tally));
        play('shuffle');
        break;
      case 'reset': this.reset(); break;
      case 'settings': this.openSettings(); break;
      case 'stats': this.openStats(); break;
      case 'rules': this.onRules?.(); break;
      case 'sound':
        toggleMute();
        this.renderTools();
        break;
      case 'fullscreen': this.toggleFullscreen(); break;
      case 'seg':
        btn.parentElement!.querySelectorAll('[data-c="seg"]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
        break;
      case 'switch': btn.setAttribute('aria-checked', String(btn.getAttribute('aria-checked') !== 'true')); break;
      case 'clear-partidas': {
        const t = S.clone(this.tally);
        t.partidas = [0, 0];
        this.commit(t);
        this.openStats();
        break;
      }
      case 'dismiss': this.closeDialog(); break;
    }
  }

  private tap() {
    vibrate(8, this.tally.haptics);
  }

  private add(team: Team, n: number) {
    const before = this.tally.points[team];
    const next = S.addPoints(this.tally, team, n, 'directo');
    this.tap();
    if (!next.result) play(Math.floor(before / 5) !== Math.floor(next.points[team] / 5) ? 'chip' : 'stone');
    this.commit(next);
  }

  /** Los tantos de un lance vuelan hasta el marcador de la pareja que se los lleva. */
  private send(lance: Lance, team: Team) {
    const n = this.tally.pending[lance];
    if (!n) return;
    const from = this.lances.get(lance)!.querySelector('.cx-lance-num')!;
    const to = this.teams[team].num;
    vibrate([10, 30, 10], this.tally.haptics);
    this.inFlight = team;
    this.commit(S.sendLance(this.tally, lance, team));
    void flyStones(this.el, from, to, n, () => play('stone')).then(() => {
      this.inFlight = null;
      this.sync();
    });
  }

  private nextHand() {
    const lost = S.pendingTotal(this.tally);
    this.tap();
    play('shuffle');
    this.commit(S.nextHand(this.tally));
    replay(this.el.querySelector('.cx-mano')!, 'swap');
    if (lost) toast(this.toasts, `Se quitaron ${lost} tanto${lost === 1 ? '' : 's'} sin asignar`, { label: 'Deshacer', run: () => this.back() });
  }

  private reset() {
    this.commit(S.fresh(this.tally));
    play('shuffle');
    toast(this.toasts, 'Marcador a cero', { label: 'Deshacer', run: () => this.back() });
  }

  private bindOrdago(btn: HTMLButtonElement, team: Team) {
    bindHold(btn, {
      ms: HOLD_MS,
      onStart: () => {
        vibrate(20, this.tally.haptics);
        play('tick');
        this.el.classList.add('tense');
      },
      onCancel: (p) => {
        this.el.classList.remove('tense');
        if (p < 0.85) toast(this.toasts, 'Mantén pulsado para dar el órdago');
      },
      onDone: () => {
        this.el.classList.remove('tense');
        this.toasts.replaceChildren();
        this.ordago(team);
      },
    });
  }

  private ordago(team: Team) {
    vibrate([40, 60, 220], this.tally.haptics);
    play('ordago');
    const slam = this.el.querySelector<HTMLElement>('.cx-slam')!;
    slam.innerHTML = `<div class="cx-slam-in t${team}"><b>¡Órdago!</b><span>${escape(this.tally.names[team])}</span></div>`;
    replay(slam, 'on');
    replay(this.board, 'quake');
    this.resultDelay = 1250;
    this.commit(S.ordago(this.tally, team));
  }

  /** Guarda el estado anterior para poder deshacer y aplica el nuevo. */
  private commit(next: Tally) {
    if (JSON.stringify(next) === JSON.stringify(this.tally)) return;
    this.undo.push(this.tally);
    if (this.undo.length > UNDO_MAX) this.undo.shift();
    this.tally = next;
    this.persist();
    this.sync();
  }

  private back() {
    const prev = this.undo.pop();
    if (!prev) return;
    this.inFlight = null;
    this.resultDelay = 0;
    this.tally = prev;
    this.persist();
    this.sync();
    this.tap();
    toast(this.toasts, 'Deshecho');
  }

  private persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ tally: this.tally, undo: this.undo.slice(-UNDO_SAVED) }));
    } catch {
      // Sin almacenamiento: el contador funciona igual, solo que no se guarda
    }
  }

  /** Pantalla completa. En Android, además, se bloquea en horizontal si así está configurado. */
  private toggleFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    void this.el
      .requestFullscreen?.({ navigationUI: 'hide' })
      .then(() => {
        const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
        if (this.tally.landscape && matchMedia('(pointer: coarse)').matches) return orientation.lock?.('landscape');
      })
      .catch(() => undefined);
  }

  // ---------- Pintado ----------

  private pieces(team: Team): [number, number] {
    const p = this.tally.points[team];
    return [Math.floor(p / 5), p % 5];
  }

  private resultKey() {
    const r = this.tally.result;
    return r ? `${this.tally.juegos.length}:${r.team}:${r.score.join('-')}` : '';
  }

  private renderTools() {
    const fs = document.fullscreenEnabled
      ? `<button class="icon-btn cx-fs" data-c="fullscreen" aria-label="Pantalla completa" title="Pantalla completa">${document.fullscreenElement ? ICON.shrink : ICON.expand}</button>`
      : '';
    this.el.querySelector('.cx-tools')!.innerHTML = `
      <button class="icon-btn" data-c="sound" aria-label="Sonido" title="Sonido" aria-pressed="${!isMuted()}">${isMuted() ? ICON.muted : ICON.sound}</button>
      <button class="icon-btn" data-c="rules" aria-label="Reglas del mus" title="Reglas">${ICON.book}</button>
      <button class="icon-btn" data-c="stats" aria-label="Estadísticas" title="Estadísticas">${ICON.chart}</button>
      ${fs}
      <button class="icon-btn" data-c="settings" aria-label="Ajustes" title="Ajustes">${ICON.gear}</button>
      <button class="icon-btn" data-c="close" aria-label="Cerrar contador">${ICON.close}</button>`;
  }

  private dots(team: Team) {
    const t = this.tally;
    return Array.from({ length: t.toWin }, (_, i) => `<i class="${i < t.games[team] ? 'won' : ''}"></i>`).join('');
  }

  private sync() {
    const t = this.tally;
    const locked = !!t.result;
    this.el.classList.toggle('can-rotate', t.landscape);
    for (const team of [0, 1] as const) this.syncTeam(team, locked);

    // Lances de la mano
    for (const [l, row] of this.lances) {
      const v = t.pending[l];
      rollNumber(row.querySelector<HTMLElement>('.cx-lance-num')!, v);
      row.classList.toggle('armed', v > 0);
      row.querySelectorAll<HTMLButtonElement>('.cx-send').forEach((b) => {
        b.disabled = !v || locked;
        const who = t.names[Number(b.dataset.team)];
        b.setAttribute('aria-label', `${S.LANCE_LABEL[l]}: ${v} para ${who}`);
        b.title = `Para ${who}`;
      });
      row.querySelectorAll<HTMLButtonElement>('.cx-step, .cx-lance-val').forEach((b) => (b.disabled = locked));
      row.querySelector<HTMLButtonElement>('.cx-step.minus')!.disabled = locked || !v;
    }
    this.el.querySelector('.cx-hand')!.textContent = `Mano ${t.hand}`;
    const pend = S.pendingTotal(t);
    const nh = this.el.querySelector<HTMLButtonElement>('.cx-nexthand')!;
    nh.disabled = locked;
    nh.classList.toggle('warn', pend > 0);
    nh.querySelector('span')!.textContent = pend ? `Mano terminada · ${pend} sin asignar` : 'Mano terminada';

    // Pie
    this.el.querySelector<HTMLButtonElement>('[data-c="undo"]')!.disabled = !this.undo.length;
    this.el.querySelector('.cx-status b')!.textContent = `Juego ${S.juegoNo(t)} · a ${t.target} · ${S.BEST_OF[t.toWin]?.toLowerCase() ?? ''}`;
    this.el.querySelector('.cx-status span')!.textContent = t.last || 'Apunta los lances y mándalos a quien gane';

    this.renderResult();
  }

  private syncTeam(team: Team, locked: boolean) {
    const t = this.tally;
    const r = this.teams[team];
    const input = r.name as HTMLInputElement;
    if (document.activeElement !== input) {
      input.value = t.names[team];
      input.size = Math.max(4, t.names[team].length + 1);
    }
    r.games.innerHTML = this.dots(team);
    r.games.title = `Juegos: ${t.games[team]} de ${t.toWin}`;
    r.goal.textContent = `/ ${t.target}`;
    r.ordago.disabled = locked;
    r.root.querySelectorAll<HTMLButtonElement>('.cx-btn, .cx-pts').forEach((b) => (b.disabled = locked));
    if (this.inFlight === team) return;

    const pts = t.points[team];
    const prev = this.drawn.pts[team];
    r.root.querySelector<HTMLButtonElement>('.cx-btn.minus')!.disabled = locked || pts === 0;
    const left = t.target - pts;
    const hot = !locked && pts > 0 && left <= 5;
    r.root.classList.toggle('hot', hot);
    r.root.classList.toggle('leading', pts > t.points[1 - team] && pts > 0);
    r.hot.textContent = hot ? `A falta de ${left}` : '';
    r.bar.style.width = `${(pts / t.target) * 100}%`;
    if (pts !== prev) {
      rollNumber(r.num, pts);
      if (pts > prev) replay(r.pts, 'bump');
      const g = document.createElement('em');
      g.className = `cx-gain${pts < prev ? ' neg' : ''}`;
      g.textContent = `${pts > prev ? '+' : '−'}${Math.abs(pts - prev)}`;
      g.addEventListener('animationend', () => g.remove(), { once: true });
      r.pts.querySelector('.cx-gain')?.remove();
      r.pts.appendChild(g);
    }

    // Piedras y amarracos: cada cinco piedras, un amarraco
    const [am, pi] = this.pieces(team);
    const [oldAm, oldPi] = this.drawn.pieces[team];
    if (am !== oldAm || pi !== oldPi) {
      const grew = pts > prev;
      const newAm = (i: number) => (grew && i >= oldAm ? ' new' : '');
      const newPi = (i: number) => (grew && (am > oldAm || i >= oldPi) ? ' new' : '');
      r.am.innerHTML = Array.from({ length: am }, (_, i) => `<i class="amarraco${newAm(i)}" style="--r:${((i * 37) % 13) - 6}deg;--d:${(i - oldAm) * 70}ms"></i>`).join('');
      r.pi.innerHTML = Array.from({ length: pi }, (_, i) => `<i class="piedra${newPi(i)}" style="--d:${i * 60}ms"></i>`).join('');
      if (grew && am > oldAm) play('chip');
    }
    const tray = r.root.querySelector('.cx-tray')!;
    tray.setAttribute('aria-label', `${am} amarraco${am === 1 ? '' : 's'} y ${pi} piedra${pi === 1 ? '' : 's'}`);

    this.drawn.pts[team] = pts;
    this.drawn.pieces[team] = [am, pi];
  }

  private renderResult() {
    const t = this.tally;
    const r = t.result;
    const key = this.resultKey();
    if (key === this.drawn.result) return;
    if (r && this.inFlight !== null) return;
    this.drawn.result = key;
    if (!r) {
      this.resultEl.hidden = true;
      this.resultEl.innerHTML = '';
      return;
    }
    const delay = this.resultDelay;
    this.resultDelay = 0;
    const n = t.games[0] + t.games[1];
    const name = escape(t.names[r.team]);
    const juego = t.juegos[t.juegos.length - 1];
    const kicker = r.ordago ? `Órdago · juego ${n}` : r.match ? 'Fin de la partida' : `Juego ${n} · ${S.BEST_OF[t.toWin]?.toLowerCase() ?? ''}`;
    const title = r.match ? `¡Partida para ${name}!` : `Juego para ${name}`;
    const series = t.toWin > 1
      ? `<div class="series"><span class="sb-juegos t0">${this.dots(0)}</span><span>${escape(t.names[0])} ${t.games[0]} — ${t.games[1]} ${escape(t.names[1])}</span><span class="sb-juegos t1">${this.dots(1)}</span></div>`
      : '';
    const partidas = r.match && t.partidas[0] + t.partidas[1] > 1
      ? `<p class="cx-meta">Partidas ganadas · ${escape(t.names[0])} ${t.partidas[0]} — ${t.partidas[1]} ${escape(t.names[1])}</p>`
      : '';
    this.resultEl.className = `cx-result t${r.team}${r.match ? ' match' : ''}`;
    this.resultEl.style.setProperty('--delay', `${delay}ms`);
    this.resultEl.innerHTML = `
      <div class="panel end">
        <span class="kicker">${kicker}</span>
        <h2>${title}</h2>
        <p class="final"><span class="t0">${r.score[0]}</span><i>–</i><span class="t1">${r.score[1]}</span></p>
        ${series}
        <p class="cx-meta">${juego ? `Juego de ${fmtDur(juego.ms)}` : ''}${r.match ? ` · partida de ${fmtDur(Date.now() - t.started)}` : ''}</p>
        ${partidas}
        <div class="cx-result-actions">
          <button class="btn quiet" data-c="undo">Deshacer</button>
          <button class="btn primary" data-c="next">${r.match ? 'Nueva partida' : 'Siguiente juego'}</button>
        </div>
      </div>`;
    this.resultEl.hidden = false;
    window.setTimeout(() => {
      if (this.drawn.result !== key) return;
      confetti(this.el, [TEAM_COLOR[r.team], TEAM_COLOR[r.team], '#fbf8f1', '#e2483b'], r.match ? 1 : 0.4);
      play('win');
      vibrate(r.match ? [60, 50, 60, 50, 200] : [50, 40, 120], t.haptics);
      this.resultEl.querySelector<HTMLButtonElement>('[data-c="next"]')?.focus({ preventScroll: true });
    }, delay + 150);
  }

  // ---------- Diálogos ----------

  private get openDialog() {
    return this.el.querySelector<HTMLElement>('.cx-dialog:not([hidden])');
  }

  private showDialog(el: HTMLElement) {
    this.closeDialog();
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('open'));
    el.querySelector<HTMLElement>('input, [data-c="dismiss"].icon-btn')?.focus({ preventScroll: true });
  }

  private closeDialog() {
    const el = this.openDialog;
    if (!el) return;
    const hadFocus = el.contains(document.activeElement);
    el.classList.remove('open');
    el.hidden = true;
    if (hadFocus && this.isOpen) this.el.focus({ preventScroll: true });
  }

  private openSettings() {
    const t = this.tally;
    const seg = (name: string, value: number, options: [number, string][]) =>
      `<div class="cx-seg" role="group" data-name="${name}">${options
        .map(([v, label]) => `<button type="button" class="cx-seg-btn" data-c="seg" data-v="${v}" aria-pressed="${v === value}">${label}</button>`)
        .join('')}</div>`;
    const el = this.el.querySelector<HTMLElement>('[data-dialog="settings"]')!;
    el.innerHTML = `
      <div class="confirm-scrim" data-c="dismiss"></div>
      <form class="confirm-card cx-settings" aria-labelledby="cx-set-title">
        <h3 id="cx-set-title">Ajustes</h3>
        <div class="cx-field"><span>Tantos por juego</span>${seg('target', t.target, [[30, 'A 30'], [40, 'A 40']])}</div>
        <div class="cx-field"><span>Partida</span>${seg('toWin', t.toWin, [[1, '1 juego'], [2, 'Mejor de 3'], [3, 'Mejor de 5']])}</div>
        <div class="cx-field cx-row">
          <span>Vibración al tocar</span>
          <button type="button" class="cx-switch" role="switch" data-c="switch" data-name="haptics" aria-checked="${t.haptics}" aria-label="Vibración al tocar"><i></i></button>
        </div>
        <div class="cx-field cx-row">
          <span>Horizontal en el móvil<small>Si el móvil está en vertical, el contador se gira para verse en horizontal</small></span>
          <button type="button" class="cx-switch" role="switch" data-c="switch" data-name="landscape" aria-checked="${t.landscape}" aria-label="Horizontal en el móvil"><i></i></button>
        </div>
        <div class="confirm-actions">
          <button type="button" class="btn quiet" data-c="dismiss">Cancelar</button>
          <button type="submit" class="btn primary">Guardar</button>
        </div>
      </form>`;
    this.showDialog(el);
  }

  private saveSettings() {
    const form = this.el.querySelector<HTMLFormElement>('[data-dialog="settings"] form')!;
    const val = (name: string) => Number(form.querySelector(`[data-name="${name}"] [aria-pressed="true"]`)?.getAttribute('data-v'));
    const on = (name: string) => form.querySelector(`[data-name="${name}"]`)?.getAttribute('aria-checked') === 'true';
    const t = S.clone(this.tally);
    t.target = val('target') || t.target;
    t.toWin = val('toWin') || t.toWin;
    t.haptics = on('haptics');
    t.landscape = on('landscape');
    this.closeDialog();
    this.commit(t);
  }

  private openStats() {
    const t = this.tally;
    const names = t.names.map(escape);
    const br = S.breakdown(t);
    const rows = S.SOURCES.filter((s) => br[s][0] || br[s][1]);
    const max = Math.max(1, ...rows.flatMap((s) => br[s]));
    const bar = (s: S.Source, team: Team) => {
      const v = br[s][team];
      return `<div class="cx-bar t${team}" title="${S.SOURCE_LABEL[s]} · ${names[team]}: ${v}">
          <i style="width:${(Math.max(0, v) / max) * 100}%"></i><b>${v}</b></div>`;
    };
    const chart = rows.length
      ? `<div class="cx-legend"><span class="t0"><i></i>${names[0]}</span><span class="t1"><i></i>${names[1]}</span></div>
         <div class="cx-bars">${rows
           .map((s) => `<div class="cx-bar-row"><span>${S.SOURCE_LABEL[s]}</span><div>${bar(s, 0)}${bar(s, 1)}</div></div>`)
           .join('')}</div>`
      : '<p class="cx-empty">Aún no hay tantos anotados en esta partida.</p>';
    const juegos = t.juegos.length
      ? `<ol class="cx-juegos">${t.juegos
          .map((j, i) => `<li class="t${j.winner}"><b>Juego ${i + 1}</b><span>${names[j.winner]}${j.ordago ? ' <em>órdago</em>' : ''}</span><span class="sc">${j.score[0]}–${j.score[1]}</span><small>${fmtDur(j.ms)}</small></li>`)
          .join('')}</ol>`
      : '<p class="cx-empty">Todavía no ha terminado ningún juego.</p>';
    const log = t.events.slice(-60).reverse();
    const registro = log.length
      ? `<ol class="cx-log">${log
          .map((e) => `<li class="t${e.team}"><time>${fmtTime(e.at)}</time><i></i><span>${e.src === 'directo' ? 'Tantos sueltos' : S.SOURCE_LABEL[e.src]} · ${names[e.team]}</span><b>${e.n > 0 ? '+' : '−'}${Math.abs(e.n)}</b></li>`)
          .join('')}</ol>`
      : '<p class="cx-empty">Aquí aparecerá cada jugada según la anotéis.</p>';
    const tile = (label: string, value: string) => `<div class="cx-tile"><span>${label}</span><b>${value}</b></div>`;
    const el = this.el.querySelector<HTMLElement>('[data-dialog="stats"]')!;
    el.innerHTML = `
      <div class="confirm-scrim" data-c="dismiss"></div>
      <div class="cx-sheet-card" role="document">
        <header class="cx-sheet-head">
          <h3>Estadísticas</h3>
          <button class="icon-btn dark" data-c="dismiss" aria-label="Cerrar estadísticas">${ICON.close}</button>
        </header>
        <div class="cx-tiles">
          ${tile('Partida', fmtDur(Date.now() - t.started))}
          ${tile('Manos', String(t.hand))}
          ${tile('Juegos', `${t.games[0]}–${t.games[1]}`)}
          ${tile('Partidas ganadas', `${t.partidas[0]}–${t.partidas[1]}`)}
        </div>
        <h4>Tantos por lance</h4>
        ${chart}
        <h4>Juegos de esta partida</h4>
        ${juegos}
        <h4>Registro</h4>
        ${registro}
        <button class="link-btn cx-clear" data-c="clear-partidas">Poner a cero las partidas ganadas</button>
      </div>`;
    this.showDialog(el);
  }
}
