/**
 * public/js/app.js
 * ─────────────────────────────────────────────────────────────────────────
 * Sanskrit Visual Builder v3.1 — Main Application
 * Orchestrates: Palette, Canvas, Properties, Code Editor, Output, WebSocket
 */

import { Palette }     from './palette.js';
import { Canvas }      from './canvas.js';
import { Properties }  from './properties.js';

// ── WebSocket connection to server ──────────────────────────────────────────
let ws = null;
let wsReconnectTimer = null;

function connectWS() {
  try {
    ws = new WebSocket(`ws://${location.host}`);
    ws.onopen    = () => { updateStatus('ready'); };
    ws.onmessage = (e) => handleServerMessage(JSON.parse(e.data));
    ws.onclose   = () => {
      updateStatus('error');
      wsReconnectTimer = setTimeout(connectWS, 3000);
    };
    ws.onerror   = () => {};
  } catch(e) { updateStatus('error'); }
}

function sendWS(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
    return true;
  }
  return false;
}

// ── State ────────────────────────────────────────────────────────────────────
let isRunning = false;
let codeView  = false;

// ── DOM refs ─────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const toolbar       = $('toolbar');
const btnRun        = $('btn-run');
const btnStop       = $('btn-stop');
const btnClear      = $('btn-clear');
const btnOpen       = $('btn-open');
const btnSave       = $('btn-save');
const btnCode       = $('btn-code');
const btnExport     = $('btn-export');
const statusEl      = $('status-indicator');
const engineBadge   = $('engine-badge');
const canvasWrap    = $('canvas-wrap');
const codeWrap      = $('code-wrap');
const codeEditor    = $('code-editor');
const btnCodeRun    = $('btn-code-run');
const btnCodeClear  = $('btn-code-clear');
const exampleSel    = $('example-selector');
const outputLines   = $('output-lines');
const outputPanel   = $('output-panel');
const btnOutClear   = $('btn-output-clear');
const btnOutToggle  = $('btn-output-toggle');
const fileInput     = $('file-open-input');
const exportModal   = $('export-modal');
const exportFormat  = $('export-format');
const exportOutput  = $('export-output');
const btnExportGen  = $('btn-export-generate');
const btnExportCopy = $('btn-export-copy');
const btnExportDl   = $('btn-export-download');

// ── Subsystems ───────────────────────────────────────────────────────────────
const palette    = new Palette(document.getElementById('palette-list'),
                               document.getElementById('palette-search'),
                               document.getElementById('palette-clear-search'));
const canvas     = new Canvas(document.getElementById('canvas'));
const properties = new Properties(document.getElementById('properties-form'),
                                  document.getElementById('properties-empty'),
                                  document.getElementById('properties-title'));

// ── Toolbar actions ──────────────────────────────────────────────────────────
btnRun.addEventListener('click',  runProgram);
btnStop.addEventListener('click', stopProgram);

btnClear.addEventListener('click', () => {
  if (codeView) { codeEditor.value = ''; return; }
  if (confirm('Clear canvas? This cannot be undone.')) canvas.clear();
});

btnCode.addEventListener('click', toggleCodeView);
btnExport.addEventListener('click', () => { exportOutput.value=''; exportModal.classList.remove('hidden'); });

btnOpen.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = ev => {
    codeEditor.value = ev.target.result;
    if (!codeView) toggleCodeView();
    addOutput('info', `📂 Loaded: ${f.name}`);
  };
  r.readAsText(f);
  fileInput.value = '';
});

btnSave.addEventListener('click', () => {
  const code = codeView ? codeEditor.value : canvas.toCode();
  if (!code.trim()) { addOutput('error', 'Nothing to save.'); return; }
  const blob = new Blob([code], { type: 'text/plain' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'program.sq'; a.click(); URL.revokeObjectURL(a.href);
  addOutput('info', '💾 Saved as program.sq');
});

// Code run button
btnCodeRun.addEventListener('click', runProgram);
$('btn-code-clear').addEventListener('click', () => codeEditor.value = '');

// Keyboard shortcut: Ctrl+Enter to run
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runProgram(); }
});

// Tab in code editor
codeEditor.addEventListener('keydown', e => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const s = codeEditor.selectionStart;
    const t = codeEditor.selectionEnd;
    codeEditor.value = codeEditor.value.substring(0,s) + '    ' + codeEditor.value.substring(t);
    codeEditor.selectionStart = codeEditor.selectionEnd = s + 4;
  }
});

