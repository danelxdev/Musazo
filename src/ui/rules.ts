import { marked } from 'marked';
import source from '../rules/reglas.md?raw';
import { faceHtml } from './cards';

const LOGO = `${import.meta.env.BASE_URL}logo-dark.png`;

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function hand(ids: string[]) {
  return `<div class="md-hand">${ids.map((id, i) => faceHtml(id, '', `--i:${i}`)).join('')}</div>`;
}

/**
 * Directivas propias dentro del Markdown:
 *   ::cards 12-oros 3-copas | pie de foto
 *   ::versus <mano A> | <mano B> | a|b | pie de foto
 */
function expandDirectives(md: string) {
  return md.replace(/^::(cards|versus)\s+(.+)$/gm, (_, kind: string, rest: string) => {
    const parts = rest.split('|').map((p) => p.trim());
    if (kind === 'cards') {
      const [ids, caption] = parts;
      return `<figure class="md-cards">${hand(ids.split(/\s+/))}${caption ? `<figcaption>${escape(caption)}</figcaption>` : ''}</figure>`;
    }
    const [a, b, winner, caption] = parts;
    const side = (ids: string, key: string, label: string) =>
      `<div class="md-side ${winner === key ? 'win' : 'lose'}"><span class="md-tag">${label}</span>${hand(ids.split(/\s+/))}${winner === key ? '<span class="md-badge">Gana</span>' : ''}</div>`;
    return `<figure class="md-versus">${side(a, 'a', 'Jugador A')}<span class="md-vs">vs</span>${side(b, 'b', 'Jugador B')}${caption ? `<figcaption>${escape(caption)}</figcaption>` : ''}</figure>`;
  });
}

const slug = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export class RulesPanel {
  private el: HTMLElement;
  private article: HTMLElement;
  private observer: IntersectionObserver | null = null;
  private rendered = false;
  private lastFocus: HTMLElement | null = null;
  onToggle: ((open: boolean) => void) | null = null;

  constructor(host: HTMLElement) {
    this.el = document.createElement('aside');
    this.el.className = 'rules';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-modal', 'true');
    this.el.setAttribute('aria-label', 'Reglas del mus');
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="rules-scrim" data-rules-close></div>
      <div class="rules-sheet">
        <header class="rules-head">
          <img src="${LOGO}" alt="musazo" class="rules-logo">
          <span class="rules-title">Reglas</span>
          <button class="icon-btn dark" data-rules-close aria-label="Cerrar reglas">
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </header>
        <nav class="rules-toc" aria-label="Apartados"></nav>
        <article class="md"></article>
      </div>`;
    host.appendChild(this.el);
    this.article = this.el.querySelector('.md')!;
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-rules-close]')) this.close();
      const link = t.closest<HTMLAnchorElement>('.rules-toc a');
      if (link) {
        e.preventDefault();
        this.article.querySelector(link.getAttribute('href')!)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    });
  }

  get isOpen() {
    return !this.el.hidden;
  }

  /** Coloca el panel dentro de otro elemento (p. ej. el contador, para girar con él). */
  mountIn(host: HTMLElement) {
    if (this.el.parentElement !== host) host.appendChild(this.el);
  }

  private render() {
    if (this.rendered) return;
    this.rendered = true;
    this.article.innerHTML = marked.parse(expandDirectives(source), { async: false }) as string;
    const toc: string[] = [];
    this.article.querySelectorAll('h2').forEach((h) => {
      h.id = slug(h.textContent ?? '');
      toc.push(`<a href="#${h.id}">${h.textContent}</a>`);
    });
    this.article.querySelectorAll('h3').forEach((h) => (h.id = slug(h.textContent ?? '')));
    this.el.querySelector('.rules-toc')!.innerHTML = toc.join('');

    // Animación de entrada al hacer scroll
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (en.isIntersecting) {
            en.target.classList.add('in');
            this.observer?.unobserve(en.target);
          }
        }
      },
      { root: this.el.querySelector('.rules-sheet'), threshold: 0.15 },
    );
    this.article.querySelectorAll(':scope > *').forEach((el) => this.observer!.observe(el));
  }

  open() {
    this.render();
    this.lastFocus = document.activeElement as HTMLElement;
    this.el.hidden = false;
    requestAnimationFrame(() => this.el.classList.add('open'));
    this.el.querySelector<HTMLButtonElement>('.rules-head [data-rules-close]')?.focus();
    this.onToggle?.(true);
  }

  close() {
    this.el.classList.remove('open');
    this.onToggle?.(false);
    window.setTimeout(() => {
      if (!this.el.classList.contains('open')) this.el.hidden = true;
    }, 320);
    this.lastFocus?.focus();
  }
}
