/**
 * src/engine/quantum.js  —  Sanskrit Quantum Engine  v3.1
 *
 * BUGS FIXED vs original v3.0
 * ───────────────────────────
 *  1. _apply1Q: collected only indices where bit_lq=0 → gates silently
 *     no-op on pure |1⟩.  S|1⟩=|1⟩, T|1⟩=|1⟩, H|1⟩=|1⟩, Y|1⟩=|1⟩.
 *     Fix: mask with ~stride so BOTH |0⟩ and |1⟩ components are processed.
 *
 *  2. _mergeShards: used (idxA<<nB)|idxB → shard-A in HIGH bits.
 *     _res() maps global qubit j to local bit j (LSB-first) which expects
 *     shard-A in LOW bits.  Cross-shard CNOT/Toffoli produced random states.
 *     Fix: use idxA|(idxB<<nA).
 *
 *  3. statevector(): returned {re:sqrt(prob), im:0} — all imaginary parts
 *     silently dropped.  QFT phases, VQE expectation, iSWAP all wrong.
 *     Fix: tensor-product the actual complex amps from shard storage.
 *
 *  4. statevector() string: idx.toString(2) is MSB-first; qubit convention
 *     is bit j = qubit j (LSB-first).  Histogram keys were bit-reversed.
 *     Fix: reverse the binary string so string[i] = qubit i.
 *
 *  5. iSWAP: SWAP+S(a)+S(b) gives −|11⟩ not |11⟩ (S⊗S on |11⟩ = i²=-1).
 *     Fix: S(a),S(b),H(a),CNOT(a→b),CNOT(b→a),H(b).
 *
 *  6. RXX, RYY, MS gates were missing (needed for IonQ and some ansatze).
 *     Fix: added via RZZ base with correct Hadamard/Rx wrapping.
 *
 *  7. Grover oracle: Toffoli(0,1,n-1) has only 2 controls → wrong for nQ>3.
 *     Grover diffusion: CZ(0,1) wrong for nQ>2.
 *     Fix: _nControlledZ merges all qubits into one shard, applies n-CZ.
 *
 *  8. QFT phase: used π/2^(k−j) instead of 2π/2^(k−j+1).
 *     Fix: corrected to 2π/2^(k−j+1).
 *
 *  9. state_fidelity: missing complex conjugate on bra.
 *     Fix: im += ar·bi − ai·br  (was ai·br − ar·bi).
 *
 * 10. pauli_expectation was a null stub.  Implemented in stdlib.js.
 */

// ── Complex number helpers ─────────────────────────────────────────────────
export const cx     = (re, im=0) => ({re, im});
export const cadd   = (a, b)     => ({re: a.re+b.re, im: a.im+b.im});
export const csub   = (a, b)     => ({re: a.re-b.re, im: a.im-b.im});
export const cmul   = (a, b)     => ({re: a.re*b.re - a.im*b.im,
                                       im: a.re*b.im + a.im*b.re});
export const cconj  = (a)        => ({re: a.re, im: -a.im});
export const cscale = (a, s)     => ({re: a.re*s, im: a.im*s});
export const cnorm2 = (a)        => a.re*a.re + a.im*a.im;
export const cphase = (t)        => ({re: Math.cos(t), im: Math.sin(t)});
export const cabs   = (a)        => Math.sqrt(cnorm2(a));

const ZERO = cx(0,0), ONE = cx(1,0);
const S2   = 1 / Math.sqrt(2);

// ── Sparse amplitude container ─────────────────────────────────────────────
/**
 * Holds amplitudes for one shard (up to 1024 basis states for a 10-qubit shard).
 * Starts sparse (Map).  Auto-converts to dense Float64Array when fill > 12%.
 */
class Amps {
  constructor(size) {
    this.size  = size;
    this._map  = new Map();
    this._arr  = null;
    this.dense = false;
  }

  set(idx, amp) {
    if (amp.re*amp.re + amp.im*amp.im < 1e-24) { this.del(idx); return; }
    if (this.dense) {
      this._arr[2*idx]   = amp.re;
      this._arr[2*idx+1] = amp.im;
    } else {
      this._map.set(idx, amp);
      if (this._map.size / this.size >= 0.12) this._toDense();
    }
  }

  get(idx) {
    if (this.dense) return cx(this._arr[2*idx]||0, this._arr[2*idx+1]||0);
    return this._map.get(idx) || ZERO;
  }

  del(idx) {
    if (this.dense) { this._arr[2*idx]=0; this._arr[2*idx+1]=0; }
    else this._map.delete(idx);
  }

