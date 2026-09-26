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

/** Probabilidad de que un rival pille una seña. */
export const CATCH_CHANCE = 0.25;

export function chatText(kind: ChatKind, id: string): string | null {
  if (kind === 'frase') return PHRASES.find((p) => p.id === id)?.text ?? null;
  const s = SENAS.find((x) => x.id === id);
  return s ? `${s.icon} ${s.text}` : null;
}

/** La seña que haría un buen compañero con estas cartas (o ninguna si no merece la pena). */
export function senaFor(hand: Card[]): string | null {
  if (hand.length !== 4) return null;
  const p = paresInfo(hand);
  if (p.kind === 'duples') return 'duples';
  if (p.kind === 'medias') return 'medias';
  if (handPoints(hand) === 31) return '31';
  const reyes = hand.filter((c) => effRank(c) === 12).length;
  const ases = hand.filter((c) => effRank(c) === 1).length;
  if (reyes >= 2) return 'reyes';
  if (ases >= 2) return 'ases';
  return Math.random() < 0.25 ? 'ciego' : null;
}
