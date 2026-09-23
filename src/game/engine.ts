import { type Card, createDeck, shuffle } from './cards';
import {
  type Lance, LANCE_NAMES, hasJuego, lanceBonus, lanceWinner, paresInfo, seatOrder,
} from './evaluate';
import * as ai from './ai';

export type Team = 0 | 1;
export const teamOf = (seat: number): Team => (seat % 2) as Team;
export const TEAM_NAMES = ['Nosotros', 'Ellos'] as const;
export const SEAT_NAMES = ['Tú', 'Iñaki', 'Maite', 'Koldo'] as const;
export const HUMAN = 0;
export const WIN_POINTS = 40;
/** La partida es al mejor de 3 juegos: gana quien se lleva 2. */
export const JUEGOS_TO_WIN = 2;

/** Reparte el que está a la izquierda de la mano (el postre). */
export const dealerOf = (mano: number) => (mano + 3) % 4;
function dealMessage(mano: number) {
  const d = dealerOf(mano);
  if (d === HUMAN) return `Repartes tú · es mano ${SEAT_NAMES[mano]}`;
  return `Reparte ${SEAT_NAMES[d]} · ${mano === HUMAN ? 'eres mano' : `es mano ${SEAT_NAMES[mano]}`}`;
}

export type Phase = 'intro' | 'deal' | 'mus' | 'discard' | 'lance' | 'showdown' | 'gameover';

export interface Bet {
  amount: number;
  /** Lo que se lleva quien envida si no se le quiere (el deje). */
  prev: number;
  team: Team;
  ordago: boolean;
}

export type LanceStatus = 'paso' | 'querido' | 'noquerido' | 'sinjugada' | 'nadie' | 'ordago';

export interface LanceRecord {
  lance: Lance;
  status: LanceStatus;
  amount: number;
  betTeam?: Team;
  participants: number[];
}

export interface SummaryLine {
  label: string;
  team: Team | null;
  points: number;
  detail: string;
}

export interface Bubble {
  text: string;
  tone: 'neutral' | 'bet' | 'yes' | 'no' | 'ordago';
}

export type Request =
  | { type: 'mus' }
  | { type: 'discard' }
  | { type: 'open'; lance: Lance }
  | { type: 'respond'; lance: Lance; bet: Bet }
  | { type: 'continue'; label: string };

export type Action =
  | { kind: 'mus' }
  | { kind: 'corto' }
  | { kind: 'discard'; ids: string[] }
  | { kind: 'paso' }
  | { kind: 'envido'; n: number }
  | { kind: 'ordago' }
  | { kind: 'quiero' }
  | { kind: 'noquiero' }
  | { kind: 'continue' };

export interface State {
  phase: Phase;
  handNo: number;
  hands: Card[][];
  deck: Card[];
  discards: Card[];
  mano: number;
  scores: [number, number];
  games: [number, number];
  bubbles: (Bubble | null)[];
  lance: Lance | null;
  bet: Bet | null;
  records: LanceRecord[];
  declared: { pares: (boolean | null)[]; juego: (boolean | null)[] };
  reveal: boolean;
  turn: number | null;
  message: string;
  summary: SummaryLine[];
  winner: Team | null;
  /** Pareja que ha ganado la partida (al mejor de 3 juegos), si ya ha terminado. */
  matchWinner: Team | null;
  /** Puntos apuntados en esta mano (para el marcador animado). */
  lastGain: [number, number];
}

class GameEnd extends Error {}

/** Se lanza para cortar la partida en curso cuando el jugador la reinicia. */
export class Restart extends Error {}

/** Escala de tiempos (0 en simulaciones). */
export const timing = { scale: 1, paused: false, epoch: 0 };

async function sleep(ms: number) {
  const epoch = timing.epoch;
  await new Promise((r) => setTimeout(r, ms * timing.scale));
  // Pausa mientras se leen las reglas
  while (timing.paused && timing.epoch === epoch) await new Promise((r) => setTimeout(r, 150));
  if (timing.epoch !== epoch) throw new Restart();
}