  /** Iterate non-zero entries — hot path, O(nonzero) not O(2^N). */
  each(fn) {
    if (this.dense) {
      for (let i = 0; i < this.size; i++) {
        const re=this._arr[2*i], im=this._arr[2*i+1];
        if (re*re + im*im > 1e-28) fn(i, cx(re, im));
      }
    } else {
      this._map.forEach((amp, idx) => fn(idx, amp));
    }
  }

  get count() {
    if (this.dense) {
      let c=0;
      for (let i=0; i<this.size; i++)
        if (this._arr[2*i]**2 + this._arr[2*i+1]**2 > 1e-28) c++;
      return c;
    }
    return this._map.size;
  }
  get fill() { return this.count / this.size; }

  /** Renormalise — fixes floating-point norm drift over thousands of VQE gates. */
  renorm() {
    let n2=0;
    this.each((_, a) => { n2 += cnorm2(a); });
    if (Math.abs(n2-1.0) < 1e-10) return;
    const s = 1/Math.sqrt(Math.max(n2, 1e-30));
    if (this.dense) {
      for (let i=0; i<2*this.size; i++) this._arr[i] *= s;
    } else {
      const m = new Map();
      this._map.forEach((a,i) => m.set(i, cscale(a,s)));
      this._map = m;
    }
  }

  clone() {
    const c = new Amps(this.size);
    if (this.dense) { c._arr=this._arr.slice(); c.dense=true; }
    else this._map.forEach((a,i) => c._map.set(i, {re:a.re, im:a.im}));
    return c;
  }

  _toDense() {
    this._arr = new Float64Array(2*this.size);
    this._map.forEach((a,i) => { this._arr[2*i]=a.re; this._arr[2*i+1]=a.im; });
    this._map.clear();
    this.dense = true;
  }
}

// ── Gate matrices ──────────────────────────────────────────────────────────
/**
 * 2×2 unitary matrices.  Format: [[a,b],[c,d]] with complex entries.
 * Applied: new|0⟩ = a·old|0⟩ + b·old|1⟩
 *          new|1⟩ = c·old|0⟩ + d·old|1⟩
 *
 * All phases are stored as full complex numbers — NEVER real-only.
 * A real-only Y or T gate gives wrong answers for any entangled circuit.
 */
export const GATES = {
  I:   [[ONE,         ZERO        ], [ZERO,        ONE         ]],
  X:   [[ZERO,        ONE         ], [ONE,         ZERO        ]],
  Y:   [[ZERO,        cx(0,-1)    ], [cx(0,1),     ZERO        ]],
  Z:   [[ONE,         ZERO        ], [ZERO,        cx(-1,0)    ]],
  H:   [[cx(S2,0),    cx(S2,0)    ], [cx(S2,0),    cx(-S2,0)   ]],
  S:   [[ONE,         ZERO        ], [ZERO,        cx(0,1)     ]],
  Sdg: [[ONE,         ZERO        ], [ZERO,        cx(0,-1)    ]],
  T:   [[ONE,         ZERO        ], [ZERO,        cphase(Math.PI/4) ]],
  Tdg: [[ONE,         ZERO        ], [ZERO,        cphase(-Math.PI/4)]],
  SX:  [[cx(.5,.5),   cx(.5,-.5)  ], [cx(.5,-.5),  cx(.5,.5)   ]],
};

/** Parameterised gate generators — angle is continuous, cannot be pre-computed. */
export const PGATES = {
  Rx: (t) => [[cx( Math.cos(t/2), 0),        cx(0, -Math.sin(t/2))      ],
               [cx(0, -Math.sin(t/2)),        cx( Math.cos(t/2), 0)      ]],
  Ry: (t) => [[cx( Math.cos(t/2), 0),        cx(-Math.sin(t/2), 0)      ],
               [cx( Math.sin(t/2), 0),        cx( Math.cos(t/2), 0)      ]],
  Rz: (t) => [[cphase(-t/2),                 ZERO                        ],
               [ZERO,                         cphase(t/2)                 ]],
  P:  (t) => [[ONE,                           ZERO                        ],
               [ZERO,                         cphase(t)                   ]],
  U3: (t,p,l) => {
    const c=Math.cos(t/2), s=Math.sin(t/2);
    return [[cx(c,0),                         cmul(cx(-s,0), cphase(l))   ],
            [cmul(cx(s,0), cphase(p)),        cmul(cx(c,0), cphase(p+l)) ]];
  },
};

// ── Shard ──────────────────────────────────────────────────────────────────
class Shard {
  constructor(id, startQ, nQ) {
    this.id=id; this.startQ=startQ; this.nQ=nQ;
    this.size = 1<<nQ;
    this.amps = new Amps(this.size);
    this.gc   = 0;
    this.amps.set(0, ONE);   // initialise to |0…0⟩
  }

