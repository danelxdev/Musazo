/**
 * Servidor de partidas clasificatorias de Musazo.
 *
 * - WebSocket en /ws: entrar, cola de emparejamiento, partidas (el motor corre aquí) y chat.
 * - HTTP: GET /api/ranking (los mejores) y GET /api/health.
 *
 * Variables de entorno:
 *   PORT            puerto (8787)
 *   DATA_DIR        carpeta donde se guardan los jugadores (./data)
 *   ALLOWED_ORIGINS orígenes permitidos, separados por comas (por defecto, cualquiera)
 *   BOT_FILL_MS     espera en cola antes de completar la mesa con la máquina (30000)
 *   TIME_SCALE      velocidad de las partidas (1; menos para pruebas)
 */
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import type { ClientMsg, Me, ServerMsg } from '../src/net/ranked-protocol';
import { cleanName } from '../src/net/protocol';
import { Store } from './store';
import { divisionOf } from './elo';
import { Game, type GameSeat } from './game';

const PORT = Number(process.env.PORT) || 8787;
const DATA_DIR = process.env.DATA_DIR || './data';
const BOT_FILL_MS = Number(process.env.BOT_FILL_MS ?? 30000);
const TIME_SCALE = Number(process.env.TIME_SCALE) || 1;
const ORIGINS = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

const store = new Store(DATA_DIR);

interface Client {
  ws: WebSocket;
  uid: string | null;
  /** Mensajes en el último segundo (para frenar abusos). */
  burst: number;
}

const clients = new Set<Client>();
/** Conexión activa de cada jugador (si entra desde otra pestaña, se queda la última). */
const online = new Map<string, Client>();
const games = new Map<string, Game>();
/** Partida en la que está cada jugador. */
const playing = new Map<string, Game>();
/** Cola de emparejamiento, por orden de llegada. */
let queue: { uid: string; since: number }[] = [];

const send = (c: Client | undefined, msg: ServerMsg) => {
  if (c && c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(msg));
};
const connOf = (uid: string) => ({ send: (m: ServerMsg) => send(online.get(uid), m) });

function me(uid: string): Me {
  const p = store.get(uid)!;
  return { ...Store.public(p), rank: store.rank(uid), division: divisionOf(p.rating) };
}

// ---------- Emparejamiento ----------

function unqueue(uid: string) {
  queue = queue.filter((q) => q.uid !== uid);
}

/**
 * Cada segundo: con cuatro en cola se juega; si alguien lleva esperando mucho,
 * se completa la mesa con la máquina. Las parejas se equilibran por rating.
 */
function matchmake() {
  queue = queue.filter((q) => online.has(q.uid) && !playing.has(q.uid));
  while (queue.length >= 4) startGame(queue.splice(0, 4).map((q) => q.uid));
  if (queue.length && Date.now() - queue[0].since >= BOT_FILL_MS) startGame(queue.splice(0, queue.length).map((q) => q.uid));
  const now = Date.now();
  for (const q of queue) send(online.get(q.uid), { t: 'queue', waiting: queue.length, seconds: Math.round((now - q.since) / 1000) });
}

function startGame(uids: string[]) {
  const players = uids.map((uid) => store.get(uid)!).sort((a, b) => b.rating - a.rating);
  // Cuatro personas: el mejor con el peor contra los dos del medio. Menos: rivales entre sí y la máquina rellena.
  const order = players.length === 4 ? [players[0], players[1], players[3], players[2]] : players;
  const seats: GameSeat[] = [0, 1, 2, 3].map((i) => {
    const p = order[i];
    if (p) return { uid: p.uid, name: p.name, rating: p.rating, conn: connOf(p.uid) };
    return { uid: null, name: ['Amaia', 'Iñaki', 'Maite', 'Koldo'][i], rating: 0, conn: null };
  });
  // Nombres repetidos: se distinguen con un número
  seats.forEach((s, i) => {
    if (seats.slice(0, i).some((o) => o.name.toLowerCase() === s.name.toLowerCase())) s.name = `${s.name} ${i + 1}`;
  });
  const id = randomBytes(4).toString('hex');
  const game = new Game(id, seats, (uid) => store.get(uid)?.games ?? 0, (g, r) => {
    for (const d of r.deltas) {
      const before = store.get(d.uid)!.rating;
      store.update(d.uid, (p) => {
        p.rating = Math.max(100, p.rating + d.delta);
        p.games++;
        if (d.won) p.wins++;
      });
      send(online.get(d.uid), { t: 'result', won: d.won, before, after: store.get(d.uid)!.rating, me: me(d.uid) });
    }
    for (const s of g.seats) if (s.uid) playing.delete(s.uid);
    setTimeout(() => games.delete(g.id), 5000);
    console.log(`[partida ${g.id}] fin: gana la pareja ${r.winner}`);
  }, TIME_SCALE);
  games.set(id, game);
  for (const s of seats) if (s.uid) playing.set(s.uid, game);
  console.log(`[partida ${id}] empieza: ${seats.map((s) => s.name + (s.uid ? '' : ' (máquina)')).join(', ')}`);
  game.start();
}

