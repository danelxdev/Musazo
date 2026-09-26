import Peer, { type DataConnection } from 'peerjs';
import { SEAT_NAMES } from '../game/engine';
import type { Rules } from '../game/rules';
import {
  type GuestMsg, type HostMsg, type LobbyInfo, type Mode, type SeatInfo, LOST_MS, PING_MS, peerOptions, cleanName, newCode, peerId,
} from './protocol';

interface Link {
  conn: DataConnection;
  cid: string;
  name: string;
  seat: number | null;
  lastSeen: number;
}

/** En qué orden se ocupan los sitios de los invitados según la modalidad. */
const GUEST_SEATS: Record<Mode, number[]> = {
  equipo: [2],
  solo: [1],
  custom: [2, 1, 3],
};

const BOT_NAMES = ['Amaia', 'Iñaki', 'Maite', 'Koldo', 'Ane', 'Josu', 'Nerea', 'Unai'];

/**
 * El anfitrión: crea la sala, recibe a los invitados y les da sitio.
 * La partida se juega en su navegador; a los demás se les mandan las jugadas.
 */
export class Host {
  lobby: LobbyInfo;
  private peer: Peer | null = null;
  private links = new Set<Link>();
  /** Quién es el dueño de cada asiento (para volver a él si se corta). */
  private owners: (string | null)[] = [null, null, null, null];
  private pinger = 0;
  private closed = false;

  onLobby: ((l: LobbyInfo) => void) | null = null;
  onStatus: ((status: 'connecting' | 'ready' | 'error', text?: string) => void) | null = null;
  /** Un invitado se ha ido en plena partida (juega la máquina) o ha vuelto. */
  onAway: ((seat: number, away: boolean) => void) | null = null;
  /** Llega a la partida alguien nuevo a un sitio que jugaba la máquina. */
  onJoinPlaying: ((seat: number) => void) | null = null;
  onAct: ((seat: number, id: number, a: Extract<GuestMsg, { t: 'act' }>['a']) => void) | null = null;
  /** Un invitado manda una frase o una seña. */
  onChat: ((seat: number, kind: string, id: string) => void) | null = null;

  constructor(mode: Mode, hostName: string, rules: Rules) {
    const seats: SeatInfo[] = [0, 1, 2, 3].map((i) => {
      if (i === 0) return { name: hostName, kind: 'host', forGuest: false };
      if (GUEST_SEATS[mode].includes(i)) return { name: '', kind: 'open', forGuest: true };
      return { name: SEAT_NAMES[i], kind: 'bot', forGuest: false };
    });
    this.lobby = { mode, rules: { ...rules }, code: '', seats, playing: false };
  }

  get localSeat() {
    return this.lobby.seats.findIndex((s) => s.kind === 'host');
  }

