export type Suit = 'oros' | 'copas' | 'espadas' | 'bastos';
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10 | 11 | 12;

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
}

export const SUITS: Suit[] = ['oros', 'copas', 'espadas', 'bastos'];
export const RANKS: Rank[] = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

export const RANK_NAMES: Record<Rank, string> = {
  1: 'As', 2: 'Dos', 3: 'Tres', 4: 'Cuatro', 5: 'Cinco', 6: 'Seis', 7: 'Siete',
  10: 'Sota', 11: 'Caballo', 12: 'Rey',
};

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push({ id: `${rank}-${suit}`, suit, rank });
  }
  return deck;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Mus a 8 reyes: los treses son reyes y los doses son ases. */
export function effRank(c: Card): number {
  if (c.rank === 3) return 12;
  if (c.rank === 2) return 1;
  return c.rank;
}

export function points(c: Card): number {
  const r = effRank(c);
  return r >= 10 ? 10 : r;
}
