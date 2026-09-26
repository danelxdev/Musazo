/** Reglas de la partida que se pueden elegir. */
export interface Rules {
  /** A 8 reyes (los treses son reyes y los doses ases) o a 4 reyes (cada carta vale lo suyo). */
  reyes: 8 | 4;
  /** Tantos para ganar un juego. */
  points: 30 | 40;
  /** Juegos para ganar la partida: 1 (a un juego), 2 (al mejor de 3) o 3 (al mejor de 5). */
  toWin: 1 | 2 | 3;
}

export const DEFAULT_RULES: Rules = { reyes: 8, points: 40, toWin: 2 };

export const BEST_OF: Record<Rules['toWin'], string> = { 1: 'a un juego', 2: 'al mejor de 3', 3: 'al mejor de 5' };

/** Resumen corto: «Mus a 8 reyes · a 40 · al mejor de 3». */
export const rulesLabel = (r: Rules) => `A ${r.reyes} reyes · a ${r.points} · ${BEST_OF[r.toWin]}`;

/**
 * Reglas con las que se evalúan las cartas ahora mismo. Las fija el motor al empezar
 * (y la mesa al pintar lo que llega del anfitrión), así las funciones de cartas siguen siendo simples.
 */
export const active: Rules = { ...DEFAULT_RULES };

export function setActiveRules(r: Rules) {
  Object.assign(active, r);
}

/** Comprueba unas reglas que vienen de fuera (almacenamiento, red) y rellena lo que falte. */
export function sanitizeRules(x: unknown): Rules {
  const r = (x ?? {}) as Partial<Rules>;
  return {
    reyes: r.reyes === 4 ? 4 : 8,
    points: r.points === 30 ? 30 : 40,
    toWin: r.toWin === 1 || r.toWin === 3 ? r.toWin : 2,
  };
}

const KEY = 'musazo.rules';

export function savedRules(): Rules {
  try {
    return sanitizeRules(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return { ...DEFAULT_RULES };
  }
}

export function saveRules(r: Rules) {
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    /* sin almacenamiento */
  }
}
