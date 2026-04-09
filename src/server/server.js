/**
 * src/server/server.js
 * Sanskrit Visual Builder — HTTP + WebSocket Server
 *
 * Run:  npm start
 * Opens browser at http://localhost:3000 automatically.
 *
 * WebSocket protocol (ws://localhost:3000/ws):
 *   Client sends:  { type:'run',         data:{code} }
 *                  { type:'stop' }
 *                  { type:'get_blocks',  data:{query?} }
 *                  { type:'get_examples' }
 *                  { type:'load_example',data:{name} }
 *                  { type:'save',        data:{name,code} }
 *
 *   Server sends:  { type:'output',  data:{text} }
 *                  { type:'gate',    data:{gate,args} }
 *                  { type:'measure', data:{type,result} }
 *                  { type:'log',     data:{m} }
 *                  { type:'state',   data:{type,...} }
 *                  { type:'done',    data:{elapsed_ms} }
 *                  { type:'error',   data:{message} }
 */

import http             from 'http';
import path             from 'path';
import fs               from 'fs';
import { execSync }     from 'child_process';
import { fileURLToPath } from 'url';

import express          from 'express';
import { WebSocketServer } from 'ws';

import { SanskritInterpreter }           from '../dsl/interpreter.js';
import { buildStdlib }                   from '../dsl/stdlib.js';
import { BLOCKS, CATEGORIES, searchBlocks, blockById } from '../blocks/registry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '../../');
const PUBLIC    = path.join(ROOT, 'public');
const EXAMPLES  = path.join(ROOT, 'examples');
const PORT      = parseInt(process.env.PORT || '3000', 10);
const HOST      = process.env.HOST || 'localhost';

// ── Terminal colours ──────────────────────────────────────────────────────────
const G = '\x1b[32m', Y = '\x1b[33m', C = '\x1b[36m',
      B = '\x1b[34m', R = '\x1b[31m', Z = '\x1b[0m', W = '\x1b[1m';

const log  = m => console.log(`${C}[Sanskrit]${Z} ${m}`);
const ok   = m => console.log(`${G}✓${Z} ${m}`);
const warn = m => console.log(`${Y}⚠${Z} ${m}`);
const fail = m => console.error(`${R}✗${Z} ${m}`);

// ── Express ───────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(PUBLIC));   // serves public/index.html, js, css

// REST: all blocks (optionally filtered by ?q=query)
app.get('/api/blocks', (req, res) => {
  const q = req.query.q;
  res.json({ blocks: q ? searchBlocks(q) : BLOCKS, categories: CATEGORIES, total: BLOCKS.length });
});

// REST: single block by id
app.get('/api/blocks/:id', (req, res) => {
  const b = blockById(req.params.id);
  if (!b) return res.status(404).json({ error: 'Not found' });
  res.json(b);
});