setInterval(matchmake, 1000);

// ---------- Mensajes ----------

function onMessage(c: Client, raw: string) {
  if (++c.burst > 30) return; // demasiados mensajes seguidos
  let msg: ClientMsg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (!msg || typeof msg !== 'object') return;
  if (msg.t === 'hello') {
    const p = store.login(String(msg.uid), String(msg.secret), cleanName(String(msg.name ?? '')));
    if (!p) {
      send(c, { t: 'error', text: 'No se ha podido entrar con esta cuenta.' });
      return;
    }
    const prev = online.get(p.uid);
    if (prev && prev !== c) {
      send(prev, { t: 'error', text: 'Has entrado desde otro sitio.' });
      prev.ws.close();
    }
    c.uid = p.uid;
    online.set(p.uid, c);
    send(c, { t: 'welcome', me: me(p.uid) });
    // ¿Estaba en una partida? Vuelve a su sitio
    playing.get(p.uid)?.rejoin(p.uid, connOf(p.uid));
    return;
  }
  const uid = c.uid;
  if (!uid) return;
  switch (msg.t) {
    case 'queue':
      if (!playing.has(uid) && !queue.some((q) => q.uid === uid)) queue.push({ uid, since: Date.now() });
      matchmake();
      break;
    case 'unqueue':
      unqueue(uid);
      break;
    case 'act':
      playing.get(uid)?.act(uid, Number(msg.id), msg.a);
      break;
    case 'chat':
      playing.get(uid)?.chat(uid, msg.kind, String(msg.id));
      break;
    case 'leave': {
      const g = playing.get(uid);
      g?.drop(uid);
      break;
    }
  }
}

function onClose(c: Client) {
  clients.delete(c);
  if (!c.uid || online.get(c.uid) !== c) return;
  online.delete(c.uid);
  unqueue(c.uid);
  playing.get(c.uid)?.drop(c.uid);
}

// ---------- Servidor ----------

const allowed = (origin: string | undefined) => !ORIGINS.length || (!!origin && ORIGINS.includes(origin));

const http = createServer((req, res) => {
  const origin = req.headers.origin;
  if (allowed(origin)) res.setHeader('Access-Control-Allow-Origin', ORIGINS.length ? origin! : '*');
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, online: online.size, games: games.size, queue: queue.length }));
  } else if (url.pathname === '/api/ranking') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=15' });
    res.end(JSON.stringify(store.top(100).map((p) => ({ ...p, division: divisionOf(p.rating) }))));
  } else {
    res.writeHead(404);
    res.end();
  }
});

const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 16 * 1024 });
wss.on('connection', (ws, req) => {
  if (!allowed(req.headers.origin)) {
    ws.close(1008, 'origin');
    return;
  }
  const c: Client = { ws, uid: null, burst: 0 };
  clients.add(c);
  ws.on('message', (data) => onMessage(c, data.toString()));
  ws.on('close', () => onClose(c));
  ws.on('error', () => ws.close());
});

// Latido: se cierran las conexiones muertas; y el contador de mensajes se vacía cada segundo
const alive = new WeakSet<WebSocket>();
wss.on('connection', (ws) => {
  alive.add(ws);
  ws.on('pong', () => alive.add(ws));
});
setInterval(() => {
  for (const c of clients) {
    if (!alive.has(c.ws)) {
      c.ws.terminate();
      continue;
    }
    alive.delete(c.ws);
    c.ws.ping();
  }
}, 20000);
setInterval(() => clients.forEach((c) => (c.burst = 0)), 1000);

http.listen(PORT, () => console.log(`Musazo · servidor de partidas en el puerto ${PORT}`));

const shutdown = () => {
  store.flush();
  for (const g of games.values()) g.abort();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