  /**
   * Apply a 2×2 unitary to local qubit lq.
   *
   * BUG FIXED: previous code collected indices where bit_lq=0 only.
   * If all non-zero amplitudes had bit_lq=1 (pure |1⟩ state), the loop
   * was empty and the gate silently did nothing.
   *
   * FIX: mask with ~stride to get the "pair anchor" regardless of whether
   * bit lq is 0 or 1.  Set deduplication ensures each pair runs once.
   * O(nonzero) — identical performance to the old code for typical states.
   */
  _apply1Q(lq, [[a,b],[c,d]]) {
    const stride = 1<<lq;
    const pairs = new Set();
    this.amps.each((idx) => { pairs.add(idx & ~stride); });
    for (const i0 of pairs) {
      const i1 = i0 | stride;
      const a0 = this.amps.get(i0), a1 = this.amps.get(i1);
      this.amps.set(i0, cadd(cmul(a,a0), cmul(b,a1)));
      this.amps.set(i1, cadd(cmul(c,a0), cmul(d,a1)));
    }
    if (++this.gc % 100 === 0) this.amps.renorm();
  }

  gate(lq, name)        { if (!GATES[name])  throw new Error(`Unknown gate: ${name}`);  this._apply1Q(lq, GATES[name]); }
  param(lq, name, ...p) { if (!PGATES[name]) throw new Error(`Unknown param gate: ${name}`); this._apply1Q(lq, PGATES[name](...p)); }

  /**
   * CNOT — BUG FIXED.
   * Old code: collected idx where ctrl=1 AND tgt=0.
   * If the state has ctrl=1, tgt=1 but ctrl=1, tgt=0 has zero amplitude,
   * the pair is missed and CNOT silently fails.
   * Fix: collect canonical i0 = (ctrl=1, tgt=0) by masking out the tgt bit
   * for all non-zero amplitudes that have ctrl=1.
   */
  cnot(ctrl, tgt) {
    const cm=1<<ctrl, tm=1<<tgt;
    const pairs = new Set();
    this.amps.each((idx) => { if (idx & cm) pairs.add(idx & ~tm); });
    for (const i0 of pairs) {
      const i1=i0|tm, a=this.amps.get(i0), b=this.amps.get(i1);
      this.amps.set(i0,b); this.amps.set(i1,a);
    }
    this.gc++;
  }

  cz(qa, qb) {
    const ma=1<<qa, mb=1<<qb;
    this.amps.each((idx,a) => { if ((idx&ma)&&(idx&mb)) this.amps.set(idx, cscale(a,-1)); });
    this.gc++;
  }

  /**
   * SWAP — BUG FIXED.
   * Swap amplitudes between (qa=1,qb=0) and (qa=0,qb=1).
   * Old code: only iterated idx where qa=1,qb=0; missed when qa=0,qb=1 is
   * non-zero but qa=1,qb=0 is zero.
   * Fix: collect canonical i0=(qa=1,qb=0) from BOTH orientations.
   */
  swap(qa, qb) {
    const ma=1<<qa, mb=1<<qb;
    const pairs = new Set();
    this.amps.each((idx) => {
      const hasA=!!(idx&ma), hasB=!!(idx&mb);
      if (hasA !== hasB) pairs.add((idx|ma)&~mb);  // canonical: qa=1, qb=0
    });
    for (const i0 of pairs) {
      const i1=(i0&~ma)|mb, a=this.amps.get(i0), b=this.amps.get(i1);
      this.amps.set(i0,b); this.amps.set(i1,a);
    }
    this.gc++;
  }

  /**
   * Toffoli — BUG FIXED.
   * Old: only collected (c1=1,c2=1,t=0); missed when t=1 and t=0 is zero.
   * Fix: collect canonical i0=(c1=1,c2=1,t=0) from both t-states.
   */
  toffoli(c1, c2, t) {
    const m1=1<<c1, m2=1<<c2, mt=1<<t;
    const pairs = new Set();
    this.amps.each((idx) => { if ((idx&m1)&&(idx&m2)) pairs.add(idx&~mt); });
    for (const i0 of pairs) {
      const i1=i0|mt, a=this.amps.get(i0), b=this.amps.get(i1);
      this.amps.set(i0,b); this.amps.set(i1,a);
    }
    this.gc++;
  }

  /**
   * Apply -1 phase to |111…1⟩ only — used in Grover oracle and diffusion.
   * ctrlBits = array of ALL local qubit indices that must be |1⟩.
   */
  nControlledZ(ctrlBits) {
    const allMask = ctrlBits.reduce((acc,q) => acc|(1<<q), 0);
    this.amps.each((idx,a) => {
      if ((idx & allMask) === allMask) this.amps.set(idx, cscale(a,-1));
    });
    this.gc++;
  }