// REST: list example .sq files
app.get('/api/examples', (req, res) => {
  try {
    if (!fs.existsSync(EXAMPLES)) return res.json([]);
    const files = fs.readdirSync(EXAMPLES).filter(f => f.endsWith('.sq')).map(f => {
      const src = fs.readFileSync(path.join(EXAMPLES, f), 'utf8');
      return { name: f, title: src.split('\n')[0].replace(/^#\s*/,'').trim() || f };
    });
    res.json(files);
  } catch { res.json([]); }
});

// REST: get single example source
app.get('/api/examples/:name', (req, res) => {
  const safe = path.basename(req.params.name);
  const fp   = path.join(EXAMPLES, safe);
  if (!safe.endsWith('.sq') || !fs.existsSync(fp)) return res.status(404).json({ error:'Not found' });
  res.json({ name: safe, code: fs.readFileSync(fp, 'utf8') });
});

// REST: synchronous run (for CI / API clients)
app.post('/api/run', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Missing code' });
  const t0 = Date.now();
  const outputs = [], logs = [];
  const interp = new SanskritInterpreter({
    output: t => outputs.push(t),
    onLog:  e => logs.push(e),
  });
  buildStdlib(interp);
  try {
    await interp.run(code);
    res.json({ success:true, outputs, elapsed_ms: Date.now()-t0, log: logs.slice(-100) });
  } catch(e) {
    res.json({ success:false, error:e.message, outputs, elapsed_ms: Date.now()-t0 });
  }
});

// REST: save .sq file
app.post('/api/save', (req, res) => {
  const { name, code } = req.body;
  if (!name || !code) return res.status(400).json({ error:'Missing name or code' });
  const safe = path.basename(name).replace(/[^a-zA-Z0-9_-]/g,'_');
  const fn   = safe.endsWith('.sq') ? safe : safe+'.sq';
  if (!fs.existsSync(EXAMPLES)) fs.mkdirSync(EXAMPLES, { recursive:true });
  fs.writeFileSync(path.join(EXAMPLES, fn), code, 'utf8');
  ok(`Saved ${fn}`);
  res.json({ success:true, name:fn });
});

// REST: health
app.get('/api/health', (req, res) =>
  res.json({ status:'ok', version:'1.0.0', blocks:BLOCKS.length,
             categories:Object.keys(CATEGORIES).length, uptime_s:Math.floor(process.uptime()) }));

// SPA fallback
app.get('*', (req, res) => {
  const idx = path.join(PUBLIC, 'index.html');
  if (fs.existsSync(idx)) res.sendFile(idx);
  else res.status(404).send('public/index.html not found — add Part 3 files.');
});

// ── HTTP + WebSocket server ───────────────────────────────────────────────────
const server = http.createServer(app);
const wss    = new WebSocketServer({ server, path: '/ws' });

// Per-client state
const clients = new Map();   // ws → { interp:SanskritInterpreter|null, running:bool }

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  log(`WS connect ${ip}`);
  clients.set(ws, { interp: null, running: false });
  send(ws, 'welcome', { version:'1.0.0', blocks:BLOCKS.length });

  ws.on('message', async raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); }
    catch { return send(ws, 'error', { message:'Invalid JSON' }); }

    const { type, data = {} } = msg;

    switch (type) {

      case 'run': {
        const client = clients.get(ws);
        if (client?.running) client.interp?.stop();   // stop previous run

        const code = (data.code || '').trim();
        if (!code) return send(ws, 'error', { message:'No code provided' });

        log(`WS run: ${code.split('\n').length} lines`);
        const t0 = Date.now();

        const interp = new SanskritInterpreter({
          output:    text  => send(ws, 'output',  { text }),
          onGate:    d     => send(ws, 'gate',    d),
          onMeasure: d     => send(ws, 'measure', d),
          onState:   d     => send(ws, 'state',   d),
          onLog:     entry => send(ws, 'log',     entry),
        });
        buildStdlib(interp);

        clients.set(ws, { interp, running: true });
        send(ws, 'start', { ts: new Date().toISOString() });

        try {
          await interp.run(code);
          const ms = Date.now() - t0;
          ok(`WS done ${ms}ms`);
          send(ws, 'done', { elapsed_ms:ms, registers:Object.keys(interp.registers) });
        } catch(e) {
          warn(`WS error: ${e.message}`);
          send(ws, 'error', { message:e.message, elapsed_ms:Date.now()-t0 });
        } finally {
          const c = clients.get(ws);
          if (c) c.running = false;
        }
        break;
      }

      case 'stop': {
        const c = clients.get(ws);
        if (c?.interp) { c.interp.stop(); c.running = false; }
        send(ws, 'stopped', { message:'Stopped by user' });
        break;
      }

      case 'get_blocks': {
        const q = data.query || '';
        const result = q ? searchBlocks(q) : BLOCKS;
        send(ws, 'blocks', { blocks:result, categories:CATEGORIES, total:result.length });
        break;
      }

      case 'get_examples': {
        try {
          if (!fs.existsSync(EXAMPLES)) { send(ws, 'examples', []); break; }
          const files = fs.readdirSync(EXAMPLES).filter(f=>f.endsWith('.sq')).map(f => {
            const src = fs.readFileSync(path.join(EXAMPLES,f),'utf8');
            return { name:f, title:src.split('\n')[0].replace(/^#\s*/,'').trim()||f,
                     preview:src.slice(0,200), lines:src.split('\n').length };
          });
          send(ws, 'examples', files);
        } catch { send(ws, 'examples', []); }
        break;
      }

      case 'load_example': {
        const safe = path.basename(data.name||'');
        const fp   = path.join(EXAMPLES, safe);
        if (!safe.endsWith('.sq') || !fs.existsSync(fp))
          return send(ws, 'error', { message:`Example "${data.name}" not found` });
        send(ws, 'example_loaded', { name:safe, code:fs.readFileSync(fp,'utf8') });
        break;
      }

      case 'save': {
        try {
          const safe = path.basename(data.name||'untitled').replace(/[^a-zA-Z0-9_-]/g,'_');
          const fn   = safe.endsWith('.sq') ? safe : safe+'.sq';
          if (!fs.existsSync(EXAMPLES)) fs.mkdirSync(EXAMPLES,{recursive:true});
          fs.writeFileSync(path.join(EXAMPLES,fn), data.code||'', 'utf8');
          ok(`Saved ${fn}`);
          send(ws, 'saved', { name:fn });
        } catch(e) { send(ws, 'error', { message:`Save failed: ${e.message}` }); }
        break;
      }

      default:
        send(ws, 'error', { message:`Unknown type: ${type}` });
    }
  });

  ws.on('close', () => {
    clients.get(ws)?.interp?.stop();
    clients.delete(ws);
    log(`WS disconnect ${ip}`);
  });

  ws.on('error', e => fail(`WS error: ${e.message}`));
});

function send(ws, type, data={}) {
  if (ws.readyState !== 1) return;
  try { ws.send(JSON.stringify({ type, data, ts:Date.now() })); } catch{}
}

// ── Start ─────────────────────────────────────────────────────────────────────
server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}`;
  console.log('');
  console.log(`${W}${C}  ╔══════════════════════════════════════════╗${Z}`);
  console.log(`${W}${C}  ║      Sanskrit Visual Builder v1.0.0      ║${Z}`);
  console.log(`${W}${C}  ╚══════════════════════════════════════════╝${Z}`);
  console.log('');
  ok(`Server  ${W}${B}${url}${Z}`);
  ok(`WS      ${W}${B}ws://${HOST}:${PORT}/ws${Z}`);
  ok(`Blocks  ${BLOCKS.length} across ${Object.keys(CATEGORIES).length} categories`);
  console.log('');

  // Auto-open browser (cross-platform) — suppress with SANSKRIT_NO_OPEN=1
  const cmds = { darwin:`open "${url}"`, win32:`start "" "${url}"`, linux:`xdg-open "${url}"` };
  const cmd  = cmds[process.platform];
  if (cmd && !process.env.SANSKRIT_NO_OPEN) {
    try { execSync(cmd); log(`Opened browser`); }
    catch { log(`Open your browser at ${url}`); }
  } else {
    log(`Open your browser at ${url}`);
  }
});

process.on('SIGINT', () => {
  log('Shutting down...');
  clients.forEach(({ interp }) => interp?.stop());
  server.close(() => { ok('Stopped'); process.exit(0); });
  setTimeout(() => process.exit(0), 2000);
});

process.on('uncaughtException',  e => fail(`Uncaught: ${e.message}`));
process.on('unhandledRejection', e => warn(`Unhandled: ${e}`));
