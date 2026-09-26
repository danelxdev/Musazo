import './style.css';
import { type Action, type Request, type State, Engine, Restart, SEAT_NAMES, timing } from './game/engine';
import { Viewer } from './game/view';
import { validAction } from './game/validate';
import * as ai from './game/ai';
import { TableUI, TURN_MS } from './ui/table';
import { RulesPanel } from './ui/rules';
import { Lobby } from './ui/lobby';
import { Settings } from './ui/settings';
import { Profile } from './ui/profile';
import { StatsRecorder } from './game/stats';
import { CATCH_CHANCE, type ChatKind, type ChatShow, chatText, senaFor } from './game/chat';
import { type Rules, savedRules } from './game/rules';
import { CounterView, isStandalone, lastViewWasCounter } from './counter/view';
import { preloadCards } from './ui/cards';
import { play, unlockAudio } from './ui/sound';
import { Host } from './net/host';
import { Guest } from './net/guest';
import { type HostMsg, type LobbyInfo, type Mode, isCode, saveName } from './net/protocol';
import { RankedClient, account, fetchRanking } from './net/ranked';
import type { Me, ServerMsg } from './net/ranked-protocol';

const app = document.getElementById('app')!;
const ui = new TableUI(app);
const rules = new RulesPanel(document.body);
const lobby = new Lobby(document.body);
const counter = new CounterView(document.body);
const settings = new Settings(document.body);
const profile = new Profile(document.body);
const stats = new StatsRecorder();

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
    botSigns(s);
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

// ---------- Chat rápido y señas ----------

const lastChat = new Map<number, number>();
let signedHand = -1;

/** ¿Hay alguien de carne y hueso en ese asiento (aquí o conectado)? */
const isHuman = (seat: number) =>
  (role !== 'guest' && seat === viewer.seat) || (role === 'host' && !!host?.remoteSeats().includes(seat));

/** Enseña algo del chat a un jugador, con la mesa girada a su sitio. */
function showTo(viewerSeat: number, fromSeat: number, text: string, show: ChatShow) {
  const seat = (fromSeat - viewerSeat + 4) % 4;
  if (viewerSeat === viewer.seat && role !== 'guest') ui.showChat(seat, text, show);
  else host?.sendTo(viewerSeat, { t: 'chat', seat, text, show });
}

function notifySeat(seat: number, text: string) {
  if (seat === viewer.seat && role !== 'guest') ui.toast(text);
  else host?.sendTo(seat, { t: 'toast', text });
}

/**
 * Reparte una frase (a toda la mesa) o una seña (a la pareja; cada rival la pilla a veces).
 * Lo decide quien lleva la partida: contra la máquina, este navegador; con amigos, el anfitrión.
 */
function deliverChat(from: number, kind: ChatKind, id: string) {
  if (!started) return;
  const text = chatText(kind, id);
  if (!text) return;
  const s = engine.state;
  if (kind === 'sena' && (!['deal', 'mus', 'discard', 'lance'].includes(s.phase) || s.reveal)) return;
  const now = performance.now();
  if (now - (lastChat.get(from) ?? -Infinity) < 1200) return;
  lastChat.set(from, now);
  if (kind === 'frase') {
    for (let v = 0; v < 4; v++) if (isHuman(v)) showTo(v, from, text, 'frase');
    return;
  }
  const partner = (from + 2) % 4;
  if (isHuman(from)) showTo(from, from, text, 'enviada');
  if (isHuman(partner)) showTo(partner, from, text, 'sena');
  for (const rival of [(from + 1) % 4, (from + 3) % 4]) {
    if (Math.random() >= CATCH_CHANCE) continue;
    if (isHuman(rival)) showTo(rival, from, text, 'pillada');
    if (isHuman(from)) notifySeat(from, `¡${s.names[rival]} te ha pillado la seña!`);
  }
}