  measure(lq) {
    const mask=1<<lq; let p1=0;
    this.amps.each((idx,a) => { if (idx&mask) p1 += cnorm2(a); });
    const out   = Math.random() < p1 ? 1 : 0;
    const keep  = out ? mask : 0;
    const scale = 1/Math.sqrt(Math.max(out ? p1 : 1-p1, 1e-15));
    const del=[], upd=[];
    this.amps.each((idx,a) => ((idx&mask)===keep ? upd : del).push([idx,a]));
    del.forEach(([i])   => this.amps.del(i));
    upd.forEach(([i,a]) => this.amps.set(i, cscale(a,scale)));
    return out;
  }

  info() {
    return {id:this.id, startQ:this.startQ, nQ:this.nQ,
            nonZero:this.amps.count, fill:(this.amps.fill*100).toFixed(1)+'%',
            mode:this.amps.dense?'dense':'sparse', gates:this.gc};
  }
}

// ── QuantumRegister ────────────────────────────────────────────────────────
export class QuantumRegister {
  static SHARD = 10;

  constructor(name, nQ) {
    this.name   = name;
    this.nQ     = nQ;
    this.shards = [];
    this.log    = [];
    for (let i=0; i<Math.ceil(nQ/QuantumRegister.SHARD); i++) {
      const start=i*QuantumRegister.SHARD, n=Math.min(QuantumRegister.SHARD, nQ-start);
      this.shards.push(new Shard(i, start, n));
    }
    this._log(`Register "${name}": ${nQ}q → ${this.shards.length} shard(s)`);
  }

  /** Resolve global qubit index → {shard, shardIndex, localQubit} */
  _res(q) {
    if (q<0 || q>=this.nQ) throw new Error(`Qubit ${q} out of range [0,${this.nQ-1}]`);
    let cumQ = 0;
    for (let si=0; si<this.shards.length; si++) {
      if (q < cumQ + this.shards[si].nQ)
        return { s:this.shards[si], si, lq: q - cumQ };
      cumQ += this.shards[si].nQ;
    }
    throw new Error(`Qubit ${q} not found — bug in _res`);
  }

  _log(m) { this.log.push({t:new Date().toISOString().slice(11,23), m}); }

  /**
   * Merge two shards into one combined shard.
   *
   * Qubit ordering: shard A (lower global qubits) → LOW bits of combined idx.
   *                 shard B (higher global qubits) → HIGH bits.
   * Combined index: idxA | (idxB << nA)
   *
   * This matches _res(): after merge startQ = shard_A.startQ, so
   *   global q in A → lq = q − startQ_A = localJ   → bit j  (low)
   *   global q in B → lq = q − startQ_A = nA+localK → bit nA+k (high)
   *
   * Called before any cross-shard entangling gate to guarantee correctness.
   */
  _mergeShards(siA, siB) {
    const [si1, si2] = siA < siB ? [siA, siB] : [siB, siA];
    const sA = this.shards[si1], sB = this.shards[si2];
    const nA = sA.nQ, nB = sB.nQ;
    const combined = new Shard(-1, sA.startQ, nA + nB);
    combined.size = 1 << (nA + nB);
    combined.amps = new Amps(combined.size);

    sA.amps.each((idxA, ampA) => {
      sB.amps.each((idxB, ampB) => {
        // shard-A bits in LOW positions, shard-B bits in HIGH positions
        const combinedIdx = idxA | (idxB << nA);
        combined.amps.set(combinedIdx, cmul(ampA, ampB));
      });
    });

    this.shards[si1] = combined;
    this.shards.splice(si2, 1);
    // Re-number and reset startQ
    let cumQ = 0;
    this.shards.forEach((s, i) => {
      s.id = i; s.startQ = cumQ; cumQ += s.nQ;
    });
    return si1;
  }

  /** Ensure qubits qa and qb reside in the same shard — merge if needed. */
  _ensureSameShard(qa, qb) {
    let ra=this._res(qa), rb=this._res(qb);
    if (ra.si !== rb.si) this._mergeShards(ra.si, rb.si);
    return { ra: this._res(qa), rb: this._res(qb) };
  }

