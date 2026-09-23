/**
 * Estado del contador de tantos. Todo son funciones puras sobre `Tally`:
 * reciben un estado y devuelven uno nuevo, así deshacer es guardar la foto anterior.
 */

export type Team = 0 | 1;
export type Lance = 'grande' | 'chica' | 'pares' | 'juego';
export type Source = Lance | 'directo' | 'ordago';

export const LANCES: Lance[] = ['grande', 'chica', 'pares', 'juego'];
export const LANCE_LABEL: Record<Lance, string> = { grande: 'Grande', chica: 'Chica', pares: 'Pares', juego: 'Juego' };
export const SOURCE_LABEL: Record<Source, string> = { ...LANCE_LABEL, juego: 'Juego / Punto', directo: 'Sueltos', ordago: 'Órdago' };
export const SOURCES: Source[] = ['grande', 'chica', 'pares', 'juego', 'directo', 'ordago'];
export const DEFAULT_NAMES: [string, string] = ['Nosotros', 'Ellos'];
export const BEST_OF: Record<number, string> = { 1: 'A un juego', 2: 'Al mejor de 3', 3: 'Al mejor de 5' };

export interface ScoreEvent {
  at: number;
  team: Team;
  n: number;
  src: Source;
  /** Número de juego dentro de la partida (1, 2, 3…). */
  juego: number;
}

export interface GameRecord {
  at: number;
  winner: Team;
  score: [number, number];
  ms: number;
  ordago: boolean;
}

export interface Result {
  team: Team;
  score: [number, number];
  match: boolean;
  ordago: boolean;
}

export interface Tally {
  v: 2;
  names: [string, string];
  /** Tantos para ganar un juego (30 o 40). */
  target: number;
  /** Juegos para ganar la partida (1, 2 o 3). */
  toWin: number;
  points: [number, number];
  games: [number, number];
  /** Tantos apuntados en cada lance de la mano, a la espera de saber para quién son. */
  pending: Record<Lance, number>;
  hand: number;
  events: ScoreEvent[];
  juegos: GameRecord[];
  /** Partidas ganadas por cada pareja desde que se pusieron a cero (sobrevive a «De cero»). */
  partidas: [number, number];
  started: number;
  juegoStarted: number;
  result: Result | null;
  last: string;
  haptics: boolean;
  /** En un móvil en vertical, girar el contador para verlo en horizontal. */
  landscape: boolean;
}

const emptyPending = (): Record<Lance, number> => ({ grande: 0, chica: 0, pares: 0, juego: 0 });

export function fresh(prev?: Tally): Tally {
  const now = Date.now();
  return {
    v: 2,
    names: prev ? [...prev.names] : [...DEFAULT_NAMES],
    target: prev?.target ?? 40,
    toWin: prev?.toWin ?? 2,
    points: [0, 0],
    games: [0, 0],
    pending: emptyPending(),
    hand: 1,
    events: [],
    juegos: [],
    partidas: prev ? [...prev.partidas] : [0, 0],
    started: now,
    juegoStarted: now,
    result: null,
    last: '',
    haptics: prev?.haptics ?? true,
    landscape: prev?.landscape ?? true,
  };
}

export const clone = (t: Tally): Tally => structuredClone(t);

export function isTally(x: unknown): x is Tally {
  const t = x as Tally;
  return !!t && t.v === 2 && Array.isArray(t.points) && Array.isArray(t.games) && Array.isArray(t.names) && !!t.pending;
}

export const juegoNo = (t: Tally) => t.games[0] + t.games[1] + (t.result ? 0 : 1);
export const pendingTotal = (t: Tally) => LANCES.reduce((s, l) => s + t.pending[l], 0);

function win(t: Tally, team: Team, ordago: boolean) {
  t.games[team]++;
  const match = t.games[team] >= t.toWin;
  const score: [number, number] = [t.points[0], t.points[1]];
  t.result = { team, score, match, ordago };
  t.juegos.push({ at: Date.now(), winner: team, score, ms: Date.now() - t.juegoStarted, ordago });
  if (match) t.partidas[team]++;
}

/** Suma tantos a una pareja. Si llega a la meta, gana el juego y lo que sobra no cuenta. */
export function addPoints(prev: Tally, team: Team, n: number, src: Source): Tally {
  const t = clone(prev);
  if (t.result || n <= 0) return t;
  const before = t.points[team];
  t.points[team] = Math.min(t.target, before + n);
  const got = t.points[team] - before;
  t.events.push({ at: Date.now(), team, n: got, src, juego: juegoNo(prev) });
  t.last = src === 'directo' ? `${t.names[team]} +${got}` : `${LANCE_LABEL[src as Lance] ?? SOURCE_LABEL[src]} para ${t.names[team]} · +${got}`;
  if (t.points[team] >= t.target) win(t, team, false);
  return t;
}

export function subPoint(prev: Tally, team: Team): Tally {
  const t = clone(prev);
  if (t.result || t.points[team] === 0) return t;
  t.points[team]--;
  t.events.push({ at: Date.now(), team, n: -1, src: 'directo', juego: juegoNo(prev) });
  t.last = `${t.names[team]} −1`;
  return t;
}

/** Órdago querido y ganado: el juego entero para esa pareja. */
export function ordago(prev: Tally, team: Team): Tally {
  const t = clone(prev);
  if (t.result) return t;
  const got = t.target - t.points[team];
  t.events.push({ at: Date.now(), team, n: got, src: 'ordago', juego: juegoNo(prev) });
  t.points[team] = t.target;
  t.pending = emptyPending();
  t.last = `Órdago para ${t.names[team]}`;
  win(t, team, true);
  return t;
}

export function bumpLance(prev: Tally, lance: Lance, n: number): Tally {
  const t = clone(prev);
  t.pending[lance] = Math.max(0, Math.min(99, t.pending[lance] + n));
  return t;
}

/** Los tantos apuntados en un lance se los lleva una pareja. */
export function sendLance(prev: Tally, lance: Lance, team: Team): Tally {
  const n = prev.pending[lance];
  if (!n || prev.result) return clone(prev);
  const t = addPoints(prev, team, n, lance);
  t.pending[lance] = 0;
  return t;
}

/** Mano terminada: se limpian los lances para la siguiente. */
export function nextHand(prev: Tally): Tally {
  const t = clone(prev);
  t.pending = emptyPending();
  t.hand++;
  t.last = `Mano ${t.hand}`;
  return t;
}

export function rename(prev: Tally, team: Team, name: string): Tally {
  const t = clone(prev);
  t.names[team] = name.trim().slice(0, 18) || DEFAULT_NAMES[team];
  return t;
}

/** Tras ganar un juego: siguiente juego, o partida nueva si ya estaba decidida. */
export function nextGame(prev: Tally): Tally {
  if (!prev.result) return clone(prev);
  if (prev.result.match) return fresh(prev);
  const t = nextHand(prev);
  t.points = [0, 0];
  t.result = null;
  t.juegoStarted = Date.now();
  t.last = `Empieza el juego ${juegoNo(t)}`;
  return t;
}

/** Tantos de cada pareja en la partida, separados por su origen. */
export function breakdown(t: Tally): Record<Source, [number, number]> {
  const out = Object.fromEntries(SOURCES.map((s) => [s, [0, 0]])) as Record<Source, [number, number]>;
  for (const e of t.events) out[e.src][e.team] += e.n;
  return out;
}
