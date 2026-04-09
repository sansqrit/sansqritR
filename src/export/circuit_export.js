/**
 * src/export/circuit_export.js
 * Circuit Export — converts Sanskrit circuit definitions to standard formats.
 *
 * Supported formats:
 *   qasm2    OpenQASM 2.0  (IBM Quantum, Qiskit)
 *   qasm3    OpenQASM 3.0
 *   ibm      IBM Quantum JSON
 *   ionq     IonQ JSON
 *   cirq     Google Cirq Python
 *   braket   AWS Braket Python
 *   quil     Rigetti Quil
 *   qir      QIR LLVM IR (stub)
 *   svg      Circuit diagram SVG
 *   json     Generic JSON (for UI)
 *
 * Usage from Sanskrit DSL:
 *   circuit Bell {
 *     let q = qubits(2)
 *     H(q[0])
 *     CNOT(q[0], q[1])
 *   }
 *   Bell.export_qasm("bell.qasm")
 *   Bell.export_ibm("bell.json")
 *   Bell.draw()
 *
 * Usage from JS:
 *   import { exportCircuit, circuitToSVG } from './src/export/circuit_export.js';
 *   const qasm = exportCircuit(circuitDef, 'qasm2');
 *   const svg  = circuitToSVG(circuitDef);
 */

