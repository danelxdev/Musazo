import './style.css';
import { Engine, timing } from './game/engine';
import { TableUI } from './ui/table';
import { RulesPanel } from './ui/rules';
import { CounterView, isStandalone, lastViewWasCounter } from './counter/view';
import { preloadCards } from './ui/cards';
import { play, unlockAudio } from './ui/sound';

const app = document.getElementById('app')!;
const ui = new TableUI(app);
const rules = new RulesPanel(document.body);
const engine = new Engine({
  onChange: (s) => ui.render(s),
  ask: (req, s) => ui.ask(req, s),
  sound: play,
  cancel: () => ui.cancel(),
});

const counter = new CounterView(document.body);

// La partida se detiene mientras se leen las reglas, se usa el contador o se confirma el reinicio
let rulesOpen = false;
let counterOpen = false;
let confirmOpen = false;
const syncPause = () => {
  const p = rulesOpen || counterOpen || confirmOpen;
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
ui.onConfirmToggle =(open) => {
  confirmOpen = open;
  syncPause();
};
ui.onRestart = () => {
  if (!started) return;
  confirmOpen = false;
  ui.setPaused(false);
  engine.restart();
  syncPause();
};

let started = false;
/** La partida en marcha; al salir a la portada termina y la siguiente espera a que acabe. */
let running: Promise<void> = Promise.resolve();
ui.onStart = () => {
  if (started) return;
  started = true;
  unlockAudio();
  running = running.then(() => engine.run());
};
ui.onExit = () => {
  if (!started) return;
  started = false;
  confirmOpen = false;
  ui.setPaused(false);
  engine.stop();
  syncPause();
};

ui.render(engine.state);
preloadCards();

// Enlace directo a la partida: /#jugar
if (location.hash === '#jugar') ui.onStart?.();
// Enlace directo al contador de tantos: /#contador
if (location.hash === '#contador') counter.open();
// Como app instalada, se vuelve a donde se estaba (normalmente el contador)
else if (!location.hash && isStandalone() && lastViewWasCounter()) counter.open();

// Sin conexión (para usar el contador en la calle sin cobertura)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  });
}