export interface EngineIO {
  onChange(state: State): void;
  ask(req: Request, state: State): Promise<Action>;
  sound(name: 'deal' | 'chip' | 'call' | 'win' | 'ordago'): void;
  /** Cancela la decisión pendiente del jugador (al reiniciar). */
  cancel?(): void;
}

export class Engine {
  state: State;
  botDelay = 900;

  constructor(private io: EngineIO) {
    this.state = {
      phase: 'intro',
      handNo: 0,
      hands: [[], [], [], []],
      deck: [],
      discards: [],
      mano: Math.floor(Math.random() * 4),
      scores: [0, 0],
      games: [0, 0],
      bubbles: [null, null, null, null],
      lance: null,
      bet: null,
      records: [],
      declared: { pares: [null, null, null, null], juego: [null, null, null, null] },
      reveal: false,
      turn: null,
      message: '',
      summary: [],
      winner: null,
      matchWinner: null,
      lastGain: [0, 0],
    };
  }

  private emit() {
    this.io.onChange(this.state);
  }

  private say(seat: number, text: string, tone: Bubble['tone'] = 'neutral') {
    this.state.bubbles[seat] = { text, tone };
    this.io.sound(tone === 'ordago' ? 'ordago' : 'call');
    this.emit();
  }

  private async decide(seat: number, req: Request): Promise<Action> {
    this.state.turn = seat;
    this.emit();
    if (seat === HUMAN) return this.io.ask(req, this.state);
    await sleep(this.botDelay * (0.7 + Math.random() * 0.6));
    return ai.decide(this.state, seat, req);
  }

  async run() {
    for (;;) {
      try {
        await this.playMatch();
      } catch (e) {
        if (!(e instanceof Restart)) throw e;
        this.resetMatch();
      }
    }
  }

  /** Corta la partida en curso y empieza una nueva de cero. */
  restart() {
    timing.epoch++;
    timing.paused = false;
    this.io.cancel?.();
  }

  private resetMatch() {
    const s = this.state;
    s.scores = [0, 0];
    s.games = [0, 0];
    s.winner = null;
    s.matchWinner = null;
    s.lastGain = [0, 0];
    s.records = [];
    s.summary = [];
    s.bubbles = [null, null, null, null];
    s.bet = null;
    s.lance = null;
    s.turn = null;
    s.reveal = false;
    s.mano = Math.floor(Math.random() * 4);
    s.message = 'Nueva partida';
    this.emit();
  }

  /** Una partida: al mejor de 3 juegos de 40 tantos. */
  private async playMatch() {
    {
      this.state.games = [0, 0];
      this.state.matchWinner = null;
      for (;;) {
        this.state.scores = [0, 0];
        this.state.winner = null;
        try {
          for (;;) {
            await this.playHand();
            this.state.mano = (this.state.mano + 1) % 4;
          }
        } catch (e) {
          if (!(e instanceof GameEnd)) throw e;
        }
        const w = this.state.winner!;
        this.state.games[w]++;
        const matchOver = this.state.games[w] >= JUEGOS_TO_WIN;
        if (matchOver) this.state.matchWinner = w;
        this.state.phase = 'gameover';
        this.state.turn = null;
        this.io.sound('win');
        this.emit();
        await this.io.ask({ type: 'continue', label: matchOver ? 'Nueva partida' : 'Siguiente juego' }, this.state);
        this.state.mano = (this.state.mano + 1) % 4;
        if (matchOver) break;
      }
    }
  }

  private addPoints(team: Team, n: number) {
    const s = this.state;
    s.scores[team] = Math.min(WIN_POINTS, s.scores[team] + n);
    s.lastGain[team] += n;
    this.emit();
    if (s.scores[team] >= WIN_POINTS) {
      s.winner = team;
      throw new GameEnd();
    }
  }