// ── Gate metadata ─────────────────────────────────────────────────
// Maps gate name → { n_qubits, n_params, qasm2, qasm3, cirq, braket, quil, ionq }
const GATE_META = {
  // Single-qubit Clifford
  H:     { n:1, p:0, qasm2:'h',     qasm3:'h',     cirq:'H',    braket:'H',    quil:'H',   ionq:'h'  },
  X:     { n:1, p:0, qasm2:'x',     qasm3:'x',     cirq:'X',    braket:'X',    quil:'X',   ionq:'x'  },
  Y:     { n:1, p:0, qasm2:'y',     qasm3:'y',     cirq:'Y',    braket:'Y',    quil:'Y',   ionq:'y'  },
  Z:     { n:1, p:0, qasm2:'z',     qasm3:'z',     cirq:'Z',    braket:'Z',    quil:'Z',   ionq:'z'  },
  S:     { n:1, p:0, qasm2:'s',     qasm3:'s',     cirq:'S',    braket:'S',    quil:'S',   ionq:'s'  },
  Sdg:   { n:1, p:0, qasm2:'sdg',   qasm3:'sdg',   cirq:'S**-1',braket:'Si',   quil:'DAGGER S', ionq:'sdg' },
  T:     { n:1, p:0, qasm2:'t',     qasm3:'t',     cirq:'T',    braket:'T',    quil:'T',   ionq:'t'  },
  Tdg:   { n:1, p:0, qasm2:'tdg',   qasm3:'tdg',   cirq:'T**-1',braket:'Ti',   quil:'DAGGER T', ionq:'tdg' },
  SX:    { n:1, p:0, qasm2:'sx',    qasm3:'sx',    cirq:'X**0.5',braket:'V',   quil:'SQRT-X', ionq:'v' },
  SXdg:  { n:1, p:0, qasm2:'sxdg',  qasm3:'sxdg',  cirq:'X**-0.5',braket:'Vi',quil:'DAGGER SQRT-X', ionq:'vi' },
  I:     { n:1, p:0, qasm2:'id',    qasm3:'id',    cirq:'I',    braket:'I',    quil:'I',   ionq:'id' },
  // Single-qubit rotation
  Rx:    { n:1, p:1, qasm2:'rx',    qasm3:'rx',    cirq:'rx',   braket:'Rx',   quil:'RX',  ionq:'rx' },
  Ry:    { n:1, p:1, qasm2:'ry',    qasm3:'ry',    cirq:'ry',   braket:'Ry',   quil:'RY',  ionq:'ry' },
  Rz:    { n:1, p:1, qasm2:'rz',    qasm3:'rz',    cirq:'rz',   braket:'Rz',   quil:'RZ',  ionq:'rz' },
  P:     { n:1, p:1, qasm2:'p',     qasm3:'p',     cirq:'ZPowGate',braket:'PhaseShift', quil:'PHASE', ionq:'gpi2' },
  U1:    { n:1, p:1, qasm2:'u1',    qasm3:'U(0,0,λ)',cirq:'ZPowGate',braket:'U',quil:'U1', ionq:'rz' },
  U2:    { n:1, p:2, qasm2:'u2',    qasm3:'U(π/2,φ,λ)',cirq:'MatrixGate',braket:'U',quil:'U2', ionq:'u2' },
  U3:    { n:1, p:3, qasm2:'u3',    qasm3:'U',     cirq:'MatrixGate',braket:'U',quil:'U3', ionq:'ms' },
  U:     { n:1, p:3, qasm2:'u3',    qasm3:'U',     cirq:'MatrixGate',braket:'U',quil:'U3', ionq:'ms' },
  // Two-qubit
  CNOT:  { n:2, p:0, qasm2:'cx',    qasm3:'cx',    cirq:'CNOT', braket:'CNot', quil:'CNOT', ionq:'cnot' },
  CX:    { n:2, p:0, qasm2:'cx',    qasm3:'cx',    cirq:'CNOT', braket:'CNot', quil:'CNOT', ionq:'cnot' },
  CY:    { n:2, p:0, qasm2:'cy',    qasm3:'cy',    cirq:'CY',   braket:'CY',   quil:'CY',   ionq:'cy' },
  CZ:    { n:2, p:0, qasm2:'cz',    qasm3:'cz',    cirq:'CZ',   braket:'CZ',   quil:'CZ',   ionq:'cz' },
  SWAP:  { n:2, p:0, qasm2:'swap',  qasm3:'swap',  cirq:'SWAP', braket:'Swap', quil:'SWAP', ionq:'swap' },
  iSWAP: { n:2, p:0, qasm2:'iswap', qasm3:'iswap', cirq:'ISWAP',braket:'ISwap',quil:'ISWAP',ionq:'iswap' },
  CRz:   { n:2, p:1, qasm2:'crz',   qasm3:'crz',   cirq:'CZPowGate',braket:'CPhaseShift',quil:'CRZ', ionq:'zz' },
  CP:    { n:2, p:1, qasm2:'cp',    qasm3:'cp',    cirq:'CZPowGate',braket:'CPhaseShift',quil:'CPHASE', ionq:'zz' },
  RXX:   { n:2, p:1, qasm2:'rxx',   qasm3:'rxx',   cirq:'XXPowGate',braket:'XX',quil:'RXX', ionq:'xx' },
  RYY:   { n:2, p:1, qasm2:'ryy',   qasm3:'ryy',   cirq:'YYPowGate',braket:'YY',quil:'RYY', ionq:'yy' },
  RZZ:   { n:2, p:1, qasm2:'rzz',   qasm3:'rzz',   cirq:'ZZPowGate',braket:'ZZ',quil:'RZZ', ionq:'zz' },
  // Three-qubit
  Toffoli:{ n:3, p:0, qasm2:'ccx',  qasm3:'ccx',   cirq:'CCX',  braket:'CCNot',quil:'CCNOT', ionq:'ccnot' },
  CCX:    { n:3, p:0, qasm2:'ccx',  qasm3:'ccx',   cirq:'CCX',  braket:'CCNot',quil:'CCNOT', ionq:'ccnot' },
  Fredkin:{ n:3, p:0, qasm2:'cswap',qasm3:'cswap', cirq:'CSWAP',braket:'CSwap',quil:'CSWAP', ionq:'cswap' },
  CSWAP:  { n:3, p:0, qasm2:'cswap',qasm3:'cswap', cirq:'CSWAP',braket:'CSwap',quil:'CSWAP', ionq:'cswap' },
  // Special
  qft:    { n:-1, p:0, qasm2:'// QFT',qasm3:'// QFT',cirq:'QuantumFourierTransform',braket:'// QFT',quil:'// QFT',ionq:'// QFT' },
  reset:  { n:1,  p:0, qasm2:'reset', qasm3:'reset',  cirq:'reset',braket:'// reset',quil:'RESET', ionq:'// reset' },
};

// ── Format helpers ────────────────────────────────────────────────
function fmtAngle(a) {
  if (a === undefined || a === null) return '0';
  const n = parseFloat(a);
  if (isNaN(n)) return String(a);
  // Express as fraction of pi if close
  const fracs = [[1,1],[1,2],[1,3],[1,4],[1,6],[1,8],[2,3],[3,4],[3,2],[5,4],[5,6],[7,4],[7,6]];
  for (const [num, den] of fracs) {
    if (Math.abs(n - Math.PI*num/den) < 1e-8) return den===1 ? `pi*${num}` : `pi*${num}/${den}`;
    if (Math.abs(n + Math.PI*num/den) < 1e-8) return den===1 ? `-pi*${num}` : `-pi*${num}/${den}`;
  }
  if (Math.abs(n) < 1e-10) return '0';
  return n.toFixed(6);
}

