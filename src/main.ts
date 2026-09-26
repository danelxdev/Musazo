import './style.css';
import { type Action, type Request, type State, Engine, Restart, SEAT_NAMES, timing } from './game/engine';
import { Viewer } from './game/view';
import * as ai from './game/ai';
import { TableUI, TURN_MS } from './ui/table';
import { RulesPanel } from './ui/rules';
import { Lobby } from './ui/lobby';
import { CounterView, isStandalone, lastViewWasCounter } from './counter/view';
import { preloadCards } from './ui/cards';
import { play, unlockAudio } from './ui/sound';
import { Host } from './net/host';
import { Guest } from './net/guest';
import { type HostMsg, type LobbyInfo, type Mode, isCode, saveName } from './net/protocol';

const app = document.getElementById('app')!;
const ui = new TableUI(app);
const rules = new RulesPanel(document.body);
const lobby = new Lobby(document.body);
const counter = new CounterView(document.body);

/**
 * Quién juega en este navegador:
 * - `solo`: contra la máquina, sin conexión;
 * - `host`: la partida con amigos se juega aquí y se manda a los demás;
 * - `guest`: se recibe la mesa del anfitrión y se mandan las jugadas.
 */
let role: 'solo' | 'host' | 'guest' = 'solo';
let host: Host | null = null;
let guest: Guest | null = null;
/** Lo que ve este navegador (la mesa girada a su asiento). */
let viewer = new Viewer(0);
/** Lo que ve cada invitado. */
const remoteViewers = new Map<number, Viewer>();
const viewerOf = (seat: number) => {
  let v = remoteViewers.get(seat);
  if (!v) remoteViewers.set(seat, (v = new Viewer(seat)));
  return v;
};

// ---------- Decisiones de los jugadores ----------

interface RemoteAsk {
  seat: number;
  req: Request;
  resolve: (a: Action) => void;
  reject: (e: Error) => void;
  timer: number;
}
let askSeq = 0;
const remoteAsks = new Map<number, RemoteAsk>();

function finishRemote(id: number, action: Action) {
  const p = remoteAsks.get(id);
  if (!p) return;
  remoteAsks.delete(id);
  window.clearTimeout(p.timer);
  p.resolve(action);
}

/** Pide la jugada a un invitado; si no contesta a tiempo (o se va), se juega lo prudente. */
function askRemote(seat: number, req: Request, state: State): Promise<Action> {
  const id = ++askSeq;
  host?.sendTo(seat, { t: 'ask', id, req: viewerOf(seat).request(req) });
  return new Promise((resolve, reject) => {
    // Margen sobre el reloj del invitado, que ya juega lo prudente al acabarse su tiempo
    const ms = req.type === 'continue' ? 60 * 60 * 1000 : TURN_MS + 6000;
    const timer = window.setTimeout(() => finishRemote(id, ai.prudent(state, seat, req)), ms);
    remoteAsks.set(id, { seat, req, resolve, reject, timer });
  });
}

/** Comprueba que la jugada que manda un invitado vale para lo que se le ha pedido. */
function validAction(req: Request, a: Action, state: State, seat: number) {
  switch (req.type) {
    case 'mus': return a.kind === 'mus' || a.kind === 'corto';
    case 'discard': {
      if (a.kind !== 'discard' || !Array.isArray(a.ids) || a.ids.length === 0) return false;
      const own = new Set(state.hands[seat].map((c) => c.id));
      return a.ids.every((id) => own.has(id));
    }
    case 'open': return a.kind === 'paso' || a.kind === 'ordago' || (a.kind === 'envido' && validAmount(a.n));
    case 'respond':
      return a.kind === 'quiero' || a.kind === 'noquiero'
        || (!req.bet.ordago && (a.kind === 'ordago' || (a.kind === 'envido' && validAmount(a.n))));
    case 'continue': return a.kind === 'continue';
  }
}
const validAmount = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 2 && n <= 30;

/** «Siguiente mano»: vale el primero que pulse (aquí o en cualquier invitado). */
function askAnyone(req: Request, state: State): Promise<Action> {
  const asks: Promise<Action>[] = [ui.ask(req, localView(state))];
  if (role === 'host' && host) for (const seat of host.remoteSeats()) asks.push(askRemote(seat, req, state));
  return new Promise((resolve, reject) => {
    let done = false;
    let failed = 0;
    for (const p of asks) {
      p.then((a) => {
        if (done) return;
        done = true;
        // Los demás ya no tienen que pulsar
        ui.cancel();
        for (const [id, r] of remoteAsks) if (r.req === req) finishRemote(id, a);
        host?.broadcast({ t: 'cancel' });
        resolve(a);
      }, (e) => {
        if (++failed === asks.length && !done) reject(e);
      });
    }
  });
}

const localView = (state: State) => viewer.view(state, engine.messageFor(viewer.seat));

