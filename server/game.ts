import { type Action, type Request, type State, type Timing, Engine, Restart } from '../src/game/engine';
import { Viewer } from '../src/game/view';
import * as ai from '../src/game/ai';
import { validAction } from '../src/game/validate';
import { DEFAULT_RULES } from '../src/game/rules';
import { CATCH_CHANCE, type ChatKind, type ChatShow, chatText, senaFor } from '../src/game/chat';
import type { ServerMsg } from '../src/net/ranked-protocol';
import { BOT_RATING, kFactor, teamDelta } from './elo';

/** Tiempo para decidir (el navegador juega lo prudente a los 20 s; aquí, con margen). */
const TURN_MS = 20000 + 6000;
/** Tiempo para pasar a la siguiente mano si nadie pulsa. */
const CONTINUE_MS = 12000;

export interface Conn {
  send(msg: ServerMsg): void;
}

export interface GameSeat {
  /** null: la máquina. */
  uid: string | null;
  name: string;
  rating: number;
  conn: Conn | null;
}

export interface GameResult {
  /** Pareja ganadora (0: asientos 0 y 2; 1: asientos 1 y 3). */
  winner: 0 | 1;
  /** Cambio de rating de cada asiento de persona. */
  deltas: { uid: string; delta: number; won: boolean }[];
}

interface Pending {
  seat: number | null;
  req: Request;
  resolve: (a: Action) => void;
  timer: NodeJS.Timeout;
}

/**
 * Una partida clasificatoria en el servidor: aquí se barajan las cartas y se aplican las reglas,
 * así nadie puede hacer trampas desde su navegador. A cada jugador se le manda su vista de la mesa.
 */
export class Game {
  private engine: Engine;
  private clock: Timing = { scale: 1, paused: false, epoch: 0 };
  private viewers: Viewer[];
  private pending = new Map<number, Pending>();
  private seq = 0;
  private over = false;
  private lastChat = new Map<number, number>();
  private signedHand = -1;

  constructor(
    readonly id: string,
    readonly seats: GameSeat[],
    private games: (uid: string) => number,
    private onEnd: (g: Game, r: GameResult) => void,
    /** Escala de tiempos (1 normal; menos para pruebas). */
    private timeScale = 1,
  ) {
    this.clock.scale = timeScale;
    this.viewers = seats.map((_, i) => new Viewer(i));
    this.engine = new Engine({
      onChange: (s) => this.broadcast(s),
      ask: (seat, req, s) => this.ask(seat, req, s),
      sound: () => {},
      cancel: () => {
        for (const [id, p] of this.pending) {
          clearTimeout(p.timer);
          this.pending.delete(id);
        }
      },
    }, this.clock);
  }

  get finished() {
    return this.over;
  }

  hasPlayer(uid: string) {
    return this.seats.some((s) => s.uid === uid);
  }

  start() {
    this.engine.configure(this.seats.map((s) => s.name), this.seats.map((s) => !s.uid || !s.conn), DEFAULT_RULES);
    for (let i = 0; i < 4; i++) this.sendMatched(i);
    this.engine.run().catch((e) => {
      if (!(e instanceof Restart)) console.error(`[partida ${this.id}]`, e);
    });
  }

  private sendMatched(seat: number) {
    const conn = this.seats[seat].conn;
    if (!conn) return;
    const players = [0, 1, 2, 3].map((i) => {
      const s = this.seats[(i + seat) % 4];
      return { name: s.name, rating: s.uid ? s.rating : null };
    });
    conn.send({ t: 'matched', you: seat, players });
  }

  // ---------- Conexiones ----------

  /** Vuelve un jugador (se había caído o recarga la página). */
  rejoin(uid: string, conn: Conn) {
    const seat = this.seats.findIndex((s) => s.uid === uid);
    if (seat < 0 || this.over) return;
    this.seats[seat].conn = conn;
    this.engine.bots[seat] = false;
    this.sendMatched(seat);
    this.sendState(seat, this.engine.state);
    this.toastAll(`${this.seats[seat].name} ha vuelto`, seat);
    this.speed();
  }

  /** Se va o se cae: juega la máquina por él (y la partida le cuenta igual en el ranking). */
  drop(uid: string) {
    const seat = this.seats.findIndex((s) => s.uid === uid);
    if (seat < 0 || !this.seats[seat].conn) return;
    this.seats[seat].conn = null;
    this.engine.bots[seat] = true;
    for (const [id, p] of this.pending) {
      if (p.seat === seat) this.finish(id, p.req.type === 'continue' ? { kind: 'continue' } : ai.decide(this.engine.state, seat, p.req));
    }
    if (!this.over) this.toastAll(`${this.seats[seat].name} se ha desconectado: juega la máquina por su sitio`, seat);
    this.speed();
  }

  /** Si ya no queda nadie mirando, la máquina termina la partida deprisa. */
  private speed() {
    this.clock.scale = this.seats.some((s) => s.conn) ? this.timeScale : 0.02;
  }

  private toastAll(text: string, except: number) {
    this.seats.forEach((s, i) => i !== except && s.conn?.send({ t: 'toast', text }));
  }

  // ---------- Mesa ----------

  private sendState(seat: number, s: State) {
    this.seats[seat].conn?.send({ t: 'state', s: this.viewers[seat].view(s, this.engine.messageFor(seat)) });
  }

  private broadcast(s: State) {
    if (this.over || s.phase === 'intro') return;
    for (let i = 0; i < 4; i++) this.sendState(i, s);
    this.botSigns(s);
  }

