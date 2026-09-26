import { type LanceKey, type Stats, loadStats, resetStats } from '../game/stats';
import { cleanName, savedName, saveName } from '../net/protocol';
import { esc } from './table';

const BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/** Mi perfil: nombre y estadísticas de todas las partidas jugadas en este navegador. */
export class Profile {
  private el: HTMLElement;
  private body: HTMLElement;
  private confirming = false;
  onToggle: ((open: boolean) => void) | null = null;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'lobby profile';
    this.el.hidden = true;
    this.el.innerHTML = '<div class="lobby-scrim" data-pf="close"></div><div class="lobby-card" role="dialog" aria-modal="true" aria-labelledby="profile-title"></div>';
    this.body = this.el.querySelector('.lobby-card')!;
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement;
      if (input.name === 'name') {
        const name = cleanName(input.value);
        if (name) saveName(name);
        input.value = savedName();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    });
  }

  get isOpen() {
    return !this.el.hidden;
  }

  open() {
    this.confirming = false;
    this.render();
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

  private render() {
    const s: Stats = loadStats();
    const name = savedName();
    const tile = (value: string, label: string, sub = '') =>
      `<div class="pf-tile"><b>${value}</b><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
    const bar = (label: string, k: LanceKey) => {
      const l = s.lances[k];
      const p = pct(l.ganados, l.jugados);
      return `<div class="pf-bar"><span>${label}</span><div class="pf-track"><i style="width:${p}%"></i></div><b>${l.jugados ? `${p}%` : '—'}</b><small>${l.ganados}/${l.jugados}</small></div>`;
    };
    const empty = !s.manos;
    this.body.dataset.screen = 'profile';
    this.body.innerHTML = `
      <header class="lb-head">
        <button class="icon-btn" data-pf="close" aria-label="Cerrar">${BACK}</button>
        <h2 id="profile-title">Mi perfil</h2>
      </header>
      <div class="pf-id">
        <span class="avatar">${esc((name[0] ?? '?').toUpperCase())}</span>
        <label class="lb-field">
          <span>Tu nombre</span>
          <input name="name" type="text" maxlength="14" autocomplete="nickname" placeholder="Cómo te verán en la mesa" value="${esc(name)}">
        </label>
      </div>
      ${empty ? '<p class="lb-hint pf-empty">Aún no hay partidas: juega una mano y aquí verás tus números.</p>' : ''}
      <div class="pf-tiles">
        ${tile(`${s.partidas.ganados}`, 'Partidas ganadas', `de ${s.partidas.jugados} · ${pct(s.partidas.ganados, s.partidas.jugados)}%`)}
        ${tile(`${s.juegos.ganados}`, 'Juegos ganados', `de ${s.juegos.jugados}`)}
        ${tile(`${s.mejorRacha}`, 'Mejor racha', s.racha ? `ahora ${s.racha} seguidas` : 'partidas seguidas')}
        ${tile(`${s.ordagos.ganados}`, 'Órdagos ganados', `de ${s.ordagos.jugados}`)}
      </div>
      <div class="lb-group">
        <h3>Lances ganados</h3>
        ${bar('Grande', 'grande')}${bar('Chica', 'chica')}${bar('Pares', 'pares')}${bar('Juego / Punto', 'juego')}
      </div>
      <div class="pf-meta">
        <span>${s.manos} manos</span>
        <span>${s.tantos.favor} tantos a favor · ${s.tantos.contra} en contra</span>
        <span>Contra la máquina ${s.modos.maquina.ganados}/${s.modos.maquina.jugados} · con amigos ${s.modos.amigos.ganados}/${s.modos.amigos.jugados}</span>
      </div>
      <div class="lb-actions">
        ${this.confirming
          ? '<p class="lb-hint">¿Seguro? Se borrarán todas tus estadísticas de este navegador.</p><div class="lb-share"><button class="btn" data-pf="keep">Cancelar</button><button class="btn danger" data-pf="wipe">Borrar</button></div>'
          : '<button class="link-btn" data-pf="reset">Borrar estadísticas</button>'}
      </div>
      <p class="lb-hint pf-note">Se guardan en este navegador. Con cuenta online (próximamente) irán contigo a cualquier dispositivo.</p>`;
  }

  private onClick(e: Event) {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-pf]');
    if (!btn) return;
    const act = btn.dataset.pf;
    if (act === 'close') this.close();
    else if (act === 'reset') {
      this.confirming = true;
      this.render();
    } else if (act === 'keep') {
      this.confirming = false;
      this.render();
    } else if (act === 'wipe') {
      resetStats();
      this.confirming = false;
      this.render();
    }
  }
}