const engine = new Engine({
  onChange: (s) => {
    if (s.phase === 'intro') {
      ui.render(s);
      return;
    }
    ui.render(localView(s));
    if (role === 'host' && host) {
      for (const seat of host.remoteSeats()) {
        host.sendTo(seat, { t: 'state', s: viewerOf(seat).view(s, engine.messageFor(seat)) });
      }
    }
  },
  ask: (seat, req, s) => {
    if (seat === null) return askAnyone(req, s);
    if (seat === viewer.seat) return ui.ask(viewer.request(req), localView(s));
    if (role === 'host' && host?.remoteSeats().includes(seat)) return askRemote(seat, req, s);
    // Nadie en ese asiento (se acaba de ir): juega la máquina
    return Promise.resolve(ai.decide(s, seat, req));
  },
  sound: play,
  cancel: () => {
    ui.cancel();
    for (const [id, r] of remoteAsks) {
      remoteAsks.delete(id);
      window.clearTimeout(r.timer);
      r.reject(new Restart());
    }
    host?.broadcast({ t: 'cancel' });
  },
});

// ---------- Pausa ----------

// La partida se detiene mientras se leen las reglas, se usa el contador o se confirma el reinicio
// (solo contra la máquina: en línea no se puede parar la mesa de los demás)
let rulesOpen = false;
let counterOpen = false;
let confirmOpen = false;
const syncPause = () => {
  const p = role === 'solo' && (rulesOpen || counterOpen || confirmOpen);
  timing.paused = p;
  ui.setPaused(p);
};
ui.onRules = () => {
  rules.mountIn(document.body);
  rules.open();
};
rules.onToggle = (open) => {
  rulesOpen = open;
  syncPause();
};
ui.onCounter = () => counter.open();
// Dentro del contador, para que las reglas giren con él cuando está en horizontal
counter.onRules = () => {
  rules.mountIn(counter.root);
  rules.open();
};
counter.blocked = () => rules.isOpen;
counter.onToggle = (open) => {
  counterOpen = open;
  syncPause();
};
ui.onConfirmToggle = (open) => {
  confirmOpen = open;
  syncPause();
};

// ---------- Partida ----------

let started = false;
/** La partida en marcha; al salir a la portada termina y la siguiente espera a que acabe. */
let running: Promise<void> = Promise.resolve();

function setRole(r: typeof role) {
  role = r;
  ui.setRole(r);
  syncPause();
}

/** Empieza a jugar en este navegador (contra la máquina o como anfitrión). */
function startEngine(names: string[], bots: boolean[], seat: number) {
  if (started) return;
  started = true;
  unlockAudio();
  viewer = new Viewer(seat);
  remoteViewers.clear();
  engine.configure(names, bots);
  running = running.then(() => engine.run());
}

function startSolo() {
  if (started || role === 'guest') return;
  setRole('solo');
  startEngine([...SEAT_NAMES], [false, true, true, true], 0);
}

ui.onStart = () => startSolo();
ui.onFriends = () => lobby.showModes();

ui.onRestart = () => {
  if (!started || role === 'guest') return;
  confirmOpen = false;
  ui.setPaused(false);
  engine.restart();
  syncPause();
};

ui.onExit = () => {
  if (role === 'guest') {
    leaveGuest();
    return;
  }
  if (!started) return;
  started = false;
  confirmOpen = false;
  ui.setPaused(false);
  engine.stop();
  if (role === 'host') closeHost('El anfitrión ha terminado la partida.');
  setRole('solo');
};

// ---------- Anfitrión ----------

function closeHost(reason?: string) {
  host?.close(reason);
  host = null;
  for (const [id, r] of remoteAsks) {
    remoteAsks.delete(id);
    window.clearTimeout(r.timer);
  }
}

function openRoom(mode: Mode, name: string) {
  closeHost();
  saveName(name);
  const h = new Host(mode, name);
  host = h;
  let status: 'connecting' | 'ready' | 'error' = 'connecting';
  let error = '';
  const show = (l: LobbyInfo) => {
    if (host === h && !l.playing) lobby.showHost(l, h.localSeat, status, error);
  };
  h.onStatus = (st, text) => {
    status = st;
    error = text ?? '';
    show(h.lobby);
  };
  h.onLobby = show;
  h.onAct = (seat, id, a) => {
    const p = remoteAsks.get(id);
    if (!p || p.seat !== seat) return;
    finishRemote(id, validAction(p.req, a, engine.state, seat) ? a : ai.prudent(engine.state, seat, p.req));
  };
  h.onAway = (seat, away) => {
    const name = h.lobby.seats[seat].name;
    engine.bots[seat] = away;
    if (away) {
      // Si le tocaba decidir, decide la máquina
      for (const [id, r] of remoteAsks) {
        if (r.seat !== seat) continue;
        if (r.req.type === 'continue') {
          // Para seguir no cuenta: esperan los que quedan
          remoteAsks.delete(id);
          window.clearTimeout(r.timer);
          r.reject(new Restart());
        } else {
          finishRemote(id, ai.decide(engine.state, seat, r.req));
        }
      }
    }
    const text = away ? `${name} se ha desconectado: juega la máquina hasta que vuelva` : `${name} ha vuelto a la partida`;
    notifyAll(text);
    engine.state.names[seat] = name;
    resend();
  };
  h.onJoinPlaying = (seat) => {
    const name = h.lobby.seats[seat].name;
    engine.bots[seat] = false;
    engine.state.names[seat] = name;
    notifyAll(`${name} se une a la partida`);
    resend();
  };
  h.open();
}