  /** Crea la sala en el servidor de enlace (con otro código si ese ya está cogido). */
  open(tries = 0) {
    this.onStatus?.('connecting');
    const code = newCode();
    const peer = new Peer(peerId(code), peerOptions());
    this.peer = peer;
    peer.on('open', () => {
      if (this.closed) return;
      this.lobby.code = code;
      this.onStatus?.('ready');
      this.changed();
    });
    peer.on('connection', (conn) => this.accept(conn));
    peer.on('disconnected', () => {
      // Se ha caído el enlace con el servidor: las conexiones ya hechas siguen, pero hace falta para que entren más
      if (!this.closed && !peer.destroyed) peer.reconnect();
    });
    peer.on('error', (err) => {
      if (this.closed) return;
      const type = (err as { type?: string }).type;
      if (type === 'unavailable-id' && tries < 4) {
        peer.destroy();
        this.open(tries + 1);
        return;
      }
      if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') {
        if (this.lobby.code) return; // ya había sala: se reintenta sola
        this.onStatus?.('error', 'No se ha podido crear la sala. Comprueba la conexión a internet y vuelve a intentarlo.');
        return;
      }
      if (type === 'browser-incompatible') {
        this.onStatus?.('error', 'Este navegador no permite jugar en línea.');
      }
    });
    window.clearInterval(this.pinger);
    this.pinger = window.setInterval(() => this.heartbeat(), PING_MS);
  }

  close(reason = 'El anfitrión ha cerrado la sala') {
    if (this.closed) return;
    this.closed = true;
    window.clearInterval(this.pinger);
    for (const l of this.links) {
      this.post(l, { t: 'closed', reason });
    }
    // Un momento para que salga el aviso antes de cortar
    const peer = this.peer;
    window.setTimeout(() => peer?.destroy(), 400);
  }

  private post(l: Link, msg: HostMsg) {
    try {
      if (l.conn.open) l.conn.send(msg);
    } catch {
      /* conexión rota: se detecta con el latido */
    }
  }

  sendTo(seat: number, msg: HostMsg) {
    for (const l of this.links) if (l.seat === seat) this.post(l, msg);
  }

  broadcast(msg: HostMsg) {
    for (const l of this.links) if (l.seat !== null) this.post(l, msg);
  }

  /** Asientos que juega alguien conectado ahora mismo desde otro navegador. */
  remoteSeats() {
    return [...this.links].filter((l) => l.seat !== null).map((l) => l.seat!);
  }

  private changed() {
    this.onLobby?.(this.lobby);
    for (const l of this.links) if (l.seat !== null) this.post(l, { t: 'lobby', lobby: this.lobby, you: l.seat });
  }

  private accept(conn: DataConnection) {
    const link: Link = { conn, cid: '', name: '', seat: null, lastSeen: performance.now() };
    conn.on('data', (raw) => {
      link.lastSeen = performance.now();
      const msg = raw as GuestMsg;
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'hello') this.hello(link, String(msg.name ?? ''), String(msg.cid ?? ''));
      else if (msg.t === 'act' && link.seat !== null) this.onAct?.(link.seat, msg.id, msg.a);
      else if (msg.t === 'bye') this.drop(link);
      else if (msg.t === 'chat' && link.seat !== null) this.onChat?.(link.seat, String(msg.kind), String(msg.id));
    });
    conn.on('close', () => this.drop(link));
    conn.on('error', () => this.drop(link));
  }

  private hello(link: Link, rawName: string, cid: string) {
    if (link.seat !== null) return;
    link.cid = cid;
    link.name = cleanName(rawName) || 'Invitado';
    const seats = this.lobby.seats;
    // ¿Vuelve alguien que ya tenía sitio?
    let seat = this.owners.findIndex((o) => o === cid);
    if (seat >= 0) {
      for (const other of this.links) if (other !== link && other.seat === seat) this.forget(other);
    } else if (!this.lobby.playing) {
      seat = GUEST_SEATS[this.lobby.mode].find((i) => seats[i].kind === 'open') ?? -1;
    } else {
      // Ya se está jugando: puede coger un sitio de invitado que esté jugando la máquina
      seat = seats.findIndex((s, i) => s.forGuest && s.kind === 'bot' && !this.owners[i]);
    }
    if (seat < 0) {
      this.post(link, { t: 'closed', reason: this.lobby.playing ? 'La partida ya ha empezado y no quedan sitios libres.' : 'La sala está completa.' });
      window.setTimeout(() => link.conn.close(), 400);
      return;
    }
    const wasBot = seats[seat].kind === 'bot';
    const wasAway = seats[seat].away;
    link.seat = seat;
    this.links.add(link);
    this.owners[seat] = cid;
    seats[seat] = { ...seats[seat], name: this.uniqueName(link.name, seat), kind: 'guest', away: false };
    this.changed();
    if (this.lobby.playing) {
      if (wasAway) this.onAway?.(seat, false);
      else if (wasBot) this.onJoinPlaying?.(seat);
    }
  }

  /** Dos jugadores con el mismo nombre se distinguen con un número. */
  private uniqueName(name: string, seat: number) {
    const taken = new Set(this.lobby.seats.filter((s, i) => i !== seat && s.kind !== 'open').map((s) => s.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let n = 2; ; n++) if (!taken.has(`${name} ${n}`.toLowerCase())) return `${name} ${n}`;
  }

  /** Se olvida la conexión sin tocar el asiento (la ha sustituido otra del mismo jugador). */
  private forget(link: Link) {
    link.seat = null;
    this.links.delete(link);
    try {
      link.conn.close();
    } catch {
      /* ya estaba cerrada */
    }
  }

  private drop(link: Link) {
    if (!this.links.has(link)) return;
    this.links.delete(link);
    const seat = link.seat;
    link.seat = null;
    try {
      link.conn.close();
    } catch {
      /* ya estaba cerrada */
    }
    if (seat === null || this.closed) return;
    const s = this.lobby.seats[seat];
    if (this.lobby.playing) {
      this.lobby.seats[seat] = { ...s, away: true };
      this.changed();
      this.onAway?.(seat, true);
    } else {
      this.owners[seat] = null;
      this.lobby.seats[seat] = { name: '', kind: 'open', forGuest: true };
      this.changed();
    }
  }

  private heartbeat() {
    const now = performance.now();
    for (const l of [...this.links]) {
      if (now - l.lastSeen > LOST_MS) this.drop(l);
      else this.post(l, { t: 'ping' });
    }
  }

  /** Cambia las reglas antes de empezar (las ven todos en la sala). */
  setRules(rules: Rules) {
    if (this.lobby.playing) return;
    this.lobby.rules = { ...rules };
    this.changed();
  }

  /** Personalizado: cambia de sitio a dos jugadores (o a un jugador con un hueco). */
  swap(a: number, b: number) {
    if (this.lobby.playing || a === b) return;
    const seats = this.lobby.seats;
    [seats[a], seats[b]] = [seats[b], seats[a]];
    [this.owners[a], this.owners[b]] = [this.owners[b], this.owners[a]];
    for (const l of this.links) {
      if (l.seat === a) l.seat = b;
      else if (l.seat === b) l.seat = a;
    }
    this.changed();
  }

  /** Empieza la partida: los huecos los juega la máquina. Devuelve nombres y asientos de la máquina. */
  start() {
    const seats = this.lobby.seats;
    const used = new Set(seats.filter((s) => s.kind !== 'open' && s.kind !== 'bot').map((s) => s.name.toLowerCase()));
    seats.forEach((s, i) => {
      if (s.kind !== 'open' && s.kind !== 'bot') return;
      const pref = s.kind === 'bot' && s.name ? [s.name] : [SEAT_NAMES[i], ...BOT_NAMES];
      const name = [...pref, ...BOT_NAMES].find((n) => n !== 'Tú' && !used.has(n.toLowerCase())) ?? `Máquina ${i}`;
      used.add(name.toLowerCase());
      seats[i] = { ...s, name, kind: 'bot' };
    });
    this.lobby.playing = true;
    this.changed();
    return {
      names: seats.map((s) => s.name),
      bots: seats.map((s) => s.kind === 'bot' || !!s.away),
      rules: { ...this.lobby.rules },
    };
  }

  /** Vuelta a la sala de espera (la partida ha terminado). */
  stop() {
    this.lobby.playing = false;
    this.lobby.seats.forEach((s, i) => {
      if (s.kind === 'guest' && s.away) {
        this.owners[i] = null;
        this.lobby.seats[i] = { name: '', kind: 'open', forGuest: true };
      } else if (s.kind === 'bot' && s.forGuest) {
        this.lobby.seats[i] = { name: '', kind: 'open', forGuest: true };
      }
    });
    this.changed();
  }
}