  private draw(fallback: Card[]): Card {
    const s = this.state;
    if (s.deck.length === 0) {
      if (s.discards.length > 0) {
        s.deck = shuffle(s.discards);
        s.discards = [];
      } else {
        s.deck = shuffle(fallback.splice(0));
      }
    }
    return s.deck.pop()!;
  }

  private async playHand() {
    const s = this.state;
    s.handNo++;
    s.phase = 'deal';
    s.deck = shuffle(createDeck());
    s.discards = [];
    s.hands = [[], [], [], []];
    s.records = [];
    s.summary = [];
    s.reveal = false;
    s.bet = null;
    s.lance = null;
    s.turn = null;
    s.lastGain = [0, 0];
    s.declared = { pares: [null, null, null, null], juego: [null, null, null, null] };
    s.bubbles = [null, null, null, null];
    s.message = dealMessage(s.mano);
    this.emit();
    // Tiempo para recoger las cartas, llevar el mazo al que reparte y barajar
    await sleep(s.handNo === 1 ? 1100 : 1950);

    for (let round = 0; round < 4; round++) {
      for (const seat of seatOrder(s.mano)) {
        s.hands[seat].push(s.deck.pop()!);
        this.io.sound('deal');
        this.emit();
        await sleep(70);
      }
    }
    await sleep(400);

    await this.musPhase();

    const lances: Lance[] = ['grande', 'chica', 'pares', 'juego'];
    for (const l of lances) await this.playLance(l);

    await this.showdown();
  }

  private async musPhase() {
    const s = this.state;
    for (;;) {
      s.phase = 'mus';
      s.message = '¿Mus?';
      s.bubbles = [null, null, null, null];
      this.emit();
      let cut = false;
      for (const seat of seatOrder(s.mano)) {
        const a = await this.decide(seat, { type: 'mus' });
        if (a.kind === 'corto') {
          this.say(seat, 'No hay mus', 'no');
          cut = true;
          break;
        }
        this.say(seat, 'Mus', 'yes');
      }
      s.turn = null;
      if (cut) {
        await sleep(900);
        return;
      }
      await sleep(600);

      s.phase = 'discard';
      s.message = 'Descartes';
      this.emit();
      const roundDiscards: Card[][] = [[], [], [], []];
      for (const seat of seatOrder(s.mano)) {
        const a = await this.decide(seat, { type: 'discard' });
        const ids = a.kind === 'discard' ? a.ids : [];
        const out = s.hands[seat].filter((c) => ids.includes(c.id));
        s.hands[seat] = s.hands[seat].filter((c) => !ids.includes(c.id));
        roundDiscards[seat] = out;
        this.say(seat, `${out.length} ${out.length === 1 ? 'carta' : 'cartas'}`, 'neutral');
      }
      s.turn = null;
      await sleep(300);
      s.message = dealerOf(s.mano) === HUMAN ? 'Das cartas tú' : `Da cartas ${SEAT_NAMES[dealerOf(s.mano)]}`;
      this.emit();
      await sleep(350);
      const pool = roundDiscards.flat();
      for (const seat of seatOrder(s.mano)) {
        for (let i = 0; i < roundDiscards[seat].length; i++) {
          s.hands[seat].push(this.draw(pool));
          this.io.sound('deal');
          this.emit();
          await sleep(80);
        }
      }
      s.discards.push(...pool);
      await sleep(500);
    }
  }

  private async declare(kind: 'pares' | 'juego') {
    const s = this.state;
    s.bubbles = [null, null, null, null];
    for (const seat of seatOrder(s.mano)) {
      const has = kind === 'pares' ? paresInfo(s.hands[seat]).kind !== 'none' : hasJuego(s.hands[seat]);
      s.declared[kind][seat] = has;
      s.turn = seat;
      this.say(seat, has ? `${kind === 'pares' ? 'Pares' : 'Juego'} sí` : 'No', has ? 'yes' : 'no');
      await sleep(seat === HUMAN ? 450 : 650);
    }
    s.turn = null;
    await sleep(500);
  }

