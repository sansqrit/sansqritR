/**
 * src/blocks/registry.js  — PART 1 of 3
 * ========================================
 * INSTRUCTIONS: Combine all 3 parts in order:
 *   cat registry_part1.js registry_part2.js registry_part3.js > registry.js
 *
 * This file contains:
 *   - CATEGORIES definition
 *   - Parameter / Port factory helpers
 *   - BLOCKS array open + first 4 sections:
 *     1. Quantum Registers (3 blocks)
 *     2. Quantum Gates Tier1 (9 blocks via map)
 *     3. Quantum Gates Tier2 (5 blocks)
 *     4. Two-Qubit Gates (10 blocks)
 *     5. Three-Qubit Gates (2 blocks)
 *     6. Utility Gates (4 blocks)
 *     7. Measurement (5 blocks)
 *     8. Quantum Algorithms (14 blocks)
 *     9. Error Mitigation (5 blocks)
 *    10. Noise Models (8 blocks)
 */

// ── Category definitions ──────────────────────────────────────────────────
export const CATEGORIES = {
  quantum_reg:  { label:'Quantum Registers',    color:'#0D9488', icon:'📦' },
  quantum_gate: { label:'Quantum Gates',        color:'#6C3FC5', icon:'⚛'  },
  quantum_meas: { label:'Measurement',          color:'#4338CA', icon:'M'  },
  quantum_algo: { label:'Algorithms',           color:'#2563EB', icon:'🔬' },
  error_mit:    { label:'Error Mitigation',     color:'#0891B2', icon:'🛡'  },
  noise:        { label:'Noise Models',         color:'#EA580C', icon:'~'  },
  pulse:        { label:'Pulse Level',          color:'#E11D48', icon:'∿'  },
  benchmark:    { label:'Benchmarking',         color:'#06B6D4', icon:'📊' },
  sharding:     { label:'Sharding Engine',      color:'#65A30D', icon:'⊕'  },
  classical:    { label:'Classical Control',    color:'#CE4A2E', icon:'⌨'  },
  fn_block:     { label:'Functions',            color:'#D97706', icon:'λ'  },
  variable:     { label:'Variables',            color:'#0D9488', icon:'$'  },
  string_re:    { label:'String & Regex',       color:'#DB2777', icon:'"'  },
  math:         { label:'Math & Numerics',      color:'#6366F1', icon:'∑'  },
  chemistry:    { label:'Chemistry',            color:'#059669', icon:'⬡'  },
  drug:         { label:'Drug Discovery',       color:'#7C3AED', icon:'💊' },
  vaccine:      { label:'Vaccine & Immunology', color:'#DB2777', icon:'💉' },
  biology:      { label:'Biology & Genomics',   color:'#16A34A', icon:'🧬' },
  medical:      { label:'Medical Imaging',      color:'#0891B2', icon:'🏥' },
  physics:      { label:'Physics',              color:'#4338CA', icon:'⚡' },
  materials:    { label:'Materials Science',    color:'#78716C', icon:'⟡'  },
  astro:        { label:'Astrophysics',         color:'#475569', icon:'🌌' },
  ml:           { label:'Machine Learning',     color:'#65A30D', icon:'🤖' },
  genai:        { label:'GenAI & LLMs',         color:'#9333EA', icon:'✨' },
  file_src:     { label:'File Sources',         color:'#0EA5E9', icon:'📁' },
  database:     { label:'Databases',            color:'#1D4ED8', icon:'🗄'  },
  cloud:        { label:'Cloud Storage',        color:'#0369A1', icon:'☁'  },
  api:          { label:'API Connectors',       color:'#0284C7', icon:'🔌' },
  transform:    { label:'Data Transform',       color:'#D97706', icon:'⇄'  },
  output:       { label:'Output & Display',     color:'#F59E0B', icon:'📤' },
  exec_ctrl:    { label:'Execution Control',    color:'#6B7280', icon:'⚙'  },
  logging:      { label:'Logging & Debug',      color:'#EAB308', icon:'📝' },
  security:     { label:'Security & Auth',      color:'#DC2626', icon:'🔒' },
  hardware:     { label:'Hardware Export',      color:'#7C3AED', icon:'🖥'  },
  utility:      { label:'Utilities',            color:'#94A3B8', icon:'🔧' },
};

// ── Parameter factory helpers ─────────────────────────────────────────────
const ps   = (k,l,v='',d='')               => ({key:k,label:l,type:'string', value:v,default:v,description:d});
const pn   = (k,l,v=0,mn=null,mx=null,d='') => ({key:k,label:l,type:'number', value:v,default:v,min:mn,max:mx,description:d});
const pa   = (k,l,v=0,d='')               => ({key:k,label:l,type:'angle',  value:v,default:v,min:0,max:Math.PI*2,description:d});
const pb   = (k,l,v=false,d='')           => ({key:k,label:l,type:'bool',   value:v,default:v,description:d});
const psel = (k,l,o,v,d='')               => ({key:k,label:l,type:'select', options:o,value:v||o[0],default:v||o[0],description:d});
const pc   = (k,l,v='',d='')              => ({key:k,label:l,type:'code',   value:v,default:v,description:d});
const pq   = (k,l,v=0,d='')              => ({key:k,label:l,type:'qubit',  value:v,default:v,description:d});
const pj   = (k,l,v='{}',d='')            => ({key:k,label:l,type:'json',   value:v,default:v,description:d});

// ── Port factory helpers ───────────────────────────────────────────────────
const qIn  = (id='qi',l='Qubit in')     => ({id,dir:'in', dt:'qubit',    label:l});
const qOut = (id='qo',l='Qubit out')    => ({id,dir:'out',dt:'qubit',    label:l});
const rIn  = (id='ri',l='Register in')  => ({id,dir:'in', dt:'register', label:l});
const rOut = (id='ro',l='Register out') => ({id,dir:'out',dt:'register', label:l});
const cIn  = (id='ci',l='In')           => ({id,dir:'in', dt:'classical',label:l});
const cOut = (id='co',l='Out')          => ({id,dir:'out',dt:'classical',label:l});
const aIn  = (id='ai',l='In')           => ({id,dir:'in', dt:'any',      label:l});
const aOut = (id='ao',l='Out')          => ({id,dir:'out',dt:'any',      label:l});

// Common param bundles
const BYPASS = [
  pb('bypass','Bypass this block',false,'Block skipped and commented out in .sq export'),
  pb('code_override','Code override',false,'Write custom .sq instead of generated'),
  pc('override_code','Custom .sq code','','Only used when code_override is enabled'),
];
const NOISE_P = [
  psel('noise_model','Noise model',['none','depolarising','bit_flip','thermal'],'none'),
  pn('error_rate','Gate error rate',0.001,0,1),
];
const LOG_P = [pb('log_result','Log result',true)];