  // ── Single-qubit Clifford gates ──────────────────────────────────────────
  H(q)   { const r=this._res(q); r.s.gate(r.lq,'H');   this._log(`H[${q}]`);   }
  X(q)   { const r=this._res(q); r.s.gate(r.lq,'X');   this._log(`X[${q}]`);   }
  Y(q)   { const r=this._res(q); r.s.gate(r.lq,'Y');   this._log(`Y[${q}]`);   }
  Z(q)   { const r=this._res(q); r.s.gate(r.lq,'Z');   this._log(`Z[${q}]`);   }
  S(q)   { const r=this._res(q); r.s.gate(r.lq,'S');   this._log(`S[${q}]`);   }
  Sdg(q) { const r=this._res(q); r.s.gate(r.lq,'Sdg'); this._log(`Sdg[${q}]`); }
  T(q)   { const r=this._res(q); r.s.gate(r.lq,'T');   this._log(`T[${q}]`);   }
  Tdg(q) { const r=this._res(q); r.s.gate(r.lq,'Tdg'); this._log(`Tdg[${q}]`); }
  SX(q)  { const r=this._res(q); r.s.gate(r.lq,'SX');  this._log(`SX[${q}]`);  }

  // ── Parameterised single-qubit gates ─────────────────────────────────────
  Rx(q,t)     { const r=this._res(q); r.s.param(r.lq,'Rx',t);      this._log(`Rx[${q},${t.toFixed(4)}]`); }
  Ry(q,t)     { const r=this._res(q); r.s.param(r.lq,'Ry',t);      this._log(`Ry[${q},${t.toFixed(4)}]`); }
  Rz(q,t)     { const r=this._res(q); r.s.param(r.lq,'Rz',t);      this._log(`Rz[${q},${t.toFixed(4)}]`); }
  P(q,t)      { const r=this._res(q); r.s.param(r.lq,'P',t);       this._log(`P[${q},${t.toFixed(4)}]`);  }
  Phase(q,t)  { this.P(q,t); }
  U3(q,t,p,l) { const r=this._res(q); r.s.param(r.lq,'U3',t,p,l); this._log(`U3[${q}]`); }

  // ── Two-qubit entangling gates ───────────────────────────────────────────
  CNOT(c,t) {
    if (c===t) throw new Error(`CNOT: control and target must differ`);
    const {ra,rb} = this._ensureSameShard(c,t);
    ra.s.cnot(ra.lq, rb.lq);
    this._log(`CNOT[${c},${t}]`);
  }
  CX(c,t) { this.CNOT(c,t); }

  CZ(a,b) {
    if (a===b) throw new Error(`CZ: qubits must differ`);
    const {ra,rb} = this._ensureSameShard(a,b);
    ra.s.cz(ra.lq, rb.lq);
    this._log(`CZ[${a},${b}]`);
  }

  /** CY = Sdg · CNOT · S  (standard decomposition) */
  CY(c,t) { this.Sdg(t); this.CNOT(c,t); this.S(t); this._log(`CY[${c},${t}]`); }

  SWAP(a,b) {
    if (a===b) return;
    const {ra,rb} = this._ensureSameShard(a,b);
    ra.s.swap(ra.lq, rb.lq);
    this._log(`SWAP[${a},${b}]`);
  }

  /**
   * iSWAP — FIXED.
   * Previous SWAP+S+S decomposition was wrong:
   *   SWAP maps |11⟩→|11⟩, then S⊗S gives i·i = −1 → −|11⟩.
   *   But iSWAP|11⟩ = |11⟩ (no phase on the diagonal).
   *
   * Correct iSWAP matrix:
   *   |00⟩ → |00⟩
   *   |01⟩ → i|10⟩
   *   |10⟩ → i|01⟩
   *   |11⟩ → |11⟩
   *
   * Verified decomposition: S(a), S(b), H(a), CNOT(a→b), CNOT(b→a), H(b).
   * Confirmed correct on all four computational basis states.
   */
  /**
   * iSWAP — corrected decomposition.
   *
   * iSWAP matrix: |00>→|00>, |01>→i|10>, |10>→i|01>, |11>→|11>.
   *
   * Verified decomposition (hand-checked on all 4 basis states):
   *   H(a), CNOT(a→b), CNOT(b→a), H(b), S(a), S(b)
   *
   * Previous code S(a),S(b),H(a),CNOT(a,b),CNOT(b,a),H(b) also gives
   * the correct result after the CNOT pair-collection bug is fixed.
   * Both are algebraically equivalent.  We use the H-first form here
   * as it is more commonly cited in the literature.
   */
  iSWAP(a,b) {
    this.H(a);
    this.CNOT(a,b);
    this.CNOT(b,a);
    this.H(b);
    this.S(a);
    this.S(b);
    this._log(`iSWAP[${a},${b}]`);
  }

  /**
   * RZZ(a,b,θ) = exp(−iθ/2 · Z⊗Z)
   * Correct decomposition: CNOT(a,b) → Rz(b,θ) → CNOT(a,b).
   */
  RZZ(a,b,theta) {
    this.CNOT(a,b);
    this.Rz(b,theta);
    this.CNOT(a,b);
    this._log(`RZZ[${a},${b},${theta.toFixed(4)}]`);
  }

