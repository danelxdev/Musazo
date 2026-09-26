import type { ClientMsg, Ranked, ServerMsg } from './ranked-protocol';

/**
 * Servidor de partidas clasificatorias (VITE_GAME_SERVER, por ejemplo wss://musazo.onrender.com).
 * Sin él, la opción aparece como «próximamente».
 */
export const GAME_SERVER = ((import.meta.env.VITE_GAME_SERVER as string | undefined) ?? '').replace(/\/+$/, '');
export const rankedEnabled = () => !!GAME_SERVER;

const httpBase = () => GAME_SERVER.replace(/^ws(s?):/, 'http$1:');

/** Cuenta de este navegador: un id y un secreto que solo conoce él (y el servidor, cifrado). */
export function account(): { uid: string; secret: string } {
  const make = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');
  try {
    const x = JSON.parse(localStorage.getItem('musazo.account') ?? 'null');
    if (x?.uid && x?.secret) return x;
    const acc = { uid: make(12), secret: make(24) };
    localStorage.setItem('musazo.account', JSON.stringify(acc));
    return acc;
  } catch {
    return { uid: make(12), secret: make(24) };
  }
}

export async function fetchRanking(): Promise<(Ranked & { division: string })[]> {
  const res = await fetch(`${httpBase()}/api/ranking`);
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

/** Conexión con el servidor; si se corta, vuelve a conectar sola (y el servidor te devuelve a tu partida). */
export class RankedClient {
  private ws: WebSocket | null = null;
  private closed = false;
  private tries = 0;
  onMsg: ((m: ServerMsg) => void) | null = null;
  onStatus: ((s: 'connecting' | 'online' | 'reconnecting' | 'error', text?: string) => void) | null = null;

  constructor(private name: string) {}

  connect() {
    this.onStatus?.(this.tries ? 'reconnecting' : 'connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${GAME_SERVER}/ws`);
    } catch {
      this.onStatus?.('error', 'La dirección del servidor de partidas no es válida.');
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.tries = 0;
      const { uid, secret } = account();
      this.send({ t: 'hello', uid, secret, name: this.name });
    };
    ws.onmessage = (e) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (msg.t === 'welcome') this.onStatus?.('online');
      this.onMsg?.(msg);
    };
    ws.onclose = () => {
      if (this.closed || ws !== this.ws) return;
      if (++this.tries > 12) {
        this.onStatus?.('error', 'No se puede conectar con el servidor de partidas.');
        return;
      }
      this.onStatus?.('reconnecting');
      window.setTimeout(() => !this.closed && this.connect(), Math.min(8000, 800 * this.tries));
    };
  }

  send(msg: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close() {
    this.closed = true;
    this.ws?.close();
  }
}
