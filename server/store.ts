import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { START_RATING } from './elo';

/**
 * Jugadores y ranking. Se guarda en un JSON en disco (DATA_DIR): suficiente para empezar.
 * Para crecer, se cambia esta clase por una base de datos (Supabase, Postgres…) sin tocar el resto.
 */
export interface Player {
  uid: string;
  secret: string;
  name: string;
  rating: number;
  games: number;
  wins: number;
  created: number;
  seen: number;
}

export interface PublicPlayer {
  uid: string;
  name: string;
  rating: number;
  games: number;
  wins: number;
}

const hash = (s: string) => createHash('sha256').update(s).digest('hex');

export class Store {
  private players = new Map<string, Player>();
  private file: string;
  private timer: NodeJS.Timeout | null = null;

  constructor(dir: string) {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, 'players.json');
    try {
      const list = JSON.parse(readFileSync(this.file, 'utf8')) as Player[];
      for (const p of list) this.players.set(p.uid, p);
    } catch {
      /* primera vez: sin datos */
    }
  }

  /** Entra (o se registra) un jugador. Su identidad es un id y un secreto que guarda su navegador. */
  login(uid: string, secret: string, name: string): Player | null {
    if (!/^[a-z0-9]{8,40}$/i.test(uid) || typeof secret !== 'string' || secret.length < 16 || secret.length > 100) return null;
    const h = hash(secret);
    let p = this.players.get(uid);
    if (p) {
      const a = Buffer.from(p.secret, 'hex');
      const b = Buffer.from(h, 'hex');
      if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
      if (name) p.name = name;
    } else {
      p = { uid, secret: h, name: name || 'Jugador', rating: START_RATING, games: 0, wins: 0, created: Date.now(), seen: Date.now() };
      this.players.set(uid, p);
    }
    p.seen = Date.now();
    this.save();
    return p;
  }

  get(uid: string) {
    return this.players.get(uid);
  }

  update(uid: string, fn: (p: Player) => void) {
    const p = this.players.get(uid);
    if (!p) return;
    fn(p);
    this.save();
  }

  static public(p: Player): PublicPlayer {
    return { uid: p.uid, name: p.name, rating: p.rating, games: p.games, wins: p.wins };
  }

  /** Los mejores (solo quien ha jugado alguna partida). */
  top(n = 50): PublicPlayer[] {
    return [...this.players.values()]
      .filter((p) => p.games > 0)
      .sort((a, b) => b.rating - a.rating || b.wins - a.wins)
      .slice(0, n)
      .map(Store.public);
  }

  /** Puesto en el ranking (1 = el primero), o null si aún no ha jugado. */
  rank(uid: string): number | null {
    const p = this.players.get(uid);
    if (!p || !p.games) return null;
    let r = 1;
    for (const q of this.players.values()) if (q.games > 0 && (q.rating > p.rating || (q.rating === p.rating && q.wins > p.wins))) r++;
    return r;
  }

  /** Guarda en disco, agrupando los cambios (como mucho una escritura por segundo). */
  private save() {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), 1000);
  }

  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify([...this.players.values()]));
    renameSync(tmp, this.file);
  }
}