  /**
   * RXX(a,b,θ) = exp(−iθ/2 · X⊗X)  — Mølmer-Sørensen XX interaction.
   * Native gate on IonQ trapped-ion hardware.
   * Decomposition: H⊗H → RZZ(θ) → H⊗H.
   */
  RXX(a,b,theta) {
    this.H(a); this.H(b);
    this.RZZ(a,b,theta);
    this.H(a); this.H(b);
    this._log(`RXX[${a},${b},${theta.toFixed(4)}]`);
  }

  /**
   * RYY(a,b,θ) = exp(−iθ/2 · Y⊗Y).
   * Decomposition: Rx(π/2)⊗Rx(π/2) → RZZ(θ) → Rx(−π/2)⊗Rx(−π/2).
   */
  RYY(a,b,theta) {
    const pi2 = Math.PI/2;
    this.Rx(a,pi2); this.Rx(b,pi2);
    this.RZZ(a,b,theta);
    this.Rx(a,-pi2); this.Rx(b,-pi2);
    this._log(`RYY[${a},${b},${theta.toFixed(4)}]`);
  }

  /** MS (Mølmer-Sørensen) gate — native on IonQ/Quantinuum.  MS = RXX(π/2). */
  MS(a,b) { this.RXX(a,b, Math.PI/2); this._log(`MS[${a},${b}]`); }

  /** CP — controlled phase.  Applies e^(iθ) to |11⟩ only. */
  CP(c,t,theta) {
    const {ra,rb} = this._ensureSameShard(c,t);
    const ph = cphase(theta);
    const mc=1<<ra.lq, mt=1<<rb.lq;
    ra.s.amps.each((idx,a) => {
      if ((idx&mc)&&(idx&mt)) ra.s.amps.set(idx, cmul(a,ph));
    });
    this._log(`CP[${c},${t},${theta.toFixed(4)}]`);
  }

  /**
   * CRz — Controlled-Rz.
   * Decomposition: Rz(θ/2) · CNOT · Rz(−θ/2) · CNOT.
   * Applies Rz(θ) to target when ctrl=|1⟩, identity when ctrl=|0⟩.
   */
  CRz(c,t,theta) {
    this.Rz(t, theta/2);
    this.CNOT(c,t);
    this.Rz(t,-theta/2);
    this.CNOT(c,t);
    this._log(`CRz[${c},${t},${theta.toFixed(4)}]`);
  }

  /**
   * Toffoli (CCX) — ensures all three qubits share one shard before delegating.
   */
  Toffoli(c1,c2,t) {
    // Merge c1↔c2 first, then merge that combined shard with t's shard
    const r1a=this._res(c1), r2a=this._res(c2);
    if (r1a.si !== r2a.si) this._mergeShards(r1a.si, r2a.si);
    const r1b=this._res(c1), rtb=this._res(t);
    if (r1b.si !== rtb.si) this._mergeShards(r1b.si, rtb.si);
    const r1=this._res(c1), r2=this._res(c2), rt=this._res(t);
    r1.s.toffoli(r1.lq, r2.lq, rt.lq);
    this._log(`Toffoli[${c1},${c2},${t}]`);
  }
  CCX(c1,c2,t)  { this.Toffoli(c1,c2,t); }
  Fredkin(c,a,b){ this.CNOT(b,a); this.Toffoli(c,a,b); this.CNOT(b,a); }
  CSWAP(c,a,b)  { this.Fredkin(c,a,b); }

  barrier() { this._log('BARRIER'); }
  reset(q)  { if (this.measureQubit(q)===1) this.X(q); this._log(`RESET[${q}]`); }

  // ── Measurement ──────────────────────────────────────────────────────────
  measureQubit(q) {
    const {s,lq}=this._res(q), out=s.measure(lq);
    this._log(`MEASURE[${q}]→${out}`); return out;
  }

  measureAll(shots=1) {
    const hist={};
    if (shots===1) {
      const bits=[];
      for (let q=0; q<this.nQ; q++) bits.push(this.measureQubit(q));
      const k=bits.join(''); hist[k]=1; return {histogram:hist, bits};
    }
    const dist=this._jointProbs();
    const states=[...dist.keys()], probs=[...dist.values()];
    const cum=[]; let s=0;
    for (const p of probs) { s+=p; cum.push(s); }
    for (let i=0; i<shots; i++) {
      const r=Math.random(); let lo=0, hi=cum.length-1;
      while (lo<hi) { const mid=(lo+hi)>>1; cum[mid]<r ? lo=mid+1 : hi=mid; }
      const k=states[lo]||states[states.length-1];
      hist[k]=(hist[k]||0)+1;
    }
    this._log(`MEASURE_ALL shots=${shots}`); return {histogram:hist};
  }

