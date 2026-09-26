import Peer, { type DataConnection } from 'peerjs';
import { type GuestMsg, type HostMsg, LOST_MS, PING_MS, peerOptions, clientId, peerId } from './protocol';

/**
 * El invitado: se conecta a la sala del anfitrión, recibe la mesa y manda sus jugadas.
 * Si se corta la conexión lo vuelve a intentar solo y recupera su sitio.
 */
export class Guest {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private lastSeen = 0;
  private pinger = 0;
  private retries = 0;
  private left = false;
  private joined = false;

  onMsg: ((m: HostMsg) => void) | null = null;
  onStatus: ((status: 'connecting' | 'joined' | 'reconnecting' | 'error', text?: string) => void) | null = null;

  constructor(private code: string, private name: string) {}

  connect() {
    this.onStatus?.(this.joined ? 'reconnecting' : 'connecting');
    const fresh = !this.peer || this.peer.destroyed;
    const peer = fresh ? new Peer(peerOptions()) : this.peer!;
    this.peer = peer;
    const go = () => {
      const conn = peer.connect(peerId(this.code), { reliable: true, serialization: 'json' });
      this.conn = conn;
      conn.on('open', () => {
        if (this.left) return;
        this.retries = 0;
        this.lastSeen = performance.now();
        this.send({ t: 'hello', name: this.name, cid: clientId() });
      });
      conn.on('data', (raw) => {
        this.lastSeen = performance.now();
        const msg = raw as HostMsg;
        if (msg.t === 'ping') return;
        if (msg.t === 'lobby' && !this.joined) {
          this.joined = true;
          this.onStatus?.('joined');
        } else if (msg.t === 'lobby' && this.retries === 0) {
          this.onStatus?.('joined');
        }
        this.onMsg?.(msg);
      });
      conn.on('close', () => this.lost(conn));
      conn.on('error', () => this.lost(conn));
    };
    if (peer.open) go();
    else peer.once('open', go);
    if (fresh) peer.on('error', (err) => {
      if (this.left) return;
      const type = (err as { type?: string }).type;
      if (type === 'peer-unavailable') {
        if (this.joined) this.retry();
        else this.fail('No se encuentra la sala. Puede que el anfitrión la haya cerrado o que el código no sea correcto.');
      } else if (type === 'browser-incompatible') {
        this.fail('Este navegador no permite jugar en línea.');
      } else if (!this.joined) {
        this.fail('No se ha podido conectar. Comprueba la conexión a internet y vuelve a intentarlo.');
      } else {
        this.retry();
      }
    });
    window.clearInterval(this.pinger);
    this.pinger = window.setInterval(() => {
      if (!this.conn?.open) return;
      if (performance.now() - this.lastSeen > LOST_MS) this.lost(this.conn);
      else this.send({ t: 'ping' });
    }, PING_MS);
  }

  send(msg: GuestMsg) {
    try {
      if (this.conn?.open) this.conn.send(msg);
    } catch {
      /* se detecta con el latido */
    }
  }

  private lost(conn: DataConnection) {
    if (this.left || conn !== this.conn) return;
    this.conn = null;
    try {
      conn.close();
    } catch {
      /* ya estaba cerrada */
    }
    this.retry();
  }

  private retry() {
    if (this.left) return;
    // Unos 60 s de reintentos: da tiempo a que el anfitrión desbloquee el móvil
    if (!this.joined || this.retries >= 24) {
      this.fail('Se ha perdido la conexión con la partida.');
      return;
    }
    this.retries++;
    this.onStatus?.('reconnecting');
    window.setTimeout(() => {
      if (this.left) return;
      if (this.peer?.disconnected && !this.peer.destroyed) this.peer.reconnect();
      this.connect();
    }, 2500);
  }

  private fail(text: string) {
    if (this.left) return;
    this.onStatus?.('error', text);
    this.leave(false);
  }

  /** Salir de la sala (avisando al anfitrión para que la máquina juegue por ti). */
  leave(notify = true) {
    if (this.left) return;
    if (notify) this.send({ t: 'bye' });
    this.left = true;
    window.clearInterval(this.pinger);
    const peer = this.peer;
    window.setTimeout(() => peer?.destroy(), notify ? 300 : 0);
  }
}