  private async playLance(initial: Lance) {
    const s = this.state;
    let lance = initial;
    s.phase = 'lance';
    s.lance = lance;
    s.bet = null;
    s.bubbles = [null, null, null, null];
    s.message = LANCE_NAMES[lance];
    this.emit();
    await sleep(500);

    let participants = [0, 1, 2, 3];
    if (lance === 'pares' || lance === 'juego') {
      await this.declare(lance);
      participants = participants.filter((p) => s.declared[lance as 'pares' | 'juego'][p]);
      if (lance === 'juego' && participants.length === 0) {
        lance = 'punto';
        s.lance = lance;
        s.message = 'Nadie tiene juego · se juega al Punto';
        participants = [0, 1, 2, 3];
        s.bubbles = [null, null, null, null];
        this.emit();
        await sleep(900);
      } else {
        const teams = new Set(participants.map(teamOf));
        if (teams.size < 2) {
          s.records.push({ lance, status: participants.length ? 'sinjugada' : 'nadie', amount: 0, participants });
          s.message = participants.length
            ? `${LANCE_NAMES[lance]}: solo ${TEAM_NAMES[teamOf(participants[0])].toLowerCase()} · no se juega`
            : `Nadie tiene ${lance}`;
          this.emit();
          await sleep(1200);
          return;
        }
        s.bubbles = [null, null, null, null];
        this.emit();
      }
    }

    const order = seatOrder(s.mano).filter((p) => participants.includes(p));
    let bet: Bet | null = null;
    for (const seat of order) {
      const a = await this.decide(seat, { type: 'open', lance });
      if (a.kind === 'envido') {
        bet = { amount: a.n, prev: 1, team: teamOf(seat), ordago: false };
        this.say(seat, a.n === 2 ? 'Envido' : `Envido ${a.n}`, 'bet');
        break;
      }
      if (a.kind === 'ordago') {
        bet = { amount: 0, prev: 1, team: teamOf(seat), ordago: true };
        this.say(seat, '¡Órdago!', 'ordago');
        break;
      }
      this.say(seat, 'Paso', 'neutral');
    }
    s.bet = bet;
    this.emit();

    if (!bet) {
      s.turn = null;
      s.records.push({ lance, status: 'paso', amount: 1, participants });
      s.message = `${LANCE_NAMES[lance]} en paso`;
      this.emit();
      await sleep(900);
      return;
    }

    for (;;) {
      const responders = order.filter((p) => teamOf(p) !== bet!.team);
      let raised = false;
      let accepted = false;
      for (const seat of responders) {
        const a = await this.decide(seat, { type: 'respond', lance, bet });
        if (a.kind === 'quiero') {
          this.say(seat, 'Quiero', 'yes');
          accepted = true;
          break;
        }
        if (a.kind === 'envido' && !bet.ordago) {
          bet = { amount: bet.amount + a.n, prev: bet.amount, team: teamOf(seat), ordago: false };
          this.say(seat, `${a.n} más`, 'bet');
          raised = true;
          break;
        }
        if (a.kind === 'ordago' && !bet.ordago) {
          bet = { amount: 0, prev: bet.amount, team: teamOf(seat), ordago: true };
          this.say(seat, '¡Órdago!', 'ordago');
          raised = true;
          break;
        }
        this.say(seat, 'No quiero', 'no');
      }
      s.bet = bet;
      this.emit();
      if (raised) continue;
      s.turn = null;

      if (accepted) {
        if (bet.ordago) {
          await this.resolveOrdago(lance, participants);
          return;
        }
        s.records.push({ lance, status: 'querido', amount: bet.amount, betTeam: bet.team, participants });
        s.message = `${LANCE_NAMES[lance]}: ${bet.amount} queridos`;
        this.emit();
        await sleep(1000);
        return;
      }

      s.records.push({ lance, status: 'noquerido', amount: bet.prev, betTeam: bet.team, participants });
      s.message = `${bet.team === 0 ? 'Nos llevamos' : 'Se llevan'} ${bet.prev} de deje`;
      this.emit();
      await sleep(700);
      this.addPoints(bet.team, bet.prev);
      await sleep(700);
      return;
    }
  }