  probabilities() { return Object.fromEntries(this._jointProbs()); }

  /**
   * statevector() — returns full complex amplitudes.
   *
   * BUGS FIXED:
   *  - Was returning {re:sqrt(prob), im:0} — all imaginary parts silently lost.
   *  - State string was MSB-first (idx.toString(2)) but qubit convention is
   *    LSB-first (bit j = qubit j).  Now reversed so string[i] = qubit i.
   *
   * For a single shard: read {re,im} directly from Amps storage.
   * For product-state multi-shard: tensor-product amplitudes.
   */
  statevector() {
    let entries = [];
    this.shards[0].amps.each((idx, a) => {
      entries.push({ idx, re: a.re, im: a.im, nQ: this.shards[0].nQ });
    });
    for (let si=1; si<this.shards.length; si++) {
      const sh = this.shards[si];
      const next = [];
      for (const e of entries) {
        sh.amps.each((idxB, aB) => {
          // shard[0..si-1] in LOW bits, shard[si] in HIGH bits — matches _res()
          const combinedIdx = e.idx | (idxB << e.nQ);
          next.push({
            idx: combinedIdx,
            re:  e.re*aB.re - e.im*aB.im,
            im:  e.re*aB.im + e.im*aB.re,
            nQ:  e.nQ + sh.nQ
          });
        });
      }
      entries = next;
    }
    const nQ = this.nQ;
    return entries
      .map(e => ({
        /**
         * String convention: string[i] = value of qubit i.
         * idx.toString(2) is MSB-first — bit(nQ-1) at position 0.
         * Reversed: bit0 (= qubit 0) is at position 0.
         *
         * Example: idx=14=0b1110, nQ=4.
         *   toString='1110'  reversed='0111'
         *   char[0]='0'=qubit0=bit0=0 ✓  char[1]='1'=qubit1=bit1=1 ✓
         */
        state: e.idx.toString(2).padStart(nQ,'0').split('').reverse().join(''),
        re: e.re,
        im: e.im,
        prob: e.re*e.re + e.im*e.im
      }))
      .filter(e => e.prob > 1e-14)
      .sort((a,b) => b.prob - a.prob);
  }

  /**
   * Exact expectation value of a Pauli string ⟨ψ|P|ψ⟩.
   * pauliStr format: "ZZ", "XIZI", etc. — one char per qubit, leftmost = qubit 0.
   * Supported: I, X, Y, Z.
   *
   * Algorithm: rotate to Z-measurement basis for X (H) and Y (Sdg·H),
   * then compute ⟨Z…Z⟩ = Σ_state sign(state) · prob(state).
   * Uses a clone to preserve the original state.
   */
  expectation_val(pauliStr, shots=0) {
    const ps = String(pauliStr).toUpperCase();
    const clone = this._clone();
    for (let i=0; i<ps.length && i<clone.nQ; i++) {
      if (ps[i]==='X') { clone.H(i); }
      else if (ps[i]==='Y') { clone.Sdg(i); clone.H(i); }
    }
    const probs = clone._jointProbs();
    let ev = 0;
    probs.forEach((prob, state) => {
      let sign = 1;
      for (let i=0; i<ps.length; i++) {
        if (ps[i]!=='I' && state[i]==='1') sign *= -1;
      }
      ev += sign * prob;
    });
    return ev;
  }

  expectation_z(q) { return this.expectation_val('I'.repeat(q)+'Z'); }

  /**
   * Quantum Fourier Transform on nQ qubits starting at qubit offset.
   *
   * BUG FIXED: phase was π/2^(k−j) — off by factor of 2.
   * Correct CP rotation angle: 2π / 2^(k−j+1).
   * The k-th CP gate in the QFT circuit uses phase e^(2πi/2^k).
   */
  qft(nQ=this.nQ, inverse=false, offset=0) {
    const sign = inverse ? -1 : 1;
    for (let j=offset; j<offset+nQ; j++) {
      this.H(j);
      for (let k=j+1; k<offset+nQ; k++) {
        // Angle = ±2π / 2^(k−j+1)
        this.CP(k, j, sign * 2*Math.PI / Math.pow(2, k-j+1));
      }
    }
    // Bit-reversal permutation
    for (let i=0; i<Math.floor(nQ/2); i++)
      this.SWAP(offset+i, offset+nQ-1-i);
    this._log(`${inverse?'IQFT':'QFT'}(${nQ}q)`);
  }

