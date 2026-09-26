import { type Card, createDeck, effRank } from './cards';
import { type Lance, handPoints, hasJuego, lanceWinner, paresInfo, seatOrder } from './evaluate';
import type { Action, Request, State } from './engine';

const teamOf = (seat: number) => seat % 2;

/**
 * Probabilidad (Monte Carlo) de que la pareja de `seat` gane el lance,
 * condicionada a lo que el resto ha declarado en pares y juego.
 */
export function estimate(state: State, seat: number, lance: Lance, samples = 350): number {
  const own = state.hands[seat];
  const ownIds = new Set(own.map((c) => c.id));
  const pool = createDeck().filter((c) => !ownIds.has(c.id));
  const others = [0, 1, 2, 3].filter((s) => s !== seat);
  let wins = 0;
  let n = 0;
  for (let tries = 0; n < samples && tries < samples * 12; tries++) {
    // Muestreo parcial de 12 cartas
    for (let i = 0; i < 12; i++) {
      const j = i + Math.floor(Math.random() * (pool.length - i));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const hands: Card[][] = [[], [], [], []];
    hands[seat] = own;
    others.forEach((s, k) => { hands[s] = pool.slice(k * 4, k * 4 + 4); });

    let ok = true;
    for (const s of others) {
      const dp = state.declared.pares[s];
      const dj = state.declared.juego[s];
      if (dp !== null && dp !== (paresInfo(hands[s]).kind !== 'none')) { ok = false; break; }
      if (dj !== null && dj !== hasJuego(hands[s])) { ok = false; break; }
    }
    if (!ok) continue;

    let participants: number[] | undefined;
    if (lance === 'pares') participants = [0, 1, 2, 3].filter((s) => paresInfo(hands[s]).kind !== 'none');
    if (lance === 'juego') participants = [0, 1, 2, 3].filter((s) => hasJuego(hands[s]));
    if (participants && participants.length === 0) continue;
    const w = lanceWinner(lance, hands, state.mano, participants);
    if (teamOf(w) === teamOf(seat)) wins++;
    n++;
  }
  return n ? wins / n : 0.5;
}

function musStrength(hand: Card[]): number {
  const p = paresInfo(hand);
  const pts = handPoints(hand);
  const reyes = hand.filter((c) => effRank(c) === 12).length;
  const ases = hand.filter((c) => effRank(c) === 1).length;
  let s = 0;
  if (p.kind === 'duples') s += 3;
  else if (p.kind === 'medias') s += p.high >= 10 ? 2.5 : 2;
  else if (p.kind === 'par' && p.high === 12) s += 1;
  if (pts === 31) s += 2.5;
  else if (pts === 32) s += 1.5;
  else if (pts >= 33) s += 0.5;
  if (reyes >= 3) s += 1.5;
  else if (reyes === 2) s += 1;
  if (ases >= 3) s += 1;
  return s;
}

function chooseDiscard(hand: Card[]): string[] {
  const counts = new Map<number, number>();
  for (const c of hand) counts.set(effRank(c), (counts.get(effRank(c)) ?? 0) + 1);
  const reyes = counts.get(12) ?? 0;
  const ases = counts.get(1) ?? 0;
  const chicaMode = ases >= 2 && reyes === 0;
  const priority = (c: Card) => {
    const r = effRank(c);
    let p = 0;
    if ((counts.get(r) ?? 0) >= 2) p += 10 + r / 10;
    if (r === 12) p += 8;
    if (chicaMode && r === 1) p += 7;
    if (chicaMode && r === 4) p += 3;
    if (r === 11) p += 1;
    return p;
  };
  const sorted = hand.slice().sort((a, b) => priority(a) - priority(b));
  let out = sorted.filter((c) => priority(c) < 5);
  if (out.length === 0) out = [sorted[0]];
  return out.map((c) => c.id);
}

export function decide(state: State, seat: number, req: Request): Action {
  const hand = state.hands[seat];
  const r = Math.random();
  const us = state.scores[teamOf(seat)];
  const them = state.scores[1 - teamOf(seat)];

  switch (req.type) {
    case 'mus':
      return musStrength(hand) + (Math.random() - 0.5) >= 3 ? { kind: 'corto' } : { kind: 'mus' };

    case 'discard':
      return { kind: 'discard', ids: chooseDiscard(hand) };

    case 'open': {
      const p = estimate(state, seat, req.lance);
      const isPostre = seatOrder(state.mano)[3] === seat;
      if (p > 0.93 && (r < 0.08 || them >= 35)) return { kind: 'ordago' };
      if (p > 0.86) return { kind: 'envido', n: r < 0.3 ? 5 : 2 };
      if (p > (isPostre ? 0.66 : 0.74)) return { kind: 'envido', n: 2 };
      if (r < 0.05) return { kind: 'envido', n: 2 };
      return { kind: 'paso' };
    }

    case 'respond': {
      // Si el rival envida, algo tendrá: desconfiamos un poco.
      const p = estimate(state, seat, req.lance) - 0.08;
      const { bet } = req;
      if (bet.ordago) {
        if (p > 0.74 || (them >= 32 && p > 0.5) || (them - us >= 20 && p > 0.6)) return { kind: 'quiero' };
        return { kind: 'noquiero' };
      }
      if (p > 0.9 && r < 0.08) return { kind: 'ordago' };
      if (p > 0.8 && bet.amount < 8) return { kind: 'envido', n: 2 };
      if (p > 0.56 || (bet.amount <= 2 && p > 0.46)) return { kind: 'quiero' };
      return { kind: 'noquiero' };
    }

    case 'continue':
      return { kind: 'continue' };
  }
}

/** Se acabó el tiempo para decidir: se juega lo más prudente (y los descartes, como la máquina). */
export function prudent(state: State, seat: number, req: Request): Action {
  switch (req.type) {
    case 'mus':
      return { kind: 'corto' };
    case 'discard':
      return decide(state, seat, req);
    case 'open':
      return { kind: 'paso' };
    case 'respond':
      return { kind: 'noquiero' };
    default:
      return { kind: 'continue' };
  }
}