// Example loader
exampleSel.addEventListener('change', e => {
  const v = e.target.value; if (!v) return;
  codeEditor.value = EXAMPLES[v] || '';
  e.target.value = '';
  addOutput('info', `📖 Loaded example: ${v}`);
});

// Output controls
btnOutClear.addEventListener('click', () => { outputLines.innerHTML = ''; });
btnOutToggle.addEventListener('click', () => {
  const collapsed = outputPanel.classList.toggle('collapsed');
  btnOutToggle.textContent = collapsed ? '▲' : '▼';
});
$('properties-close').addEventListener('click', () => { properties.deselect(); });

// Modal close
document.querySelectorAll('.modal-close,[data-modal]').forEach(el => {
  el.addEventListener('click', () => {
    const mid = el.dataset.modal || el.closest('.modal')?.id;
    if (mid) document.getElementById(mid)?.classList.add('hidden');
  });
});
exportModal.addEventListener('click', e => { if (e.target === exportModal) exportModal.classList.add('hidden'); });

// Export
btnExportGen.addEventListener('click', async () => {
  const code = codeView ? codeEditor.value : canvas.toCode();
  const fmt  = exportFormat.value;
  const res  = await fetch('/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, format: fmt })
  }).catch(() => null);
  if (!res?.ok) { exportOutput.value = '-- Server not available. Run npm start first.'; return; }
  const data = await res.json();
  exportOutput.value = data.output || data.error || '';
});

btnExportCopy.addEventListener('click', () => {
  navigator.clipboard.writeText(exportOutput.value).then(() => {
    btnExportCopy.textContent = 'Copied!';
    setTimeout(() => { btnExportCopy.textContent = 'Copy'; }, 1500);
  });
});

btnExportDl.addEventListener('click', () => {
  const exts = { qasm2:'qasm', qasm3:'qasm', ibm:'json', ionq:'json',
                 cirq:'py', braket:'py', quil:'quil', qir:'ll', svg:'svg', json:'json' };
  const ext  = exts[exportFormat.value] || 'txt';
  const blob = new Blob([exportOutput.value], { type: 'text/plain' });
  const a    = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `circuit.${ext}`; a.click();
  URL.revokeObjectURL(a.href);
});

// Canvas → Properties wiring
canvas.onBlockSelect = (block) => {
  if (block) properties.show(block, (field, value) => {
    canvas.updateBlockParam(block.id, field, value);
  });
  else properties.deselect();
};

// ── RUN / STOP ───────────────────────────────────────────────────────────────
function runProgram() {
  if (isRunning) return;
  const code = codeView ? codeEditor.value.trim() : canvas.toCode();
  if (!code) { addOutput('error', 'Nothing to run.'); return; }

  clearOutput();
  setRunning(true);

  if (!sendWS({ type: 'run', code })) {
    // Fallback: use REST API
    fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, timeout: 30000 })
    }).then(r => r.json()).then(data => {
      (data.output || []).forEach(item => displayOutput(item));
      if (data.error) addOutput('error', data.error);
      setRunning(false);
      if (data.elapsed_ms !== undefined) addOutput('timing', `⏱ ${data.elapsed_ms}ms`);
    }).catch(e => {
      addOutput('error', `Cannot reach server: ${e.message}\nRun "npm start" in your terminal.`);
      setRunning(false);
    });
  }
}

function stopProgram() {
  sendWS({ type: 'stop' });
  setRunning(false);
  addOutput('info', '■ Stopped');
}

// ── Server message handler ────────────────────────────────────────────────────
function handleServerMessage(msg) {
  switch (msg.type) {
    case 'output':      displayOutput(msg.data); break;
    case 'gate_applied':addOutput('gate', `⟨gate⟩ ${msg.gate}(${msg.qubit !== undefined ? `q[${msg.qubit}]` : ''})`); break;
    case 'measure':     addOutput('measure', `⟨measure⟩ ${JSON.stringify(msg.result)}`); break;
    case 'done':        setRunning(false); addOutput('timing', `⏱ ${msg.elapsed_ms}ms`); break;
    case 'error':       setRunning(false); addOutput('error', `✗ ${msg.message}`); break;
    case 'engine':      engineBadge.textContent = msg.engine === 'rust' ? 'Rust' : 'JS';
                        engineBadge.className   = msg.engine === 'rust' ? 'badge-rust' : 'badge-js'; break;
  }
}

