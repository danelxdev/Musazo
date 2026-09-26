import type { Card } from './cards';
import { effRank } from './cards';
import { handPoints, paresInfo } from './evaluate';

/** Frases hechas: las ve toda la mesa. */
export const PHRASES = [
  { id: 'aupa', text: '¡Aupa!' },
  { id: 'buena', text: '¡Buena!' },
  { id: 'bien', text: 'Bien jugado' },
  { id: 'suerte', text: '¡Qué suerte!' },
  { id: 'venga', text: '¡Venga, que se puede!' },
  { id: 'vaya', text: 'Vaya mano…' },
  { id: 'uff', text: 'Uff…' },
  { id: 'jaja', text: '¡Jajaja!' },
] as const;

/**
 * Señas del mus: solo para la pareja, pero los rivales pueden pillarlas.
 * Cada una con el gesto de la mesa (en emoji) y lo que quiere decir.
 */
export const SENAS = [
  { id: 'duples', icon: '😬', text: 'Duples' },
  { id: 'medias', icon: '😏', text: 'Medias' },
  { id: '31', icon: '😉', text: 'La 31' },
  { id: 'reyes', icon: '😗', text: 'Dos reyes' },
  { id: 'ases', icon: '😛', text: 'Dos ases' },
  { id: 'ciego', icon: '😑', text: 'No llevo nada' },
] as const;

export type ChatKind = 'frase' | 'sena';
/** Cómo lo ve cada uno: frase para todos, seña para la pareja, seña enviada (el que la hace), seña pillada (un rival). */
export type ChatShow = 'frase' | 'sena' | 'enviada' | 'pillada';

/** Probabilidad de que un rival pille una seña (parecido a otras apps de mus: pasa, pero poco). */
export const CATCH_CHANCE = 0.15;

export function chatText(kind: ChatKind, id: string): string | null {
  if (kind === 'frase') return PHRASES.find((p) => p.id === id)?.text ?? null;
  const s = SENAS.find((x) => x.id === id);
  return s ? `${s.icon} ${s.text}` : null;
}

/**
 * Señas que se pueden hacer con estas cartas. Como en el reglamento, solo se hace
 * la seña de lo que de verdad se lleva (no se puede mentir).
 */
export function validSenas(hand: Card[]): string[] {
  if (hand.length !== 4) return [];
  const p = paresInfo(hand);
  const pts = handPoints(hand);
  const reyes = hand.filter((c) => effRank(c) === 12).length;
  const ases = hand.filter((c) => effRank(c) === 1).length;
  const out: string[] = [];
  if (p.kind === 'duples') out.push('duples');
  if (p.kind === 'medias') out.push('medias');
  if (pts === 31) out.push('31');
  if (reyes >= 2) out.push('reyes');
  if (ases >= 2) out.push('ases');
  // Ciego: ni pares ni juego
  if (p.kind === 'none' && pts < 31) out.push('ciego');
  return out;
}

export const senaValid = (hand: Card[], id: string) => validSenas(hand).includes(id);

/** La seña que haría un buen compañero con estas cartas (o ninguna si no merece la pena). */
export function senaFor(hand: Card[]): string | null {
  const valid = validSenas(hand);
  const best = ['duples', 'medias', '31', 'reyes', 'ases'].find((id) => valid.includes(id));
  if (best) return best;
  return valid.includes('ciego') && Math.random() < 0.3 ? 'ciego' : null;
}
