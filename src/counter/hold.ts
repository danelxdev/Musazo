/**
 * Botón de «mantén pulsado»: mientras se aprieta, `--p` sube de 0 a 1 y,
 * si se llega al final, se confirma. Soltar antes lo cancela.
 * Funciona con dedo, ratón y teclado (Espacio / Intro).
 */

interface HoldOptions {
  ms: number;
  onStart?: () => void;
  onDone: () => void;
  /** Se soltó antes de tiempo; `progress` es lo que se llegó a llenar (0-1). */
  onCancel?: (progress: number) => void;
}

export function bindHold(el: HTMLElement, o: HoldOptions) {
  let start = 0;
  let raf = 0;
  let active = false;

  const set = (p: number) => el.style.setProperty('--p', p.toFixed(3));

  const frame = (now: number) => {
    const p = Math.min(1, (now - start) / o.ms);
    set(p);
    if (p >= 1) {
      finish(true);
      return;
    }
    raf = requestAnimationFrame(frame);
  };

  const begin = () => {
    if (active || (el as HTMLButtonElement).disabled) return;
    active = true;
    start = performance.now();
    el.classList.add('holding');
    o.onStart?.();
    raf = requestAnimationFrame(frame);
  };

  const finish = (done: boolean) => {
    if (!active) return;
    active = false;
    cancelAnimationFrame(raf);
    const progress = Math.min(1, (performance.now() - start) / o.ms);
    el.classList.remove('holding');
    if (done) {
      set(1);
      o.onDone();
      window.setTimeout(() => set(0), 500);
    } else {
      el.classList.add('releasing');
      set(0);
      window.setTimeout(() => el.classList.remove('releasing'), 350);
      o.onCancel?.(progress);
    }
  };

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    el.setPointerCapture?.(e.pointerId);
    begin();
  });
  el.addEventListener('pointerup', () => finish(false));
  el.addEventListener('pointercancel', () => finish(false));
  el.addEventListener('lostpointercapture', () => finish(false));
  // Una pulsación larga en el móvil no debe abrir el menú contextual
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
      e.preventDefault();
      begin();
    }
  });
  el.addEventListener('keyup', (e) => {
    if (e.key === ' ' || e.key === 'Enter') finish(false);
  });
  el.addEventListener('blur', () => finish(false));
}
