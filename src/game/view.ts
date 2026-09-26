import type { Card } from './cards';
import type { Request, State, Team } from './engine';

/**
 * Lo que ve cada jugador: la mesa girada para que él esté siempre abajo (asiento 0, pareja 0)
 * y las cartas de los demás tapadas hasta que se enseñan.
 *
 * Las cartas de los demás llevan un identificador anónimo que se mantiene durante toda la mano
 * (también al enseñarlas), así las animaciones de reparto y descarte funcionan igual
 * sin que el identificador delate la carta.
 */
export class Viewer {
  private tokens = new Map<string, string>();
  private hand = -1;
  private n = 0;

  constructor(public seat: number) {}

  private token(s: State, id: string) {
    if (s.handNo !== this.hand) {
      this.hand = s.handNo;
      this.tokens.clear();
    }
    let t = this.tokens.get(id);
    if (!t) {
      t = `x${s.handNo}-${++this.n}`;
      this.tokens.set(id, t);
    }
    return t;
  }

  view(s: State, message: string): State {
    const v = this.seat;
    const seat = (i: number) => (i - v + 4) % 4;
    const team = (t: Team): Team => ((t + v) % 2) as Team;
    const rot = <T>(arr: T[]) => arr.map((_, i) => arr[(i + v) % 4]);
    const pair = <T>(p: [T, T]): [T, T] => (v % 2 ? [p[1], p[0]] : [p[0], p[1]]);
    const hidden: Card = { id: '', suit: 'oros', rank: 1 };
    const hands = s.hands.map((h, i) =>
      i === v ? h.slice() : h.map((c) => (s.reveal ? { ...c, id: this.token(s, c.id) } : { ...hidden, id: this.token(s, c.id) })),
    );
    return {
      ...s,
      names: rot(s.names),
      hands: rot(hands),
      deck: s.deck.map(() => hidden),
      discards: [],
      bubbles: rot(s.bubbles),
      declared: { pares: rot(s.declared.pares), juego: rot(s.declared.juego) },
      mano: seat(s.mano),
      turn: s.turn === null ? null : seat(s.turn),
      deckSeat: seat(s.deckSeat),
      scores: pair(s.scores),
      games: pair(s.games),
      lastGain: pair(s.lastGain),
      bet: s.bet && { ...s.bet, team: team(s.bet.team) },
      records: s.records.map((r) => ({
        ...r,
        participants: r.participants.map(seat),
        betTeam: r.betTeam === undefined ? undefined : team(r.betTeam),
      })),
      summary: s.summary.map((l) => ({
        ...l,
        team: l.team === null ? null : team(l.team),
        seat: l.seat === undefined ? undefined : seat(l.seat),
      })),
      winner: s.winner === null ? null : team(s.winner),
      matchWinner: s.matchWinner === null ? null : team(s.matchWinner),
      message,
    };
  }

  /** La petición, vista desde el asiento (el envite es de «nosotros» o de «ellos»). */
  request(req: Request): Request {
    if (req.type !== 'respond') return req;
    return { ...req, bet: { ...req.bet, team: ((req.bet.team + this.seat) % 2) as Team } };
  }
}
