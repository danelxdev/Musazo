import { type Card, effRank, points } from './cards';

export type Lance = 'grande' | 'chica' | 'pares' | 'juego' | 'punto';

export const LANCE_NAMES: Record<Lance, string> = {
  grande: 'Grande', chica: 'Chica', pares: 'Pares', juego: 'Juego', punto: 'Punto',
};

// Orden de las cartas de menor a mayor (a 8 reyes): As, 4, 5, 6, 7, Sota, Caballo, Rey
const ORDER = [1, 4, 5, 6, 7, 10, 11, 12];
const idx = (c: Card) => ORDER.indexOf(effRank(c));

export function grandeScore(hand: Card[]): number {
  const d = hand.map(idx).sort((a, b) => b - a);
  return d.reduce((acc, v) => acc * 8 + v, 0);
}

export function chicaScore(hand: Card[]): number {
  const d = hand.map(idx).sort((a, b) => a - b);
  return d.reduce((acc, v) => acc * 8 + (7 - v), 0);
}

export type ParesKind = 'none' | 'par' | 'medias' | 'duples';

export interface ParesInfo {
  kind: ParesKind;
  score: number;
  bonus: number;
  /** Rango efectivo principal (para textos). */
  high: number;
  low: number;
}

export function paresInfo(hand: Card[]): ParesInfo {
  const counts = new Map<number, number>();
  for (const c of hand) counts.set(effRank(c), (counts.get(effRank(c)) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const [r1, n1] = groups[0];
  const o = (r: number) => ORDER.indexOf(r);
  if (n1 === 4) return { kind: 'duples', score: 3000 + o(r1) * 10 + o(r1), bonus: 3, high: r1, low: r1 };
  if (n1 === 3) return { kind: 'medias', score: 2000 + o(r1) * 10, bonus: 2, high: r1, low: r1 };
  if (n1 === 2) {
    const second = groups[1];
    if (second && second[1] === 2) {
      const hi = Math.max(r1, second[0]);
      const lo = Math.min(r1, second[0]);
      return { kind: 'duples', score: 3000 + o(hi) * 10 + o(lo), bonus: 3, high: hi, low: lo };
    }
    return { kind: 'par', score: 1000 + o(r1) * 10, bonus: 1, high: r1, low: r1 };
  }
  return { kind: 'none', score: 0, bonus: 0, high: 0, low: 0 };
}

export function handPoints(hand: Card[]): number {
  return hand.reduce((s, c) => s + points(c), 0);
}

const JUEGO_ORDER: Record<number, number> = { 31: 8, 32: 7, 40: 6, 37: 5, 36: 4, 35: 3, 34: 2, 33: 1 };

export function hasJuego(hand: Card[]): boolean {
  return handPoints(hand) >= 31;
}

export function juegoScore(hand: Card[]): number {
  return JUEGO_ORDER[handPoints(hand)] ?? 0;
}

export function juegoBonus(hand: Card[]): number {
  const p = handPoints(hand);
  if (p < 31) return 0;
  return p === 31 ? 3 : 2;
}

export function lanceScore(lance: Lance, hand: Card[]): number {
  switch (lance) {
    case 'grande': return grandeScore(hand);
    case 'chica': return chicaScore(hand);
    case 'pares': return paresInfo(hand).score;
    case 'juego': return juegoScore(hand);
    case 'punto': return handPoints(hand);
  }
}

/** Orden de juego empezando por la mano (sentido antihorario). */
export function seatOrder(mano: number): number[] {
  return [0, 1, 2, 3].map((i) => (mano + i) % 4);
}

/** Devuelve el asiento ganador de un lance; en empate gana el más cercano a la mano. */
export function lanceWinner(lance: Lance, hands: Card[][], mano: number, candidates?: number[]): number {
  let best = -1;
  let bestScore = -Infinity;
  for (const seat of seatOrder(mano)) {
    if (candidates && !candidates.includes(seat)) continue;
    const s = lanceScore(lance, hands[seat]);
    if (s > bestScore) {
      best = seat;
      bestScore = s;
    }
  }
  return best;
}

export function lanceBonus(lance: Lance, hand: Card[]): number {
  if (lance === 'pares') return paresInfo(hand).bonus;
  if (lance === 'juego') return juegoBonus(hand);
  return 0;
}

const RANK_LABEL: Record<number, [string, string]> = {
  1: ['ases', 'as'], 4: ['cuatros', 'cuatro'], 5: ['cincos', 'cinco'], 6: ['seises', 'seis'],
  7: ['sietes', 'siete'], 10: ['sotas', 'sota'], 11: ['caballos', 'caballo'], 12: ['reyes', 'rey'],
};

export function describePares(hand: Card[]): string {
  const p = paresInfo(hand);
  if (p.kind === 'none') return 'Sin pares';
  if (p.kind === 'par') return `Par de ${RANK_LABEL[p.high][0]}`;
  if (p.kind === 'medias') return `Medias de ${RANK_LABEL[p.high][0]}`;
  if (p.high === p.low) return `Duples de ${RANK_LABEL[p.high][0]}`;
  return `Duples ${RANK_LABEL[p.high][0]} y ${RANK_LABEL[p.low][0]}`;
}

export function describeJuego(hand: Card[]): string {
  const p = handPoints(hand);
  return p >= 31 ? `Juego ${p === 31 ? 'de la una (31)' : p}` : `Punto ${p}`;
}