function fmtAngleQASM(a) { return fmtAngle(a).replace('pi','pi'); }
function fmtAnglePy(a)   { return fmtAngle(a).replace('pi','np.pi'); }
function fmtAngleBraket(a){ return fmtAngle(a).replace('pi','np.pi'); }

// ── OpenQASM 2.0 ──────────────────────────────────────────────────
export function toQASM2(circuit) {
  const n = circuit.n_qubits || 2;
  const lines = [
    'OPENQASM 2.0;',
    'include "qelib1.inc";',
    '',
    `// Circuit: ${circuit.name}`,
    `qreg q[${n}];`,
    `creg c[${n}];`,
    '',
  ];

  for (const g of (circuit.gates || [])) {
    const meta = GATE_META[g.gate];
    if (!meta) { lines.push(`// unknown gate: ${g.gate}`); continue; }
    const name  = meta.qasm2;
    const qargs = (g.qubits || []).map(q => `q[${q}]`).join(', ');
    const params = (g.params || []).length
      ? `(${g.params.map(fmtAngleQASM).join(', ')}) `
      : '';
    lines.push(`${name} ${params}${qargs};`);
  }

  lines.push('', `// measure all`);
  lines.push(`measure q -> c;`);
  return lines.join('\n');
}

// ── OpenQASM 3.0 ──────────────────────────────────────────────────
export function toQASM3(circuit) {
  const n = circuit.n_qubits || 2;
  const lines = [
    'OPENQASM 3.0;',
    '',
    `// Circuit: ${circuit.name}`,
    `qubit[${n}] q;`,
    `bit[${n}] c;`,
    '',
  ];

  for (const g of (circuit.gates || [])) {
    const meta = GATE_META[g.gate];
    if (!meta) { lines.push(`// unknown gate: ${g.gate}`); continue; }
    const name  = meta.qasm3;
    const qargs = (g.qubits || []).map(q => `q[${q}]`).join(', ');
    const params = (g.params || []).length
      ? `(${g.params.map(fmtAngleQASM).join(', ')}) `
      : '';
    lines.push(`${name} ${params}${qargs};`);
  }

  lines.push('', `c = measure q;`);
  return lines.join('\n');
}

// ── IBM Quantum JSON ──────────────────────────────────────────────
export function toIBM(circuit) {
  const n = circuit.n_qubits || 2;
  const instructions = (circuit.gates || []).map(g => {
    const meta = GATE_META[g.gate];
    return {
      name:   meta?.qasm2 || g.gate.toLowerCase(),
      qubits: g.qubits || [],
      params: (g.params || []).map(p => parseFloat(p) || 0),
    };
  });
  instructions.push({ name:'measure', qubits:Array.from({length:n},(_,i)=>i), params:[] });

  return JSON.stringify({
    name:         circuit.name,
    backend:      'ibm_nairobi',
    shots:        1024,
    n_qubits:     n,
    instructions,
    metadata: {
      generated_by: 'Sanskrit DSL v3.0',
      generated_at: new Date().toISOString(),
    },
  }, null, 2);
}

// ── IonQ JSON ─────────────────────────────────────────────────────
export function toIonQ(circuit) {
  const n = circuit.n_qubits || 2;
  const gateDefs = (circuit.gates || []).map(g => {
    const meta = GATE_META[g.gate];
    const def = {
      gate:   meta?.ionq || g.gate.toLowerCase(),
      target: (g.qubits || [])[0] ?? 0,
    };
    if ((g.qubits||[]).length > 1) def.control = g.qubits[0], def.target = g.qubits[1];
    if ((g.params||[]).length)     def.rotation = parseFloat(g.params[0]) || 0;
    return def;
  });

  return JSON.stringify({
    lang:         'json',
    body:         gateDefs,
    target:       'simulator',
    shots:        1024,
    qubits:       n,
    name:         circuit.name,
    metadata: {
      generated_by: 'Sanskrit DSL v3.0',
    },
  }, null, 2);
}