// ── BLOCKS array ─────────────────────────────────────────────────────────────
export const BLOCKS = [

  // ═══════════════════════════════════════════════════════════════════════
  // 1. QUANTUM REGISTERS
  // ═══════════════════════════════════════════════════════════════════════
  {
    id:'q_register', label:'Quantum Register', cat:'quantum_reg', color:'#0D9488', icon:'📦',
    info:'N-qubit register. Auto-sharded above 10 qubits. Each shard tracks only non-zero amplitudes — enables 30+ qubit simulation on a laptop.',
    params:[pn('n_qubits','Qubits',2,1,200), ps('name','Register name','q'), psel('initial_state','Initial state',['|0...0⟩','|+...+⟩'],'|0...0⟩'), pb('log_on_create','Log shard map',true), ...BYPASS],
    inputs:[], outputs:[rOut()],
    toSq: p=>`let ${p.name} = qubits(${p.n_qubits})`,
  },
  {
    id:'ancilla_reg', label:'Ancilla Register', cat:'quantum_reg', color:'#0D9488', icon:'🔧',
    info:'Auxiliary scratch qubits for algorithms and error correction. Auto-reset to |0⟩ after use.',
    params:[pn('n_ancilla','Ancilla qubits',2,1,50), ps('name','Name','anc'), pb('auto_reset','Auto-reset',true), ...BYPASS],
    inputs:[], outputs:[rOut('anc','Ancilla out')],
    toSq: p=>`let ${p.name} = qubits(${p.n_ancilla})  # ancilla`,
  },
  {
    id:'classical_reg', label:'Classical Register', cat:'quantum_reg', color:'#0D9488', icon:'🗂',
    info:'Classical bit register for storing measurement results.',
    params:[pn('n_bits','Bits',4,1,64), ps('name','Name','c'), ...BYPASS],
    inputs:[], outputs:[cOut('c_out','Bits out')],
    toSq: p=>`let ${p.name} = [0] * ${p.n_bits}`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 2. SINGLE-QUBIT CLIFFORD GATES (Tier 1 — exact lookup tables)
  // ═══════════════════════════════════════════════════════════════════════
  ...['H','X','Y','Z','S','Sdg','T','Tdg','SX'].map(g=>({
    id:`${g.toLowerCase()}_gate`, label:`${g} Gate`, cat:'quantum_gate', color:'#6C3FC5', icon:g,
    info:{
      H:'Hadamard: |0⟩→|+⟩=(|0⟩+|1⟩)/√2. H²=I.',
      X:'Pauli-X: bit flip |0⟩↔|1⟩. Quantum NOT.',
      Y:'Pauli-Y: Y|0⟩=i|1⟩. Complex phase — stored as {re,im} (not real-only).',
      Z:'Pauli-Z: phase flip |1⟩→-|1⟩.',
      S:'Phase S: |1⟩→i|1⟩. S²=Z.',
      Sdg:'S-dagger: |1⟩→-i|1⟩.',
      T:'T gate: |1⟩→e^(iπ/4)|1⟩. T-count determines quantum advantage.',
      Tdg:'T-dagger: e^(-iπ/4) phase.',
      SX:'√X gate. IBM native basis gate. SX²=X.',
    }[g],
    params:[pq('target','Target qubit',0), ...NOISE_P, ...BYPASS],
    inputs:[qIn()], outputs:[qOut()],
    toSq: p=>`${g}(q[${p.target}])`,
  })),

  // ═══════════════════════════════════════════════════════════════════════
  // 3. PARAMETERISED SINGLE-QUBIT GATES (Tier 2 — runtime computed)
  // ═══════════════════════════════════════════════════════════════════════
  {
    id:'rx_gate', label:'Rx(θ)', cat:'quantum_gate', color:'#6C3FC5', icon:'Rx',
    info:'X-rotation: Rx(θ)=cos(θ/2)I-i·sin(θ/2)X. Most common VQE variational gate.',
    params:[pq('target','Target qubit',0), pa('theta','Angle θ',Math.PI/4), pb('vqe_param','VQE trainable',false), ps('param_name','Param name','θ₀'), ...NOISE_P, ...BYPASS],
    inputs:[qIn()], outputs:[qOut()],
    toSq: p=>`Rx(q[${p.target}], ${p.theta.toFixed(6)})`,
  },
  {
    id:'ry_gate', label:'Ry(θ)', cat:'quantum_gate', color:'#6C3FC5', icon:'Ry',
    info:'Y-rotation: real-valued matrix — most numerically stable VQE gate. Default gate in HEA.',
    params:[pq('target','Target qubit',0), pa('theta','Angle θ',Math.PI/2), pb('vqe_param','VQE trainable',false), ps('param_name','Param name','θ₀'), ...NOISE_P, ...BYPASS],
    inputs:[qIn()], outputs:[qOut()],
    toSq: p=>`Ry(q[${p.target}], ${p.theta.toFixed(6)})`,
  },
  {
    id:'rz_gate', label:'Rz(θ)', cat:'quantum_gate', color:'#6C3FC5', icon:'Rz',
    info:'Z-rotation: diagonal — only modifies phases, no amplitude mixing. Used in QFT.',
    params:[pq('target','Target qubit',0), pa('theta','Angle θ',Math.PI/4), pb('vqe_param','VQE trainable',false), ...BYPASS],
    inputs:[qIn()], outputs:[qOut()],
    toSq: p=>`Rz(q[${p.target}], ${p.theta.toFixed(6)})`,
  },
  {
    id:'phase_gate', label:'Phase P(θ)', cat:'quantum_gate', color:'#6C3FC5', icon:'P',
    info:'Phase gate: |0⟩→|0⟩, |1⟩→e^(iθ)|1⟩. Generalises Z(π), S(π/2), T(π/4).',
    params:[pq('target','Target qubit',0), pa('theta','Phase θ',Math.PI/4), ...BYPASS],
    inputs:[qIn()], outputs:[qOut()],
    toSq: p=>`P(q[${p.target}], ${p.theta.toFixed(6)})`,
  },
  {
    id:'u3_gate', label:'U3(θ,φ,λ)', cat:'quantum_gate', color:'#6C3FC5', icon:'U3',
    info:'General single-qubit gate — 3 Euler angles. Any single-qubit unitary = U3. IBM native.',
    params:[pq('target','Target',0), pa('theta','θ',0), pa('phi','φ',0), pa('lambda','λ',0), ...BYPASS],
    inputs:[qIn()], outputs:[qOut()],
    toSq: p=>`U3(q[${p.target}], ${p.theta.toFixed(4)}, ${p.phi.toFixed(4)}, ${p.lambda.toFixed(4)})`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 4. TWO-QUBIT GATES
  // ═══════════════════════════════════════════════════════════════════════
  {
    id:'cnot_gate', label:'CNOT (CX)', cat:'quantum_gate', color:'#6C3FC5', icon:'CX',
    info:'Controlled-NOT: flips target when control=|1⟩. Cross-shard: Schmidt decomposition — no 20-qubit merge.',
    params:[pq('control','Control qubit',0), pq('target','Target qubit',1), ...NOISE_P, ...LOG_P, ...BYPASS],
    inputs:[qIn('ci','Control'), qIn('ti','Target')], outputs:[qOut('co','Control'), qOut('to','Target')],
    toSq: p=>`CNOT(q[${p.control}], q[${p.target}])`,
  },
  {
    id:'cz_gate', label:'CZ Gate', cat:'quantum_gate', color:'#6C3FC5', icon:'CZ',
    info:'Controlled-Z: phase flip on |11⟩. Symmetric — order irrelevant. Google Sycamore native.',
    params:[pq('qa','Qubit A',0), pq('qb','Qubit B',1), ...NOISE_P, ...BYPASS],
    inputs:[qIn('a'), qIn('b')], outputs:[qOut('ao'), qOut('bo')],
    toSq: p=>`CZ(q[${p.qa}], q[${p.qb}])`,
  },
  {
    id:'cy_gate', label:'CY Gate', cat:'quantum_gate', color:'#6C3FC5', icon:'CY',
    info:'Controlled-Y. Decomposed as Sdg·CNOT·S.',
    params:[pq('control','Control',0), pq('target','Target',1), ...BYPASS],
    inputs:[qIn('c'), qIn('t')], outputs:[qOut('co'), qOut('to')],
    toSq: p=>`CY(q[${p.control}], q[${p.target}])`,
  },
  {
    id:'swap_gate', label:'SWAP', cat:'quantum_gate', color:'#6C3FC5', icon:'↔',
    info:'Exchange two qubits. Implemented as 3 CNOTs: CNOT(a,b);CNOT(b,a);CNOT(a,b).',
    params:[pq('qa','Qubit A',0), pq('qb','Qubit B',1), ...NOISE_P, ...BYPASS],
    inputs:[qIn('a'), qIn('b')], outputs:[qOut('ao'), qOut('bo')],
    toSq: p=>`SWAP(q[${p.qa}], q[${p.qb}])`,
  },
  {
    id:'iswap_gate', label:'iSWAP', cat:'quantum_gate', color:'#6C3FC5', icon:'i↔',
    info:'iSWAP: SWAP + phase factor i on swapped components. Superconducting native.',
    params:[pq('qa','Qubit A',0), pq('qb','Qubit B',1), ...BYPASS],
    inputs:[qIn('a'), qIn('b')], outputs:[qOut('ao'), qOut('bo')],
    toSq: p=>`iSWAP(q[${p.qa}], q[${p.qb}])`,
  },
  {
    id:'cp_gate', label:'CP(θ)', cat:'quantum_gate', color:'#6C3FC5', icon:'CP',
    info:'Controlled-Phase: e^(iθ) to |11⟩ only. QFT subroutine. CP(π)=CZ.',
    params:[pq('control','Control',0), pq('target','Target',1), pa('theta','Phase θ',Math.PI/4), ...BYPASS],
    inputs:[qIn('c'), qIn('t')], outputs:[qOut('co'), qOut('to')],
    toSq: p=>`CP(q[${p.control}], q[${p.target}], ${p.theta.toFixed(6)})`,
  },
  {
    id:'crz_gate', label:'CRz(θ)', cat:'quantum_gate', color:'#6C3FC5', icon:'CRz',
    info:'Controlled-Rz: applies Rz(θ) to target when control=|1⟩.',
    params:[pq('control','Control',0), pq('target','Target',1), pa('theta','θ',Math.PI/2), ...BYPASS],
    inputs:[qIn('c'), qIn('t')], outputs:[qOut('co'), qOut('to')],
    toSq: p=>`CRz(q[${p.control}], q[${p.target}], ${p.theta.toFixed(6)})`,
  },
  {
    id:'rzz_gate', label:'RZZ(θ)', cat:'quantum_gate', color:'#6C3FC5', icon:'ZZ',
    info:'ZZ Ising coupling: exp(-iθ/2 Z⊗Z). Native QAOA cost layer.',
    params:[pq('qa','Qubit A',0), pq('qb','Qubit B',1), pa('theta','Coupling θ',Math.PI/2), ...BYPASS],
    inputs:[qIn('a'), qIn('b')], outputs:[qOut('ao'), qOut('bo')],
    toSq: p=>`RZZ(q[${p.qa}], q[${p.qb}], ${p.theta.toFixed(6)})`,
  },
  {
    id:'ms_gate', label:'Mølmer-Sørensen', cat:'quantum_gate', color:'#6C3FC5', icon:'MS',
    info:'MS gate: native entangling gate for trapped-ion systems (IonQ, Quantinuum).',
    params:[pq('qa','Qubit A',0), pq('qb','Qubit B',1), pa('theta','θ',Math.PI/4), ...BYPASS],
    inputs:[qIn('a'), qIn('b')], outputs:[qOut('ao'), qOut('bo')],
    toSq: p=>`# MS(q[${p.qa}], q[${p.qb}], theta=${p.theta.toFixed(4)})`,
  },
  {
    id:'ecr_gate', label:'ECR', cat:'quantum_gate', color:'#6C3FC5', icon:'ECR',
    info:'Echoed Cross-Resonance: IBM superconducting native 2-qubit gate.',
    params:[pq('control','Control',0), pq('target','Target',1), ...BYPASS],
    inputs:[qIn('c'), qIn('t')], outputs:[qOut('co'), qOut('to')],
    toSq: p=>`# ECR(q[${p.control}], q[${p.target}])`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 5. THREE-QUBIT GATES
  // ═══════════════════════════════════════════════════════════════════════
  {
    id:'toffoli_gate', label:'Toffoli (CCX)', cat:'quantum_gate', color:'#6C3FC5', icon:'CCX',
    info:'Toffoli: flips target when BOTH controls=|1⟩. Cross-shard: 6-CNOT Selinger decomposition.',
    params:[pq('ctrl1','Control 1',0), pq('ctrl2','Control 2',1), pq('target','Target',2), ...NOISE_P, ...BYPASS],
    inputs:[qIn('c1','C1'), qIn('c2','C2'), qIn('t','Target')],
    outputs:[qOut('c1o'), qOut('c2o'), qOut('to')],
    toSq: p=>`Toffoli(q[${p.ctrl1}], q[${p.ctrl2}], q[${p.target}])`,
  },
  {
    id:'fredkin_gate', label:'Fredkin (CSWAP)', cat:'quantum_gate', color:'#6C3FC5', icon:'CSWAP',
    info:'Fredkin: swaps qubits A and B when control=|1⟩.',
    params:[pq('control','Control',0), pq('qa','Qubit A',1), pq('qb','Qubit B',2), ...BYPASS],
    inputs:[qIn('c'), qIn('a'), qIn('b')], outputs:[qOut('co'), qOut('ao'), qOut('bo')],
    toSq: p=>`Fredkin(q[${p.control}], q[${p.qa}], q[${p.qb}])`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 6. UTILITY GATES
  // ═══════════════════════════════════════════════════════════════════════
  {
    id:'barrier_gate', label:'Barrier', cat:'quantum_gate', color:'#6C3FC5', icon:'|',
    info:'Optimisation fence — prevents gate reordering. No physical effect.',
    params:[ps('label','Label','barrier'), ...BYPASS], inputs:[rIn()], outputs:[rOut()],
    toSq: p=>`barrier()  # ${p.label}`,
  },
  {
    id:'reset_gate', label:'Reset', cat:'quantum_gate', color:'#6C3FC5', icon:'↺',
    info:'Reset qubit to |0⟩: measure then conditionally flip.',
    params:[pq('target','Target qubit',0), ...BYPASS], inputs:[qIn()], outputs:[qOut()],
    toSq: p=>`reset(q[${p.target}])`,
  },
  {
    id:'delay_gate', label:'Delay', cat:'quantum_gate', color:'#6C3FC5', icon:'⏱',
    info:'Wait for duration — models T1/T2 decoherence or synchronises operations.',
    params:[pq('target','Target',0), pn('duration','Duration',100,0,1e6), psel('unit','Unit',['dt','ns','us','ms'],'ns'), ...BYPASS],
    inputs:[qIn()], outputs:[qOut()],
    toSq: p=>`# delay(q[${p.target}], ${p.duration}${p.unit})`,
  },
  {
    id:'custom_unitary', label:'Custom Unitary', cat:'quantum_gate', color:'#6C3FC5', icon:'U',
    info:'Any single-qubit 2×2 unitary. Must satisfy U†U=I.',
    params:[pq('target','Target',0), pj('matrix','Matrix [[a,b],[c,d]]','[[{"re":1,"im":0},{"re":0,"im":0}],[{"re":0,"im":0},{"re":1,"im":0}]]'), pb('validate','Validate U†U=I',true), ...BYPASS],
    inputs:[qIn()], outputs:[qOut()],
    toSq: p=>`# custom_unitary(q[${p.target}])`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 7. MEASUREMENT
  // ═══════════════════════════════════════════════════════════════════════
  {
    id:'measure_single', label:'Measure (single)', cat:'quantum_meas', color:'#4338CA', icon:'M',
    info:'Collapse single qubit to 0 or 1. P(0)=|α|², P(1)=|β|². State collapses — remaining amplitudes renormalised.',
    params:[pq('target','Target qubit',0), psel('basis','Basis',['Z','X','Y'],'Z'), pb('reset_after','Reset after',false), ps('output_var','Output variable','bit0'), ...LOG_P, ...BYPASS],
    inputs:[qIn()], outputs:[qOut('qo','Post-collapse'), cOut('bo','Classical bit')],
    toSq: p=>`let ${p.output_var} = measure(q[${p.target}])`,
  },
  {
    id:'measure_all', label:'Measure All', cat:'quantum_meas', color:'#4338CA', icon:'M⊗',
    info:'shots=1: collapses state. shots>1: samples from probability distribution (non-destructive). Returns {histogram:{bitstring:count}}.',
    params:[ps('register','Register name','q'), pn('shots','Shots',1000,1,1000000), psel('format','Format',['counts','probabilities','both'],'counts'), pb('plot_histogram','Plot histogram',true), ps('output_var','Output variable','result'), ...LOG_P, ...BYPASS],
    inputs:[rIn()], outputs:[rOut(), cOut('hist','Histogram')],
    toSq: p=>`let ${p.output_var} = measure_all(${p.register}, shots=${p.shots})`,
  },
  {
    id:'expectation_val', label:'Expectation Value', cat:'quantum_meas', color:'#4338CA', icon:'⟨O⟩',
    info:'⟨ψ|O|ψ⟩ without collapsing state. Z, X, Y, ZZ, custom Pauli string. Essential for VQE.',
    params:[ps('register','Register','q'), psel('observable','Observable',['Z','X','Y','ZZ','XX','YY','custom'],'Z'), ps('custom_obs','Custom Pauli','ZZI'), pq('qubit_a','Qubit A',0), pq('qubit_b','Qubit B',1), ps('output_var','Output','expval'), ...BYPASS],
    inputs:[rIn()], outputs:[rOut(), cOut('ev','Expectation value')],
    toSq: p=>`let ${p.output_var} = expectation_z(q[${p.qubit_a}])`,
  },
  {
    id:'statevector_block', label:'State Vector', cat:'quantum_meas', color:'#4338CA', icon:'|ψ⟩',
    info:'Returns [{state,re,im,prob}] sorted by probability. NON-DESTRUCTIVE — does not collapse.',
    params:[ps('register','Register','q'), pn('top_n','Top N states',10,1,1000), ps('output_var','Output','sv'), ...BYPASS],
    inputs:[rIn()], outputs:[rOut(), cOut('sv','State vector')],
    toSq: p=>`let ${p.output_var} = statevector(${p.register})`,
  },
  {
    id:'probabilities_block', label:'Probabilities', cat:'quantum_meas', color:'#4338CA', icon:'P(x)',
    info:'P(|x⟩)=|⟨x|ψ⟩|² for all basis states. Non-destructive. Returns {bitstring: probability}.',
    params:[ps('register','Register','q'), ps('output_var','Output','probs'), ...BYPASS],
    inputs:[rIn()], outputs:[rOut(), cOut('pr','Probabilities')],
    toSq: p=>`let ${p.output_var} = probabilities(${p.register})`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 8. QUANTUM ALGORITHMS
  // ═══════════════════════════════════════════════════════════════════════
  {
    id:'qft_block', label:'QFT', cat:'quantum_algo', color:'#2563EB', icon:'QFT',
    info:'Quantum Fourier Transform. O(n²) CP+H gates. Core of Shor\'s and QPE.',
    params:[ps('register','Register','q'), pn('n_qubits','Qubits',4,1,30), pb('inverse','Inverse QFT',false), pb('swap_bits','Bit reversal',true), ...BYPASS],
    inputs:[rIn()], outputs:[rOut()],
    toSq: p=>`${p.inverse?'iqft':'qft'}(${p.register}, ${p.n_qubits})`,
  },
  {
    id:'vqe_block', label:'VQE', cat:'quantum_algo', color:'#2563EB', icon:'VQE',
    info:'Variational Quantum Eigensolver. Minimises ⟨ψ(θ)|H|ψ(θ)⟩. Exact gradients via parameter-shift: ∂f/∂θ=[f(θ+π/2)-f(θ-π/2)]/2.',
    params:[ps('hamiltonian','Hamiltonian','H2'), psel('ansatz','Ansatz',['UCCSD','HEA','RealAmplitudes','EfficientSU2'],'UCCSD'), pn('n_layers','Layers',1,1,20), psel('optimizer','Optimizer',['COBYLA','SPSA','Adam'],'COBYLA'), pn('max_iter','Max iterations',1000,1,100000), pn('shots','Shots',1000,1,100000), pb('live_dashboard','Live dashboard',true), ps('output_var','Output','vqe_result'), ...BYPASS],
    inputs:[rIn()], outputs:[rOut(), cOut('energy','Ground state energy')],
    toSq: p=>`let ${p.output_var} = vqe("${p.hamiltonian}", ansatz="${p.ansatz}", shots=${p.shots})`,
  },
  {
    id:'qaoa_block', label:'QAOA', cat:'quantum_algo', color:'#2563EB', icon:'QAOA',
    info:'Quantum Approximate Optimization. p layers alternating cost+mixer. MaxCut, TSP, portfolio.',
    params:[ps('cost_hamiltonian','Cost Hamiltonian','ZZ+Z'), psel('mixer','Mixer',['X','XY','custom'],'X'), pn('p_layers','p layers',1,1,20), psel('optimizer','Optimizer',['COBYLA','SPSA'],'COBYLA'), pn('shots','Shots',1000,100,100000), ps('output_var','Output','qaoa_result'), ...BYPASS],
    inputs:[rIn()], outputs:[rOut(), cOut('result')],
    toSq: p=>`let ${p.output_var} = qaoa(p=${p.p_layers}, shots=${p.shots})`,
  },
  {
    id:'grover_block', label:"Grover's Search", cat:'quantum_algo', color:'#2563EB', icon:'GRV',
    info:"O(√N) oracle queries vs O(N) classical. H^N creates dense state — sparse engine minimal benefit here.",
    params:[pn('n_qubits','Search qubits',4,1,20), pj('marked_states','Marked states','[7]'), pn('n_iterations','Iterations (0=auto)',0,0,100), pn('shots','Shots',1000,100,10000), ps('output_var','Output','grover_result'), ...BYPASS],
    inputs:[], outputs:[cOut('result')],
    toSq: p=>`let ${p.output_var} = grover(n_qubits=${p.n_qubits}, marked=${p.marked_states})`,
  },
  {
    id:'shor_block', label:"Shor's Algorithm", cat:'quantum_algo', color:'#2563EB', icon:'SHOR',
    info:"Exponential speedup over best classical. Uses QFT + QPE. Factors N in O((log N)³) gates.",
    params:[pn('N','Number to factor',15,3,1000000), pn('shots','Shots',1024,100,100000), ps('output_var','Output','factors'), ...BYPASS],
    inputs:[], outputs:[cOut('factors')],
    toSq: p=>`let ${p.output_var} = shor_factor(${p.N})`,
  },
  {
    id:'qpe_block', label:'QPE', cat:'quantum_algo', color:'#2563EB', icon:'QPE',
    info:'Quantum Phase Estimation. Estimates eigenphase φ of unitary U|ψ⟩=e^(2πiφ)|ψ⟩.',
    params:[pn('n_precision','Precision qubits',4,1,20), pn('shots','Shots',1000,100,100000), ps('output_var','Output phase','phase'), ...BYPASS],
    inputs:[rIn('state'), aIn('unitary')], outputs:[cOut('phase'), rOut()],
    toSq: p=>`let ${p.output_var} = qpe(unitary, n_precision=${p.n_precision})`,
  },
  {
    id:'hhl_block', label:'HHL', cat:'quantum_algo', color:'#2563EB', icon:'HHL',
    info:'HHL linear systems Ax=b. O(log(N)κ²) vs classical O(Nκ). For ML, PDE, finance.',
    params:[ps('matrix_A','Matrix A','A'), ps('vector_b','Vector b','b'), pn('n_qubits','Register size',4,1,20), ps('output_var','Output','x_sol'), ...BYPASS],
    inputs:[aIn('A'), aIn('b')], outputs:[cOut('x')],
    toSq: p=>`let ${p.output_var} = hhl(${p.matrix_A}, ${p.vector_b})`,
  },
  {
    id:'qsvm_block', label:'Quantum SVM', cat:'quantum_algo', color:'#2563EB', icon:'QSVM',
    info:'Quantum kernel SVM: uses circuit overlap to compute kernel matrix.',
    params:[psel('feature_map','Feature map',['ZZ','Pauli','custom'],'ZZ'), pn('n_features','Features',2,1,20), pn('shots','Shots',1024,100,10000), ps('X_train','Training data','X_train'), ps('y_train','Labels','y_train'), ps('output_var','Output model','qsvm_model'), ...BYPASS],
    inputs:[aIn('X'), aIn('y')], outputs:[aOut('model')],
    toSq: p=>`let ${p.output_var} = qsvm(${p.X_train}, ${p.y_train})`,
  },
  {
    id:'qrng_block', label:'Quantum RNG', cat:'quantum_algo', color:'#2563EB', icon:'QRNG',
    info:'True random numbers from quantum measurement — genuinely random via quantum uncertainty.',
    params:[pn('n_bits','Bits',8,1,64), psel('format','Format',['bits','int','float','bytes'],'int'), ps('output_var','Output','rand_val'), ...BYPASS],
    inputs:[], outputs:[cOut('rand')],
    toSq: p=>`let ${p.output_var} = qrng(n_bits=${p.n_bits})`,
  },
  {
    id:'bv_block', label:'Bernstein-Vazirani', cat:'quantum_algo', color:'#2563EB', icon:'BV',
    info:'Finds hidden string s in f(x)=s·x(mod2). Single oracle query vs O(n) classical.',
    params:[pn('n_qubits','Qubits',4,1,20), ps('secret','Secret string','1010'), pn('shots','Shots',100,1,10000), ps('output_var','Output','secret_found'), ...BYPASS],
    inputs:[], outputs:[cOut('secret')],
    toSq: p=>`let ${p.output_var} = bernstein_vazirani(n=${p.n_qubits})`,
  },
  {
    id:'dj_block', label:'Deutsch-Jozsa', cat:'quantum_algo', color:'#2563EB', icon:'DJ',
    info:'Constant-or-balanced oracle. Single quantum query vs O(2^(n-1)+1) classical.',
    params:[pn('n_qubits','Qubits',3,1,20), psel('oracle','Oracle',['constant_0','constant_1','balanced_random'],'balanced_random'), ps('output_var','Output','dj_result'), ...BYPASS],
    inputs:[], outputs:[cOut('result')],
    toSq: p=>`let ${p.output_var} = deutsch_jozsa(n=${p.n_qubits})`,
  },
  {
    id:'qwalk_block', label:'Quantum Walk', cat:'quantum_algo', color:'#2563EB', icon:'QW',
    info:'Quantum walk on graphs: quadratic speedup over classical random walk.',
    params:[psel('graph','Graph',['line','cycle','complete','hypercube'],'line'), pn('n_vertices','Vertices',8,2,100), pn('n_steps','Steps',10,1,1000), ps('output_var','Output','walk_result'), ...BYPASS],
    inputs:[], outputs:[cOut('dist')],
    toSq: p=>`let ${p.output_var} = quantum_walk(graph="${p.graph}", n=${p.n_vertices})`,
  },
  {
    id:'teleport_block', label:'Quantum Teleportation', cat:'quantum_algo', color:'#2563EB', icon:'TEL',
    info:'Transfers quantum state via entanglement + 2 classical bits. Does NOT clone (No-Cloning).',
    params:[pq('source','Source',0), pq('epr_a','EPR qubit A',1), pq('epr_b','EPR qubit B',2), ps('output_var','Output','tele_result'), ...BYPASS],
    inputs:[qIn('src'), qIn('ea'), qIn('eb')], outputs:[qOut('target')],
    toSq: p=>`let ${p.output_var} = teleport(q[${p.source}], q[${p.epr_a}], q[${p.epr_b}])`,
  },
  {
    id:'amp_est_block', label:'Amplitude Estimation', cat:'quantum_algo', color:'#2563EB', icon:'AE',
    info:'Quadratic speedup over Monte Carlo. Used in option pricing.',
    params:[pn('n_eval','Eval qubits',5,1,20), psel('method','Method',['canonical','IQAE','MLAE'],'IQAE'), ps('output_var','Output','amplitude'), ...BYPASS],
    inputs:[aIn('oracle')], outputs:[cOut('amp')],
    toSq: p=>`let ${p.output_var} = amplitude_estimation(oracle, n_eval=${p.n_eval})`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 9. ERROR MITIGATION
  // ═══════════════════════════════════════════════════════════════════════
  {
    id:'zne_block', label:'ZNE', cat:'error_mit', color:'#0891B2', icon:'ZNE',
    info:'Zero-Noise Extrapolation: scaled noise (1×,2×,3×) extrapolated to zero via Richardson.',
    params:[pj('scale_factors','Scale factors','[1,2,3]'), psel('extrapolation','Extrapolation',['linear','quadratic','richardson'],'richardson'), pn('shots','Shots/level',1000,100,100000), ps('output_var','Output','mitigated_val'), ...BYPASS],
    inputs:[aIn('circuit')], outputs:[cOut('mitigated')],
    toSq: p=>`let ${p.output_var} = zne(circuit, scales=${p.scale_factors})`,
  },
  {
    id:'pec_block', label:'PEC', cat:'error_mit', color:'#0891B2', icon:'PEC',
    info:'Probabilistic Error Cancellation: represents ideal op as linear combination of noisy ops.',
    params:[pn('noise_level','Error rate',0.01,0,1), pn('n_circuits','Circuits',100,10,10000), ps('output_var','Output','pec_val'), ...BYPASS],
    inputs:[aIn('circuit')], outputs:[cOut('mitigated')],
    toSq: p=>`let ${p.output_var} = pec(circuit, noise=${p.noise_level})`,
  },
  {
    id:'twirl_block', label:'Pauli Twirling', cat:'error_mit', color:'#0891B2', icon:'TWL',
    info:'Converts coherent noise into Pauli noise by random Pauli insertion.',
    params:[pn('n_samples','Samples',100,10,10000), ps('output_var','Output','twirled'), ...BYPASS],
    inputs:[aIn('circuit')], outputs:[cOut('twirled')],
    toSq: p=>`let ${p.output_var} = pauli_twirl(circuit, n=${p.n_samples})`,
  },
  {
    id:'symmetry_verify', label:'Symmetry Verification', cat:'error_mit', color:'#0891B2', icon:'SYM',
    info:'Post-select on Hamiltonian symmetries. Detects and discards error-corrupted shots.',
    params:[ps('symmetry_op','Symmetry op','Z0+Z1+Z2'), pn('eigenvalue','Expected eigenvalue',0,-10,10), ps('output_var','Output','sym_result'), ...BYPASS],
    inputs:[rIn()], outputs:[cOut('filtered'), rOut()],
    toSq: p=>`let ${p.output_var} = symmetry_verify(q, sym="${p.symmetry_op}")`,
  },
  {
    id:'cdr_block', label:'Clifford Data Regression', cat:'error_mit', color:'#0891B2', icon:'CDR',
    info:'Trains regression on near-Clifford circuits (classically simulable) to subtract error.',
    params:[pn('n_training','Training circuits',20,5,200), ps('output_var','Output','cdr_val'), ...BYPASS],
    inputs:[aIn('circuit')], outputs:[cOut('mitigated')],
    toSq: p=>`let ${p.output_var} = clifford_regression(circuit)`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 10. NOISE MODELS
  // ═══════════════════════════════════════════════════════════════════════
  {
    id:'depol_noise', label:'Depolarising Noise', cat:'noise', color:'#EA580C', icon:'~D',
    info:'Applies random Pauli (X,Y,Z) with probability p/3. Most common noise model.',
    params:[pn('error_rate','Error rate p',0.001,0,1), psel('apply_to','Apply to',['all_gates','1q_only','2q_only'],'all_gates'), ...BYPASS],
    inputs:[aIn('circuit')], outputs:[aOut('noisy')],
    toSq: p=>`noise_model = depolarising(p=${p.error_rate})`,
  },
  {
    id:'bitflip_noise', label:'Bit-Flip Noise', cat:'noise', color:'#EA580C', icon:'~B',
    info:'Qubit flips |0⟩↔|1⟩ with probability p.',
    params:[pn('p_flip','Flip probability',0.01,0,0.5), ...BYPASS],
    inputs:[aIn()], outputs:[aOut('noisy')],
    toSq: p=>`noise_model = bit_flip(p=${p.p_flip})`,
  },
  {
    id:'phaseflip_noise', label:'Phase-Flip Noise', cat:'noise', color:'#EA580C', icon:'~P',
    info:'Applies Z with probability p. Destroys coherence without affecting populations.',
    params:[pn('p_flip','Phase flip prob',0.01,0,0.5), ...BYPASS],
    inputs:[aIn()], outputs:[aOut('noisy')],
    toSq: p=>`noise_model = phase_flip(p=${p.p_flip})`,
  },
  {
    id:'ampdamp_noise', label:'Amplitude Damping', cat:'noise', color:'#EA580C', icon:'~A',
    info:'Energy relaxation T1: qubit decays |1⟩→|0⟩. Physically realistic for superconducting qubits.',
    params:[pn('gamma','Damping γ',0.01,0,1), pn('T1_us','T1 (μs)',100,0.1,10000), ...BYPASS],
    inputs:[aIn()], outputs:[aOut('noisy')],
    toSq: p=>`noise_model = amplitude_damping(gamma=${p.gamma})`,
  },
  {
    id:'thermal_noise', label:'Thermal Relaxation', cat:'noise', color:'#EA580C', icon:'~T',
    info:'Combined T1+T2 thermal noise. Most physically realistic model for superconducting qubits.',
    params:[pn('T1_us','T1 (μs)',100,0.1,10000), pn('T2_us','T2 (μs)',50,0.1,10000), pn('gate_time_ns','Gate time (ns)',50,1,10000), ...BYPASS],
    inputs:[aIn()], outputs:[aOut('noisy')],
    toSq: p=>`noise_model = thermal(T1=${p.T1_us}e-6, T2=${p.T2_us}e-6)`,
  },
  {
    id:'readout_noise', label:'Readout Error', cat:'noise', color:'#EA580C', icon:'~R',
    info:'Readout misclassification: P(1|0) and P(0|1) assignment error.',
    params:[pn('p01','P(1|0)',0.01,0,1), pn('p10','P(0|1)',0.05,0,1), ...BYPASS],
    inputs:[aIn()], outputs:[aOut('noisy')],
    toSq: p=>`noise_model = readout_error(p01=${p.p01}, p10=${p.p10})`,
  },
  {
    id:'crosstalk_noise', label:'Crosstalk', cat:'noise', color:'#EA580C', icon:'~C',
    info:'Unwanted coupling between neighbouring qubits during gate operations.',
    params:[pj('coupling_map','Coupling map','[[0,1],[1,2]]'), pn('strength','Coupling strength',0.001,0,0.1), ...BYPASS],
    inputs:[aIn()], outputs:[aOut('noisy')],
    toSq: p=>`noise_model = crosstalk(strength=${p.strength})`,
  },
  {
    id:'kraus_noise', label:'Custom Kraus Channel', cat:'noise', color:'#EA580C', icon:'K',
    info:'Any physical noise channel: ρ→ΣKᵢρKᵢ†. Kraus operators must satisfy ΣKᵢ†Kᵢ=I.',
    params:[pj('kraus_ops','Kraus operators','[]'), pb('validate','Validate completeness',true), ...BYPASS],
    inputs:[aIn()], outputs:[aOut('noisy')],
    toSq: ()=>`noise_model = custom_kraus(ops=...)`,
  },

// ═══ END OF PART 1 ══════════════════════════════════════════════════════
// Continue with registry_part2.js — paste the contents DIRECTLY after
// the last block above (before this comment)
//           Variables, String/Regex, Math, Chemistry, Drug Discovery

  // ═══════════════════════════════════════════════════════════════════════
  // 11. PULSE LEVEL
  // ═══════════════════════════════════════════════════════════════════════
  {
    id:'gaussian_pulse', label:'Gaussian Pulse', cat:'pulse', color:'#E11D48', icon:'G~',
    info:'Gaussian microwave pulse for gate implementation. IBM Qiskit Pulse native.',
    params:[pn('amplitude','Amplitude',0.5,0,1), pn('sigma','Sigma (samples)',64,1,1000), pn('duration','Duration (dt)',256,1,10000), ps('channel','Channel','d0'), ...BYPASS],
    inputs:[cIn()], outputs:[cOut('pulse')],
    toSq: p=>`pulse_gaussian(amp=${p.amplitude}, sigma=${p.sigma}, dur=${p.duration}, ch="${p.channel}")`,
  },
  {
    id:'drag_pulse', label:'DRAG Pulse', cat:'pulse', color:'#E11D48', icon:'D~',
    info:'DRAG: suppresses leakage to |2⟩ in transmon qubits. IBM standard native gate pulse.',
    params:[pn('amplitude','Amplitude',0.5,0,1), pn('sigma','Sigma',64,1,1000), pn('beta','DRAG β',0.5,-10,10), pn('duration','Duration (dt)',256,1,10000), ps('channel','Channel','d0'), ...BYPASS],
    inputs:[cIn()], outputs:[cOut('pulse')],
    toSq: p=>`pulse_drag(amp=${p.amplitude}, beta=${p.beta}, sigma=${p.sigma}, dur=${p.duration}, ch="${p.channel}")`,
  },
  {
    id:'square_pulse', label:'Square Pulse', cat:'pulse', color:'#E11D48', icon:'□~',
    info:'Constant amplitude pulse for cross-resonance (CR) two-qubit gates.',
    params:[pn('amplitude','Amplitude',0.3,0,1), pn('duration','Duration (dt)',256,1,10000), ps('channel','Channel','u0'), ...BYPASS],
    inputs:[cIn()], outputs:[cOut('pulse')],
    toSq: p=>`pulse_square(amp=${p.amplitude}, dur=${p.duration}, ch="${p.channel}")`,
  },
  {
    id:'pulse_schedule', label:'Pulse Schedule', cat:'pulse', color:'#E11D48', icon:'SCH',
    info:'Compose multiple pulses into a synchronised schedule with timing control.',
    params:[psel('alignment','Alignment',['sequential','parallel','left','right'],'sequential'), ps('output_var','Schedule variable','schedule'), ...BYPASS],
    inputs:[cIn('p1','Pulse 1'), cIn('p2','Pulse 2'), cIn('p3','Pulse 3')], outputs:[cOut('sched')],
    toSq: p=>`let ${p.output_var} = pulse_schedule(alignment="${p.alignment}")`,
  },
  {
    id:'ecr_pulse', label:'ECR Pulse', cat:'pulse', color:'#E11D48', icon:'ECR~',
    info:'Echoed cross-resonance pulse for IBM 2-qubit gates.',
    params:[ps('ctrl_channel','Control channel','u0'), ps('tgt_channel','Target channel','d1'), pn('duration','Duration (dt)',800,100,10000), ...BYPASS],
    inputs:[cIn()], outputs:[cOut()],
    toSq: p=>`pulse_ecr(ctrl="${p.ctrl_channel}", tgt="${p.tgt_channel}", dur=${p.duration})`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 12. BENCHMARKING
  // ═══════════════════════════════════════════════════════════════════════
  {
    id:'xeb_block', label:'XEB', cat:'benchmark', color:'#06B6D4', icon:'XEB',
    info:'Cross-Entropy Benchmarking. Compares output distribution to ideal random circuit. Google Sycamore supremacy metric.',
    params:[pn('n_qubits','Qubits',5,2,50), pn('n_cycles','Cycles',20,1,200), pn('n_circuits','Random circuits',100,10,10000), ps('output_var','Output','xeb_fidelity'), ...BYPASS],
    inputs:[], outputs:[cOut('fidelity')],
    toSq: p=>`let ${p.output_var} = xeb(n_qubits=${p.n_qubits}, cycles=${p.n_cycles})`,
  },
  {
    id:'rb_block', label:'Randomised Benchmarking', cat:'benchmark', color:'#06B6D4', icon:'RB',
    info:'Gate fidelity via random Clifford circuits of increasing depth. Fit exponential decay.',
    params:[pn('n_qubits','Qubits',1,1,5), pj('seq_lengths','Sequence lengths','[1,10,50,100,200]'), pn('n_seeds','Seeds',20,5,500), pn('shots','Shots',1000,100,100000), ps('output_var','Output','rb_result'), ...BYPASS],
    inputs:[], outputs:[cOut('fidelity')],
    toSq: p=>`let ${p.output_var} = randomised_benchmarking(n_qubits=${p.n_qubits})`,
  },
  {
    id:'proc_tomo', label:'Process Tomography', cat:'benchmark', color:'#06B6D4', icon:'QPT',
    info:'Full quantum channel characterisation. 4^n input states — exponential cost.',
    params:[pn('n_qubits','Qubits',1,1,3), psel('method','Method',['linear_inversion','MLE'],'MLE'), pn('shots','Shots',1000,100,100000), ps('output_var','Output','process_matrix'), ...BYPASS],
    inputs:[aIn('gate')], outputs:[cOut('chi','Process matrix χ')],
    toSq: p=>`let ${p.output_var} = process_tomography(circuit, n=${p.n_qubits})`,
  },
  {
    id:'state_tomo', label:'State Tomography', cat:'benchmark', color:'#06B6D4', icon:'QST',
    info:'Reconstructs density matrix ρ from 3^n Pauli measurements.',
    params:[pn('n_qubits','Qubits',2,1,5), psel('method','Method',['linear_inversion','MLE','BME'],'MLE'), pn('shots','Shots',1000,100,100000), ps('output_var','Output','rho'), ...BYPASS],
    inputs:[rIn()], outputs:[cOut('rho','Density matrix ρ')],
    toSq: p=>`let ${p.output_var} = state_tomography(q, n=${p.n_qubits})`,
  },
  {
    id:'qvol_block', label:'Quantum Volume', cat:'benchmark', color:'#06B6D4', icon:'QV',
    info:'IBM Quantum Volume: largest square random circuit reliably executable (>2/3 heavy output).',
    params:[pn('max_qubits','Max qubits',7,1,50), pn('n_trials','Trials',100,10,1000), ps('output_var','Output','qv_result'), ...BYPASS],
    inputs:[], outputs:[cOut('qv')],
    toSq: p=>`let ${p.output_var} = quantum_volume(max_qubits=${p.max_qubits})`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 13. SHARDING ENGINE
  // ═══════════════════════════════════════════════════════════════════════
  {
    id:'shard_register', label:'Shard Register', cat:'sharding', color:'#65A30D', icon:'⊕',
    info:'Explicit sharding control. Usually automatic — use for custom shard size configuration.',
    params:[ps('source_register','Source register','q'), pn('shard_size','Shard size (max 10)',10,1,10), pb('log_shard_map','Log shard topology',true), pn('prune_threshold','Prune threshold',1e-12,1e-15,1e-6), ...BYPASS],
    inputs:[rIn()], outputs:[rOut()],
    toSq: ()=>`# Sharding is automatic for registers > 10 qubits`,
  },
  {
    id:'amp_cache', label:'Amplitude Cache', cat:'sharding', color:'#65A30D', icon:'🗄',
    info:'Cache sparse state vector. Critical for VQE — circuit prefix is identical across 1000s of iterations.',
    params:[ps('register','Register','q'), psel('operation','Operation',['auto','store','load','invalidate'],'auto'), pb('compress','Compress',true), pb('log_hits','Log cache hits',true), ...BYPASS],
    inputs:[rIn()], outputs:[rOut()],
    toSq: ()=>`# amplitude_cache: automatic`,
  },
  {
    id:'bin_loader', label:'Bin File Loader', cat:'sharding', color:'#65A30D', icon:'.bin',
    info:'Pre-loads gate lookup .bin files (26 MB total) at startup for O(1) Tier-1 gate lookup.',
    params:[ps('bin_dir','Directory','data/gates/'), pb('preload_all','Preload all',true), pb('validate_crc','Validate CRC64',true), ...BYPASS],
    inputs:[], outputs:[aOut('gates')],
    toSq: ()=>`# bin files auto-loaded by Sanskrit runtime`,
  },
  {
    id:'cross_shard_gate', label:'Cross-Shard Gate', cat:'sharding', color:'#65A30D', icon:'⊗',
    info:'2-qubit gate spanning shard boundary. Uses Schmidt decomposition — avoids 20-qubit merge (6 GB .bin files).',
    params:[pn('qubit_a','Global qubit A',9,0,199), pn('qubit_b','Global qubit B',10,0,199), psel('gate','Gate type',['CNOT','CZ','SWAP'],'CNOT'), pb('log_entanglement','Log entanglement',true), ...BYPASS],
    inputs:[rIn('a'), rIn('b')], outputs:[rOut('ao'), rOut('bo')],
    toSq: p=>`CNOT(q[${p.qubit_a}], q[${p.qubit_b}])  # cross-shard via Schmidt`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 14. CLASSICAL CONTROL FLOW
  // ═══════════════════════════════════════════════════════════════════════
  {
    id:'for_loop', label:'For Loop', cat:'classical', color:'#CE4A2E', icon:'↩',
    info:'Iterates over range or collection. Python-style: for i in range(10):  Brace-style: for i in range(10) { }',
    params:[ps('variable','Loop variable','i'), psel('iterate_over','Iterate over',['range','collection'],'range'), ps('range_start','Start','0'), ps('range_end','End','10'), pn('step','Step',1,1,1000), ps('collection_var','Collection variable','items'), ...BYPASS],
    inputs:[aIn()], outputs:[cOut('iter_var'), aOut()],
    toSq: p=>p.iterate_over==='range'?`for ${p.variable} in range(${p.range_start}, ${p.range_end}):`:`for ${p.variable} in ${p.collection_var}:`,
  },
  {
    id:'while_loop', label:'While Loop', cat:'classical', color:'#CE4A2E', icon:'⟳',
    info:'Repeats body while condition is true. Safety max prevents infinite loops.',
    params:[ps('condition','Condition','x > 0'), pn('max_iterations','Max iterations',100000,1,1e9), ...BYPASS],
    inputs:[cIn()], outputs:[aOut()],
    toSq: p=>`while ${p.condition}:`,
  },
  {
    id:'if_else', label:'If / Else', cat:'classical', color:'#CE4A2E', icon:'⎇',
    info:'Conditional. Supports elif. Quantum feedback: if measure(q[0]) == 1: X(q[1]).',
    params:[ps('condition','Condition','energy < -1.0'), pb('has_elif','Has elif',false), pb('has_else','Has else',true), ...BYPASS],
    inputs:[cIn()], outputs:[cOut('then_out'), cOut('else_out')],
    toSq: p=>`if ${p.condition}:`,
  },
  {
    id:'try_catch', label:'Try / Catch', cat:'classical', color:'#CE4A2E', icon:'🛡',
    info:'Exception handling for DB connections, API calls, hardware failures.',
    params:[ps('error_var','Error variable','e'), pb('log_errors','Log errors',true), ...BYPASS],
    inputs:[cIn()], outputs:[cOut('try_out'), cOut('catch_out')],
    toSq: ()=>`try:`,
  },
  {
    id:'return_block', label:'Return', cat:'classical', color:'#CE4A2E', icon:'↵',
    info:'Return a value from a function.',
    params:[ps('return_expr','Return expression','result'), ...BYPASS],
    inputs:[cIn()], outputs:[],
    toSq: p=>`return ${p.return_expr}`,
  },
  {
    id:'break_block', label:'Break', cat:'classical', color:'#CE4A2E', icon:'⏹',
    info:'Break out of the enclosing for/while loop.',
    params:[ps('condition','Condition (blank=always)',''), ...BYPASS], inputs:[cIn()], outputs:[],
    toSq: p=>p.condition?`if ${p.condition}:\n    break`:`break`,
  },
  {
    id:'continue_block', label:'Continue', cat:'classical', color:'#CE4A2E', icon:'⏭',
    info:'Skip to next loop iteration.',
    params:[ps('condition','Condition (blank=always)',''), ...BYPASS], inputs:[cIn()], outputs:[],
    toSq: p=>p.condition?`if ${p.condition}:\n    continue`:`continue`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 15. FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════
  {
    id:'fn_def', label:'Function', cat:'fn_block', color:'#D97706', icon:'λ',
    info:'Define reusable function. SimpleSanskrit: def f(x): return x*2  FullSanskrit: fn f(x: float) -> float { x * 2.0 }',
    params:[ps('fn_name','Name','my_function'), pj('params','Parameters','[{"name":"x","type":"float"}]'), ps('return_type','Return type','float'), pb('is_async','Async',false), pb('memoize','Memoize results',false), ...BYPASS],
    inputs:[aIn('body')], outputs:[aOut('fn_ref')],
    toSq: p=>{try{const a=JSON.parse(p.params||'[]');return `def ${p.fn_name}(${a.map(x=>x.name).join(', ')}):`;}catch{return `def ${p.fn_name}():`;} },
  },
  {
    id:'fn_call', label:'Function Call', cat:'fn_block', color:'#D97706', icon:'f()',
    info:'Call a function with positional or keyword arguments.',
    params:[ps('fn_name','Function name','my_function'), pj('args','Arguments','["arg1"]'), pj('kwargs','Named args','{}'), ps('output_var','Result variable','result'), ...BYPASS],
    inputs:[aIn()], outputs:[aOut('result')],
    toSq: p=>{try{const a=JSON.parse(p.args||'[]');return `let ${p.output_var} = ${p.fn_name}(${a.join(', ')})`;} catch{return `let ${p.output_var} = ${p.fn_name}()`;} },
  },
  {
    id:'lambda_block', label:'Lambda', cat:'fn_block', color:'#D97706', icon:'|x|',
    info:'Anonymous function: f = lambda x, y: x + y',
    params:[ps('params','Parameters','x, y'), ps('body','Body expression','x + y'), ps('assign_to','Assign to','f'), ...BYPASS],
    inputs:[], outputs:[aOut('fn_ref')],
    toSq: p=>`let ${p.assign_to} = lambda ${p.params}: ${p.body}`,
  },
  {
    id:'async_fn', label:'Async Function', cat:'fn_block', color:'#D97706', icon:'⟳f',
    info:'Non-blocking async function for network/IO operations.',
    params:[ps('fn_name','Name','fetch_data'), pn('timeout_ms','Timeout (ms)',30000,100,300000), ...BYPASS],
    inputs:[aIn('body')], outputs:[aOut('fn_ref')],
    toSq: p=>`async def ${p.fn_name}():`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 16. VARIABLES
  // ═══════════════════════════════════════════════════════════════════════
  {
    id:'global_var', label:'Global Variable', cat:'variable', color:'#0D9488', icon:'$G',
    info:'Global variable accessible by ALL downstream blocks.',
    params:[ps('var_name','Name','shared_energy'), ps('var_type','Type hint','float'), ps('initial_value','Initial value','0.0'), pb('log_on_change','Log on change',true), ...BYPASS],
    inputs:[], outputs:[cOut('var_ref')],
    toSq: p=>`global ${p.var_name} = ${p.initial_value}`,
  },
  {
    id:'local_var', label:'Local Variable', cat:'variable', color:'#0D9488', icon:'$L',
    info:'Variable scoped to the current block.',
    params:[ps('var_name','Name','x'), ps('initial_value','Initial value','0'), pb('log_value','Log value',true), ...BYPASS],
    inputs:[], outputs:[cOut('var_ref')],
    toSq: p=>`${p.var_name} = ${p.initial_value}`,
  },
  {
    id:'const_var', label:'Constant', cat:'variable', color:'#0D9488', icon:'🔒',
    info:'Immutable constant. Cannot change after declaration.',
    params:[ps('name','Name','MAX_ITER'), ps('value','Value','1000'), ...BYPASS],
    inputs:[], outputs:[cOut('const_ref')],
    toSq: p=>`const ${p.name} = ${p.value}`,
  },
  {
    id:'var_snapshot', label:'Variable Snapshot', cat:'variable', color:'#0D9488', icon:'📸',
    info:'Dumps ALL variables + quantum states to logs panel. Does NOT affect execution.',
    params:[ps('label','Snapshot label','checkpoint_1'), pb('include_quantum','Include quantum states',true), ...BYPASS],
    inputs:[aIn()], outputs:[aOut()],
    toSq: p=>`debug_vars!("${p.label}")`,
  },
  {
    id:'env_var', label:'Environment Variable', cat:'variable', color:'#0D9488', icon:'ENV',
    info:'Read OS environment variable. Falls back to default if not set.',
    params:[ps('env_key','ENV key','SANSKRIT_API_KEY'), ps('fallback','Default value',''), pb('mask_in_logs','Mask in logs',true), ps('assign_to','Assign to','env_val'), ...BYPASS],
    inputs:[], outputs:[cOut('value')],
    toSq: p=>`let ${p.assign_to} = env("${p.env_key}")`,
  },
  {
    id:'secret_var', label:'Secret / API Key', cat:'variable', color:'#0D9488', icon:'🔑',
    info:'API keys and credentials. Always masked in logs. Never exported to .sq files.',
    params:[ps('secret_name','Secret name','OPENAI_API_KEY'), psel('storage','Storage',['browser_local','env','session'],'env'), ps('assign_to','Assign to','api_key'), ...BYPASS],
    inputs:[], outputs:[cOut('secret')],
    toSq: p=>`let ${p.assign_to} = secret("${p.secret_name}")`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 17. STRING & REGEX
  // ═══════════════════════════════════════════════════════════════════════
  {
    id:'string_ops', label:'String Operations', cat:'string_re', color:'#DB2777', icon:'STR',
    info:'Format, split, join, replace, contains, case, slice, trim, zfill.',
    params:[ps('input_var','Input variable','text'), psel('operation','Operation',['upper','lower','split','join','replace','trim','strip','len','slice','find','contains','startswith','endswith','zfill'],'upper'), ps('pattern','Pattern / separator',''), ps('replacement','Replacement',''), ps('assign_to','Assign to','result'), ...BYPASS],
    inputs:[cIn()], outputs:[cOut('result')],
    toSq: p=>`let ${p.assign_to} = ${p.input_var}.${p.operation}("${p.pattern}")`,
  },
  {
    id:'regex_ops', label:'Regex Operations', cat:'string_re', color:'#DB2777', icon:'.*',
    info:'Match, find, capture, replace using RE2 syntax. Named captures, multiline, case-insensitive.',
    params:[ps('input_var','Input variable','text'), ps('pattern','Regex pattern','[A-Z]+'), psel('operation','Operation',['is_match','find','find_all','captures','replace','replace_all','split'],'is_match'), pb('case_insensitive','Case insensitive',false), ps('assign_to','Assign to','matches'), ...BYPASS],
    inputs:[cIn()], outputs:[cOut('result')],
    toSq: p=>`let ${p.assign_to} = regex_${p.operation}(r"${p.pattern}", ${p.input_var})`,
  },
  {
    id:'json_ops', label:'JSON Operations', cat:'string_re', color:'#DB2777', icon:'{}J',
    info:'Parse, serialize, JSONPath query, schema validate.',
    params:[ps('input_var','Input variable','data'), psel('operation','Operation',['parse','serialize','pretty_print','get_field','merge'],'parse'), ps('field_path','JSONPath','$.data'), ps('assign_to','Assign to','result'), ...BYPASS],
    inputs:[cIn()], outputs:[cOut('result')],
    toSq: p=>`let ${p.assign_to} = json_${p.operation}(${p.input_var})`,
  },
  {
    id:'xml_ops', label:'XML Operations', cat:'string_re', color:'#DB2777', icon:'<XML>',
    info:'Parse, XPath query, validate XSD.',
    params:[ps('input_var','Input variable','xml_data'), psel('operation','Operation',['parse','serialize','xpath'],'parse'), ps('xpath_expr','XPath','//element'), ps('assign_to','Assign to','result'), ...BYPASS],
    inputs:[cIn()], outputs:[cOut('result')],
    toSq: p=>`let ${p.assign_to} = xml_${p.operation}(${p.input_var})`,
  },
  {
    id:'hash_block', label:'Hash / HMAC', cat:'string_re', color:'#DB2777', icon:'#',
    info:'MD5, SHA256/512, Blake3, HMAC-SHA256.',
    params:[ps('input_var','Input variable','data'), psel('algorithm','Algorithm',['MD5','SHA1','SHA256','SHA512','Blake3','HMAC-SHA256'],'SHA256'), psel('output_format','Format',['hex','bytes','base64'],'hex'), ps('assign_to','Assign to','hash'), ...BYPASS],
    inputs:[cIn()], outputs:[cOut('hash_out')],
    toSq: p=>`let ${p.assign_to} = hash_${p.algorithm.toLowerCase()}(${p.input_var})`,
  },
  {
    id:'format_string', label:'Format String', cat:'string_re', color:'#DB2777', icon:'f"',
    info:'f-string: f"Energy: {energy:.6f} Ha". Specs: .Nf, .Ne, d, g, x.',
    params:[ps('template','Template','Value: {x:.3f}'), pj('vars','Variables','{}'), ps('assign_to','Assign to','formatted'), ...BYPASS],
    inputs:[cIn()], outputs:[cOut('string_out')],
    toSq: p=>`let ${p.assign_to} = f"${p.template}"`,
  },
  {
    id:'base64_block', label:'Base64', cat:'string_re', color:'#DB2777', icon:'b64',
    info:'Base64 encode/decode. Standard, URL-safe, MIME.',
    params:[ps('input_var','Input variable','data'), psel('operation','Operation',['encode','decode'],'encode'), psel('charset','Variant',['standard','url_safe','mime'],'standard'), ps('assign_to','Assign to','result'), ...BYPASS],
    inputs:[cIn()], outputs:[cOut('result')],
    toSq: p=>`let ${p.assign_to} = base64_${p.operation}(${p.input_var})`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 18. MATH & NUMERICS
  // ═══════════════════════════════════════════════════════════════════════
  {
    id:'math_ops', label:'Math Operations', cat:'math', color:'#6366F1', icon:'∑',
    info:'Full math.h: trig, log, power, rounding, min/max, clamp.',
    params:[ps('lhs','Left operand','a'), psel('operation','Operation',['add','sub','mul','div','mod','pow','sqrt','abs','floor','ceil','round','log','ln','log2','exp','sin','cos','tan','asin','acos','atan','atan2','min','max','hypot','sign','clamp'],'add'), ps('rhs','Right operand','b'), ps('assign_to','Result variable','result'), ...BYPASS],
    inputs:[cIn('a'), cIn('b')], outputs:[cOut('result')],
    toSq: p=>`let ${p.assign_to} = ${p.operation}(${p.lhs}, ${p.rhs})`,
  },
  {
    id:'matrix_ops', label:'Matrix Operations', cat:'math', color:'#6366F1', icon:'M×',
    info:'Multiply, inverse, transpose, eigenvalues, SVD, QR, LU, trace, norm.',
    params:[ps('matrix_a','Matrix A','A'), ps('matrix_b','Matrix B','B'), psel('operation','Operation',['multiply','add','subtract','transpose','inverse','determinant','eigenvalues','svd','qr','lu','trace','norm'],'multiply'), ps('assign_to','Assign to','result'), ...BYPASS],
    inputs:[cIn('A'), cIn('B')], outputs:[cOut('result')],
    toSq: p=>`let ${p.assign_to} = matrix_${p.operation}(${p.matrix_a}, ${p.matrix_b})`,
  },
  {
    id:'fft_block', label:'FFT / IFFT', cat:'math', color:'#6366F1', icon:'FFT',
    info:'Classical Fast Fourier Transform. For quantum FT use the QFT algorithm block.',
    params:[ps('input_var','Input signal','signal'), psel('operation','Operation',['fft','ifft','fft2d','rfft'],'fft'), pb('fft_shift','FFT shift (centre freq)',false), ps('assign_to','Assign to','spectrum'), ...BYPASS],
    inputs:[cIn()], outputs:[cOut('spectrum')],
    toSq: p=>`let ${p.assign_to} = fft(${p.input_var})`,
  },
  {
    id:'stats_block', label:'Statistics', cat:'math', color:'#6366F1', icon:'σ',
    info:'Mean, median, std, t-test, chi-square, ANOVA, percentile, correlation, normalise.',
    params:[ps('input_var','Input data','data'), psel('operation','Operation',['mean','median','std','var','min','max','sum','count','percentile','correlation','covariance','t_test','zscore','normalize'],'mean'), ps('assign_to','Assign to','stat_result'), ...BYPASS],
    inputs:[cIn()], outputs:[cOut('result')],
    toSq: p=>`let ${p.assign_to} = stats_${p.operation}(${p.input_var})`,
  },
  {
    id:'complex_ops', label:'Complex Ops', cat:'math', color:'#6366F1', icon:'ℂ',
    info:'Complex arithmetic: add, mul, conjugate, magnitude, phase, polar↔rect.',
    params:[ps('a_var','Complex A','a'), ps('b_var','Complex B','b'), psel('operation','Operation',['add','mul','sub','div','conjugate','magnitude','phase','polar_to_rect'],'mul'), ps('assign_to','Assign to','result'), ...BYPASS],
    inputs:[cIn('a'), cIn('b')], outputs:[cOut('result')],
    toSq: p=>`let ${p.assign_to} = complex_${p.operation}(${p.a_var}, ${p.b_var})`,
  },
  {
    id:'bit_ops', label:'Bitwise Operations', cat:'math', color:'#6366F1', icon:'&|',
    info:'AND, OR, XOR, NOT, shifts. Used in Grover oracle construction.',
    params:[ps('a_var','Operand A','a'), ps('b_var','Operand B','b'), psel('operation','Operation',['and','or','xor','not','shift_left','shift_right','rotate_left'],'xor'), ps('assign_to','Assign to','result'), ...BYPASS],
    inputs:[cIn('a'), cIn('b')], outputs:[cOut('result')],
    toSq: p=>{ const ops={and:'&',or:'|',xor:'^',not:'~',shift_left:'<<',shift_right:'>>'}; return `let ${p.assign_to} = ${p.a_var} ${ops[p.operation]||p.operation} ${p.b_var}`; },
  },
  {
    id:'linspace_block', label:'Linspace', cat:'math', color:'#6366F1', icon:'[a..b]',
    info:'N evenly spaced values between a and b (like numpy.linspace).',
    params:[ps('start','Start','0'), ps('end','End','1'), pn('n_points','Points',100,2,100000), ps('assign_to','Assign to','x'), ...BYPASS],
    inputs:[], outputs:[cOut('array')],
    toSq: p=>`let ${p.assign_to} = linspace(${p.start}, ${p.end}, ${p.n_points})`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 19. CHEMISTRY
  // ═══════════════════════════════════════════════════════════════════════
  {
    id:'molecule_init', label:'Molecule', cat:'chemistry', color:'#059669', icon:'⬡',
    info:'Initialise molecule from SMILES, PDB, or IUPAC name. Computes geometry, orbitals, basis set.',
    params:[ps('molecule_name','Molecule','H2'), ps('smiles','SMILES','[H][H]'), pn('charge','Charge',0,-10,10), pn('multiplicity','Multiplicity',1,1,10), psel('basis_set','Basis set',['STO-3G','6-31G','6-31G*','cc-pVDZ','def2-SVP'],'STO-3G'), ps('output_var','Output variable','mol'), pb('log_properties','Log properties',true), ...BYPASS],
    inputs:[], outputs:[aOut('mol')],
    toSq: p=>`let ${p.output_var} = molecule("${p.molecule_name}", basis="${p.basis_set}")`,
  },
  {
    id:'vqe_chemistry', label:'VQE Chemistry', cat:'chemistry', color:'#059669', icon:'VQE⬡',
    info:'VQE for molecular ground state. Jordan-Wigner mapping, UCCSD ansatz, frozen-core, parameter-shift gradients.',
    params:[ps('molecule_var','Molecule','mol'), psel('qubit_mapping','Qubit mapping',['Jordan-Wigner','Bravyi-Kitaev','parity'],'Jordan-Wigner'), psel('ansatz','Ansatz',['UCCSD','kUpCCGSD','HEA'],'UCCSD'), psel('optimizer','Optimizer',['COBYLA','SLSQP'],'COBYLA'), pn('shots','Shots',1000,100,100000), ps('output_var','Output','chem_result'), ...BYPASS],
    inputs:[aIn('mol')], outputs:[cOut('energy','Ground state energy (Hartree)')],
    toSq: p=>`let ${p.output_var} = vqe_chemistry(${p.molecule_var}, ansatz="${p.ansatz}")`,
  },
  {
    id:'hartree_fock', label:'Hartree-Fock', cat:'chemistry', color:'#059669', icon:'HF',
    info:'Classical SCF. Starting point for all correlated methods. Computes molecular orbitals.',
    params:[ps('molecule_var','Molecule','mol'), pn('max_iter','Max iterations',50,1,1000), pb('diis','DIIS acceleration',true), ps('output_var','Output','hf_result'), ...BYPASS],
    inputs:[aIn('mol')], outputs:[cOut('hf_out')],
    toSq: p=>`let ${p.output_var} = hartree_fock(${p.molecule_var})`,
  },
  {
    id:'mp2_block', label:'MP2 Correction', cat:'chemistry', color:'#059669', icon:'MP2',
    info:'Møller-Plesset 2nd order: adds electron correlation to Hartree-Fock.',
    params:[ps('hf_var','HF result','hf_result'), pb('frozen_core','Frozen core',true), ps('output_var','Output','mp2_energy'), ...BYPASS],
    inputs:[aIn('hf')], outputs:[cOut('energy')],
    toSq: p=>`let ${p.output_var} = mp2(${p.hf_var})`,
  },
  {
    id:'ccsd_t_block', label:'CCSD(T)', cat:'chemistry', color:'#059669', icon:'CCSD',
    info:'Coupled Cluster Singles Doubles + Triples — "gold standard" of quantum chemistry.',
    params:[ps('hf_var','HF result','hf_result'), pb('frozen_core','Frozen core',true), ps('output_var','Output','ccsd_energy'), ...BYPASS],
    inputs:[aIn('hf')], outputs:[cOut('energy')],
    toSq: p=>`let ${p.output_var} = ccsd_t(${p.hf_var})`,
  },
  {
    id:'dft_block', label:'DFT', cat:'chemistry', color:'#059669', icon:'DFT',
    info:'Density Functional Theory. B3LYP for organics, PBE for solids, wB97X-D for non-covalent.',
    params:[ps('molecule_var','Molecule','mol'), psel('functional','Functional',['B3LYP','PBE','M06-2X','PBE0','wB97X-D','LDA'],'B3LYP'), psel('dispersion','Dispersion',['none','D3','D3BJ'],'D3'), ps('output_var','Output','dft_result'), ...BYPASS],
    inputs:[aIn('mol')], outputs:[cOut('energy')],
    toSq: p=>`let ${p.output_var} = dft(${p.molecule_var}, functional="${p.functional}")`,
  },
  {
    id:'tanimoto_block', label:'Tanimoto Similarity', cat:'chemistry', color:'#059669', icon:'∩∪',
    info:'Molecular fingerprint similarity. Score=|A∩B|/|A∪B|. Industry standard for virtual screening.',
    params:[ps('mol_a','Molecule A','mol_a'), ps('mol_b','Molecule B','mol_b'), psel('fingerprint','Fingerprint',['Morgan','MACCS','RDKit'],'Morgan'), ps('output_var','Similarity variable','similarity'), ...BYPASS],
    inputs:[aIn('a'), aIn('b')], outputs:[cOut('score','Similarity 0-1')],
    toSq: p=>`let ${p.output_var} = tanimoto(${p.mol_a}, ${p.mol_b})`,
  },
  {
    id:'spectroscopy_block', label:'Spectroscopy Sim', cat:'chemistry', color:'#059669', icon:'λ~',
    info:'Simulate IR, Raman, UV-Vis, NMR spectra from optimised geometry.',
    params:[ps('molecule_var','Molecule','mol'), psel('type','Spectrum type',['IR','Raman','UV-Vis','NMR'],'IR'), pb('plot_spectrum','Plot spectrum',true), ps('output_var','Output','spectrum'), ...BYPASS],
    inputs:[aIn('mol')], outputs:[cOut('spectrum')],
    toSq: p=>`let ${p.output_var} = spectroscopy(${p.molecule_var}, type="${p.type}")`,
  },
  {
    id:'pka_block', label:'pKa Calculator', cat:'chemistry', color:'#059669', icon:'pKa',
    info:'Predict acid-base dissociation constant. Essential for drug solubility prediction.',
    params:[ps('molecule_var','Molecule','mol'), psel('method','Method',['Epik','ACD','ML_model'],'Epik'), ps('output_var','Output','pka'), ...BYPASS],
    inputs:[aIn('mol')], outputs:[cOut('pka')],
    toSq: p=>`let ${p.output_var} = pka(${p.molecule_var})`,
  },
  {
    id:'logp_block', label:'LogP Calculator', cat:'chemistry', color:'#059669', icon:'logP',
    info:'Octanol/water partition coefficient. Lipinski Rule of 5: logP ≤ 5 for oral bioavailability.',
    params:[ps('molecule_var','Molecule','mol'), psel('method','Method',['ALOGPS','Wildman-Crippen','XLOGP3'],'ALOGPS'), ps('output_var','Output','logp'), ...BYPASS],
    inputs:[aIn('mol')], outputs:[cOut('logp')],
    toSq: p=>`let ${p.output_var} = logp(${p.molecule_var})`,
  },
  {
    id:'reaction_path', label:'Reaction Pathway', cat:'chemistry', color:'#059669', icon:'→↗',
    info:'Minimum energy reaction path via NEB or IRC.',
    params:[ps('reactants_var','Reactants','reactants'), ps('products_var','Products','products'), psel('method','Method',['NEB','GSM','IRC'],'NEB'), pn('n_images','NEB images',7,3,50), ps('output_var','Output','pathway'), ...BYPASS],
    inputs:[aIn('reactants'), aIn('products')], outputs:[cOut('pathway')],
    toSq: p=>`let ${p.output_var} = reaction_path(${p.reactants_var}, ${p.products_var})`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 20. DRUG DISCOVERY
  // ═══════════════════════════════════════════════════════════════════════
  {
    id:'molecular_docking', label:'Molecular Docking', cat:'drug', color:'#7C3AED', icon:'🔗',
    info:'Score ligand-protein binding. AutoDock-Vina, Glide, GOLD, rDock engines.',
    params:[ps('ligand_var','Ligand','ligand'), ps('protein_var','Protein PDB','protein'), psel('engine','Engine',['AutoDock-Vina','Glide SP','GOLD','rDock'],'AutoDock-Vina'), pn('exhaustiveness','Exhaustiveness',8,1,100), pn('n_poses','Poses',9,1,50), ps('output_var','Output','poses'), ...BYPASS],
    inputs:[aIn('ligand'), aIn('protein')], outputs:[cOut('poses'), cOut('scores')],
    toSq: p=>`let ${p.output_var} = molecular_docking(${p.ligand_var}, ${p.protein_var})`,
  },
  {
    id:'admet_block', label:'ADMET Predictor', cat:'drug', color:'#7C3AED', icon:'ADMET',
    info:'Absorption, Distribution, Metabolism, Excretion, Toxicity. Lipinski Rule of 5, BBB, hERG.',
    params:[ps('molecule_var','Molecule','mol'), psel('model','Model',['pkCSM','SwissADME','ADMETsar'],'pkCSM'), ps('output_var','Output','admet_result'), pb('flag_violations','Flag Lipinski violations',true), ...BYPASS],
    inputs:[aIn('mol')], outputs:[cOut('admet')],
    toSq: p=>`let ${p.output_var} = admet(${p.molecule_var})`,
  },
  {
    id:'virtual_screen', label:'Virtual Screening', cat:'drug', color:'#7C3AED', icon:'VS',
    info:'Screen compound library against target. Filter by Lipinski, PAINS, drug-likeness.',
    params:[ps('library_file','Compound library','library.sdf'), ps('target_var','Target protein','protein'), psel('method','Method',['docking','pharmacophore','shape','ML'],'docking'), pn('top_n','Top N hits',100,10,10000), ps('output_var','Output hits','hits'), ...BYPASS],
    inputs:[aIn('target')], outputs:[cOut('hits')],
    toSq: p=>`let ${p.output_var} = virtual_screen("${p.library_file}", ${p.target_var})`,
  },
  {
    id:'qsar_model', label:'QSAR Model', cat:'drug', color:'#7C3AED', icon:'QSAR',
    info:'Predict bioactivity from molecular structure using ML.',
    params:[ps('training_data_var','Training data','train_data'), ps('endpoint','Endpoint','IC50'), psel('method','Method',['RF','GBT','SVM','DNN','GraphNN'],'RF'), ps('output_model','Model variable','qsar_model'), ...BYPASS],
    inputs:[aIn('data')], outputs:[aOut('model'), cOut('metrics')],
    toSq: p=>`let ${p.output_model} = qsar(${p.training_data_var}, endpoint="${p.endpoint}")`,
  },
  {
    id:'lead_opt', label:'Lead Optimisation', cat:'drug', color:'#7C3AED', icon:'💊',
    info:'Generate optimised candidates from scaffold using RL, generative models, or GA.',
    params:[ps('scaffold_smiles','Scaffold SMILES',''), psel('method','Method',['graph_GA','REINVENT','VAE','RL'],'graph_GA'), pn('n_compounds','Candidates',100,10,10000), ps('output_var','Output leads','lead_list'), ...BYPASS],
    inputs:[aIn('scaffold')], outputs:[cOut('leads')],
    toSq: p=>`let ${p.output_var} = lead_optimization(scaffold="${p.scaffold_smiles}")`,
  },
  {
    id:'de_novo_design', label:'De Novo Design', cat:'drug', color:'#7C3AED', icon:'✨',
    info:'Generate novel drug candidates from scratch using RFdiffusion or VAE generative models.',
    params:[ps('target_var','Target protein','protein'), psel('method','Method',['fragment','RL','VAE','diffusion'],'diffusion'), pn('n_designs','Designs',100,10,10000), ps('output_var','Output molecules','novel_molecules'), ...BYPASS],
    inputs:[aIn('target')], outputs:[cOut('molecules')],
    toSq: p=>`let ${p.output_var} = de_novo_design(${p.target_var})`,
  },
  {
    id:'toxicity_block', label:'Toxicity Predictor', cat:'drug', color:'#7C3AED', icon:'☠',
    info:'Ames mutagenicity, hERG, DILI, carcinogenicity, LD50, skin sensitisation.',
    params:[ps('molecule_var','Molecule','mol'), pj('endpoints','Endpoints','["Ames","hERG","DILI"]'), ps('output_var','Output','toxicity'), ...BYPASS],
    inputs:[aIn('mol')], outputs:[cOut('toxicity')],
    toSq: p=>`let ${p.output_var} = toxicity(${p.molecule_var})`,
  },
  {
    id:'binding_free_energy', label:'Binding Free Energy', cat:'drug', color:'#7C3AED', icon:'ΔG',
    info:'Protein-ligand ΔG via MM-GBSA, FEP, or PBSA.',
    params:[ps('protein_var','Protein','protein'), ps('ligand_var','Ligand','ligand'), psel('scoring','Method',['MM-GBSA','FEP','PBSA'],'MM-GBSA'), ps('output_var','Output ΔG','delta_g'), ...BYPASS],
    inputs:[aIn('protein'), aIn('ligand')], outputs:[cOut('delta_g','ΔG kcal/mol')],
    toSq: p=>`let ${p.output_var} = binding_free_energy(${p.protein_var}, ${p.ligand_var})`,
  },

// ═══ END OF PART 2 ══════════════════════════════════════════════════════
// Continue with registry_part3.js — paste DIRECTLY after the last block above

//           ML, GenAI, File Sources, Databases, Cloud, API, Transform,
//           Output, Execution Control, Logging, Security, Hardware, Utility
// Then closes the BLOCKS array and exports registry helpers.

  // ═══════════════════════════════════════════════════════════════════════
  // 21. VACCINE & IMMUNOLOGY
  // ═══════════════════════════════════════════════════════════════════════
  {
    id:'antigen_design', label:'Antigen Design', cat:'vaccine', color:'#DB2777', icon:'🧬',
    info:'Design vaccine antigen from pathogen sequence. Methods: consensus, mosaic, ancestral, AI.',
    params:[ps('pathogen_sequence','Pathogen sequence',''), psel('method','Method',['consensus','mosaic','ancestral','AI_generated'],'mosaic'), pn('coverage_target','Coverage target (%)',95,50,100), ps('output_var','Output antigen','antigen'), ...BYPASS],
    inputs:[cIn('seq')], outputs:[cOut('antigen')],
    toSq: p=>`let ${p.output_var} = antigen_design("${p.pathogen_sequence}", method="${p.method}")`,
  },
  {
    id:'epitope_pred', label:'Epitope Predictor', cat:'vaccine', color:'#DB2777', icon:'MHC',
    info:'Predict T-cell and B-cell epitopes. MHC I/II binding using NetMHCpan, IEDB.',
    params:[ps('protein_sequence','Protein sequence',''), psel('mhc_class','MHC class',['I','II','both'],'I'), pj('mhc_alleles','MHC alleles','["HLA-A*02:01"]'), psel('method','Method',['NetMHCpan','SYFPEITHI','IEDB_consensus'],'NetMHCpan'), ps('output_var','Output','epitopes'), ...BYPASS],
    inputs:[cIn('seq')], outputs:[cOut('epitopes')],
    toSq: p=>`let ${p.output_var} = epitope_prediction("${p.protein_sequence}", mhc="${p.mhc_class}")`,
  },
  {
    id:'immunogenicity', label:'Immunogenicity', cat:'vaccine', color:'#DB2777', icon:'IgG',
    info:'Predict immunogenicity score — likelihood of triggering immune response.',
    params:[ps('antigen_var','Antigen','antigen'), psel('model','Model',['NetMHCII','IEDB_consensus','TCR_model'],'IEDB_consensus'), ps('output_var','Output','imm_score'), ...BYPASS],
    inputs:[aIn('antigen')], outputs:[cOut('score')],
    toSq: p=>`let ${p.output_var} = immunogenicity(${p.antigen_var})`,
  },
  {
    id:'antibody_design', label:'Antibody Design', cat:'vaccine', color:'#DB2777', icon:'Y',
    info:'Design therapeutic antibodies: CDR graft, humanisation, affinity maturation.',
    params:[ps('target_epitope','Target epitope',''), psel('method','Method',['CDR_graft','humanise','affinity_mature','de_novo'],'de_novo'), pn('n_candidates','Candidates',100,10,10000), ps('output_var','Output','antibodies'), ...BYPASS],
    inputs:[cIn('epitope')], outputs:[cOut('antibodies')],
    toSq: p=>`let ${p.output_var} = antibody_design("${p.target_epitope}")`,
  },
  {
    id:'mrna_design', label:'mRNA Design', cat:'vaccine', color:'#DB2777', icon:'mRNA',
    info:'Optimise mRNA codon usage, UTR, poly-A tail for maximum expression and stability.',
    params:[ps('protein_sequence','Protein sequence',''), ps('host_organism','Host organism','human'), pb('codon_optimise','Codon optimise',true), pb('add_utr','Add UTR elements',true), ps('output_var','Output mRNA','mrna'), ...BYPASS],
    inputs:[cIn('protein')], outputs:[cOut('mrna')],
    toSq: p=>`let ${p.output_var} = mrna_design("${p.protein_sequence}")`,
  },
  {
    id:'vax_formulation', label:'Vaccine Formulation', cat:'vaccine', color:'#DB2777', icon:'💉',
    info:'Predict optimal adjuvants, delivery systems, and storage conditions.',
    params:[ps('antigen_var','Antigen','antigen'), psel('delivery','Delivery system',['LNP','alum','MF59','virosomes'],'LNP'), psel('adjuvant','Adjuvant',['AS01B','CpG','poly_IC','none'],'AS01B'), ps('output_var','Output','formulation'), ...BYPASS],
    inputs:[aIn('antigen')], outputs:[cOut('formulation')],
    toSq: p=>`let ${p.output_var} = vaccine_formulation(${p.antigen_var}, delivery="${p.delivery}")`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 22. BIOLOGY & GENOMICS
  // ═══════════════════════════════════════════════════════════════════════
  {
    id:'dna_seq', label:'DNA Sequence', cat:'biology', color:'#16A34A', icon:'🧬',
    info:'Load, parse, analyse DNA. GC content, melting temperature, k-mer counts.',
    params:[ps('sequence','Sequence','ATGCGATCG'), ps('file_path','File path (FASTA)',''), psel('format','Format',['raw','FASTA','FASTQ','GenBank'],'raw'), ps('output_var','Output','dna'), ...BYPASS],
    inputs:[], outputs:[aOut('dna')],
    toSq: p=>`let ${p.output_var} = dna("${p.sequence}")`,
  },
  {
    id:'protein_fold', label:'Protein Folding', cat:'biology', color:'#16A34A', icon:'🔄',
    info:'AlphaFold2/ColabFold structure prediction. pLDDT confidence score.',
    params:[ps('sequence','Protein sequence','MKTAYIAKQRQISFVK'), psel('method','Method',['AlphaFold2','ESMFold','OmegaFold','RoseTTAFold'],'AlphaFold2'), pb('use_templates','Use templates',true), ps('output_var','Output','protein_struct'), ...BYPASS],
    inputs:[cIn('seq')], outputs:[aOut('structure')],
    toSq: p=>`let ${p.output_var} = protein_fold("${p.sequence}", method="${p.method}")`,
  },
  {
    id:'blast_block', label:'BLAST Search', cat:'biology', color:'#16A34A', icon:'BLAST',
    info:'NCBI BLAST: find homologous sequences in databases.',
    params:[ps('query_seq','Query sequence',''), psel('blast_type','BLAST type',['blastn','blastp','blastx','tblastn'],'blastp'), ps('database','Database','nr'), pn('e_value_threshold','E-value threshold',1e-10,1e-100,1), ps('output_var','Output','blast_hits'), ...BYPASS],
    inputs:[cIn('seq')], outputs:[cOut('hits')],
    toSq: p=>`let ${p.output_var} = blast("${p.query_seq}", db="${p.database}")`,
  },
  {
    id:'rna_fold', label:'RNA Folding', cat:'biology', color:'#16A34A', icon:'RNA',
    info:'Predict RNA secondary structure. Vienna RNAfold minimum free energy.',
    params:[ps('rna_sequence','RNA sequence','AUGCAUGCAUGC'), psel('method','Method',['Vienna_RNAfold','mfold','RNAstructure'],'Vienna_RNAfold'), ps('output_var','Output','rna_struct'), ...BYPASS],
    inputs:[cIn('seq')], outputs:[aOut('structure')],
    toSq: p=>`let ${p.output_var} = rna_fold("${p.rna_sequence}")`,
  },
  {
    id:'gene_expression', label:'Gene Expression', cat:'biology', color:'#16A34A', icon:'📊',
    info:'Differential expression analysis from RNA-seq count matrices (DESeq2, edgeR, limma).',
    params:[ps('count_matrix_var','Count matrix','counts'), ps('sample_metadata','Sample metadata','metadata'), psel('method','Method',['DESeq2','edgeR','limma'],'DESeq2'), pn('fdr_threshold','FDR threshold',0.05,0,1), ps('output_var','Output DE genes','de_genes'), ...BYPASS],
    inputs:[aIn('counts')], outputs:[cOut('de_genes'), cOut('volcano_data')],
    toSq: p=>`let ${p.output_var} = gene_expression(${p.count_matrix_var})`,
  },
  {
    id:'crispr_design', label:'CRISPR Guide Design', cat:'biology', color:'#16A34A', icon:'✂',
    info:'Design sgRNA guides for CRISPR-Cas9. Predict on/off-target scores.',
    params:[ps('target_seq','Target sequence',''), ps('pam','PAM sequence','NGG'), psel('cas_type','Cas type',['Cas9','Cas12a','Cas13'],'Cas9'), pn('guide_length','Guide length',20,17,25), ps('output_var','Output guides','guides'), ...BYPASS],
    inputs:[cIn('seq')], outputs:[cOut('guides')],
    toSq: p=>`let ${p.output_var} = crispr_design("${p.target_seq}", pam="${p.pam}")`,
  },
  {
    id:'seq_align', label:'Sequence Alignment', cat:'biology', color:'#16A34A', icon:'≡≡',
    info:'Needleman-Wunsch (global), Smith-Waterman (local), MUSCLE/MAFFT (multiple).',
    params:[ps('seq_a','Sequence A',''), ps('seq_b','Sequence B / file',''), psel('method','Method',['Needleman-Wunsch','Smith-Waterman','MUSCLE','MAFFT'],'Smith-Waterman'), ps('output_var','Output','alignment'), ...BYPASS],
    inputs:[cIn('a'), cIn('b')], outputs:[cOut('alignment')],
    toSq: p=>`let ${p.output_var} = seq_align(${p.seq_a}, ${p.seq_b})`,
  },
  {
    id:'phylogenetics', label:'Phylogenetics', cat:'biology', color:'#16A34A', icon:'🌳',
    info:'Build phylogenetic tree from multiple aligned sequences.',
    params:[ps('alignment_var','Alignment','alignment'), psel('method','Method',['Neighbor-Joining','UPGMA','Maximum-Likelihood','Bayesian'],'Maximum-Likelihood'), ps('output_var','Output tree','tree'), ...BYPASS],
    inputs:[aIn('alignment')], outputs:[cOut('tree')],
    toSq: p=>`let ${p.output_var} = phylogenetics(${p.alignment_var})`,
  },
  {
    id:'proteomics_block', label:'Proteomics', cat:'biology', color:'#16A34A', icon:'MS/MS',
    info:'Mass spec peptide identification and quantification.',
    params:[ps('spectra_file','Spectra file','spectra.mzML'), psel('method','Method',['database_search','de_novo','DIA'],'database_search'), ps('protein_db','Protein DB','UniProt'), ps('output_var','Output','protein_quant'), ...BYPASS],
    inputs:[], outputs:[cOut('protein_quant')],
    toSq: p=>`let ${p.output_var} = proteomics("${p.spectra_file}")`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 23. MEDICAL IMAGING
  // ═══════════════════════════════════════════════════════════════════════
  {
    id:'dicom_load', label:'DICOM Loader', cat:'medical', color:'#0891B2', icon:'📷',
    info:'Load DICOM medical images (CT, MRI, PET, X-ray).',
    params:[ps('file_path','DICOM path','scan.dcm'), psel('modality','Modality',['CT','MRI','PET','X-ray','Ultrasound'],'CT'), pb('anonymize','Anonymize on load',true), ps('output_var','Output','scan'), ...BYPASS],
    inputs:[], outputs:[aOut('scan')],
    toSq: p=>`let ${p.output_var} = dicom_load("${p.file_path}")`,
  },
  {
    id:'img_segment', label:'Image Segmentation', cat:'medical', color:'#0891B2', icon:'✂📷',
    info:'Organ and lesion segmentation. TotalSegmentator, nnU-Net, or SAM.',
    params:[ps('scan_var','Scan variable','scan'), psel('method','Method',['TotalSegmentator','nnU-Net','SAM','threshold'],'TotalSegmentator'), pj('targets','Targets','["liver","lung","kidney"]'), ps('output_var','Output masks','masks'), ...BYPASS],
    inputs:[aIn('scan')], outputs:[cOut('masks')],
    toSq: p=>`let ${p.output_var} = segment(${p.scan_var})`,
  },
  {
    id:'radio_classify', label:'Radiology AI', cat:'medical', color:'#0891B2', icon:'🩺',
    info:'Classify pathologies: pneumonia, nodules, fractures, tumours.',
    params:[ps('scan_var','Scan variable','scan'), psel('model','Model',['CheXNet','MAIDA','custom'],'CheXNet'), ps('output_var','Output diagnosis','diagnosis'), ...BYPASS],
    inputs:[aIn('scan')], outputs:[cOut('diagnosis'), cOut('heatmap')],
    toSq: p=>`let ${p.output_var} = radiology_classify(${p.scan_var})`,
  },
  {
    id:'ehr_load', label:'EHR Loader', cat:'medical', color:'#0891B2', icon:'📋',
    info:'Load Electronic Health Records (FHIR, HL7, CSV, OMOP).',
    params:[ps('file_path','EHR file path','patient.fhir.json'), psel('format','Format',['FHIR','HL7','CSV','OMOP'],'FHIR'), pb('anonymize','Anonymize',true), ps('output_var','Output','patient_data'), ...BYPASS],
    inputs:[], outputs:[aOut('patient_data')],
    toSq: p=>`let ${p.output_var} = ehr_load("${p.file_path}")`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 24. PHYSICS
  // ═══════════════════════════════════════════════════════════════════════
  {
    id:'hamiltonian_block', label:'Hamiltonian', cat:'physics', color:'#4338CA', icon:'H',
    info:'Define quantum Hamiltonian as Pauli string: Σᵢ hᵢ·Pᵢ. Used in VQE and QAOA.',
    params:[ps('pauli_string','Pauli string','0.5*Z0*Z1 + 0.3*X0'), psel('format','Format',['pauli_string','matrix','openfermion'],'pauli_string'), pb('compute_ground_state','Compute ground state (exact)',false), ps('output_var','Output hamiltonian','H'), ...BYPASS],
    inputs:[], outputs:[aOut('hamiltonian')],
    toSq: p=>`let ${p.output_var} = hamiltonian("${p.pauli_string}")`,
  },
  {
    id:'ising_model', label:'Ising Model', cat:'physics', color:'#4338CA', icon:'↑↓',
    info:'Quantum Ising model: H = -J Σ ZᵢZᵢ₊₁ - h Σ Xᵢ. Phase transition at h/J=1.',
    params:[pn('n_spins','Spins',6,2,30), pn('J_coupling','J coupling',1.0,0,10), pn('h_field','Transverse field h',0.5,0,10), psel('method','Method',['VQE','exact_diag','DMRG'],'VQE'), ps('output_var','Output','ising_result'), ...BYPASS],
    inputs:[], outputs:[cOut('energy'), cOut('magnetization')],
    toSq: p=>`let ${p.output_var} = ising(n=${p.n_spins}, J=${p.J_coupling}, h=${p.h_field})`,
  },
  {
    id:'monte_carlo', label:'Monte Carlo', cat:'physics', color:'#4338CA', icon:'🎲',
    info:'Statistical sampling: Metropolis-Hastings for partition functions and observables.',
    params:[pn('n_samples','Samples',10000,100,1e8), pn('n_burnin','Burn-in',1000,0,100000), pn('temperature','Temperature kT',1.0,0,1000), psel('algorithm','Algorithm',['Metropolis','Wolff','Wang-Landau'],'Metropolis'), ps('output_var','Output','mc_result'), ...BYPASS],
    inputs:[aIn('hamiltonian')], outputs:[cOut('observable')],
    toSq: p=>`let ${p.output_var} = monte_carlo(H, n=${p.n_samples}, T=${p.temperature})`,
  },
  {
    id:'molecular_dynamics', label:'Molecular Dynamics', cat:'physics', color:'#4338CA', icon:'💥',
    info:'Classical MD simulation with AMBER, GROMACS, or OpenMM force fields.',
    params:[ps('system_var','System variable','molecule'), psel('force_field','Force field',['AMBER','CHARMM','OPLS','GROMOS'],'AMBER'), pn('n_steps','Steps',100000,1000,1e9), pn('timestep_fs','Timestep (fs)',2,0.5,4), pn('temperature_K','Temperature (K)',300,0,10000), ps('output_var','Output trajectory','traj'), ...BYPASS],
    inputs:[aIn('system')], outputs:[cOut('trajectory')],
    toSq: p=>`let ${p.output_var} = molecular_dynamics(${p.system_var}, steps=${p.n_steps})`,
  },
  {
    id:'quantum_field', label:'Quantum Field Theory', cat:'physics', color:'#4338CA', icon:'Φ',
    info:'Lattice QFT simulation: scalar φ⁴ theory, lattice gauge theory.',
    params:[psel('model','Model',['phi4','lattice_QED','lattice_QCD','Schwinger'],'phi4'), pj('lattice_size','Lattice size','[8,8]'), pn('mass','Mass m²',1.0,-10,100), pn('coupling','Coupling λ',0.5,0,100), ps('output_var','Output','qft_result'), ...BYPASS],
    inputs:[], outputs:[cOut('result')],
    toSq: p=>`let ${p.output_var} = quantum_field("${p.model}")`,
  },
  {
    id:'condensed_matter', label:'Condensed Matter', cat:'physics', color:'#4338CA', icon:'⚡',
    info:'Hubbard model, Heisenberg chain, topological phases, band structure.',
    params:[psel('model','Model',['Hubbard','Heisenberg','SSH','Kitaev_chain'],'Heisenberg'), pn('n_sites','Lattice sites',8,2,100), pn('n_particles','Particles',4,1,50), ps('output_var','Output','cm_result'), ...BYPASS],
    inputs:[], outputs:[cOut('result')],
    toSq: p=>`let ${p.output_var} = condensed_matter("${p.model}", n=${p.n_sites})`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 25. MATERIALS SCIENCE
  // ═══════════════════════════════════════════════════════════════════════
  {
    id:'crystal_structure', label:'Crystal Structure', cat:'materials', color:'#78716C', icon:'⟡',
    info:'Load or create crystalline structures from CIF files or space group + Wyckoff positions.',
    params:[ps('cif_file','CIF file path','structure.cif'), ps('formula','Chemical formula','Fe2O3'), pn('a_angstrom','a (Å)',5.0,0.1,100), pn('b_angstrom','b (Å)',5.0,0.1,100), pn('c_angstrom','c (Å)',5.0,0.1,100), ps('output_var','Output crystal','crystal'), ...BYPASS],
    inputs:[], outputs:[aOut('crystal')],
    toSq: p=>`let ${p.output_var} = crystal("${p.formula}", cif="${p.cif_file}")`,
  },
  {
    id:'band_structure', label:'Band Structure', cat:'materials', color:'#78716C', icon:'⎓',
    info:'Electronic band structure from DFT. Identify direct/indirect gap, effective masses.',
    params:[ps('crystal_var','Crystal variable','crystal'), psel('dft_code','DFT code',['VASP','QuantumESPRESSO','FHI-aims','GPAW'],'QuantumESPRESSO'), pj('k_path','k-path','["Γ","X","M","Γ"]'), ps('output_var','Output','bands'), ...BYPASS],
    inputs:[aIn('crystal')], outputs:[cOut('bands')],
    toSq: p=>`let ${p.output_var} = band_structure(${p.crystal_var})`,
  },
  {
    id:'phonon_block', label:'Phonon Calculation', cat:'materials', color:'#78716C', icon:'〜',
    info:'Phonon dispersion and density of states from finite difference or DFPT.',
    params:[ps('crystal_var','Crystal','crystal'), psel('method','Method',['finite_diff','DFPT'],'finite_diff'), ps('output_var','Output','phonons'), ...BYPASS],
    inputs:[aIn('crystal')], outputs:[cOut('phonons')],
    toSq: p=>`let ${p.output_var} = phonon(${p.crystal_var})`,
  },
  {
    id:'battery_sim', label:'Battery Material Sim', cat:'materials', color:'#78716C', icon:'🔋',
    info:'Li-ion insertion voltage profile, migration barriers, capacity.',
    params:[ps('cathode_material','Cathode','LiFePO4'), ps('anode_material','Anode','graphite'), psel('method','Method',['NEB','MD','AIMD'],'NEB'), ps('output_var','Output','battery_props'), ...BYPASS],
    inputs:[], outputs:[cOut('voltage_profile'), cOut('capacity')],
    toSq: p=>`let ${p.output_var} = battery_sim("${p.cathode_material}")`,
  },
  {
    id:'superconductor_block', label:'Superconductor', cat:'materials', color:'#78716C', icon:'🌡',
    info:'BCS gap equation, Tc estimation, pair correlation from DFT+phonon coupling.',
    params:[ps('material_var','Material','crystal'), psel('method','Method',['BCS','McMillan','EPW'],'McMillan'), ps('output_var','Output','sc_props'), ...BYPASS],
    inputs:[aIn('crystal')], outputs:[cOut('Tc'), cOut('gap')],
    toSq: p=>`let ${p.output_var} = superconductor(${p.material_var})`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 26. ASTROPHYSICS
  // ═══════════════════════════════════════════════════════════════════════
  {
    id:'nbody_sim', label:'N-Body Simulation', cat:'astro', color:'#475569', icon:'🌌',
    info:'Gravitational N-body simulation using leapfrog or Barnes-Hut tree algorithm.',
    params:[pn('n_bodies','Bodies',100,2,100000), pn('timestep','Time step (yr)',0.01,1e-6,1000), pn('n_steps','Steps',10000,10,1e9), psel('algorithm','Algorithm',['direct','Barnes-Hut','FMM'],'Barnes-Hut'), ps('output_var','Output trajectory','traj'), ...BYPASS],
    inputs:[], outputs:[cOut('trajectory')],
    toSq: p=>`let ${p.output_var} = nbody(n=${p.n_bodies}, steps=${p.n_steps})`,
  },
  {
    id:'stellar_evolution', label:'Stellar Evolution', cat:'astro', color:'#475569', icon:'⭐',
    info:'MESA-like stellar evolution tracks: main sequence, red giant, white dwarf.',
    params:[pn('mass_solar','Mass (M☉)',1.0,0.1,200), pn('metallicity','Metallicity [Fe/H]',0,-3,1), psel('network','Nuclear network',['basic','pp_cno','full'],'pp_cno'), ps('output_var','Output tracks','stellar_track'), ...BYPASS],
    inputs:[], outputs:[cOut('hr_diagram'), cOut('age_sequence')],
    toSq: p=>`let ${p.output_var} = stellar_evolution(mass=${p.mass_solar})`,
  },
  {
    id:'grav_wave', label:'Gravitational Waves', cat:'astro', color:'#475569', icon:'〜〜',
    info:'GW signal from CBC. LALSuite/PyCBC match filtering and parameter estimation.',
    params:[pn('m1_solar','Mass 1 (M☉)',30,1,1000), pn('m2_solar','Mass 2 (M☉)',30,1,1000), pn('luminosity_dist_mpc','Distance (Mpc)',500,1,20000), ps('output_var','Output waveform','waveform'), ...BYPASS],
    inputs:[], outputs:[cOut('waveform'), cOut('snr')],
    toSq: p=>`let ${p.output_var} = grav_wave(m1=${p.m1_solar}, m2=${p.m2_solar})`,
  },
  {
    id:'cosmology_block', label:'Cosmology', cat:'astro', color:'#475569', icon:'🔭',
    info:'ΛCDM power spectrum, correlation functions, CMB temperature anisotropies.',
    params:[pn('H0','H₀ (km/s/Mpc)',67.4,50,100), pn('omega_m','Ωm',0.315,0,1), pn('omega_lambda','ΩΛ',0.685,0,1), psel('quantity','Compute',['power_spectrum','correlation_fn','CMB_Cl','luminosity_dist'],'power_spectrum'), ps('output_var','Output','cosmo_result'), ...BYPASS],
    inputs:[], outputs:[cOut('result')],
    toSq: p=>`let ${p.output_var} = cosmology(H0=${p.H0}, omega_m=${p.omega_m})`,
  },
  {
    id:'exoplanet_block', label:'Exoplanet Transit', cat:'astro', color:'#475569', icon:'🪐',
    info:'Simulate or fit transit light curves for exoplanet detection.',
    params:[pn('planet_radius_rearth','Planet radius (R⊕)',1.0,0.1,20), pn('orbital_period_days','Period (days)',365,0.5,1000), pn('star_radius_rsun','Star radius (R☉)',1.0,0.1,100), ps('output_var','Output','transit'), ...BYPASS],
    inputs:[], outputs:[cOut('light_curve')],
    toSq: p=>`let ${p.output_var} = exoplanet_transit(Rp=${p.planet_radius_rearth}, P=${p.orbital_period_days})`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 27. MACHINE LEARNING
  // ═══════════════════════════════════════════════════════════════════════
  {
    id:'train_model', label:'Train Model', cat:'ml', color:'#65A30D', icon:'🤖',
    info:'Train classical ML: RF, GBT, SVM, logistic regression, k-NN, XGBoost.',
    params:[ps('X_train','Training features','X_train'), ps('y_train','Labels','y_train'), psel('model_type','Model type',['RandomForest','GradientBoosting','SVM','LogisticRegression','kNN','XGBoost'],'RandomForest'), pj('hyperparams','Hyperparameters','{"n_estimators":100}'), pb('cross_validate','Cross-validate (5-fold)',true), ps('output_model','Model variable','model'), ...BYPASS],
    inputs:[aIn('X'), aIn('y')], outputs:[aOut('model'), cOut('metrics')],
    toSq: p=>`let ${p.output_model} = train(${p.X_train}, ${p.y_train}, model="${p.model_type}")`,
  },
  {
    id:'neural_net', label:'Neural Network', cat:'ml', color:'#65A30D', icon:'🧠',
    info:'Deep learning with configurable layers. PyTorch/JAX backend.',
    params:[pj('layers','Layer config','[{"type":"Linear","in":128,"out":64},{"type":"ReLU"},{"type":"Linear","in":64,"out":1}]'), psel('loss','Loss',['MSE','CrossEntropy','BCE','MAE'],'CrossEntropy'), psel('optimizer','Optimizer',['Adam','SGD','AdamW','RMSprop'],'Adam'), pn('epochs','Epochs',100,1,10000), pn('lr','Learning rate',1e-3,1e-6,1), pn('batch_size','Batch size',32,1,10000), ps('output_model','Model variable','nn_model'), ...BYPASS],
    inputs:[aIn('X'), aIn('y')], outputs:[aOut('model'), cOut('metrics')],
    toSq: p=>`let ${p.output_model} = neural_net(X_train, y_train, epochs=${p.epochs})`,
  },
  {
    id:'predict_block', label:'Predict', cat:'ml', color:'#65A30D', icon:'→y',
    info:'Apply trained model to new data.',
    params:[ps('model_var','Model variable','model'), ps('X_var','Input features','X_test'), pb('return_proba','Return probabilities',false), ps('output_var','Output predictions','y_pred'), ...BYPASS],
    inputs:[aIn('model'), aIn('X')], outputs:[cOut('predictions')],
    toSq: p=>`let ${p.output_var} = predict(${p.model_var}, ${p.X_var})`,
  },
  {
    id:'clustering_block', label:'Clustering', cat:'ml', color:'#65A30D', icon:'●●',
    info:'K-means, DBSCAN, hierarchical, Gaussian mixture models.',
    params:[ps('X_var','Data','X'), psel('method','Algorithm',['k-means','DBSCAN','hierarchical','GMM'],'k-means'), pn('n_clusters','Clusters',5,2,100), ps('output_var','Output labels','labels'), ...BYPASS],
    inputs:[aIn('X')], outputs:[cOut('labels'), cOut('centroids')],
    toSq: p=>`let ${p.output_var} = cluster(${p.X_var}, n=${p.n_clusters}, method="${p.method}")`,
  },
  {
    id:'dimensionality_red', label:'Dimensionality Reduction', cat:'ml', color:'#65A30D', icon:'⟶2D',
    info:'PCA, t-SNE, UMAP, autoencoder for visualisation and feature compression.',
    params:[ps('X_var','Input data','X'), psel('method','Method',['PCA','t-SNE','UMAP','ICA','NMF'],'UMAP'), pn('n_components','Target dimensions',2,1,100), ps('output_var','Output embedding','X_reduced'), ...BYPASS],
    inputs:[aIn('X')], outputs:[cOut('embedding')],
    toSq: p=>`let ${p.output_var} = reduce_dim(${p.X_var}, n=${p.n_components}, method="${p.method}")`,
  },
  {
    id:'feature_eng', label:'Feature Engineering', cat:'ml', color:'#65A30D', icon:'⚙📊',
    info:'Normalise, one-hot encode, impute missing values, polynomial features.',
    params:[ps('X_var','Input data','X'), pj('steps','Pipeline steps','[{"type":"StandardScaler"},{"type":"OneHotEncoder"}]'), ps('output_var','Output features','X_feat'), ...BYPASS],
    inputs:[aIn('X')], outputs:[aOut('features')],
    toSq: p=>`let ${p.output_var} = feature_pipeline(${p.X_var})`,
  },
  {
    id:'model_eval', label:'Model Evaluation', cat:'ml', color:'#65A30D', icon:'📈',
    info:'Accuracy, precision, recall, F1, ROC-AUC, RMSE, confusion matrix.',
    params:[ps('model_var','Model','model'), ps('X_test_var','Test features','X_test'), ps('y_test_var','Test labels','y_test'), pj('metrics','Metrics','["accuracy","f1","roc_auc"]'), ps('output_var','Output metrics','eval_metrics'), ...BYPASS],
    inputs:[aIn('model'), aIn('X'), aIn('y')], outputs:[cOut('metrics')],
    toSq: p=>`let ${p.output_var} = evaluate(${p.model_var}, ${p.X_test_var}, ${p.y_test_var})`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 28. GenAI & LLMs
  // ═══════════════════════════════════════════════════════════════════════
  {
    id:'openai_block', label:'OpenAI', cat:'genai', color:'#9333EA', icon:'GPT',
    info:'GPT-4o, GPT-4 turbo, o1, o3. Tool calling, streaming, vision, JSON mode.',
    params:[psel('model','Model',['gpt-4o','gpt-4o-mini','gpt-4-turbo','o1-preview','o3-mini'],'gpt-4o'), ps('api_key_var','API key var','OPENAI_API_KEY'), ps('system_prompt','System prompt','You are a helpful assistant.'), ps('user_prompt','User prompt',''), pn('temperature','Temperature',0.7,0,2), pn('max_tokens','Max tokens',1000,1,128000), pb('stream','Stream',false), pb('json_mode','JSON mode',false), pb('track_cost','Track cost',true), ps('output_var','Output variable','gpt_response'), ...BYPASS],
    inputs:[cIn('prompt')], outputs:[cOut('response'), cOut('usage')],
    toSq: p=>`let ${p.output_var} = openai(model="${p.model}", prompt="${p.user_prompt}", max_tokens=${p.max_tokens})`,
  },
  {
    id:'anthropic_block', label:'Anthropic Claude', cat:'genai', color:'#9333EA', icon:'Claude',
    info:'Claude Sonnet/Opus/Haiku. Extended thinking, vision, tool use.',
    params:[psel('model','Model',['claude-sonnet-4-6','claude-opus-4-6','claude-haiku-4-5-20251001','claude-3-5-sonnet-20241022'],'claude-sonnet-4-6'), ps('api_key_var','API key var','ANTHROPIC_API_KEY'), ps('system_prompt','System prompt','You are a helpful assistant.'), ps('user_prompt','User prompt',''), pn('max_tokens','Max tokens',1024,1,200000), pn('temperature','Temperature',0.7,0,1), pb('extended_thinking','Extended thinking',false), pn('thinking_budget','Thinking budget tokens',10000,1000,100000), pb('stream','Stream',false), pb('track_cost','Track cost',true), ps('output_var','Output variable','claude_response'), ...BYPASS],
    inputs:[cIn('prompt')], outputs:[cOut('response'), cOut('usage')],
    toSq: p=>`let ${p.output_var} = anthropic(model="${p.model}", prompt="${p.user_prompt}", max_tokens=${p.max_tokens})`,
  },
  {
    id:'gemini_block', label:'Google Gemini', cat:'genai', color:'#9333EA', icon:'Gemini',
    info:'Gemini 2.5 Flash/Pro. Multimodal: text, image, video, audio, code.',
    params:[psel('model','Model',['gemini-2.5-flash','gemini-2.5-pro','gemini-1.5-pro','gemini-1.5-flash'],'gemini-2.5-flash'), ps('api_key_var','API key var','GEMINI_API_KEY'), ps('prompt','Prompt',''), pn('temperature','Temperature',0.7,0,2), pn('max_tokens','Max tokens',8192,1,1000000), pb('multimodal','Multimodal (image/video)',false), ps('output_var','Output variable','gemini_response'), ...BYPASS],
    inputs:[cIn('prompt'), aIn('media','Media (optional)')], outputs:[cOut('response'), cOut('usage')],
    toSq: p=>`let ${p.output_var} = gemini(model="${p.model}", prompt="${p.prompt}")`,
  },
  {
    id:'ollama_block', label:'Ollama (Local)', cat:'genai', color:'#9333EA', icon:'🦙',
    info:'Local inference. No API key. Llama3, Mistral, CodeLlama, Phi, Gemma, DeepSeek.',
    params:[psel('model','Model',['llama3.3','mistral','codellama','phi4','gemma3','deepseek-r1','qwen2.5'],'llama3.3'), ps('host','Ollama host','http://localhost:11434'), ps('prompt','Prompt',''), pn('temperature','Temperature',0.7,0,2), pn('max_tokens','Max tokens',2048,1,128000), pb('stream','Stream',false), ps('output_var','Output variable','ollama_response'), ...BYPASS],
    inputs:[cIn('prompt')], outputs:[cOut('response')],
    toSq: p=>`let ${p.output_var} = ollama(model="${p.model}", prompt="${p.prompt}")`,
  },
  {
    id:'mcp_server', label:'MCP Server', cat:'genai', color:'#9333EA', icon:'MCP',
    info:'Model Context Protocol connector. Exposes tools from any MCP-compatible service to LLMs.',
    params:[ps('server_url','Server URL','https://mcp.example.com/sse'), ps('server_name','Server name','my_mcp'), psel('transport','Transport',['SSE','stdio','websocket'],'SSE'), ps('output_var','Output server ref','mcp_server'), ...BYPASS],
    inputs:[], outputs:[aOut('server_ref')],
    toSq: p=>`let ${p.output_var} = mcp_connect("${p.server_url}")`,
  },
  {
    id:'mcp_tool_call', label:'MCP Tool Call', cat:'genai', color:'#9333EA', icon:'MCP🔧',
    info:'Invoke a specific tool exposed by an MCP server.',
    params:[ps('server_var','MCP server variable','mcp_server'), ps('tool_name','Tool name','search'), pj('tool_params','Tool parameters','{}'), ps('output_var','Output variable','tool_result'), ...BYPASS],
    inputs:[aIn('server')], outputs:[cOut('result')],
    toSq: p=>`let ${p.output_var} = mcp_call(${p.server_var}, "${p.tool_name}", ${p.tool_params})`,
  },
  {
    id:'llm_router', label:'LLM Router', cat:'genai', color:'#9333EA', icon:'⇒LLM',
    info:'Auto-selects cheapest/fastest provider matching quality requirements. Falls back on error.',
    params:[ps('prompt','Prompt',''), psel('strategy','Strategy',['cheapest','fastest','best_quality','balanced'],'balanced'), psel('fallback','Fallback',['ollama','gemini-2.5-flash'],'ollama'), pn('max_cost_cents','Max cost per call (¢)',5,0,1000), ps('output_var','Output variable','routed_response'), ...BYPASS],
    inputs:[cIn('prompt')], outputs:[cOut('response'), cOut('provider_used')],
    toSq: p=>`let ${p.output_var} = llm_router("${p.prompt}", strategy="${p.strategy}")`,
  },
  {
    id:'embeddings_block', label:'Embeddings', cat:'genai', color:'#9333EA', icon:'[v]',
    info:'Dense vector embeddings: OpenAI text-embedding-3, Cohere, local sentence-transformers.',
    params:[ps('text_var','Input text/list','text'), psel('model','Model',['text-embedding-3-large','text-embedding-3-small','all-MiniLM-L6','mxbai-embed-large'],'text-embedding-3-small'), ps('output_var','Output embeddings','embeddings'), ...BYPASS],
    inputs:[cIn('text')], outputs:[cOut('embeddings')],
    toSq: p=>`let ${p.output_var} = embed(${p.text_var}, model="${p.model}")`,
  },
  {
    id:'rag_block', label:'RAG Pipeline', cat:'genai', color:'#9333EA', icon:'📚',
    info:'Retrieval-Augmented Generation: embed docs, vector search, augmented LLM call.',
    params:[ps('documents_var','Documents variable','docs'), ps('query','Query',''), psel('vector_store','Vector store',['chromadb','faiss','pinecone','qdrant'],'chromadb'), pn('top_k','Top-K',5,1,100), psel('llm_model','LLM model',['gpt-4o','claude-sonnet-4-6','gemini-2.5-flash'],'gpt-4o'), ps('output_var','Output answer','rag_answer'), ...BYPASS],
    inputs:[aIn('docs'), cIn('query')], outputs:[cOut('answer'), cOut('context_used')],
    toSq: p=>`let ${p.output_var} = rag(${p.documents_var}, "${p.query}", top_k=${p.top_k})`,
  },
  {
    id:'agent_block', label:'LLM Agent', cat:'genai', color:'#9333EA', icon:'🤖',
    info:'Autonomous ReAct / tool-use agent. Loops: reason → act → observe until done.',
    params:[ps('system_prompt','System prompt','You are a helpful agent.'), ps('user_goal','User goal',''), pj('tools','Available tools','["web_search","calculator","code_exec"]'), psel('llm_model','LLM',['gpt-4o','claude-sonnet-4-6'],'claude-sonnet-4-6'), pn('max_steps','Max steps',10,1,100), ps('output_var','Output result','agent_result'), ...BYPASS],
    inputs:[cIn('goal')], outputs:[cOut('result'), cOut('trace')],
    toSq: p=>`let ${p.output_var} = agent("${p.user_goal}", model="${p.llm_model}", max_steps=${p.max_steps})`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 29. FILE SOURCES
  // ═══════════════════════════════════════════════════════════════════════
  {
    id:'csv_reader', label:'CSV Reader', cat:'file_src', color:'#0EA5E9', icon:'📄',
    info:'Read CSV/TSV. Auto-detect types, handle missing values.',
    params:[ps('file_path','File path','data.csv'), ps('separator','Separator',','), pb('header','Has header',true), pb('auto_types','Auto-detect types',true), ps('encoding','Encoding','utf-8'), ps('output_var','Output variable','df'), ...BYPASS],
    inputs:[], outputs:[cOut('dataframe')],
    toSq: p=>`let ${p.output_var} = csv_read("${p.file_path}")`,
  },
  {
    id:'json_reader', label:'JSON Reader', cat:'file_src', color:'#0EA5E9', icon:'📋',
    info:'Read JSON / JSONL files.',
    params:[ps('file_path','File path','data.json'), pb('jsonl_mode','JSONL mode',false), ps('output_var','Output variable','data'), ...BYPASS],
    inputs:[], outputs:[aOut('data')],
    toSq: p=>`let ${p.output_var} = json_read("${p.file_path}")`,
  },
  {
    id:'parquet_reader', label:'Parquet Reader', cat:'file_src', color:'#0EA5E9', icon:'📦',
    info:'Read columnar Parquet files. Efficient for large datasets.',
    params:[ps('file_path','File path','data.parquet'), ps('columns','Columns (blank=all)',''), ps('output_var','Output variable','df'), ...BYPASS],
    inputs:[], outputs:[cOut('dataframe')],
    toSq: p=>`let ${p.output_var} = parquet_read("${p.file_path}")`,
  },
  {
    id:'excel_reader', label:'Excel Reader', cat:'file_src', color:'#0EA5E9', icon:'📊',
    info:'Read .xlsx / .xls files.',
    params:[ps('file_path','File path','data.xlsx'), ps('sheet_name','Sheet','Sheet1'), pb('header','Has header',true), ps('output_var','Output','df'), ...BYPASS],
    inputs:[], outputs:[cOut('dataframe')],
    toSq: p=>`let ${p.output_var} = excel_read("${p.file_path}", sheet="${p.sheet_name}")`,
  },
  {
    id:'hdf5_reader', label:'HDF5 Reader', cat:'file_src', color:'#0EA5E9', icon:'🗄',
    info:'Read HDF5 data files. Used by MD outputs, DICOM, NumPy.',
    params:[ps('file_path','File path','data.h5'), ps('dataset_path','Dataset path','/data'), ps('output_var','Output','data'), ...BYPASS],
    inputs:[], outputs:[aOut('data')],
    toSq: p=>`let ${p.output_var} = hdf5_read("${p.file_path}", path="${p.dataset_path}")`,
  },
  {
    id:'pdb_reader', label:'PDB Reader', cat:'file_src', color:'#0EA5E9', icon:'🧬',
    info:'Load Protein Data Bank structure files.',
    params:[ps('file_path','PDB file or ID','protein.pdb'), pb('fetch_from_rcsb','Fetch from RCSB by ID',false), ps('output_var','Output','protein'), ...BYPASS],
    inputs:[], outputs:[aOut('structure')],
    toSq: p=>`let ${p.output_var} = pdb_load("${p.file_path}")`,
  },
  {
    id:'file_watcher', label:'File Watcher', cat:'file_src', color:'#0EA5E9', icon:'👁',
    info:'Watch file/directory for changes and trigger downstream on new data.',
    params:[ps('watch_path','Watch path','./data/'), psel('event','Trigger on',['created','modified','deleted','any'],'created'), pn('debounce_ms','Debounce (ms)',500,0,10000), ps('output_var','Output filepath','new_file'), ...BYPASS],
    inputs:[], outputs:[cOut('filepath')],
    toSq: p=>`# file_watcher("${p.watch_path}")`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 30. DATABASES
  // ═══════════════════════════════════════════════════════════════════════
  {
    id:'db_connect', label:'DB Connect', cat:'database', color:'#1D4ED8', icon:'🔌DB',
    info:'Connect to PostgreSQL, MySQL, SQLite, MongoDB, Redis, DynamoDB, Snowflake, BigQuery.',
    params:[psel('db_type','Database type',['PostgreSQL','MySQL','SQLite','MongoDB','Redis','DynamoDB','Snowflake','BigQuery'],'PostgreSQL'), ps('host','Host','localhost'), pn('port','Port',5432,0,65535), ps('database','Database name','mydb'), ps('username_var','Username env var','DB_USER'), ps('password_var','Password env var','DB_PASS'), ps('output_var','Connection variable','db'), ...BYPASS],
    inputs:[], outputs:[aOut('connection')],
    toSq: p=>`let ${p.output_var} = db_connect("${p.db_type}", host="${p.host}")`,
  },
  {
    id:'sql_query', label:'SQL Query', cat:'database', color:'#1D4ED8', icon:'SQL',
    info:'Execute SQL on PostgreSQL, MySQL, SQLite, SQL Server.',
    params:[ps('connection_var','Connection variable','db'), ps('query','SQL query','SELECT * FROM table LIMIT 100'), pj('params','Parameters (array)','[]'), ps('output_var','Output variable','rows'), pb('return_as_dataframe','Return as DataFrame',true), ...BYPASS],
    inputs:[aIn('db')], outputs:[cOut('result')],
    toSq: p=>`let ${p.output_var} = sql_query(${p.connection_var}, "${p.query}")`,
  },
  {
    id:'nosql_query', label:'NoSQL Query', cat:'database', color:'#1D4ED8', icon:'🗄',
    info:'MongoDB find/aggregate, Redis get/set, DynamoDB scan/query.',
    params:[ps('connection_var','Connection variable','db'), ps('collection','Collection / key','users'), pj('filter','Filter','{}'), ps('output_var','Output variable','results'), ...BYPASS],
    inputs:[aIn('db')], outputs:[cOut('results')],
    toSq: p=>`let ${p.output_var} = nosql_query(${p.connection_var}, "${p.collection}")`,
  },
  {
    id:'vector_db', label:'Vector DB', cat:'database', color:'#1D4ED8', icon:'[v]DB',
    info:'Upsert and query embeddings in ChromaDB, Pinecone, Qdrant, Weaviate.',
    params:[psel('db_type','Vector DB',['ChromaDB','Pinecone','Qdrant','Weaviate','pgvector'],'ChromaDB'), ps('collection','Collection name','embeddings'), psel('operation','Operation',['upsert','query','delete','get'],'query'), pn('top_k','Top-K',10,1,1000), ps('output_var','Output results','vector_results'), ...BYPASS],
    inputs:[cIn('vector')], outputs:[cOut('results')],
    toSq: p=>`let ${p.output_var} = vector_db_query("${p.collection}", vector, k=${p.top_k})`,
  },
  {
    id:'db_write', label:'DB Write', cat:'database', color:'#1D4ED8', icon:'✍DB',
    info:'INSERT / UPDATE / UPSERT rows.',
    params:[ps('connection_var','Connection','db'), ps('table','Table name','results'), ps('data_var','Data variable','row_data'), psel('mode','Write mode',['insert','update','upsert','append'],'insert'), ps('primary_key','Primary key','id'), ...BYPASS],
    inputs:[aIn('db'), aIn('data')], outputs:[cOut('n_rows','Rows written')],
    toSq: p=>`db_write(${p.connection_var}, "${p.table}", ${p.data_var}, mode="${p.mode}")`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 31. CLOUD STORAGE
  // ═══════════════════════════════════════════════════════════════════════
  {
    id:'s3_block', label:'AWS S3', cat:'cloud', color:'#0369A1', icon:'S3',
    info:'Read, write, list AWS S3 objects. Streaming for large files.',
    params:[ps('bucket','Bucket name','my-bucket'), ps('key','Object key','data/file.csv'), psel('operation','Operation',['get','put','delete','list','presign'],'get'), ps('aws_region','AWS Region','us-east-1'), ps('output_var','Output','s3_data'), ...BYPASS],
    inputs:[aIn('data')], outputs:[cOut('result')],
    toSq: p=>`let ${p.output_var} = s3_${p.operation}("${p.bucket}", "${p.key}")`,
  },
  {
    id:'gcs_block', label:'Google Cloud Storage', cat:'cloud', color:'#0369A1', icon:'GCS',
    info:'Read, write GCS objects.',
    params:[ps('bucket','Bucket','my-bucket'), ps('blob','Blob path','data/file.csv'), psel('operation','Operation',['download','upload','delete','list'],'download'), ps('output_var','Output','gcs_data'), ...BYPASS],
    inputs:[aIn('data')], outputs:[cOut('result')],
    toSq: p=>`let ${p.output_var} = gcs_${p.operation}("${p.bucket}", "${p.blob}")`,
  },
  {
    id:'azure_blob', label:'Azure Blob Storage', cat:'cloud', color:'#0369A1', icon:'AZB',
    info:'Read, write Azure Blob Storage.',
    params:[ps('container','Container','my-container'), ps('blob_name','Blob name','file.csv'), psel('operation','Operation',['download','upload','delete','list'],'download'), ps('output_var','Output','azure_data'), ...BYPASS],
    inputs:[aIn('data')], outputs:[cOut('result')],
    toSq: p=>`let ${p.output_var} = azure_blob_${p.operation}("${p.container}", "${p.blob_name}")`,
  },
  {
    id:'hdfs_block', label:'HDFS', cat:'cloud', color:'#0369A1', icon:'HDFS',
    info:'Hadoop Distributed File System read/write for big data workflows.',
    params:[ps('path','HDFS path','/user/data/'), psel('operation','Operation',['read','write','list','delete'],'read'), ps('namenode','Namenode','hdfs://namenode:9000'), ps('output_var','Output','hdfs_data'), ...BYPASS],
    inputs:[aIn('data')], outputs:[cOut('result')],
    toSq: p=>`let ${p.output_var} = hdfs_${p.operation}("${p.path}")`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 32. API CONNECTORS
  // ═══════════════════════════════════════════════════════════════════════
  {
    id:'http_get', label:'HTTP GET', cat:'api', color:'#0284C7', icon:'GET',
    info:'HTTP GET with headers, query params, timeout, retry.',
    params:[ps('url','URL','https://api.example.com/data'), pj('headers','Headers','{}'), pj('params','Query params','{}'), pn('timeout_ms','Timeout (ms)',30000,100,300000), pn('retries','Retries',3,0,10), ps('output_var','Output variable','response'), ...BYPASS],
    inputs:[], outputs:[cOut('response'), cOut('status_code')],
    toSq: p=>`let ${p.output_var} = http_get("${p.url}")`,
  },
  {
    id:'http_post', label:'HTTP POST', cat:'api', color:'#0284C7', icon:'POST',
    info:'HTTP POST with JSON or form body.',
    params:[ps('url','URL','https://api.example.com/submit'), pj('headers','Headers','{"Content-Type":"application/json"}'), ps('body_var','Body variable','payload'), psel('body_type','Body type',['json','form','multipart'],'json'), pn('timeout_ms','Timeout (ms)',30000,100,300000), ps('output_var','Output variable','response'), ...BYPASS],
    inputs:[aIn('body')], outputs:[cOut('response'), cOut('status_code')],
    toSq: p=>`let ${p.output_var} = http_post("${p.url}", ${p.body_var})`,
  },
  {
    id:'graphql_block', label:'GraphQL', cat:'api', color:'#0284C7', icon:'GQL',
    info:'Execute GraphQL queries and mutations.',
    params:[ps('endpoint','GraphQL endpoint','https://api.example.com/graphql'), pc('query','GraphQL query','query { user { id name } }'), pj('variables','Variables','{}'), ps('output_var','Output','gql_result'), ...BYPASS],
    inputs:[], outputs:[cOut('result')],
    toSq: p=>`let ${p.output_var} = graphql("${p.endpoint}", \`${p.query}\`)`,
  },
  {
    id:'webhook_block', label:'Webhook Sender', cat:'api', color:'#0284C7', icon:'🔔',
    info:'POST to webhook URL (Slack, Discord, Teams, custom).',
    params:[ps('webhook_url','Webhook URL',''), ps('payload_var','Payload variable','message'), psel('platform','Platform',['generic','Slack','Discord','Teams'],'Slack'), ...BYPASS],
    inputs:[aIn('payload')], outputs:[cOut('status')],
    toSq: p=>`webhook_post("${p.webhook_url}", ${p.payload_var})`,
  },
  {
    id:'kafka_block', label:'Apache Kafka', cat:'api', color:'#0284C7', icon:'⟳📨',
    info:'Produce and consume Kafka messages.',
    params:[ps('broker','Broker','localhost:9092'), ps('topic','Topic','sanskrit-events'), psel('operation','Operation',['produce','consume'],'produce'), ps('message_var','Message variable','msg'), ps('output_var','Output','kafka_msg'), ...BYPASS],
    inputs:[aIn('message')], outputs:[cOut('result')],
    toSq: p=>`let ${p.output_var} = kafka_${p.operation}("${p.topic}", ${p.message_var})`,
  },
  {
    id:'email_block', label:'Email (SMTP)', cat:'api', color:'#0284C7', icon:'📧',
    info:'Send email via SMTP. Supports HTML body, attachments.',
    params:[ps('to','To address',''), ps('subject','Subject',''), ps('body_var','Body variable','email_body'), pb('html','HTML body',true), ps('smtp_host_var','SMTP host env var','SMTP_HOST'), ...BYPASS],
    inputs:[aIn('body')], outputs:[cOut('sent')],
    toSq: p=>`send_email("${p.to}", "${p.subject}", ${p.body_var})`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 33. DATA TRANSFORM
  // ═══════════════════════════════════════════════════════════════════════
  {
    id:'filter_block', label:'Filter', cat:'transform', color:'#D97706', icon:'▽',
    info:'Filter rows or elements matching a condition.',
    params:[ps('data_var','Data variable','data'), ps('condition','Filter condition','x > 0'), ps('output_var','Output variable','filtered'), ...BYPASS],
    inputs:[aIn()], outputs:[cOut('filtered')],
    toSq: p=>`let ${p.output_var} = filter(${p.data_var}, lambda x: ${p.condition})`,
  },
  {
    id:'map_transform', label:'Map / Apply', cat:'transform', color:'#D97706', icon:'↦',
    info:'Apply function to each element.',
    params:[ps('data_var','Data variable','data'), ps('transform_expr','Transform','x * 2'), ps('output_var','Output variable','mapped'), ...BYPASS],
    inputs:[aIn()], outputs:[cOut('result')],
    toSq: p=>`let ${p.output_var} = list(map(lambda x: ${p.transform_expr}, ${p.data_var}))`,
  },
  {
    id:'sort_block', label:'Sort', cat:'transform', color:'#D97706', icon:'↕',
    info:'Sort by key ascending or descending.',
    params:[ps('data_var','Data variable','data'), ps('key_expr','Sort key','x'), pb('descending','Descending',false), ps('output_var','Output','sorted_data'), ...BYPASS],
    inputs:[aIn()], outputs:[cOut('sorted')],
    toSq: p=>`let ${p.output_var} = sorted(${p.data_var})`,
  },
  {
    id:'groupby_block', label:'Group By', cat:'transform', color:'#D97706', icon:'⊞',
    info:'Group items by key, aggregate per group.',
    params:[ps('data_var','Data variable','data'), ps('key_fn','Group-by key','x["category"]'), psel('agg','Aggregation',['list','sum','mean','count','first','max','min'],'list'), ps('output_var','Output','grouped'), ...BYPASS],
    inputs:[aIn()], outputs:[cOut('grouped')],
    toSq: p=>`let ${p.output_var} = groupby(${p.data_var}, lambda x: ${p.key_fn})`,
  },
  {
    id:'join_block', label:'Join / Merge', cat:'transform', color:'#D97706', icon:'⋈',
    info:'Join two datasets on a common key. Inner, left, right, outer joins.',
    params:[ps('left_var','Left dataset','left'), ps('right_var','Right dataset','right'), ps('left_key','Left key','id'), ps('right_key','Right key','id'), psel('join_type','Join type',['inner','left','right','outer'],'inner'), ps('output_var','Output','merged'), ...BYPASS],
    inputs:[aIn('left'), aIn('right')], outputs:[cOut('merged')],
    toSq: p=>`let ${p.output_var} = join(${p.left_var}, ${p.right_var}, on="${p.left_key}")`,
  },
  {
    id:'pivot_block', label:'Pivot Table', cat:'transform', color:'#D97706', icon:'⧖',
    info:'Reshape data from long to wide format.',
    params:[ps('data_var','Data variable','data'), ps('index','Row index','date'), ps('columns','Column field','category'), ps('values','Values field','amount'), psel('aggfunc','Aggregation',['sum','mean','count','max','min'],'sum'), ps('output_var','Output','pivot'), ...BYPASS],
    inputs:[aIn()], outputs:[cOut('pivot')],
    toSq: p=>`let ${p.output_var} = pivot(${p.data_var}, index="${p.index}")`,
  },
  {
    id:'schema_validate', label:'Schema Validation', cat:'transform', color:'#D97706', icon:'✓',
    info:'Validate data against JSON Schema or Pydantic model.',
    params:[ps('data_var','Data variable','data'), pj('schema','JSON Schema','{"type":"object"}'), pb('strict','Strict mode',true), ps('output_var','Valid rows variable','valid_data'), ps('errors_var','Errors variable','validation_errors'), ...BYPASS],
    inputs:[aIn()], outputs:[cOut('valid'), cOut('errors')],
    toSq: p=>`let ${p.output_var} = schema_validate(${p.data_var})`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 34. OUTPUT & DISPLAY
  // ═══════════════════════════════════════════════════════════════════════
  {
    id:'plot_block', label:'Plot / Chart', cat:'output', color:'#F59E0B', icon:'📈',
    info:'Plotly, Matplotlib, Bokeh: line, bar, scatter, histogram, heatmap, 3D.',
    params:[ps('x_var','X data variable','x'), ps('y_var','Y data variable','y'), psel('chart_type','Chart type',['line','scatter','bar','histogram','heatmap','box','violin','3d_scatter','contour'],'line'), ps('title','Title',''), ps('x_label','X label',''), ps('y_label','Y label',''), psel('backend','Backend',['plotly','matplotlib','bokeh'],'plotly'), pb('interactive','Interactive',true), ps('output_var','Output figure','fig'), ...BYPASS],
    inputs:[cIn('x'), cIn('y')], outputs:[aOut('figure')],
    toSq: p=>`let ${p.output_var} = plot(${p.x_var}, ${p.y_var}, type="${p.chart_type}", title="${p.title}")`,
  },
  {
    id:'print_block', label:'Print', cat:'output', color:'#F59E0B', icon:'📤',
    info:'Print value to logs panel.',
    params:[ps('value_var','Value to print','result'), ps('label','Label prefix',''), psel('format','Format',['auto','json','table','csv'],'auto'), ...BYPASS],
    inputs:[aIn('value')], outputs:[],
    toSq: p=>`print(${p.label?`"${p.label}:", `:''}${p.value_var})`,
  },
  {
    id:'save_file', label:'Save File', cat:'output', color:'#F59E0B', icon:'💾',
    info:'Save variable to CSV, JSON, Parquet, HDF5, or pickle.',
    params:[ps('data_var','Data variable','result'), ps('file_path','Output file path','output.csv'), psel('format','Format',['csv','json','parquet','hdf5','pickle','txt'],'csv'), pb('overwrite','Overwrite existing',true), ...BYPASS],
    inputs:[aIn('data')], outputs:[cOut('filepath')],
    toSq: p=>`save("${p.file_path}", ${p.data_var})`,
  },
  {
    id:'table_block', label:'Table View', cat:'output', color:'#F59E0B', icon:'⊞',
    info:'Display tabular data in the output panel with sorting, filtering, pagination.',
    params:[ps('data_var','Data variable','data'), pn('max_rows','Max rows',100,10,10000), pb('sortable','Sortable',true), pb('filterable','Filterable',true), ...BYPASS],
    inputs:[aIn('data')], outputs:[],
    toSq: p=>`table_view(${p.data_var})`,
  },
  {
    id:'circuit_diagram', label:'Circuit Diagram', cat:'output', color:'#F59E0B', icon:'⚛📊',
    info:'Export quantum circuit diagram as SVG, PDF, ASCII, or QASM.',
    params:[ps('register_var','Register variable','q'), psel('format','Format',['svg','pdf','ascii','qasm'],'svg'), pb('show_params','Show gate params',true), ps('output_var','Output filepath','circuit.svg'), ...BYPASS],
    inputs:[rIn()], outputs:[cOut('diagram')],
    toSq: p=>`let ${p.output_var} = circuit_diagram(${p.register_var}, format="${p.format}")`,
  },
  {
    id:'vqe_dashboard', label:'VQE Dashboard', cat:'output', color:'#F59E0B', icon:'📊VQE',
    info:'Live convergence plot: energy vs iteration, gradient norm, parameter trajectories.',
    params:[ps('vqe_result_var','VQE result variable','vqe_result'), pb('live_update','Live update',true), pb('show_params','Show parameter trajectories',true), ...BYPASS],
    inputs:[aIn('vqe_result')], outputs:[],
    toSq: p=>`vqe_dashboard(${p.vqe_result_var})`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 35. EXECUTION CONTROL
  // ═══════════════════════════════════════════════════════════════════════
  {
    id:'parallel_exec', label:'Parallel Execute', cat:'exec_ctrl', color:'#6B7280', icon:'⇉',
    info:'Execute blocks in parallel using worker threads or async.',
    params:[psel('backend','Backend',['threads','async','processes'],'async'), pn('max_workers','Max workers',4,1,64), pb('wait_all','Wait for all',true), ps('output_var','Results variable','par_results'), ...BYPASS],
    inputs:[aIn('tasks')], outputs:[cOut('results')],
    toSq: p=>`let ${p.output_var} = parallel_exec(tasks, workers=${p.max_workers})`,
  },
  {
    id:'rate_limiter', label:'Rate Limiter', cat:'exec_ctrl', color:'#6B7280', icon:'⏲',
    info:'Throttle API calls. Sliding window or token bucket.',
    params:[pn('calls_per_second','Calls per second',5,0.1,1000), psel('algorithm','Algorithm',['sliding_window','token_bucket','leaky_bucket'],'token_bucket'), pn('burst_limit','Burst limit',10,1,1000), ...BYPASS],
    inputs:[aIn()], outputs:[aOut()],
    toSq: p=>`# rate_limiter(${p.calls_per_second}/s)`,
  },
  {
    id:'retry_block', label:'Retry', cat:'exec_ctrl', color:'#6B7280', icon:'↺',
    info:'Retry on failure with exponential backoff.',
    params:[pn('max_retries','Max retries',3,0,20), pn('base_delay_ms','Base delay (ms)',1000,0,60000), pn('backoff_factor','Backoff multiplier',2,1,10), pj('retry_on','Retry on exceptions','["TimeoutError","ConnectionError"]'), ...BYPASS],
    inputs:[aIn('task')], outputs:[aOut('result')],
    toSq: p=>`# retry(max_retries=${p.max_retries}, backoff=${p.backoff_factor}x)`,
  },
  {
    id:'checkpoint_block', label:'Checkpoint', cat:'exec_ctrl', color:'#6B7280', icon:'💾⚡',
    info:'Save execution state so runs can be resumed after interruption.',
    params:[ps('checkpoint_id','Checkpoint ID','run_001'), ps('data_var','Data to checkpoint','state'), psel('storage','Storage',['file','redis','s3'],'file'), ...BYPASS],
    inputs:[aIn('state')], outputs:[aOut('state')],
    toSq: p=>`checkpoint("${p.checkpoint_id}", ${p.data_var})`,
  },
  {
    id:'scheduler_block', label:'Scheduler', cat:'exec_ctrl', color:'#6B7280', icon:'⏰',
    info:'Trigger execution on cron schedule or interval.',
    params:[ps('cron_expr','Cron expression','0 * * * *'), psel('tz','Timezone',['UTC','Asia/Kolkata','America/New_York','Europe/London'],'UTC'), pb('run_on_start','Run immediately on start',false), ...BYPASS],
    inputs:[aIn('task')], outputs:[aOut()],
    toSq: p=>`# schedule("${p.cron_expr}")`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 36. LOGGING & DEBUG
  // ═══════════════════════════════════════════════════════════════════════
  {
    id:'logger_block', label:'Logger', cat:'logging', color:'#EAB308', icon:'📝',
    info:'Structured logging with levels and JSON output.',
    params:[ps('message','Message',''), ps('level','Log level','INFO'), psel('format','Format',['text','json','structured'],'text'), pb('include_timestamp','Include timestamp',true), ...BYPASS],
    inputs:[cIn('value')], outputs:[],
    toSq: p=>`log("${p.level}", "${p.message}")`,
  },
  {
    id:'metric_block', label:'Metric', cat:'logging', color:'#EAB308', icon:'📊',
    info:'Record numeric metric: gauge, counter, histogram. Prometheus, DataDog, CloudWatch.',
    params:[ps('metric_name','Metric name','iteration_energy'), psel('metric_type','Type',['gauge','counter','histogram'],'gauge'), ps('value_var','Value variable','energy'), pj('labels','Labels','{"experiment":"vqe"}'), psel('backend','Backend',['console','prometheus','datadog','cloudwatch'],'console'), ...BYPASS],
    inputs:[cIn('value')], outputs:[],
    toSq: p=>`metric("${p.metric_name}", ${p.value_var})`,
  },
  {
    id:'profiler_block', label:'Profiler', cat:'logging', color:'#EAB308', icon:'⏱',
    info:'Time the enclosed block. Report to logs panel.',
    params:[ps('label','Profiler label','vqe_step'), pb('memory_profile','Memory profile too',false), ps('output_var','Elapsed ms variable','elapsed_ms'), ...BYPASS],
    inputs:[aIn()], outputs:[cOut('elapsed_ms')],
    toSq: p=>`# profiler: ${p.label}`,
  },
  {
    id:'assert_block', label:'Assert', cat:'logging', color:'#EAB308', icon:'✓',
    info:'Assert a condition. Throws descriptive error on failure.',
    params:[ps('condition','Condition','energy < 0'), ps('message','Failure message','Energy must be negative'), pb('warn_only','Warn only (no throw)',false), ...BYPASS],
    inputs:[cIn()], outputs:[],
    toSq: p=>`assert ${p.condition}, "${p.message}"`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 37. SECURITY & AUTH
  // ═══════════════════════════════════════════════════════════════════════
  {
    id:'jwt_block', label:'JWT', cat:'security', color:'#DC2626', icon:'JWT',
    info:'Sign and verify JSON Web Tokens (RS256, HS256, ES256).',
    params:[psel('operation','Operation',['sign','verify','decode'],'sign'), ps('payload_var','Payload variable','claims'), ps('secret_var','Secret env var','JWT_SECRET'), psel('algorithm','Algorithm',['HS256','RS256','ES256'],'HS256'), pn('expiry_seconds','Expiry (seconds)',3600,1,86400), ps('output_var','Output token','jwt_token'), ...BYPASS],
    inputs:[aIn('payload')], outputs:[cOut('token')],
    toSq: p=>`let ${p.output_var} = jwt_${p.operation}(${p.payload_var}, "${p.secret_var}")`,
  },
  {
    id:'encrypt_block', label:'Encrypt / Decrypt', cat:'security', color:'#DC2626', icon:'🔐',
    info:'Symmetric encryption: AES-256-GCM, ChaCha20-Poly1305.',
    params:[psel('operation','Operation',['encrypt','decrypt'],'encrypt'), ps('data_var','Data variable','plaintext'), ps('key_var','Key env var','ENCRYPTION_KEY'), psel('algorithm','Algorithm',['AES-256-GCM','ChaCha20-Poly1305'],'AES-256-GCM'), ps('output_var','Output','encrypted'), ...BYPASS],
    inputs:[cIn('data')], outputs:[cOut('result')],
    toSq: p=>`let ${p.output_var} = ${p.operation}(${p.data_var}, key=secret("${p.key_var}"))`,
  },
  {
    id:'oauth2_block', label:'OAuth2', cat:'security', color:'#DC2626', icon:'🔑',
    info:'OAuth2 client credentials and auth code flows.',
    params:[ps('client_id_var','Client ID env var','OAUTH_CLIENT_ID'), ps('client_secret_var','Secret env var','OAUTH_CLIENT_SECRET'), ps('token_url','Token URL',''), psel('grant_type','Grant type',['client_credentials','authorization_code','refresh_token'],'client_credentials'), ps('scopes','Scopes','openid profile'), ps('output_var','Output token','oauth_token'), ...BYPASS],
    inputs:[], outputs:[cOut('access_token')],
    toSq: p=>`let ${p.output_var} = oauth2(grant="${p.grant_type}")`,
  },
  {
    id:'api_key_auth', label:'API Key Auth', cat:'security', color:'#DC2626', icon:'🗝',
    info:'Validate incoming API key against stored hash.',
    params:[ps('header_name','Header name','X-API-Key'), ps('key_env_var','Expected key env var','API_KEY'), pb('hash_compare','Compare hashed',true), ps('output_var','Is valid variable','is_valid'), ...BYPASS],
    inputs:[cIn('request')], outputs:[cOut('is_valid'), cOut('user_info')],
    toSq: p=>`let ${p.output_var} = api_key_validate(request, "${p.header_name}")`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 38. HARDWARE EXPORT
  // ═══════════════════════════════════════════════════════════════════════
  {
    id:'qasm_export', label:'OpenQASM Export', cat:'hardware', color:'#7C3AED', icon:'QASM',
    info:'Export circuit to OpenQASM 2.0 or 3.0 for IBM Quantum / Qiskit.',
    params:[ps('register_var','Register variable','q'), psel('version','QASM version',['2.0','3.0'],'3.0'), pb('optimise','Optimise gates',true), pb('include_barriers','Include barriers',false), ps('output_file','Output file','circuit.qasm'), ...BYPASS],
    inputs:[rIn()], outputs:[cOut('qasm_string')],
    toSq: p=>`export_qasm(${p.register_var}, version="${p.version}", file="${p.output_file}")`,
  },
  {
    id:'cirq_export', label:'Cirq Export', cat:'hardware', color:'#7C3AED', icon:'CIRQ',
    info:'Export to Google Cirq circuit for Sycamore processor.',
    params:[ps('register_var','Register variable','q'), ps('device','Target device','sycamore'), ps('output_var','Output circuit','cirq_circuit'), ...BYPASS],
    inputs:[rIn()], outputs:[cOut('circuit')],
    toSq: p=>`let ${p.output_var} = export_cirq(${p.register_var})`,
  },
  {
    id:'ibm_runtime', label:'IBM Runtime Submit', cat:'hardware', color:'#7C3AED', icon:'IBM',
    info:'Submit circuit to IBM Quantum via Qiskit Runtime primitives.',
    params:[ps('circuit_var','Circuit variable','q'), ps('ibm_token_var','Token env var','IBM_TOKEN'), ps('backend','Backend','ibm_brisbane'), psel('primitive','Primitive',['Sampler','Estimator'],'Sampler'), pn('shots','Shots',4096,1,100000), ps('job_id_var','Job ID variable','job_id'), ...BYPASS],
    inputs:[rIn()], outputs:[cOut('job_id'), cOut('results')],
    toSq: p=>`let ${p.job_id_var} = ibm_submit(${p.circuit_var}, backend="${p.backend}", shots=${p.shots})`,
  },
  {
    id:'braket_submit', label:'AWS Braket Submit', cat:'hardware', color:'#7C3AED', icon:'BKT',
    info:'Submit to AWS Braket: IonQ, Rigetti, OQC, IQM, or local simulator.',
    params:[ps('circuit_var','Circuit variable','q'), psel('device','Device',['IonQ Harmony','Rigetti Aspen-M','local_sim'],'local_sim'), pn('shots','Shots',1000,1,100000), ps('s3_bucket','S3 results bucket','braket-results'), ps('job_id_var','Job ID variable','braket_job'), ...BYPASS],
    inputs:[rIn()], outputs:[cOut('job_id'), cOut('results')],
    toSq: p=>`let ${p.braket_job} = braket_submit(${p.circuit_var}, device="${p.device}")`,
  },
  {
    id:'quil_export', label:'Quil Export', cat:'hardware', color:'#7C3AED', icon:'QUIL',
    info:'Export to Quil format for Rigetti quantum processors.',
    params:[ps('register_var','Register variable','q'), ps('output_file','Output file','circuit.quil'), ...BYPASS],
    inputs:[rIn()], outputs:[cOut('quil_string')],
    toSq: p=>`export_quil(${p.register_var}, file="${p.output_file}")`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 39. UTILITIES
  // ═══════════════════════════════════════════════════════════════════════
  {
    id:'timer_block', label:'Timer', cat:'utility', color:'#94A3B8', icon:'⏱',
    info:'Start and read elapsed time. Returns milliseconds.',
    params:[psel('operation','Operation',['start','stop','elapsed','reset'],'start'), ps('timer_id','Timer ID','t1'), ps('output_var','Output (elapsed ms)','elapsed'), ...BYPASS],
    inputs:[], outputs:[cOut('elapsed_ms')],
    toSq: p=>`let ${p.output_var} = timer_${p.operation}("${p.timer_id}")`,
  },
  {
    id:'uuid_block', label:'UUID Generator', cat:'utility', color:'#94A3B8', icon:'ID',
    info:'Generate UUID v4 or quantum-random ID.',
    params:[psel('type','UUID type',['v4','v7','quantum'],'v4'), ps('output_var','Output variable','new_id'), ...BYPASS],
    inputs:[], outputs:[cOut('id')],
    toSq: p=>`let ${p.output_var} = uuid()`,
  },
  {
    id:'sleep_block', label:'Sleep / Wait', cat:'utility', color:'#94A3B8', icon:'😴',
    info:'Pause execution for specified duration.',
    params:[pn('duration_ms','Duration (ms)',1000,0,3600000), ...BYPASS],
    inputs:[], outputs:[],
    toSq: p=>`sleep(${p.duration_ms})`,
  },
  {
    id:'config_load', label:'Config Loader', cat:'utility', color:'#94A3B8', icon:'⚙',
    info:'Load configuration from YAML, TOML, JSON, .env.',
    params:[ps('config_file','Config file','config.yaml'), psel('format','Format',['yaml','toml','json','env','cli'],'yaml'), pj('defaults','Defaults','{}'), ps('output_var','Output config','config'), ...BYPASS],
    inputs:[], outputs:[aOut('config')],
    toSq: p=>`let ${p.output_var} = load_config("${p.config_file}")`,
  },
  {
    id:'note_block', label:'Note / Comment', cat:'utility', color:'#94A3B8', icon:'💬',
    info:'Documentation block. Generates a comment in .sq export. Never executed.',
    params:[ps('title','Title','Note'), pc('content','Content',''), psel('style','Style',['comment','section_header','todo','warning'],'comment'), ...BYPASS],
    inputs:[], outputs:[],
    toSq: p=>`\n# ── ${p.title} ${'─'.repeat(40)}\n# ${(p.content||'').split('\n').join('\n# ')}`,
  },
  {
    id:'type_cast', label:'Type Cast', cat:'utility', color:'#94A3B8', icon:'⇒T',
    info:'Cast variable to int, float, str, bool, list, dict.',
    params:[ps('input_var','Input variable','x'), psel('to_type','Target type',['int','float','str','bool','list','dict'],'float'), ps('output_var','Output variable','y'), ...BYPASS],
    inputs:[cIn()], outputs:[cOut('result')],
    toSq: p=>`let ${p.output_var} = ${p.to_type}(${p.input_var})`,
  },
  {
    id:'debug_break', label:'Debug Breakpoint', cat:'utility', color:'#94A3B8', icon:'🔴',
    info:'Pause execution and dump state for inspection.',
    params:[ps('label','Breakpoint label','bp1'), pb('dump_all_vars','Dump all vars',true), pb('dump_quantum_state','Dump quantum state',true), ...BYPASS],
    inputs:[aIn()], outputs:[aOut()],
    toSq: p=>`debug!("${p.label}")`,
  },
  {
    id:'version_block', label:'Sanskrit Version', cat:'utility', color:'#94A3B8', icon:'vX',
    info:'Emit Sanskrit engine version, shard config, and feature flags.',
    params:[pb('log_to_panel','Log to panel',true), ps('output_var','Output var','version'), ...BYPASS],
    inputs:[], outputs:[cOut('version')],
    toSq: p=>`let ${p.output_var} = sanskrit_version()`,
  },

]; // ← CLOSE of BLOCKS array

// ── Registry access helpers ────────────────────────────────────────────────
/** Get all blocks for a given category. Used by palette panel. */
export const blocksByCategory = (cat) => BLOCKS.filter(b => b.cat === cat);

/** Find a block by its unique ID. Used by canvas to hydrate a dropped node. */
export const blockById = (id) => BLOCKS.find(b => b.id === id) || null;

/** Search blocks by label, info, or category. Used by palette search input. */
export const searchBlocks = (query) => {
  const q = query.toLowerCase();
  return BLOCKS.filter(b =>
    b.label.toLowerCase().includes(q) ||
    b.info.toLowerCase().includes(q)  ||
    b.cat.toLowerCase().includes(q)
  );
};

// ── Merge extra block files ───────────────────────────────────────────────
import { EXTRA_BLOCKS, EXTRA_CATEGORIES } from "./registry_extra.js";
import { EXTRA_BLOCKS_B } from "./registry_extra_b.js";

Object.assign(CATEGORIES, EXTRA_CATEGORIES);
BLOCKS.push(...EXTRA_BLOCKS, ...EXTRA_BLOCKS_B);

// Log block count at import time (visible in server console)
console.log(`[registry] Loaded ${BLOCKS.length} blocks across ${Object.keys(CATEGORIES).length} categories`);
