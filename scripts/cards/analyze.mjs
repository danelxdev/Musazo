import { spawn } from 'node:child_process';
import fs from 'node:fs';
const CH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9400 + Math.floor(Math.random() * 400);
const proc = spawn(CH, ['--headless=new', '--disable-gpu', '--allow-file-access-from-files', `--remote-debugging-port=${port}`, '--user-data-dir=' + process.env.TEMP + '/cdpa-' + port, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(200); } }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pend = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Emulation.setDeviceMetricsOverride', { width: 2600, height: 1700, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: process.argv[2] });
await sleep(3000);
const r = await send('Runtime.evaluate', { expression: fs.readFileSync(process.argv[3], 'utf8'), returnByValue: true });
fs.writeFileSync(process.argv[4], typeof r.result.value === 'string' ? r.result.value : JSON.stringify(r.result.value ?? r, null, 1));
proc.kill(); process.exit(0);