// ── Google Cirq Python ────────────────────────────────────────────
export function toCirq(circuit) {
  const n = circuit.n_qubits || 2;
  const lines = [
    '"""',
    `Circuit: ${circuit.name}`,
    `Generated by Sanskrit DSL v3.0`,
    '"""',
    'import cirq',
    'import numpy as np',
    '',
    `qubits = cirq.LineQubit.range(${n})`,
    `q = qubits   # alias: q[0], q[1], ...`,
    '',
    `circuit = cirq.Circuit([`,
  ];

  for (const g of (circuit.gates || [])) {
    const meta = GATE_META[g.gate];
    const qs   = (g.qubits || []).map(i => `q[${i}]`).join(', ');
    const cirqName = meta?.cirq || `MatrixGate  # ${g.gate}`;
    const params   = (g.params||[]).length
      ? `(rads=${fmtAnglePy(g.params[0])}).on`
      : `.on`;
    lines.push(`    cirq.${cirqName}${params}(${qs}),`);
  }

  lines.push(`])`, '', `# Simulate`, `simulator = cirq.Simulator()`, `result = simulator.simulate(circuit)`, `print(result)`);
  return lines.join('\n');
}

// ── AWS Braket Python ─────────────────────────────────────────────
export function toBraket(circuit) {
  const n = circuit.n_qubits || 2;
  const lines = [
    '"""',
    `Circuit: ${circuit.name}`,
    `Generated by Sanskrit DSL v3.0`,
    '"""',
    'from braket.circuits import Circuit',
    'import numpy as np',
    '',
    `circuit = Circuit()`,
    '',
  ];

  for (const g of (circuit.gates || [])) {
    const meta = GATE_META[g.gate];
    const name = meta?.braket || g.gate;
    const qs   = (g.qubits || []).join(', ');
    const params = (g.params||[]).length
      ? `, ${g.params.map(fmtAngleBraket).join(', ')}`
      : '';
    lines.push(`circuit.${name.toLowerCase()}(${qs}${params})`);
  }

  lines.push(
    '',
    '# Run on local simulator',
    'from braket.devices import LocalSimulator',
    'device = LocalSimulator()',
    `task = device.run(circuit, shots=1024)`,
    `result = task.result()`,
    `print(result.measurement_counts)`,
  );
  return lines.join('\n');
}

// ── Rigetti Quil ──────────────────────────────────────────────────
export function toQuil(circuit) {
  const n = circuit.n_qubits || 2;
  const lines = [
    `# Circuit: ${circuit.name}`,
    `# Generated by Sanskrit DSL v3.0`,
    '',
    `DECLARE ro BIT[${n}]`,
    '',
  ];

  for (const g of (circuit.gates || [])) {
    const meta  = GATE_META[g.gate];
    const name  = meta?.quil || g.gate;
    const params = (g.params||[]).length
      ? `(${g.params.map(fmtAngle).join(', ')}) `
      : '';
    const qargs = (g.qubits || []).join(' ');
    lines.push(`${name} ${params}${qargs}`);
  }

  lines.push('');
  for (let i = 0; i < n; i++) lines.push(`MEASURE ${i} ro[${i}]`);
  return lines.join('\n');
}

// ── QIR (LLVM IR stub) ────────────────────────────────────────────
export function toQIR(circuit) {
  const n = circuit.n_qubits || 2;
  return [
    `; QIR: ${circuit.name}`,
    `; Generated by Sanskrit DSL v3.0`,
    `; n_qubits: ${n}`,
    '',
    `%Qubit = type opaque`,
    `%Result = type opaque`,
    '',
    `define void @${circuit.name.replace(/\s+/g,'_')}() {`,
    `entry:`,
    ...(circuit.gates||[]).map(g =>
      `  call void @__quantum__qis__${(GATE_META[g.gate]?.qasm2||g.gate).toLowerCase()}__body(${
        (g.qubits||[]).map(q=>`%Qubit* inttoptr (i64 ${q} to %Qubit*)`).join(', ')
      })`
    ),
    `  ret void`,
    `}`,
  ].join('\n');
}