  /** Deep-clone the register (used for non-destructive expectation measurement). */
  _clone() {
    const c = new QuantumRegister(this.name+'_clone', this.nQ);
    c.shards = this.shards.map(s => {
      const ns = new Shard(s.id, s.startQ, s.nQ);
      ns.amps = s.amps.clone();
      ns.gc = s.gc;
      return ns;
    });
    return c;
  }

  /**
   * Joint probability distribution — works for both merged and product-state shards.
   * Calls statevector() which handles the tensor product correctly.
   */
  _jointProbs() {
    const sv = this.statevector();
    const map = new Map();
    for (const e of sv) {
      map.set(e.state, (map.get(e.state)||0) + e.prob);
    }
    return map;
  }

  diag() {
    return {name:this.name, nQ:this.nQ, nShards:this.shards.length,
            shards:this.shards.map(s=>s.info()), log:this.log.slice(-20)};
  }
}

// ── Algorithm helpers ──────────────────────────────────────────────────────
export class QAlgorithms {

  /** Bell states: 'Phi+' (default), 'Phi-', 'Psi+', 'Psi-' */
  static bell(type='Phi+') {
    const q=new QuantumRegister('q',2); q.H(0); q.CNOT(0,1);
    if (type==='Phi-') q.Z(0);
    if (type==='Psi+') q.X(1);
    if (type==='Psi-') { q.Z(0); q.X(1); }
    return q;
  }

  /** GHZ state (|0…0⟩ + |1…1⟩)/√2 for n qubits. */
  static ghz(n) {
    const q=new QuantumRegister('q',n); q.H(0);
    for (let i=1; i<n; i++) q.CNOT(0,i); return q;
  }

  /**
   * Grover's search — FIXED for nQ ≥ 3.
   *
   * Oracle bug: Toffoli(0,1,n-1) provides only 2 controls — wrong for nQ>3.
   * Diffusion bug: CZ(0,1) marks only |1100…⟩ — wrong for nQ>2.
   * Both fixed via _nControlledZ which merges all qubits into one shard
   * and applies a true n-qubit controlled-Z.
   *
   * Bit convention: target integer s is interpreted MSB-first so that
   * target=7 → binary "0111" → histogram key "0111" (qubit 0 first).
   */
  static grover(nQ, marked, shots=1000) {
    const q = new QuantumRegister('q', nQ);
    const N = 1<<nQ, M = marked.length;
    for (let i=0; i<nQ; i++) q.H(i);
    const iters = Math.max(1, Math.round(Math.PI/4*Math.sqrt(N/M)));

    for (let it=0; it<iters; it++) {
      // Oracle: mark each target state with a phase flip
      for (const s of marked) {
        const bits = s.toString(2).padStart(nQ,'0').split('').map(Number);
        // bits[i] = desired value of qubit i in target state (MSB-first string)
        // Flip qubits where bits[i]=0 so target becomes |111…1⟩
        for (let i=0; i<nQ; i++) if (!bits[i]) q.X(i);
        QAlgorithms._nControlledZ(q, nQ);
        for (let i=0; i<nQ; i++) if (!bits[i]) q.X(i);
      }

      // Diffusion: 2|+…+⟩⟨+…+| − I  = H^n · X^n · nCZ · X^n · H^n
      for (let i=0; i<nQ; i++) q.H(i);
      for (let i=0; i<nQ; i++) q.X(i);
      QAlgorithms._nControlledZ(q, nQ);
      for (let i=0; i<nQ; i++) q.X(i);
      for (let i=0; i<nQ; i++) q.H(i);
    }
    return q.measureAll(shots);
  }

  /**
   * N-controlled-Z: apply −1 phase to |111…1⟩ only.
   * Merges all qubits into a single shard and calls Shard.nControlledZ.
   */
  static _nControlledZ(q, nQ) {
    if (nQ === 1) { q.Z(0); return; }
    if (nQ === 2) { q.CZ(0,1); return; }
    while (q.shards.length > 1) q._mergeShards(0, 1);
    const allQubits = Array.from({length: nQ}, (_, i) => i);
    q.shards[0].nControlledZ(allQubits);
  }

  /**
   * Parameter-shift gradient — EXACT quantum gradient.
   * ∂f/∂θᵢ = [f(θᵢ+π/2) − f(θᵢ−π/2)] / 2
   * Requires only 2 circuit evaluations per parameter.
   */
  static paramShiftGrad(circuitFn, params, idx, shots=500) {
    const p1=[...params]; p1[idx]+=Math.PI/2;
    const p2=[...params]; p2[idx]-=Math.PI/2;
    return (circuitFn(p1,shots) - circuitFn(p2,shots)) / 2;
  }
}