function displayOutput(item) {
  if (!item) return;
  switch (item.type) {
    case 'print':   addOutput('print', formatValue(item.value)); break;
    case 'gate':    addOutput('gate',  `⟨gate⟩ ${item.gate}[${item.qubit ?? ''}]`); break;
    case 'measure': addOutput('measure', `⟨measure⟩ ${JSON.stringify(item.result || item.value)}`); break;
    case 'register':addOutput('reg',  `⟨register⟩ "${item.name}" ${item.n_q} qubits`); break;
    case 'error':   addOutput('error', `✗ ${item.message}`); break;
    default:        if (item.value !== undefined) addOutput('print', formatValue(item.value));
  }
}

function formatValue(v) {
  if (v === null || v === undefined) return 'None';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// ── Output helpers ────────────────────────────────────────────────────────────
function addOutput(type, text) {
  const line = document.createElement('div');
  line.className = `output-line type-${type}`;
  line.textContent = text;
  outputLines.appendChild(line);
  outputLines.scrollTop = outputLines.scrollHeight;
  // Auto-expand output panel if collapsed
  if (outputPanel.classList.contains('collapsed') && type !== 'timing') {
    outputPanel.classList.remove('collapsed');
    btnOutToggle.textContent = '▼';
  }
}

function clearOutput() { outputLines.innerHTML = ''; }

// ── UI state ─────────────────────────────────────────────────────────────────
function setRunning(v) {
  isRunning = v;
  btnRun.disabled  = v;
  btnStop.disabled = !v;
  statusEl.textContent = v ? '● Running' : '● Ready';
  statusEl.className   = v ? 'status-running' : 'status-ready';
}

function updateStatus(s) {
  if (s === 'error') { statusEl.textContent = '● Disconnected'; statusEl.className = 'status-error'; }
  else               { statusEl.textContent = '● Ready';        statusEl.className = 'status-ready'; }
}

function toggleCodeView() {
  codeView = !codeView;
  btnCode.classList.toggle('active', codeView);
  canvasWrap.classList.toggle('hidden',  codeView);
  codeWrap.classList.toggle('hidden',   !codeView);
  if (codeView && !codeEditor.value.trim()) {
    codeEditor.value = canvas.toCode();
  }
}

// ── Built-in examples ─────────────────────────────────────────────────────────
const EXAMPLES = {

bell: `-- Bell State: Quantum Entanglement Hello World
-- Creates two perfectly entangled qubits
-- Result: only "00" and "11" — never "01" or "10"

let q = qubits(2)
H(q[0])                              -- superposition
CNOT(q[0], q[1])                     -- entangle
let result = measure_all(q, shots=1000)
print("Bell State histogram:")
print(result.histogram)
let p00 = dict_get(result.histogram, "00", 0) / 1000.0
let p11 = dict_get(result.histogram, "11", 0) / 1000.0
print(f"P(00) = {p00:.3f}  P(11) = {p11:.3f}")`,

grover: `-- Grover Search: Find item 7 in 16-item database
-- Quantum: ~3 queries. Classical: up to 16 queries.

let n_qubits = 4
let target = 7
let shots = 2000

print(f"Searching for {target} (binary '0111') in {2**n_qubits} items...")
let result = grover(n_qubits, [target], shots)
let found  = dict_get(result.histogram, "0111", 0)
print(f"Target '0111' found: {found}/{shots} ({round_to(found/shots*100,1)}%)")
print("Full histogram:")
print(result.histogram)`,

vqe: `-- VQE: Ground State Energy of Hydrogen Molecule H2
-- Exact FCI answer: -1.137270 Hartree
-- Chemical accuracy requires error < 0.001 Hartree (1 mHa)

molecule H2 {
    atoms: [H, H],
    bond_length: 0.74,
    basis_set: "STO-3G",
    charge: 0,
    multiplicity: 1
}

print("Running VQE for H2...")
let result = vqe(H2, ansatz="UCCSD", optimizer="COBYLA", shots=2000)
let exact  = -1.137270
let error  = abs(result.energy - exact) * 1000
print(f"VQE energy:  {result.energy:.6f} Ha")
print(f"Exact FCI:   {exact:.6f} Ha")
print(f"Error:       {error:.3f} mHa")
print(f"Chemical accuracy: {error < 1.0}")`,

teleport: `-- Quantum Teleportation Protocol
-- Teleport an unknown qubit state from Alice to Bob

def teleport(angle):
    let q = qubits(3)
    Ry(q[0], angle)
    H(q[1]); CNOT(q[1], q[2])
    CNOT(q[0], q[1]); H(q[0])
    let m0 = measure(q[0])
    let m1 = measure(q[1])
    if m1 == 1: X(q[2])
    if m0 == 1: Z(q[2])
    let probs = probabilities(q)
    let expected = round_to(cos(angle/2)**2, 4)
    print(f"angle={round_to(angle,3)}: expected P(0)={expected}")

print("=== Quantum Teleportation ===")
for a in [0.0, PI/4, PI/2, PI]:
    teleport(a)`,

qrng: `-- Quantum Random Number Generator
-- Truly random numbers using quantum measurement

def qrand(lo, hi):
    let range = hi - lo + 1
    let n = n_qubits_for(range)
    let q = qubits(n)
    H_all(q)
    let bits = [measure(q[i]) for i in range(n)]
    let v = bits_to_int(join([str(b) for b in bits], ""))
    if v >= range: return qrand(lo, hi)
    return lo + v

print("10 quantum random integers (1-100):")
print([qrand(1, 100) for _ in range(10)])
print("")
print("1000 coin flips (should be ~50/50):")
let coins = [qrand(0,1) for _ in range(1000)]
let h = len(filter(fn(x): return x==0, coins))
print(f"Heads: {h}  Tails: {1000-h}")`,

stats: `-- Statistical Analysis of Measurement Data

let data = [2.3, 4.1, 3.8, 5.2, 4.7, 3.9, 6.1, 4.5, 5.0, 4.3,
            3.7, 4.9, 5.5, 3.2, 4.8, 5.1, 4.0, 3.6, 4.4, 5.3]

print("=== Descriptive Statistics ===")
print(f"N:           {len(data)}")
print(f"Mean:        {mean(data):.4f}")
print(f"Median:      {median(data):.4f}")
print(f"Std Dev:     {stdev(data):.4f}")
print(f"Std Error:   {stderr(data):.4f}")
print(f"Min/Max:     {min(data):.2f} / {max(data):.2f}")
print(f"IQR:         {iqr(data):.4f}")
print(f"95th pct:    {percentile(data,95):.4f}")
print("")
let t = t_test_one_sample(data, 4.0)
print(f"T-test vs mu=4.0: t={t.t_stat:.4f}, mean={t.mean:.4f}")`,

shor: `-- Shor's Factoring Algorithm
-- Factors integers using quantum period finding

for N in [15, 21, 33, 35]:
    let r = shor_factor(N=N, a=2, n_count_qubits=8, shots=2000)
    print(f"{N} = {r.factors[0]} x {r.factors[1]}")

-- Expected: 15=3x5, 21=3x7, 33=3x11, 35=5x7`,

qaoa: `-- QAOA Portfolio Optimisation
-- Select best 2 assets from 4 using quantum optimisation

let assets  = ["RELIANCE", "TCS", "HDFC", "INFOSYS"]
let returns = [0.24, 0.31, 0.19, 0.28]
let vols    = [0.22, 0.25, 0.18, 0.26]

print("Assets:")
for i in range(4):
    let sharpe = returns[i] / vols[i]
    print(f"  {assets[i]}: return={returns[i]*100:.0f}%  vol={vols[i]*100:.0f}%  Sharpe={sharpe:.3f}")

print("")
print("Running QAOA (p=3 layers)...")
let edges = [[0,1],[1,2],[2,3],[3,0],[0,2],[1,3]]
let r = qaoa(n_nodes=4, edges=edges, p_layers=3, shots=2000)
print("QAOA results:")
let sorted = sort_by(items(r.histogram), fn(kv): return -kv[1])
for kv in sorted[:3]:
    let sel = [assets[i] for i in range(4) if kv[0][i]=="1"]
    print(f"  {kv[0]}: {sel} — {kv[1]} times")`,
};

// ── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  await palette.load();
  canvas.init();

  // Connect WebSocket
  connectWS();

  // Check engine type via API
  fetch('/api/health').then(r => r.json()).then(d => {
    const engine = d.engine || 'js';
    engineBadge.textContent = engine === 'rust' ? 'Rust' : 'JS';
    engineBadge.className   = engine === 'rust' ? 'badge-rust' : 'badge-js';
    addOutput('info', `⟨ψ⟩ Sanskrit Visual Builder v3.1 — Engine: ${engine.toUpperCase()}`);
    addOutput('info', `📦 ${d.n_blocks || 528} blocks loaded across ${d.n_categories || 42} categories`);
  }).catch(() => {
    addOutput('info', '⟨ψ⟩ Sanskrit Visual Builder v3.1');
    addOutput('info', '⚠ Server not running — start with: npm start');
  });
}

init().catch(console.error);
