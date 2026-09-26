import { type LobbyInfo, type Mode, MODE_INFO, cleanName, inviteUrl, isCode, savedName } from '../net/protocol';
import { esc } from './table';
import { rulesLabel } from '../game/rules';
import type { Me, Ranked } from '../net/ranked-protocol';
import { rankedEnabled } from '../net/ranked';

const ICON = {
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  bot: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="8" width="15" height="11" rx="3.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 8V4.5M9.5 13h.01M14.5 13h.01" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  solo: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="7" cy="8" r="2.8" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="17" cy="8" r="2.8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M2.5 18.5c.5-2.8 2.2-4.2 4.5-4.2s4 1.4 4.5 4.2M12.5 18.5c.5-2.8 2.2-4.2 4.5-4.2s4 1.4 4.5 4.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M12 5v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-dasharray="1.5 2.5"/></svg>',
  team: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="15.5" cy="9" r="2.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 19c.6-3.2 2.8-4.8 5.5-4.8s4.9 1.6 5.5 4.8M14 14.4c.5-.1 1-.2 1.5-.2 2.5 0 4.4 1.5 5 4.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  custom: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="6.5" r="2.4" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="18" cy="6.5" r="2.4" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="6" cy="17.5" r="2.4" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="18" cy="17.5" r="2.4" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="9.5" y="9.5" width="5" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5v1.5A3.5 3.5 0 0 0 8 11M16 6h3.5v1.5A3.5 3.5 0 0 1 16 11M12 13v4M8.5 20h7M9.5 17h5v3h-5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3.5M7.5 8 12 3.5 16.5 8M5 12.5v6A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M15.5 5.5v-.5a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 5v8A1.5 1.5 0 0 0 6 14.5h.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
};

export type Choice = 'bots' | Mode | 'ranked';

/**
 * Menú de partidas y sala de espera:
 * - elegir cómo jugar (contra la máquina, solo o en equipo con un amigo, o personalizado);
 * - el anfitrión ve el código y el enlace para invitar, y quién ha entrado;
 * - el invitado pone su nombre, entra y espera a que empiece la partida.
 */
export class Lobby {
  private el: HTMLElement;
  private body: HTMLElement;
  private screen: 'modes' | 'host' | 'join' | 'wait' | 'error' | 'queue' | 'result' | 'ranking' | null = null;
  private selected: number | null = null;
  private lobby: LobbyInfo | null = null;
  private me = 0;
  private code = '';