/** Al empezar los lances, los compañeros de la máquina hacen su seña si llevan algo. */
function botSigns(s: State) {
  if (s.phase !== 'lance' || s.lance !== 'grande' || s.handNo === signedHand) return;
  signedHand = s.handNo;
  const hand = s.handNo;
  for (let seat = 0; seat < 4; seat++) {
    if (!engine.bots[seat]) continue;
    // Solo tiene gracia si la puede ver alguien: su pareja o un rival que la pille
    if (![0, 1, 2, 3].some((v) => v !== seat && isHuman(v))) continue;
    const sena = senaFor(s.hands[seat]);
    if (!sena || Math.random() > 0.7) continue;
    window.setTimeout(() => {
      if (engine.state.handNo === hand) deliverChat(seat, 'sena', sena);
    }, 500 + Math.random() * 2500);
  }
}

ui.onChat = (kind, id) => {
  if (role === 'guest' && ranked) ranked.send({ t: 'chat', kind, id });
  else if (role === 'guest') guest?.send({ t: 'chat', kind, id });
  else deliverChat(viewer.seat, kind, id);
};

// ---------- Pausa ----------

// La partida se detiene mientras se leen las reglas, se usa el contador o se confirma el reinicio
// (solo contra la máquina: en línea no se puede parar la mesa de los demás)
let rulesOpen = false;
let counterOpen = false;
let confirmOpen = false;
let settingsOpen = false;
const syncPause = () => {
  const p = role === 'solo' && (rulesOpen || counterOpen || confirmOpen || settingsOpen);
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
ui.onSettings = () => settings.open(started || role === 'guest');
settings.onToggle = (open) => {
  settingsOpen = open;
  syncPause();
};
settings.onSound = () => ui.refreshMute();
ui.onProfile = () => profile.open();
ui.onRoundEnd = (s) => stats.record(s, role === 'solo' ? 'maquina' : 'amigos');
settings.onRules = (r) => {
  // En la portada se ven las reglas nuevas; en la sala, las ven todos los invitados
  if (!started && role !== 'guest') {
    engine.configure([...SEAT_NAMES], [false, true, true, true], r);
    ui.render(engine.state);
  }
  host?.setRules(r);
};
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
function startEngine(names: string[], bots: boolean[], seat: number, rules: Rules) {
  if (started) return;
  started = true;
  unlockAudio();
  viewer = new Viewer(seat);
  remoteViewers.clear();
  engine.configure(names, bots, rules);
  running = running.then(() => engine.run());
}

function startSolo() {
  if (started || role === 'guest') return;
  setRole('solo');
  startEngine([...SEAT_NAMES], [false, true, true, true], 0, savedRules());
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
  if (ranked) {
    ranked.send({ t: 'leave' });
    endRanked();
    return;
  }
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
  const h = new Host(mode, name, savedRules());
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
  h.onChat = (seat, kind, id) => {
    if (kind === 'frase' || kind === 'sena') deliverChat(seat, kind, id);
  };
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
    // Al volver, fuera los botones que pudiera tener de antes (ese turno ya lo jugó la máquina)
    if (!away) h.sendTo(seat, { t: 'cancel' });
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
  if (choice === 'ranked') {
    startRanked(name);
    return;
  }
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
lobby.onSettings = () => settings.open(false);

lobby.onStart = () => {
  const h = host;
  if (!h || started) return;
  const { names, bots, rules } = h.start();
  lobby.close();
  setRole('host');
  startEngine(names, bots, h.localSeat, rules);
};

lobby.onCancel = () => {
  if (ranked) {
    ranked.send({ t: 'unqueue' });
    endRanked();
    lobby.close();
    return;
  }
  if (role === 'guest' || guest) {
    leaveGuest();
    return;
  }
  closeHost();
  lobby.close();
  clearHash();
};

// ---------- Invitado (y mesa que llega de fuera) ----------

/** La mesa que llega del anfitrión o del servidor de clasificatorias. */
let guestState: State | null = null;

/** Pinta la mesa que llega de fuera y contesta lo que se pida. */
function applyRemote(msg: HostMsg | ServerMsg, sendAct: (id: number, a: Action) => void) {
  switch (msg.t) {
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
        ui.ask(msg.req, guestState).then((a) => sendAct(id, a), () => undefined);
      }
      break;
    case 'cancel':
      ui.cancel();
      break;
    case 'toast':
      ui.toast(msg.text);
      break;
    case 'chat':
      if (['frase', 'sena', 'enviada', 'pillada'].includes(msg.show)) ui.showChat(Number(msg.seat) % 4, String(msg.text), msg.show);
      break;
  }
}

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
      default:
        applyRemote(msg, (id, a) => g.send({ t: 'act', id, a }));
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

// ---------- Clasificatoria ----------

let ranked: RankedClient | null = null;
let rankedMe: Me | null = null;

function startRanked(name: string) {
  if (started) return;
  leaveGuest(false);
  closeHost();
  saveName(name);
  ranked?.close();
  const r = new RankedClient(name);
  ranked = r;
  guestState = null;
  lobby.showQueue(null, 'Conectando con el servidor…');
  r.onStatus = (st, text) => {
    if (ranked !== r) return;
    if (st === 'error') {
      endRanked();
      lobby.showError('Partida clasificatoria', text ?? '');
    } else if (st === 'reconnecting') {
      if (guestState) ui.toast('Se ha cortado la conexión: reconectando…', 5000);
      else lobby.showQueue(rankedMe, 'Reconectando…');
    }
  };
  r.onMsg = (m) => {
    if (ranked !== r) return;
    switch (m.t) {
      case 'welcome':
        rankedMe = m.me;
        // Si estaba jugando, el servidor le devuelve a su partida; si no, a la cola
        if (!guestState) {
          r.send({ t: 'queue' });
          lobby.showQueue(m.me, 'Buscando jugadores…');
        }
        break;
      case 'queue':
        lobby.showQueue(rankedMe, `${m.waiting > 1 ? `${m.waiting} jugadores buscando` : 'Buscando rivales'} · ${m.seconds} s`);
        break;
      case 'matched':
        guestState = null;
        ui.toast(`¡Partida! ${m.players.map((p, i) => (i ? p.name : 'Tú')).join(' · ')}`, 3500);
        break;
      case 'result':
        rankedMe = m.me;
        // Un momento para ver cómo acaba la mesa
        window.setTimeout(() => ranked === r && lobby.showResult(m.won, m.before, m.after, m.me), 3000);
        break;
      case 'error':
        ui.toast(m.text);
        break;
      default:
        applyRemote(m, (id, a) => r.send({ t: 'act', id, a }));
    }
  };
  r.connect();
}

function endRanked() {
  ranked?.close();
  ranked = null;
  guestState = null;
  ui.cancel();
  setRole('solo');
  ui.render(engine.state);
}

lobby.onRequeue = () => {
  if (!ranked) return;
  guestState = null;
  setRole('solo');
  ui.render(engine.state);
  ranked.send({ t: 'queue' });
  lobby.showQueue(rankedMe, 'Buscando jugadores…');
};

async function showRanking() {
  const uid = account().uid;
  lobby.showRanking(null, uid);
  try {
    lobby.showRanking(await fetchRanking(), uid);
  } catch {
    lobby.showRanking([], uid, 'No se ha podido cargar el ranking. Inténtalo más tarde.');
  }
}

lobby.onRanking = () => void showRanking();
ui.onRanking = () => void showRanking();

// Avisar al salir de la página para que la máquina ocupe el sitio al momento
window.addEventListener('pagehide', () => {
  ranked?.close();
  guest?.leave(true);
  host?.close('El anfitrión ha cerrado la partida.');
});

// ---------- Arranque ----------

engine.configure([...SEAT_NAMES], [false, true, true, true], savedRules());
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
