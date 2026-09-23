import { type Card, RANK_NAMES, RANKS, SUITS, type Suit } from '../game/cards';

const BASE = import.meta.env.BASE_URL;

export const cardSrc = (id: string) => `${BASE}cards/${id}.svg`;

export function cardName(card: Pick<Card, 'rank' | 'suit'>) {
  return `${RANK_NAMES[card.rank]} de ${card.suit}`;
}

/** Cara de carta: papel pintado por CSS y la ilustración SVG encima. */
export function faceHtml(id: string, extraClass = '', style = '') {
  const [rank, suit] = id.split('-');
  const alt = cardName({ rank: Number(rank) as Card['rank'], suit: suit as Suit });
  return `<div class="card face ${extraClass}" style="${style}"><img src="${cardSrc(id)}" alt="${alt}" draggable="false" decoding="async"></div>`;
}

export function backHtml(extraClass = '', style = '') {
  return `<div class="card back ${extraClass}" style="${style}" aria-hidden="true"><i></i></div>`;
}

/** Precarga las 40 cartas para que el reparto no muestre huecos. */
export function preloadCards() {
  for (const s of SUITS) {
    for (const r of RANKS) {
      const img = new Image();
      img.decoding = 'async';
      img.src = cardSrc(`${r}-${s}`);
    }
  }
}