  onPick: ((choice: Choice, name: string) => void) | null = null;
  onJoin: ((code: string, name: string) => void) | null = null;
  onStart: (() => void) | null = null;
  onSwap: ((a: number, b: number) => void) | null = null;
  /** Cerrar el menú o salir de la sala. */
  onCancel: (() => void) | null = null;
  /** Abrir los ajustes (para cambiar las reglas de la sala). */
  onSettings: (() => void) | null = null;
  /** Clasificatoria: volver a buscar partida, o ver el ranking. */
  onRequeue: (() => void) | null = null;
  onRanking: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'lobby';
    this.el.hidden = true;
    this.el.innerHTML = '<div class="lobby-scrim" data-lb="cancel"></div><div class="lobby-card" role="dialog" aria-modal="true" aria-labelledby="lobby-title"></div>';
    this.body = this.el.querySelector('.lobby-card')!;
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target as HTMLFormElement;
      if (form.dataset.form === 'join') this.submitJoin(form);
    });
    document.addEventListener('keydown', (e) => {
      // Con los ajustes abiertos encima, Escape es para ellos
      if (document.querySelector('.settings:not([hidden])')) return;
      if (e.key === 'Escape' && this.isOpen && this.screen !== 'wait') this.onCancel?.();
    });
  }

  get isOpen() {
    return !this.el.hidden;
  }

  private open() {
    this.el.hidden = false;
    requestAnimationFrame(() => this.el.classList.add('open'));
  }

  close() {
    this.el.classList.remove('open');
    this.el.hidden = true;
    this.screen = null;
    this.selected = null;
  }

  private nameField(autofocus = false) {
    return `<label class="lb-field">
        <span>Tu nombre</span>
        <input name="name" type="text" maxlength="14" autocomplete="nickname" enterkeyhint="done" placeholder="Cómo te verán en la mesa" value="${esc(savedName())}" ${autofocus ? 'autofocus' : ''}>
      </label>`;
  }

  private readName(): string | null {
    const input = this.body.querySelector<HTMLInputElement>('input[name="name"]');
    const name = cleanName(input?.value ?? '');
    if (!name && input) {
      input.focus();
      input.classList.remove('shake');
      void input.offsetWidth;
      input.classList.add('shake');
      input.placeholder = 'Escribe tu nombre para jugar';
      return null;
    }
    return name;
  }

  // ---------- Pantallas ----------

  /** Elegir modalidad para jugar con amigos. */
  showModes() {
    this.screen = 'modes';
    this.body.dataset.screen = 'modes';
    const opt = (choice: Choice, icon: string, title: string, text: string) =>
      `<button class="lb-option" data-lb="pick" data-choice="${choice}"><span class="lb-ico">${icon}</span><span><b>${title}</b><small>${text}</small></span></button>`;
    this.body.innerHTML = `
      <header class="lb-head">
        <button class="icon-btn" data-lb="cancel" aria-label="Volver">${ICON.back}</button>
        <h2 id="lobby-title">¿Cómo quieres jugar?</h2>
      </header>
      ${this.nameField()}
      <div class="lb-group">
        <h3>Online · clasificatoria</h3>
        ${rankedEnabled()
          ? `${opt('ranked', ICON.trophy, 'Partida clasificatoria', 'Te emparejamos con gente de tu nivel. Gana y sube en el ranking.')}<button class="link-btn lb-rank-link" data-lb="ranking">Ver el ranking</button>`
          : `<div class="lb-option soon" aria-disabled="true"><span class="lb-ico">${ICON.trophy}</span><span><b>Partida clasificatoria <em>Próximamente</em></b><small>Emparejamiento con gente de tu nivel y ranking por temporadas.</small></span></div>`}
      </div>
      <div class="lb-split">
      <div class="lb-group">
        <h3>Multijugador · invita a una persona</h3>
        ${opt('solo', ICON.solo, MODE_INFO.solo.title, MODE_INFO.solo.text)}
        ${opt('equipo', ICON.team, MODE_INFO.equipo.title, MODE_INFO.equipo.text)}
      </div>
      <div class="lb-group">
        <h3>Con tu cuadrilla</h3>
        ${opt('custom', ICON.custom, MODE_INFO.custom.title, MODE_INFO.custom.text)}
      </div>
      <div class="lb-group">
        <h3>Sin conexión</h3>
        ${opt('bots', ICON.bot, 'Contra la máquina', 'Tú y Maite contra Iñaki y Koldo')}
      </div>
      </div>
      <form class="lb-code" data-form="join">
        <span>¿Te han pasado un código?</span>
        <input name="code" type="text" maxlength="5" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="CÓDIGO" aria-label="Código de la sala">
        <button class="btn" type="submit">Entrar</button>
      </form>`;
    this.open();
  }

  /** Sala del anfitrión: invitar y esperar a que entren. */
  showHost(lobby: LobbyInfo, me: number, status: 'connecting' | 'ready' | 'error', error = '') {
    this.screen = 'host';
    this.body.dataset.screen = 'host';
    this.lobby = lobby;
    this.me = me;
    const guests = lobby.seats.filter((s) => s.kind === 'guest').length;
    const open = lobby.seats.filter((s) => s.kind === 'open').length;
    const custom = lobby.mode === 'custom';
    const ready = status === 'ready' && lobby.code;
    let invite: string;
    if (status === 'error') {
      invite = `<p class="lb-error">${esc(error)}</p><button class="btn" data-lb="retry">Volver a intentarlo</button>`;
    } else if (!ready) {
      invite = '<p class="lb-status"><span class="spinner"></span>Creando la sala…</p>';
    } else {
      const canShare = typeof navigator.share === 'function';
      invite = `
        <div class="lb-invite">
          <span class="lb-label">Código de la sala</span>
          <strong class="lb-codebig">${esc(lobby.code)}</strong>
          <div class="lb-share">
            ${canShare ? `<button class="btn primary" data-lb="share">${ICON.share}Invitar</button>` : ''}
            <button class="btn ${canShare ? '' : 'primary'}" data-lb="copy">${ICON.copy}<span>Copiar enlace</span></button>
          </div>
          <small class="lb-hint">Mándale el enlace (o el código) a ${custom ? 'tus amigos' : 'tu amigo'}: al abrirlo entra directamente en tu sala.</small>
        </div>`;
    }
    const need = custom ? '' : guests ? '' : 'Esperando a que entre tu amigo…';
    const startLabel = custom && open ? `Empezar (${open === 1 ? 'el hueco lo juega' : 'los huecos los juega'} la máquina)` : 'Empezar partida';
    this.body.innerHTML = `
      <header class="lb-head">
        <button class="icon-btn" data-lb="cancel" aria-label="Cerrar la sala">${ICON.back}</button>
        <div>
          <span class="lb-kicker">${MODE_INFO[lobby.mode].title}</span>
          <h2 id="lobby-title">${custom ? 'Invita a tus amigos' : 'Invita a tu amigo'}</h2>
        </div>
      </header>
      <p class="lb-sub">${MODE_INFO[lobby.mode].text}.</p>
      <div class="lb-rules"><span>${esc(rulesLabel(lobby.rules))}</span><button class="link-btn" data-lb="settings">Cambiar reglas</button></div>
      <div class="lb-split">
        ${invite}
        <div>
          ${this.seatsHtml(lobby, me, custom)}
          ${custom ? '<p class="lb-hint lb-center">Toca dos sitios para cambiarlos: los que están enfrente juegan de pareja.</p>' : ''}
        </div>
      </div>
      <div class="lb-actions">
        ${need ? `<p class="lb-status"><span class="spinner"></span>${need}</p>` : ''}
        <button class="btn primary big" data-lb="start" ${ready && (custom || guests) ? '' : 'disabled'}>${startLabel}</button>
      </div>`;
    this.open();
  }

  /** Te han invitado: nombre y entrar. */
  showJoin(code: string, error = '') {
    this.screen = 'join';
    this.body.dataset.screen = 'join';
    this.code = code;
    this.body.innerHTML = `
      <header class="lb-head">
        <button class="icon-btn" data-lb="cancel" aria-label="Volver">${ICON.back}</button>
        <div>
          <span class="lb-kicker">Sala ${esc(code)}</span>
          <h2 id="lobby-title">Te han invitado a jugar al mus</h2>
        </div>
      </header>
      ${error ? `<p class="lb-error">${esc(error)}</p>` : ''}
      <form data-form="join">
        ${this.nameField(true)}
        <input type="hidden" name="code" value="${esc(code)}">
        <div class="lb-actions"><button class="btn primary big" type="submit">Entrar en la partida</button></div>
      </form>`;
    this.open();
  }

  /** Invitado dentro de la sala, esperando al anfitrión. */
  showWait(lobby: LobbyInfo | null, me: number, status: string) {
    this.screen = 'wait';
    this.body.dataset.screen = 'wait';
    this.lobby = lobby;
    this.me = me;
    const host = lobby?.seats.find((s) => s.kind === 'host');
    this.body.innerHTML = `
      <header class="lb-head">
        <button class="icon-btn" data-lb="cancel" aria-label="Salir de la sala">${ICON.back}</button>
        <div>
          <span class="lb-kicker">${lobby ? `${MODE_INFO[lobby.mode].title} · sala ${esc(lobby.code)}` : `Sala ${esc(this.code)}`}</span>
          <h2 id="lobby-title">${lobby ? 'Ya estás dentro' : 'Entrando…'}</h2>
        </div>
      </header>
      ${lobby ? `<div class="lb-rules"><span>${esc(rulesLabel(lobby.rules))}</span></div>` : ''}
      ${lobby ? this.seatsHtml(lobby, me, false) : ''}
      <div class="lb-actions"><p class="lb-status"><span class="spinner"></span>${esc(status || (host ? `Esperando a que ${host.name} empiece la partida…` : 'Conectando con la sala…'))}</p></div>`;
    this.open();
  }

  /** Clasificatoria: buscando partida. */
  showQueue(me: Me | null, text: string) {
    this.screen = 'queue';
    this.body.dataset.screen = 'queue';
    this.body.innerHTML = `
      <header class="lb-head">
        <button class="icon-btn" data-lb="cancel" aria-label="Dejar de buscar">${ICON.back}</button>
        <div>
          <span class="lb-kicker">Partida clasificatoria</span>
          <h2 id="lobby-title">Buscando partida</h2>
        </div>
      </header>
      ${me ? this.meHtml(me) : ''}
      <div class="lb-actions">
        <p class="lb-status"><span class="spinner"></span>${esc(text)}</p>
        <p class="lb-hint lb-center">Si tarda, completamos la mesa con la máquina (esas partidas cuentan la mitad).</p>
        <button class="btn" data-lb="cancel">Dejar de buscar</button>
      </div>`;
    this.open();
  }

  /** Clasificatoria: resultado y puntos ganados o perdidos. */
  showResult(won: boolean, before: number, after: number, me: Me) {
    this.screen = 'result';
    this.body.dataset.screen = 'result';
    const d = after - before;
    this.body.innerHTML = `
      <header class="lb-head">
        <button class="icon-btn" data-lb="cancel" aria-label="Volver al inicio">${ICON.back}</button>
        <div>
          <span class="lb-kicker">Partida clasificatoria</span>
          <h2 id="lobby-title">${won ? '¡Partida ganada!' : 'Partida perdida'}</h2>
        </div>
      </header>
      <div class="lb-result ${won ? 'won' : 'lost'}">
        <b>${d >= 0 ? '+' : '−'}${Math.abs(d)}</b>
        <span>${before} → ${after} puntos</span>
      </div>
      ${this.meHtml(me)}
      <div class="lb-actions">
        <button class="btn primary big" data-lb="requeue">Otra partida</button>
        <button class="link-btn" data-lb="ranking">Ver el ranking</button>
      </div>`;
    this.open();
  }

  /** Ranking de los mejores (list null: cargando). */
  showRanking(list: (Ranked & { division: string })[] | null, myUid: string, error = '') {
    this.screen = 'ranking';
    this.body.dataset.screen = 'ranking';
    const rows = list?.map((p, i) => `<tr class="${p.uid === myUid ? 'me' : ''}">
        <td class="pos">${i + 1}</td>
        <td class="who"><b>${esc(p.name)}</b><small>${esc(p.division)}</small></td>
        <td class="pts">${p.rating}</td>
        <td class="wl">${p.wins}/${p.games}</td></tr>`).join('') ?? '';
    this.body.innerHTML = `
      <header class="lb-head">
        <button class="icon-btn" data-lb="cancel" aria-label="Volver">${ICON.back}</button>
        <div>
          <span class="lb-kicker">Clasificatoria</span>
          <h2 id="lobby-title">Ranking</h2>
        </div>
      </header>
      ${error ? `<p class="lb-error">${esc(error)}</p>` : ''}
      ${!list && !error ? '<p class="lb-status"><span class="spinner"></span>Cargando…</p>' : ''}
      ${list && !list.length ? '<p class="lb-hint lb-center">Aún no hay nadie en el ranking: ¡juega la primera partida!</p>' : ''}
      ${list?.length ? `<table class="lb-ranking"><thead><tr><th>#</th><th>Jugador</th><th>Puntos</th><th>G/J</th></tr></thead><tbody>${rows}</tbody></table>` : ''}`;
    this.open();
  }

  private meHtml(me: Me) {
    return `<div class="lb-me">
        <span class="avatar">${esc((me.name[0] ?? '?').toUpperCase())}</span>
        <div><b>${esc(me.name)}</b><small>${esc(me.division)}${me.rank ? ` · puesto ${me.rank}` : ''} · ${me.wins}/${me.games} ganadas</small></div>
        <strong>${me.rating}</strong>
      </div>`;
  }

  showError(title: string, text: string) {
    this.screen = 'error';
    this.body.dataset.screen = 'error';
    this.body.innerHTML = `
      <header class="lb-head">
        <button class="icon-btn" data-lb="cancel" aria-label="Volver">${ICON.back}</button>
        <h2 id="lobby-title">${esc(title)}</h2>
      </header>
      <p class="lb-error">${esc(text)}</p>
      <div class="lb-actions"><button class="btn primary big" data-lb="cancel">Volver al inicio</button></div>`;
    this.open();
  }

  private seatsHtml(lobby: LobbyInfo, me: number, editable: boolean) {
    const seat = (i: number) => {
      const s = lobby.seats[i];
      const tag = s.kind === 'open' ? 'esperando…'
        : s.kind === 'bot' ? 'máquina'
          : s.away ? 'desconectado'
            : s.kind === 'host' ? 'anfitrión' : 'invitado';
      const name = s.kind === 'open' ? (s.forGuest ? 'Invitado' : 'Libre') : s.name;
      const cls = [`lb-seat t${i % 2}`, s.kind, i === me ? 'me' : '', this.selected === i ? 'sel' : ''].join(' ');
      const inner = `<span class="avatar">${s.kind === 'open' ? '?' : esc(name[0]?.toUpperCase() ?? '?')}</span>
        <span class="lb-seat-name">${esc(name)}${i === me ? ' <em>(tú)</em>' : ''}</span>
        <small>${tag}</small>`;
      return editable
        ? `<button class="${cls}" data-lb="seat" data-seat="${i}">${inner}</button>`
        : `<div class="${cls}">${inner}</div>`;
    };
    return `<div class="lb-table">
      <div class="lb-pair t0"><span class="lb-label">Pareja 1</span>${seat(0)}${seat(2)}</div>
      <div class="lb-pair t1"><span class="lb-label">Pareja 2</span>${seat(1)}${seat(3)}</div>
    </div>`;
  }

  // ---------- Acciones ----------

  private submitJoin(form: HTMLFormElement) {
    const codeInput = form.querySelector<HTMLInputElement>('input[name="code"]');
    const code = (codeInput?.value ?? '').trim().toUpperCase();
    if (!isCode(code)) {
      if (codeInput && codeInput.type !== 'hidden') {
        codeInput.focus();
        codeInput.classList.remove('shake');
        void codeInput.offsetWidth;
        codeInput.classList.add('shake');
      }
      return;
    }
    const name = this.readName();
    if (name === null) return;
    this.code = code;
    this.onJoin?.(code, name);
  }

  private async onClick(e: Event) {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-lb]');
    if (!btn) return;
    const act = btn.dataset.lb;
    if (act === 'cancel') {
      // En la sala de espera del invitado, tocar fuera no le saca de la sala
      if (btn.classList.contains('lobby-scrim') && (this.screen === 'wait' || this.screen === 'host')) return;
      this.onCancel?.();
    } else if (act === 'pick') {
      const choice = btn.dataset.choice as Choice;
      const name = choice === 'bots' ? cleanName(this.body.querySelector<HTMLInputElement>('input[name="name"]')?.value ?? '') : this.readName();
      if (name === null) return;
      this.onPick?.(choice, name);
    } else if (act === 'requeue') {
      this.onRequeue?.();
    } else if (act === 'ranking') {
      this.onRanking?.();
    } else if (act === 'settings') {
      this.onSettings?.();
    } else if (act === 'start') {
      this.onStart?.();
    } else if (act === 'retry') {
      if (this.lobby) this.onPick?.(this.lobby.mode, this.lobby.seats[this.me]?.name ?? savedName());
    } else if (act === 'seat') {
      const i = Number(btn.dataset.seat);
      if (this.selected === null) this.selected = i;
      else {
        const a = this.selected;
        this.selected = null;
        if (a !== i) this.onSwap?.(a, i);
      }
      if (this.lobby) this.showHost(this.lobby, this.lobby.seats.findIndex((s) => s.kind === 'host'), 'ready');
    } else if (act === 'share' && this.lobby) {
      const url = inviteUrl(this.lobby.code);
      try {
        await navigator.share({ title: 'Musazo', text: `¿Echamos un mus? Entra en mi sala (código ${this.lobby.code}):`, url });
      } catch {
        /* cancelado */
      }
    } else if (act === 'copy' && this.lobby) {
      const url = inviteUrl(this.lobby.code);
      let ok = false;
      try {
        await navigator.clipboard.writeText(url);
        ok = true;
      } catch {
        ok = false;
      }
      const label = btn.querySelector('span');
      if (label) {
        label.textContent = ok ? '¡Copiado!' : url;
        window.setTimeout(() => { if (label.isConnected) label.textContent = 'Copiar enlace'; }, 2200);
      }
    }
  }
}
