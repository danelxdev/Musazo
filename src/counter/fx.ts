/** Efectos del contador: piedras que vuelan, números que ruedan, confeti y vibración. */

export const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function vibrate(pattern: number | number[], enabled: boolean) {
  if (!enabled || reduced()) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Algunos navegadores lo bloquean sin interacción previa
  }
}

/** Reinicia una animación CSS de clase (p. ej. el «bote» del marcador). */
export function replay(el: Element, cls: string) {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}

const rolling = new WeakMap<Element, number>();

/** El número cuenta desde el valor anterior hasta el nuevo. */
export function rollNumber(el: HTMLElement, to: number) {
  const from = Number(el.dataset.value ?? el.textContent) || 0;
  el.dataset.value = String(to);
  cancelAnimationFrame(rolling.get(el) ?? 0);
  if (from === to || reduced()) {
    el.textContent = String(to);
    return;
  }
  const dur = Math.min(700, 220 + Math.abs(to - from) * 40);
  const t0 = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = String(Math.round(from + (to - from) * e));
    if (k < 1) rolling.set(el, requestAnimationFrame(step));
  };
  rolling.set(el, requestAnimationFrame(step));
}

/**
 * Capa de efectos dentro del contador. El contador puede estar girado (móvil en vertical),
 * así que los efectos se dibujan en sus coordenadas y no en las de la pantalla.
 */
function fxLayer(host: HTMLElement) {
  let layer = host.querySelector<HTMLElement>(':scope > .cx-fxlayer');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'cx-fxlayer';
    layer.setAttribute('aria-hidden', 'true');
    host.appendChild(layer);
  }
  return layer;
}

/** Pasa un punto de la pantalla a coordenadas del contador (deshaciendo su giro, si lo hay). */
function toLocal(host: HTMLElement, sx: number, sy: number) {
  const layer = fxLayer(host);
  let probe = layer.querySelector<HTMLElement>('.cx-probe');
  if (!probe) {
    probe = document.createElement('i');
    probe.className = 'cx-probe';
    layer.appendChild(probe);
  }
  // Dónde cae en pantalla la esquina (0,0) de la capa, y el giro que lleva encima
  const o = probe.getBoundingClientRect();
  const tf = getComputedStyle(host).transform;
  if (!tf || tf === 'none') return { x: sx - o.left, y: sy - o.top };
  const m = new DOMMatrix(tf);
  m.e = 0;
  m.f = 0;
  const pt = m.inverse().transformPoint(new DOMPoint(sx - o.left, sy - o.top));
  return { x: pt.x, y: pt.y };
}

const center = (host: HTMLElement, el: Element) => {
  const r = el.getBoundingClientRect();
  return toLocal(host, r.left + r.width / 2, r.top + r.height / 2);
};

/** Piedras que salen de un sitio y aterrizan en otro, en arco y una detrás de otra. */
export function flyStones(host: HTMLElement, from: Element, to: Element, n: number, onLand?: (i: number) => void): Promise<void> {
  const a = center(host, from);
  const b = center(host, to);
  const count = Math.max(1, Math.min(n, 7));
  if (reduced()) {
    for (let i = 0; i < count; i++) onLand?.(i);
    return Promise.resolve();
  }
  const layer = fxLayer(host);
  const flights = Array.from({ length: count }, (_, i) => {
    const el = document.createElement('i');
    el.className = 'piedra cx-flying';
    layer.appendChild(el);
    const jx = (Math.random() - 0.5) * 26;
    const jy = (Math.random() - 0.5) * 16;
    const lift = Math.min(160, 50 + Math.hypot(b.x - a.x, b.y - a.y) * 0.3);
    const frames: Keyframe[] = [];
    for (let k = 0; k <= 14; k++) {
      const t = k / 14;
      const x = a.x + jx * (1 - t) + (b.x - a.x) * t;
      const y = a.y + jy * (1 - t) + (b.y - a.y) * t - lift * 4 * t * (1 - t);
      const s = 1 + 0.6 * Math.sin(Math.PI * t);
      frames.push({ transform: `translate(${x}px, ${y}px) scale(${s})`, opacity: t < 0.1 ? t * 10 : 1, offset: t });
    }
    const anim = el.animate(frames, { duration: 620, delay: i * 85, easing: 'cubic-bezier(.45,.05,.3,1)', fill: 'both' });
    return anim.finished
      .catch(() => undefined)
      .then(() => {
        el.remove();
        onLand?.(i);
      });
  });
  return Promise.all(flights).then(() => undefined);
}

/** Onda que se expande desde un punto. */
export function ripple(el: HTMLElement, e: PointerEvent) {
  if (reduced()) return;
  const w = el.offsetWidth, h = el.offsetHeight;
  // offsetX/Y ya vienen en coordenadas del botón aunque el contador esté girado
  const x = e.target === el ? e.offsetX : w / 2;
  const y = e.target === el ? e.offsetY : h / 2;
  const s = document.createElement('span');
  s.className = 'cx-ripple';
  const size = Math.max(w, h) * 2.2;
  s.style.cssText = `width:${size}px;height:${size}px;left:${x - size / 2}px;top:${y - size / 2}px`;
  el.appendChild(s);
  s.addEventListener('animationend', () => s.remove(), { once: true });
}

/** Confeti sobre todo el contador. `power` va de 0 a 1. */
export function confetti(host: HTMLElement, colors: string[], power = 1) {
  if (reduced()) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'cx-confetti';
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas.remove();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = host.clientWidth, H = host.clientHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);
  const N = Math.round(70 + 150 * power);
  const parts = Array.from({ length: N }, (_, i) => {
    const fromLeft = i % 2 === 0;
    const angle = (fromLeft ? -60 : -120) * (Math.PI / 180) + (Math.random() - 0.5) * 0.9;
    const speed = (9 + Math.random() * 11) * (0.7 + power * 0.5);
    return {
      x: fromLeft ? -10 : W + 10,
      y: H * (0.55 + Math.random() * 0.3),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      w: 6 + Math.random() * 7,
      h: 4 + Math.random() * 5,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.35,
      color: colors[i % colors.length],
      shape: Math.random() < 0.3 ? 'circle' : 'rect',
      delay: Math.random() * 12,
    };
  });
  let frame = 0;
  const tick = () => {
    frame++;
    ctx.clearRect(0, 0, W, H);
    let alive = 0;
    for (const p of parts) {
      if (frame < p.delay) {
        alive++;
        continue;
      }
      p.vy += 0.32;
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      if (p.y > H + 30) continue;
      alive++;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, Math.cos(p.rot * 2.3));
      ctx.fillStyle = p.color;
      if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, p.w / 2.4, 0, Math.PI * 2);
        ctx.fill();
      } else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (alive && frame < 60 * 7) requestAnimationFrame(tick);
    else canvas.remove();
  };
  requestAnimationFrame(tick);
}

/** Aviso breve en la parte baja de la pantalla. */
export function toast(host: HTMLElement, text: string, action?: { label: string; run: () => void }) {
  host.querySelectorAll('.cx-toast').forEach((t) => t.remove());
  const el = document.createElement('div');
  el.className = 'cx-toast';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span></span>`;
  el.querySelector('span')!.textContent = text;
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.addEventListener('click', () => {
      action.run();
      el.remove();
    });
    el.appendChild(b);
  }
  host.appendChild(el);
  window.setTimeout(() => {
    el.classList.add('out');
    window.setTimeout(() => el.remove(), 300);
  }, action ? 4200 : 2400);
}