// ── Generic JSON ──────────────────────────────────────────────────
export function toJSON(circuit) {
  return JSON.stringify({
    name:     circuit.name,
    n_qubits: circuit.n_qubits || 2,
    n_gates:  (circuit.gates||[]).length,
    gates:    (circuit.gates||[]).map(g => ({
      gate:   g.gate,
      qubits: g.qubits || [],
      params: (g.params||[]).map(p => parseFloat(p)||0),
    })),
    metadata: {
      generated_by: 'Sanskrit DSL v3.0',
      generated_at: new Date().toISOString(),
    },
  }, null, 2);
}

// ── SVG circuit diagram ───────────────────────────────────────────
export function toSVG(circuit) {
  const n      = circuit.n_qubits || 2;
  const gates  = circuit.gates || [];
  const COL_W  = 60;
  const ROW_H  = 50;
  const LEFT   = 80;
  const TOP    = 40;
  const COLS   = Math.max(gates.length, 1);
  const WIDTH  = LEFT + COLS * COL_W + 60;
  const HEIGHT = TOP  + n * ROW_H + 40;

  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" font-family="monospace" font-size="13">`,
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="#1a1a2e" rx="8"/>`,
    `<text x="10" y="20" fill="#888" font-size="11">${circuit.name} — ${gates.length} gates, ${n} qubits</text>`,
  ];

  // Qubit lines + labels
  for (let q = 0; q < n; q++) {
    const y = TOP + q * ROW_H + ROW_H / 2;
    lines.push(`<text x="8" y="${y+4}" fill="#88aaff">q[${q}]</text>`);
    lines.push(`<line x1="${LEFT-5}" y1="${y}" x2="${WIDTH-20}" y2="${y}" stroke="#334" stroke-width="2"/>`);
  }

  // Gates
  const GATE_COLORS = {
    H:'#4a9eff',X:'#ff6b6b',Y:'#ffd93d',Z:'#6bcb77',
    S:'#c77dff',T:'#ff9f43',Rx:'#ff6348',Ry:'#2ed573',Rz:'#1e90ff',
    CNOT:'#ff6b6b',CX:'#ff6b6b',CZ:'#6bcb77',SWAP:'#ffd93d',
    Toffoli:'#ff6b6b',CCX:'#ff6b6b',
  };

  gates.forEach((g, col) => {
    const cx = LEFT + col * COL_W + COL_W / 2;
    const qs = g.qubits || [];
    const color = GATE_COLORS[g.gate] || '#aaa';

    if (qs.length === 1) {
      // Single-qubit gate box
      const y = TOP + qs[0] * ROW_H + ROW_H / 2;
      lines.push(`<rect x="${cx-16}" y="${y-14}" width="32" height="28" rx="4" fill="${color}" opacity="0.85"/>`);
      lines.push(`<text x="${cx}" y="${y+4}" text-anchor="middle" fill="#000" font-weight="bold" font-size="11">${g.gate}</text>`);
    } else if (qs.length === 2) {
      // Two-qubit gate — control dot + target
      const [c, t] = qs;
      const cy = TOP + c * ROW_H + ROW_H / 2;
      const ty = TOP + t * ROW_H + ROW_H / 2;
      // Vertical line
      lines.push(`<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${ty}" stroke="${color}" stroke-width="2"/>`);
      if (g.gate === 'CNOT' || g.gate === 'CX') {
        // Control dot
        lines.push(`<circle cx="${cx}" cy="${cy}" r="5" fill="${color}"/>`);
        // Target circle with X
        lines.push(`<circle cx="${cx}" cy="${ty}" r="14" fill="none" stroke="${color}" stroke-width="2"/>`);
        lines.push(`<line x1="${cx-14}" y1="${ty}" x2="${cx+14}" y2="${ty}" stroke="${color}" stroke-width="2"/>`);
        lines.push(`<line x1="${cx}" y1="${ty-14}" x2="${cx}" y2="${ty+14}" stroke="${color}" stroke-width="2"/>`);
      } else if (g.gate === 'SWAP') {
        // Two X marks
        for (const y of [cy, ty]) {
          lines.push(`<line x1="${cx-8}" y1="${y-8}" x2="${cx+8}" y2="${y+8}" stroke="${color}" stroke-width="2"/>`);
          lines.push(`<line x1="${cx+8}" y1="${y-8}" x2="${cx-8}" y2="${y+8}" stroke="${color}" stroke-width="2"/>`);
        }
      } else {
        // Generic two-qubit box
        const y1 = Math.min(cy, ty);
        const h  = Math.abs(ty - cy);
        lines.push(`<rect x="${cx-16}" y="${y1-14}" width="32" height="${h+28}" rx="4" fill="${color}" opacity="0.7"/>`);
        lines.push(`<text x="${cx}" y="${(y1+ty)/2+4}" text-anchor="middle" fill="#000" font-weight="bold" font-size="10">${g.gate}</text>`);
      }
    } else if (qs.length >= 3) {
      // Three-qubit gate
      const ys = qs.map(q => TOP + q * ROW_H + ROW_H / 2);
      const y1 = Math.min(...ys), y2 = Math.max(...ys);
      lines.push(`<rect x="${cx-16}" y="${y1-14}" width="32" height="${y2-y1+28}" rx="4" fill="${color}" opacity="0.7"/>`);
      lines.push(`<text x="${cx}" y="${(y1+y2)/2+4}" text-anchor="middle" fill="#000" font-weight="bold" font-size="9">${g.gate}</text>`);
    }
  });

  lines.push('</svg>');
  return lines.join('\n');
}