  private ask(seat: number | null, req: Request, s: State): Promise<Action> {
    if (seat === null) {
      if (s.matchWinner !== null) {
        this.end(s);
        return new Promise(() => {});
      }
      // Seguir: vale el primero que pulse, o se sigue solo al rato
      const humans = this.seats.map((x, i) => (x.conn ? i : -1)).filter((i) => i >= 0);
      if (!humans.length) return Promise.resolve({ kind: 'continue' });
      return new Promise((resolve) => {
        const id = ++this.seq;
        const timer = setTimeout(() => this.finish(id, { kind: 'continue' }), CONTINUE_MS);
        this.pending.set(id, { seat: null, req, resolve, timer });
        for (const i of humans) this.seats[i].conn!.send({ t: 'ask', id, req: this.viewers[i].request(req) });
      });
    }
    const conn = this.seats[seat].conn;
    if (!conn) return Promise.resolve(ai.decide(s, seat, req));
    return new Promise((resolve) => {
      const id = ++this.seq;
      const timer = setTimeout(() => this.finish(id, ai.prudent(s, seat, req)), TURN_MS);
      this.pending.set(id, { seat, req, resolve, timer });
      conn.send({ t: 'ask', id, req: this.viewers[seat].request(req) });
    });
  }

  private finish(id: number, a: Action) {
    const p = this.pending.get(id);
    if (!p) return;
    this.pending.delete(id);
    clearTimeout(p.timer);
    p.resolve(a);
    // Si era para seguir, a los demás se les quita el botón
    if (p.seat === null) this.seats.forEach((s) => s.conn?.send({ t: 'cancel' }));
  }

  /** Llega una jugada de un jugador. */
  act(uid: string, id: number, a: Action) {
    const seat = this.seats.findIndex((s) => s.uid === uid);
    const p = this.pending.get(id);
    if (seat < 0 || !p || (p.seat !== null && p.seat !== seat)) return;
    if (p.seat === null) {
      if (a?.kind === 'continue') this.finish(id, a);
      return;
    }
    this.finish(id, validAction(p.req, a, this.engine.state, seat) ? a : ai.prudent(this.engine.state, seat, p.req));
  }

  // ---------- Chat y señas ----------

  chat(uid: string, kind: ChatKind, id: string) {
    const seat = this.seats.findIndex((s) => s.uid === uid);
    if (seat >= 0) this.deliver(seat, kind, id);
  }

  private showTo(v: number, from: number, text: string, show: ChatShow) {
    this.seats[v].conn?.send({ t: 'chat', seat: (from - v + 4) % 4, text, show });
  }

  private deliver(from: number, kind: ChatKind, id: string) {
    const text = kind === 'frase' || kind === 'sena' ? chatText(kind, id) : null;
    const s = this.engine.state;
    if (!text || this.over) return;
    if (kind === 'sena' && (!['deal', 'mus', 'discard', 'lance'].includes(s.phase) || s.reveal)) return;
    const now = Date.now();
    if (now - (this.lastChat.get(from) ?? 0) < 1200) return;
    this.lastChat.set(from, now);
    if (kind === 'frase') {
      for (let v = 0; v < 4; v++) this.showTo(v, from, text, 'frase');
      return;
    }
    this.showTo(from, from, text, 'enviada');
    this.showTo((from + 2) % 4, from, text, 'sena');
    for (const rival of [(from + 1) % 4, (from + 3) % 4]) {
      if (Math.random() >= CATCH_CHANCE) continue;
      this.showTo(rival, from, text, 'pillada');
      this.seats[from].conn?.send({ t: 'toast', text: `¡${this.seats[rival].name} te ha pillado la seña!` });
    }
  }

  /** La máquina también hace señas a su pareja al empezar los lances. */
  private botSigns(s: State) {
    if (s.phase !== 'lance' || s.lance !== 'grande' || s.handNo === this.signedHand) return;
    this.signedHand = s.handNo;
    const hand = s.handNo;
    for (let seat = 0; seat < 4; seat++) {
      if (!this.engine.bots[seat]) continue;
      const sena = senaFor(s.hands[seat]);
      if (!sena || Math.random() > 0.7) continue;
      setTimeout(() => {
        if (this.engine.state.handNo === hand) this.deliver(seat, 'sena', sena);
      }, 500 + Math.random() * 2500);
    }
  }

  // ---------- Final ----------

  private end(s: State) {
    if (this.over) return;
    this.over = true;
    const winner = s.matchWinner as 0 | 1;
    const withBots = this.seats.some((x) => !x.uid);
    const rating = (i: number) => (this.seats[i].uid ? this.seats[i].rating : BOT_RATING);
    const deltas: GameResult['deltas'] = [];
    this.seats.forEach((seat, i) => {
      if (!seat.uid) return;
      const team = i % 2;
      const own = [i, (i + 2) % 4].map(rating);
      const rivals = [(i + 1) % 4, (i + 3) % 4].map(rating);
      const won = team === winner;
      deltas.push({ uid: seat.uid, delta: teamDelta(own, rivals, won, kFactor(this.games(seat.uid), withBots)), won });
    });
    this.onEnd(this, { winner, deltas });
    // Se deja que se vea el final y se para el motor
    setTimeout(() => this.engine.stop(), 1000);
  }

  /** Cierra la partida sin más (apagado del servidor). */
  abort() {
    this.over = true;
    this.engine.stop();
  }
}
