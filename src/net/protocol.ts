import type { Action, Request, State } from '../game/engine';
import type { Rules } from '../game/rules';
import type { ChatKind, ChatShow } from '../game/chat';

/** Cómo es la partida con amigos. */
export type Mode = 'equipo' | 'solo' | 'custom';

export const MODE_INFO: Record<Mode, { title: string; text: string }> = {
  equipo: { title: 'En equipo', text: 'Tu amigo y tú, de pareja contra la máquina' },
  solo: { title: 'Solo', text: 'Tú contra tu amigo: cada uno con un compañero de la máquina' },
  custom: { title: 'Personalizado', text: 'Hasta 4 amigos: elegís sitios y parejas; los huecos los juega la máquina' },
};

/** Qué hay en cada asiento de la sala. */
export interface SeatInfo {
  name: string;
  kind: 'host' | 'guest' | 'bot' | 'open';
  /** Sitio reservado para alguien invitado (si falta, lo juega la máquina y lo puede coger al llegar). */
  forGuest: boolean;
  /** Invitado desconectado: la máquina juega por él hasta que vuelva. */
  away?: boolean;
}

export interface LobbyInfo {
  mode: Mode;
  rules: Rules;
  code: string;
  seats: SeatInfo[];
  playing: boolean;
}

/** Del anfitrión al invitado. */
export type HostMsg =
  | { t: 'lobby'; lobby: LobbyInfo; you: number }
  | { t: 'state'; s: State }
  | { t: 'ask'; id: number; req: Request }
  | { t: 'cancel' }
  | { t: 'toast'; text: string }
  | { t: 'chat'; seat: number; text: string; show: ChatShow }
  | { t: 'closed'; reason: string }
  | { t: 'ping' };

/** Del invitado al anfitrión. */
export type GuestMsg =
  | { t: 'hello'; name: string; cid: string }
  | { t: 'act'; id: number; a: Action }
  | { t: 'bye' }
  | { t: 'chat'; kind: ChatKind; id: string }
  | { t: 'ping' };

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const newCode = () => Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
export const peerId = (code: string) => `musazo-sala-${code.toUpperCase()}`;
export const isCode = (code: string) => /^[A-Z0-9]{5}$/.test(code.toUpperCase());

/** Enlace de invitación: abre la web directamente en la sala. */
export function inviteUrl(code: string) {
  return `${location.origin}${location.pathname}#sala=${code}`;
}

/** Identificador de este navegador, para volver a tu sitio si se corta la conexión. */
export function clientId() {
  try {
    let id = localStorage.getItem('musazo.cid');
    if (!id) {
      id = Math.random().toString(36).slice(2, 12);
      localStorage.setItem('musazo.cid', id);
    }
    return id;
  } catch {
    return Math.random().toString(36).slice(2, 12);
  }
}

export function savedName() {
  try {
    return localStorage.getItem('musazo.name') ?? '';
  } catch {
    return '';
  }
}

export function saveName(name: string) {
  try {
    localStorage.setItem('musazo.name', name);
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

/** Nombre limpio: sin espacios de más y corto, para que quepa en la placa. */
export const cleanName = (name: string) => name.replace(/\s+/g, ' ').trim().slice(0, 14);

/**
 * Servidor de enlace de PeerJS: por defecto el público y gratuito (0.peerjs.com).
 * Se puede cambiar con VITE_PEER_HOST / VITE_PEER_PORT / VITE_PEER_PATH (por ejemplo, uno propio o uno local para pruebas).
 */
export function peerOptions() {
  const env = import.meta.env;
  const opts: { debug: 0; host?: string; port?: number; path?: string; secure?: boolean } = { debug: 0 };
  if (env.VITE_PEER_HOST) {
    opts.host = env.VITE_PEER_HOST;
    opts.port = Number(env.VITE_PEER_PORT) || 443;
    opts.path = env.VITE_PEER_PATH || '/';
    opts.secure = opts.port === 443;
  }
  return opts;
}

/** Tiempo sin noticias de un jugador para darlo por desconectado. */
export const PING_MS = 3000;
export const LOST_MS = 12000;
