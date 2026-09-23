import './style.css';
import { Engine, timing } from './game/engine';
import { TableUI } from './ui/table';
import { RulesPanel } from './ui/rules';
import { preloadCards } from './ui/cards';
import { play, unlockAudio } from './ui/sound';

const app = document.getElementById('app')!;
const ui = new TableUI(app);
const rules = new RulesPanel(document.body);
const engine = new Engine({
  onChange: (s) => ui.render(s),
  ask: (req, s) => ui.ask(req, s),
  sound: play,
});

// La partida se detiene mientras se leen las reglas
ui.onRules = () => rules.open();
rules.onToggle = (open) => {
  timing.paused = open;
};

let started = false;
ui.onStart = () => {
  if (started) return;
  started = true;
  unlockAudio();
  void engine.run();
};

ui.render(engine.state);
preloadCards();

// Enlace directo a la partida: /#jugar
if (location.hash === '#jugar') ui.onStart?.();