function notifyAll(text: string) {
  ui.toast(text);
  host?.broadcast({ t: 'toast', text });
}

/** Vuelve a mandar la mesa a todos (alguien ha llegado o se ha ido). */
function resend() {
  if (started) engine.refresh();
}

lobby.onPick = (choice, name) => {
  if (choice === 'bots') {
    if (name) saveName(name);
    lobby.close();
    closeHost();
    startSolo();
    return;
  }
  openRoom(choice, name);
};

lobby.onSwap = (a, b) => host?.swap(a, b);

lobby.onStart = () => {
  const h = host;
  if (!h || started) return;
  const { names, bots } = h.start();
  lobby.close();
  setRole('host');
  startEngine(names, bots, h.localSeat);
};

lobby.onCancel = () => {
  if (role === 'guest' || guest) {
    leaveGuest();
    return;
  }
  closeHost();
  lobby.close();
  clearHash();
};

// ---------- Invitado ----------

let guestState: State | null = null;

function joinRoom(code: string, name: string) {
  leaveGuest(false);
  saveName(name);
  const g = new Guest(code, name);
  guest = g;
  let lobbyInfo: LobbyInfo | null = null;
  let me = 0;
  lobby.showWait(null, 0, 'Conectando con la sala…');
  g.onStatus = (st, text) => {
    if (guest !== g) return;
    if (st === 'error') {
      endGuest();
      lobby.showError('No se ha podido entrar', text ?? '');
    } else if (st === 'reconnecting') {
      ui.toast('Se ha cortado la conexión: reconectando…', 6000);
      if (!guestState) lobby.showWait(lobbyInfo, me, 'Reconectando…');
    }
  };
  g.onMsg = (msg: HostMsg) => {
    if (guest !== g) return;
    switch (msg.t) {
      case 'lobby':
        lobbyInfo = msg.lobby;
        me = msg.you;
        if (!msg.lobby.playing && !guestState) lobby.showWait(msg.lobby, me, '');
        break;
      case 'state':
        if (!guestState) {
          lobby.close();
          setRole('guest');
          unlockAudio();
        }
        guestState = msg.s;
        ui.render(msg.s);
        break;
      case 'ask':
        if (guestState) {
          const id = msg.id;
          ui.ask(msg.req, guestState).then(
            (a) => g.send({ t: 'act', id, a }),
            () => undefined,
          );
        }
        break;
      case 'cancel':
        ui.cancel();
        break;
      case 'toast':
        ui.toast(msg.text);
        break;
      case 'closed':
        endGuest();
        lobby.showError('Fin de la partida', msg.reason);
        break;
    }
  };
  g.connect();
}

/** Deja de ser invitado y vuelve la portada. */
function endGuest() {
  guest?.leave(false);
  guest = null;
  guestState = null;
  ui.cancel();
  setRole('solo');
  ui.render(engine.state);
  clearHash();
}

function leaveGuest(back = true) {
  if (!guest) return;
  guest.leave(true);
  guest = null;
  guestState = null;
  ui.cancel();
  setRole('solo');
  ui.render(engine.state);
  if (back) {
    lobby.close();
    clearHash();
  }
}

lobby.onJoin = (code, name) => {
  if (started) return;
  history.replaceState(null, '', `#sala=${code}`);
  joinRoom(code, name);
};

function clearHash() {
  if (location.hash.startsWith('#sala=')) history.replaceState(null, '', location.pathname + location.search);
}

// Avisar al salir de la página para que la máquina ocupe el sitio al momento
window.addEventListener('pagehide', () => {
  guest?.leave(true);
  host?.close('El anfitrión ha cerrado la partida.');
});

// ---------- Arranque ----------

ui.render(engine.state);
preloadCards();

// Para las pruebas en desarrollo
if (import.meta.env.DEV) Object.assign(window, { __musazo: { engine, ui, timing, lobby } });

// Enlace de invitación: /#sala=CODIGO
const invite = location.hash.match(/^#sala=([A-Za-z0-9]+)/);
if (invite && isCode(invite[1])) lobby.showJoin(invite[1].toUpperCase());
// Enlace directo a la partida: /#jugar
else if (location.hash === '#jugar') ui.onStart?.();
// Enlace directo al contador de tantos: /#contador
else if (location.hash === '#contador') counter.open();
// Como app instalada, se vuelve a donde se estaba (normalmente el contador)
else if (!location.hash && isStandalone() && lastViewWasCounter()) counter.open();

// Sin conexión (para usar el contador en la calle sin cobertura)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  });
}
