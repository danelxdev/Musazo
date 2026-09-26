import { type Rules, savedRules, saveRules } from '../game/rules';
import { BACKS, FELTS, type Look, applyLook, savedLook, saveLook } from './look';
import { isMuted, toggleMute } from './sound';

const BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/**
 * Ajustes: reglas de la partida (para la próxima que empieces) y aspecto de la mesa.
 * Usa el mismo marco que el menú de partidas.
 */
export class Settings {
  private el: HTMLElement;
  private body: HTMLElement;
  private rules: Rules = savedRules();
  private look: Look = savedLook();
  private playing = false;
  /** Avisa cuando cambian las reglas (para la portada y la sala). */
  onRules: ((r: Rules) => void) | null = null;
  onToggle: ((open: boolean) => void) | null = null;
  /** Se ha cambiado el sonido (para el botón de la barra). */
  onSound: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'lobby settings';
    this.el.hidden = true;
    this.el.innerHTML = '<div class="lobby-scrim" data-st="close"></div><div class="lobby-card" role="dialog" aria-modal="true" aria-labelledby="settings-title"></div>';
    this.body = this.el.querySelector('.lobby-card')!;
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => this.onClick(e));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    });
    applyLook(this.look);
  }

  get isOpen() {
    return !this.el.hidden;
  }

  open(playing = false) {
    this.playing = playing;
    this.rules = savedRules();
    this.look = savedLook();
    this.render(playing);
    this.el.hidden = false;
    requestAnimationFrame(() => this.el.classList.add('open'));
    this.onToggle?.(true);
  }

  close() {
    if (this.el.hidden) return;
    this.el.classList.remove('open');
    this.el.hidden = true;
    this.onToggle?.(false);
  }

  private render(playing: boolean) {
    const seg = <K extends keyof Rules>(key: K, opts: [Rules[K], string][]) =>
      `<div class="seg" role="radiogroup">${opts
        .map(([v, label]) => `<button class="seg-btn ${this.rules[key] === v ? 'on' : ''}" role="radio" aria-checked="${this.rules[key] === v}" data-st="rule" data-key="${key}" data-val="${v}">${label}</button>`)
        .join('')}</div>`;
    const swatches = (kind: 'felt' | 'back', list: typeof FELTS) =>
      `<div class="swatches">${list
        .map((o) => `<button class="swatch ${kind} ${this.look[kind] === o.id ? 'on' : ''}" data-st="${kind}" data-id="${o.id}" style="--sw:${o.color}" aria-label="${o.name}" aria-pressed="${this.look[kind] === o.id}"><i></i><span>${o.name}</span></button>`)
        .join('')}</div>`;
    this.body.dataset.screen = 'settings';
    this.body.innerHTML = `
      <header class="lb-head">
        <button class="icon-btn" data-st="close" aria-label="Cerrar">${BACK}</button>
        <h2 id="settings-title">Ajustes</h2>
      </header>
      <div class="lb-group">
        <h3>Reglas de la partida</h3>
        ${playing ? '<p class="lb-hint">Se aplican a partir de la próxima partida que empieces.</p>' : ''}
        <div class="st-row"><span>Reyes</span>${seg('reyes', [[8, 'A 8 reyes'], [4, 'A 4 reyes']])}</div>
        <div class="st-row"><span>Tantos por juego</span>${seg('points', [[30, 'A 30'], [40, 'A 40']])}</div>
        <div class="st-row"><span>Partida</span>${seg('toWin', [[1, '1 juego'], [2, 'Mejor de 3'], [3, 'Mejor de 5']])}</div>
        <p class="lb-hint">A 8 reyes, los treses valen como reyes y los doses como ases. A 4 reyes, cada carta vale lo suyo.</p>
      </div>
      <div class="lb-group">
        <h3>Sonido</h3>
        <div class="seg" role="radiogroup">
          <button class="seg-btn ${isMuted() ? '' : 'on'}" role="radio" aria-checked="${!isMuted()}" data-st="sound" data-val="on">Con sonido</button>
          <button class="seg-btn ${isMuted() ? 'on' : ''}" role="radio" aria-checked="${isMuted()}" data-st="sound" data-val="off">Sin sonido</button>
        </div>
      </div>
      <div class="lb-group">
        <h3>Tapete</h3>
        ${swatches('felt', FELTS)}
      </div>
      <div class="lb-group">
        <h3>Reverso de las cartas</h3>
        ${swatches('back', BACKS)}
      </div>`;
  }

  private onClick(e: Event) {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-st]');
    if (!btn) return;
    const act = btn.dataset.st;
    const playing = this.playing;
    if (act === 'close') {
      this.close();
    } else if (act === 'rule') {
      const key = btn.dataset.key as keyof Rules;
      (this.rules as unknown as Record<string, number>)[key] = Number(btn.dataset.val);
      saveRules(this.rules);
      this.onRules?.({ ...this.rules });
      this.render(playing);
    } else if (act === 'sound') {
      if ((btn.dataset.val === 'off') !== isMuted()) toggleMute();
      this.onSound?.();
      this.render(playing);
    } else if (act === 'felt' || act === 'back') {
      this.look = { ...this.look, [act]: btn.dataset.id! };
      saveLook(this.look);
      applyLook(this.look);
      this.render(playing);
    }
  }
}