  private async resolveOrdago(lance: Lance, participants: number[]) {
    const s = this.state;
    s.reveal = true;
    s.phase = 'showdown';
    const w = lanceWinner(lance, s.hands, s.mano, participants);
    s.records.push({ lance, status: 'ordago', amount: 0, participants });
    s.summary = [{
      label: `Órdago a ${LANCE_NAMES[lance].toLowerCase()}`,
      team: teamOf(w),
      points: WIN_POINTS,
      detail: `Gana ${SEAT_NAMES[w]}`,
    }];
    s.message = '¡Órdago querido! Se enseñan las cartas';
    this.emit();
    await sleep(2200);
    s.scores[teamOf(w)] = WIN_POINTS;
    s.winner = teamOf(w);
    this.emit();
    throw new GameEnd();
  }

  private teamBonus(lance: Lance, team: Team, participants: number[]): number {
    return participants
      .filter((p) => teamOf(p) === team)
      .reduce((sum, p) => sum + lanceBonus(lance, this.state.hands[p]), 0);
  }

  private async showdown() {
    const s = this.state;
    s.phase = 'showdown';
    s.lance = null;
    s.bet = null;
    s.turn = null;
    s.reveal = true;
    s.bubbles = [null, null, null, null];
    s.message = 'Se ven las cartas';
    this.emit();
    await sleep(900);

    for (const r of s.records) {
      const name = LANCE_NAMES[r.lance];
      let team: Team | null = null;
      let pts = 0;
      let detail = '';
      const winnerSeat = r.participants.length ? lanceWinner(r.lance, s.hands, s.mano, r.participants) : -1;
      const hasBonus = r.lance === 'pares' || r.lance === 'juego';
      const punto = r.lance === 'punto' ? 1 : 0;

      switch (r.status) {
        case 'nadie':
          detail = 'Nadie';
          break;
        case 'paso':
          team = teamOf(winnerSeat);
          if (hasBonus) {
            pts = this.teamBonus(r.lance, team, r.participants);
            detail = 'En paso';
          } else {
            pts = 1;
            detail = 'En paso';
          }
          break;
        case 'querido':
          team = teamOf(winnerSeat);
          pts = r.amount + punto + (hasBonus ? this.teamBonus(r.lance, team, r.participants) : 0);
          detail = `${r.amount} queridos`;
          break;
        case 'noquerido':
          team = r.betTeam!;
          pts = punto + (hasBonus ? this.teamBonus(r.lance, team, r.participants) : 0);
          detail = `Deje de ${r.amount} ya apuntado`;
          break;
        case 'sinjugada':
          team = teamOf(r.participants[0]);
          pts = this.teamBonus(r.lance, team, r.participants);
          detail = 'Solo una pareja';
          break;
        default:
          break;
      }
      if (hasBonus && team !== null && r.status !== 'nadie') {
        const extra = this.teamBonus(r.lance, team, r.participants);
        if (extra > 0) detail += ` · +${extra} de ${r.lance === 'pares' ? 'pares' : 'juego'}`;
      }
      if (winnerSeat >= 0 && r.status !== 'noquerido' && r.status !== 'sinjugada') detail += ` · ${SEAT_NAMES[winnerSeat]}`;
      s.summary.push({ label: name, team, points: pts, detail });
      this.emit();
      await sleep(550);
      if (team !== null && pts > 0) this.addPoints(team, pts);
    }

    s.message = '';
    this.emit();
    await this.io.ask({ type: 'continue', label: 'Siguiente mano' }, s);
  }
}
