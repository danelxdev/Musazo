import type { Action, Request, State } from '../game/engine';
import type { ChatKind, ChatShow } from '../game/chat';

/** Lo que el servidor cuenta de un jugador. */
export interface Me {
  uid: string;
  name: string;
  rating: number;
  games: number;
  wins: number;
  rank: number | null;
  division: string;
}

export interface Ranked {
  uid: string;
  name: string;
  rating: number;
  games: number;
  wins: number;
}

/** Del navegador al servidor de partidas clasificatorias. */
export type ClientMsg =
  | { t: 'hello'; uid: string; secret: string; name: string }
  | { t: 'queue' }
  | { t: 'unqueue' }
  | { t: 'act'; id: number; a: Action }
  | { t: 'chat'; kind: ChatKind; id: string }
  | { t: 'leave' };

/** Del servidor al navegador. */
export type ServerMsg =
  | { t: 'welcome'; me: Me }
  | { t: 'error'; text: string }
  | { t: 'queue'; waiting: number; seconds: number }
  | { t: 'matched'; you: number; players: { name: string; rating: number | null }[] }
  | { t: 'state'; s: State }
  | { t: 'ask'; id: number; req: Request }
  | { t: 'cancel' }
  | { t: 'toast'; text: string }
  | { t: 'chat'; seat: number; text: string; show: ChatShow }
  | { t: 'result'; won: boolean; before: number; after: number; me: Me };