// ── Master export function ────────────────────────────────────────
export function exportCircuit(circuit, format, filename) {
  if (!circuit) throw new Error('exportCircuit: circuit is required');
  if (!format)  throw new Error('exportCircuit: format is required (qasm2|qasm3|ibm|ionq|cirq|braket|quil|qir|svg|json)');

  const FORMATS = {
    qasm2:  toQASM2,
    qasm3:  toQASM3,
    ibm:    toIBM,
    ionq:   toIonQ,
    cirq:   toCirq,
    braket: toBraket,
    quil:   toQuil,
    qir:    toQIR,
    svg:    toSVG,
    json:   toJSON,
  };

  const fn = FORMATS[format.toLowerCase()];
  if (!fn) throw new Error(`exportCircuit: unknown format "${format}". Supported: ${Object.keys(FORMATS).join(', ')}`);

  const content = fn(circuit);

  if (filename) {
    // In browser/server context: log + return
    console.log(`EXPORT ${format.toUpperCase()}: ${filename} (${content.length} bytes)`);
  }

  return content;
}

// ── Attach export methods to CircuitDef instances ─────────────────
// Call this after creating a circuit to add .export_*() methods
export function attachExports(circuitDef) {
  if (!circuitDef || !circuitDef.__circuit__) return circuitDef;

  circuitDef.export_qasm   = (f) => { const r=toQASM2(circuitDef);  circuitDef.interp?._log(`EXPORT QASM2: ${f||''}`);  return r; };
  circuitDef.export_qasm3  = (f) => { const r=toQASM3(circuitDef);  circuitDef.interp?._log(`EXPORT QASM3: ${f||''}`);  return r; };
  circuitDef.export_ibm    = (f) => { const r=toIBM(circuitDef);    circuitDef.interp?._log(`EXPORT IBM: ${f||''}`);    return r; };
  circuitDef.export_ionq   = (f) => { const r=toIonQ(circuitDef);   circuitDef.interp?._log(`EXPORT IonQ: ${f||''}`);   return r; };
  circuitDef.export_cirq   = (f) => { const r=toCirq(circuitDef);   circuitDef.interp?._log(`EXPORT Cirq: ${f||''}`);   return r; };
  circuitDef.export_braket = (f) => { const r=toBraket(circuitDef); circuitDef.interp?._log(`EXPORT Braket: ${f||''}`); return r; };
  circuitDef.export_quil   = (f) => { const r=toQuil(circuitDef);   circuitDef.interp?._log(`EXPORT Quil: ${f||''}`);   return r; };
  circuitDef.export_qir    = (f) => { const r=toQIR(circuitDef);    circuitDef.interp?._log(`EXPORT QIR: ${f||''}`);    return r; };
  circuitDef.export_svg    = (f) => { const r=toSVG(circuitDef);    circuitDef.interp?._log(`EXPORT SVG: ${f||''}`);    return r; };
  circuitDef.export_json   = (f) => { const r=toJSON(circuitDef);   circuitDef.interp?._log(`EXPORT JSON: ${f||''}`);   return r; };
  circuitDef.draw          = ()  => { const r=toSVG(circuitDef);    circuitDef.interp?._log(`DRAW: ${circuitDef.name}`); return r; };

  return circuitDef;
}

// ── Convenience: circuitToSVG ─────────────────────────────────────
export const circuitToSVG = toSVG;
export const circuitToQASM = toQASM2;
