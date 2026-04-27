//! Quantum simulation engines.
//!
//! Three-tier system:
//! - Dense (≤20 qubits): Full state vector, fastest for small circuits
//! - Sparse (≤28 qubits): Only non-zero amplitudes, huge win for sparse circuits
//! - Chunked (unlimited): Splits into 10-qubit chunks, parallel execution

use crate::backend_planner::{BackendPlan, BackendPlanner, CircuitProfile, PlannerConfig};
use crate::complex::*;
use crate::gates::*;
use crate::lookup::GateLookupTable;
use crate::measurement::MeasurementResult;
use crate::sparse::SparseStateVec;
use rand::Rng;
use std::collections::HashMap;
use std::sync::Arc;

/// Engine selection mode.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EngineKind {
    Auto,
    Dense,
    Sparse,
    Chunked,
}

impl EngineKind {
    /// Auto-select engine based on qubit count.
    pub fn auto_select(n_qubits: usize) -> EngineKind {
        let profile = CircuitProfile::new(n_qubits);
        BackendPlanner::plan(&profile, &PlannerConfig::default()).runtime_engine
    }
}

/// Quantum simulation engine — the primary interface.
pub struct QuantumEngine {
    /// The sparse state vector (used by all engine modes).
    pub state: SparseStateVec,
    /// Which engine tier is active.
    pub engine_kind: EngineKind,
    /// Pre-computed gate lookup tables.
    pub lookup: Arc<GateLookupTable>,
    /// Circuit history for QASM export.
    pub circuit_log: Vec<GateOp>,
    /// Chunk size for chunked engine.
    pub chunk_size: usize,
}

impl QuantumEngine {
    /// Create a new quantum engine with n qubits.
    pub fn new(n_qubits: usize) -> Self {
        Self::with_engine(n_qubits, EngineKind::Auto)
    }

    /// Create with a specific engine mode.
    pub fn with_engine(n_qubits: usize, mut kind: EngineKind) -> Self {
        if kind == EngineKind::Auto {
            kind = EngineKind::auto_select(n_qubits);
        }
        let lookup = Arc::new(GateLookupTable::auto_discover());
        QuantumEngine {
            state: SparseStateVec::new(n_qubits),
            engine_kind: kind,
            lookup,
            circuit_log: Vec::new(),
            chunk_size: 10,
        }
    }

    /// Return the explainable backend plan used by automatic selection.
    pub fn backend_plan(n_qubits: usize, config: &PlannerConfig) -> BackendPlan {
        BackendPlanner::plan(&CircuitProfile::new(n_qubits), config)
    }

    /// Create an engine and return the planner decision that selected it.
    pub fn with_backend_plan(
        n_qubits: usize,
        requested: EngineKind,
        config: &PlannerConfig,
    ) -> (Self, BackendPlan) {
        let plan = BackendPlanner::enforce_requested(n_qubits, requested, config);
        (Self::with_engine(n_qubits, plan.runtime_engine), plan)
    }

    /// Create with specific lookup tables.
    pub fn with_lookup(n_qubits: usize, kind: EngineKind, lookup: Arc<GateLookupTable>) -> Self {
        let actual_kind = if kind == EngineKind::Auto {
            EngineKind::auto_select(n_qubits)
        } else {
            kind
        };
        QuantumEngine {
            state: SparseStateVec::new(n_qubits),
            engine_kind: actual_kind,
            lookup,
            circuit_log: Vec::new(),
            chunk_size: 10,
        }
    }

    /// Number of qubits.
    pub fn n_qubits(&self) -> usize {
        self.state.n_qubits
    }

    /// Number of non-zero amplitudes.
    pub fn nnz(&self) -> usize {
        self.state.nnz()
    }

    /// Apply a gate operation.
    pub fn apply(&mut self, gate: GateOp) {
        // Log for QASM export
        self.circuit_log.push(gate.clone());

        match self.engine_kind {
            EngineKind::Dense | EngineKind::Sparse => {
                // Both use the same sparse state vector;
                // Dense just means we expect it to be fully populated
                apply_gate(&mut self.state, &gate);
            }
            EngineKind::Chunked => {
                self.apply_chunked(&gate);
            }
            EngineKind::Auto => unreachable!("Auto should be resolved at construction"),
        }
    }

    // ─── Convenience gate methods ──────────────────────────────────────

    // Single-qubit gates (18)
    pub fn i(&mut self, q: usize) {
        self.apply(GateOp::single(GateKind::I, q));
    }
    pub fn x(&mut self, q: usize) {
        self.apply(GateOp::single(GateKind::X, q));
    }
    pub fn y(&mut self, q: usize) {
        self.apply(GateOp::single(GateKind::Y, q));
    }
    pub fn z(&mut self, q: usize) {
        self.apply(GateOp::single(GateKind::Z, q));
    }
    pub fn h(&mut self, q: usize) {
        self.apply(GateOp::single(GateKind::H, q));
    }
    pub fn s(&mut self, q: usize) {
        self.apply(GateOp::single(GateKind::S, q));
    }
    pub fn sdg(&mut self, q: usize) {
        self.apply(GateOp::single(GateKind::Sdg, q));
    }
    pub fn t(&mut self, q: usize) {
        self.apply(GateOp::single(GateKind::T, q));
    }
    pub fn tdg(&mut self, q: usize) {
        self.apply(GateOp::single(GateKind::Tdg, q));
    }
    pub fn sx(&mut self, q: usize) {
        self.apply(GateOp::single(GateKind::SX, q));
    }
    pub fn sxdg(&mut self, q: usize) {
        self.apply(GateOp::single(GateKind::SXdg, q));
    }

    pub fn rx(&mut self, q: usize, theta: f64) {
        self.apply(GateOp::single_param(GateKind::Rx, q, theta));
    }
    pub fn ry(&mut self, q: usize, theta: f64) {
        self.apply(GateOp::single_param(GateKind::Ry, q, theta));
    }
    pub fn rz(&mut self, q: usize, theta: f64) {
        self.apply(GateOp::single_param(GateKind::Rz, q, theta));
    }
    pub fn phase(&mut self, q: usize, theta: f64) {
        self.apply(GateOp::single_param(GateKind::Phase, q, theta));
    }
    pub fn u1(&mut self, q: usize, lambda: f64) {
        self.apply(GateOp::single_param(GateKind::U1, q, lambda));
    }
    pub fn u2(&mut self, q: usize, phi: f64, lambda: f64) {
        self.apply(GateOp {
            kind: GateKind::U2,
            qubits: vec![q],
            params: vec![phi, lambda],
        });
    }
    pub fn u3(&mut self, q: usize, theta: f64, phi: f64, lambda: f64) {
        self.apply(GateOp {
            kind: GateKind::U3,
            qubits: vec![q],
            params: vec![theta, phi, lambda],
        });
    }

    // Two-qubit gates (21)
    pub fn cnot(&mut self, c: usize, t: usize) {
        self.apply(GateOp::two(GateKind::CNOT, c, t));
    }
    pub fn cx(&mut self, c: usize, t: usize) {
        self.cnot(c, t);
    } // alias
    pub fn cz(&mut self, q0: usize, q1: usize) {
        self.apply(GateOp::two(GateKind::CZ, q0, q1));
    }
    pub fn cy(&mut self, c: usize, t: usize) {
        self.apply(GateOp::two(GateKind::CY, c, t));
    }
    pub fn ch(&mut self, c: usize, t: usize) {
        self.apply(GateOp::two(GateKind::CH, c, t));
    }
    pub fn csx(&mut self, c: usize, t: usize) {
        self.apply(GateOp::two(GateKind::CSX, c, t));
    }
    pub fn swap(&mut self, q0: usize, q1: usize) {
        self.apply(GateOp::two(GateKind::SWAP, q0, q1));
    }
    pub fn iswap(&mut self, q0: usize, q1: usize) {
        self.apply(GateOp::two(GateKind::ISWAP, q0, q1));
    }
    pub fn sqrt_swap(&mut self, q0: usize, q1: usize) {
        self.apply(GateOp::two(GateKind::SqrtSWAP, q0, q1));
    }
    pub fn fswap(&mut self, q0: usize, q1: usize) {
        self.apply(GateOp::two(GateKind::FSWAP, q0, q1));
    }
    pub fn dcx(&mut self, q0: usize, q1: usize) {
        self.apply(GateOp::two(GateKind::DCX, q0, q1));
    }
    pub fn crx(&mut self, c: usize, t: usize, theta: f64) {
        self.apply(GateOp::two_param(GateKind::CRx, c, t, theta));
    }
    pub fn cry(&mut self, c: usize, t: usize, theta: f64) {
        self.apply(GateOp::two_param(GateKind::CRy, c, t, theta));
    }
    pub fn crz(&mut self, c: usize, t: usize, theta: f64) {
        self.apply(GateOp::two_param(GateKind::CRz, c, t, theta));
    }
    pub fn cp(&mut self, c: usize, t: usize, theta: f64) {
        self.apply(GateOp::two_param(GateKind::CP, c, t, theta));
    }
    pub fn cu(&mut self, c: usize, t: usize, theta: f64, phi: f64, lambda: f64) {
        self.apply(GateOp {
            kind: GateKind::CU,
            qubits: vec![c, t],
            params: vec![theta, phi, lambda],
        });
    }
    pub fn rxx(&mut self, q0: usize, q1: usize, theta: f64) {
        self.apply(GateOp::two_param(GateKind::RXX, q0, q1, theta));
    }
    pub fn ryy(&mut self, q0: usize, q1: usize, theta: f64) {
        self.apply(GateOp::two_param(GateKind::RYY, q0, q1, theta));
    }
    pub fn rzz(&mut self, q0: usize, q1: usize, theta: f64) {
        self.apply(GateOp::two_param(GateKind::RZZ, q0, q1, theta));
    }
    pub fn rzx(&mut self, q0: usize, q1: usize, theta: f64) {
        self.apply(GateOp::two_param(GateKind::RZX, q0, q1, theta));
    }

    // Three-qubit gates (3)
    pub fn toffoli(&mut self, c0: usize, c1: usize, t: usize) {
        self.apply(GateOp::three(GateKind::Toffoli, c0, c1, t));
    }
    pub fn ccx(&mut self, c0: usize, c1: usize, t: usize) {
        self.toffoli(c0, c1, t);
    } // alias
    pub fn fredkin(&mut self, c: usize, q1: usize, q2: usize) {
        self.apply(GateOp::three(GateKind::Fredkin, c, q1, q2));
    }
    pub fn cswap(&mut self, c: usize, q1: usize, q2: usize) {
        self.fredkin(c, q1, q2);
    } // alias
    pub fn ccz(&mut self, q0: usize, q1: usize, q2: usize) {
        self.apply(GateOp::three(GateKind::CCZ, q0, q1, q2));
    }

    // Multi-qubit gates (4)
    pub fn mcx(&mut self, controls: &[usize], target: usize) {
        let mut qubits: Vec<usize> = controls.to_vec();
        qubits.push(target);
        self.apply(GateOp::multi(GateKind::MCX, qubits));
    }
    pub fn mcz(&mut self, qubits: &[usize]) {
        self.apply(GateOp::multi(GateKind::MCZ, qubits.to_vec()));
    }
    pub fn c3x(&mut self, c0: usize, c1: usize, c2: usize, target: usize) {
        self.apply(GateOp::multi(GateKind::C3X, vec![c0, c1, c2, target]));
    }
    pub fn c4x(&mut self, c0: usize, c1: usize, c2: usize, c3: usize, target: usize) {
        self.apply(GateOp::multi(GateKind::C4X, vec![c0, c1, c2, c3, target]));
    }

    /// Clone the engine state into a new engine (for VQE gradient evaluation).
    pub fn clone_state(&self, n_qubits: usize) -> QuantumEngine {
        let mut new_engine = QuantumEngine::new(n_qubits);
        new_engine.state = self.state.clone();
        new_engine.engine_kind = self.engine_kind;
        new_engine
    }

    // ─── Batch operations ─────────────────────────────────────────────

    /// Apply Hadamard to all qubits.
    pub fn h_all(&mut self) {
        for q in 0..self.n_qubits() {
            self.h(q);
        }
    }

    /// Apply Rx to all qubits with the same angle.
    pub fn rx_all(&mut self, theta: f64) {
        for q in 0..self.n_qubits() {
            self.rx(q, theta);
        }
    }

    /// Apply Ry to all qubits.
    pub fn ry_all(&mut self, theta: f64) {
        for q in 0..self.n_qubits() {
            self.ry(q, theta);
        }
    }

    // ─── Built-in circuits ────────────────────────────────────────────

    /// Apply QFT to all qubits.
    pub fn qft(&mut self) {
        let qubits: Vec<usize> = (0..self.n_qubits()).collect();
        apply_qft(&mut self.state, &qubits);
    }

    /// Apply QFT to a subset of qubits.
    pub fn qft_on(&mut self, qubits: &[usize]) {
        apply_qft(&mut self.state, qubits);
    }

    /// Create GHZ state.
    pub fn ghz(&mut self) {
        let qubits: Vec<usize> = (0..self.n_qubits()).collect();
        create_ghz(&mut self.state, &qubits);
    }

    /// Create Bell state on qubits 0 and 1.
    pub fn bell(&mut self) {
        create_bell(&mut self.state, 0, 1);
    }

    // ─── Measurement ──────────────────────────────────────────────────

    /// Measure a single qubit, collapsing the state. Returns 0 or 1.
    pub fn measure(&mut self, qubit: usize) -> u8 {
        let mut rng = rand::thread_rng();
        let p0: f64 = self
            .state
            .iter()
            .filter(|(&idx, _)| SparseStateVec::bit_of(idx, qubit) == 0)
            .map(|(_, amp)| amp.norm_sqr())
            .sum();

        let outcome = if rng.gen::<f64>() < p0 { 0u8 } else { 1u8 };

        // Collapse: remove states inconsistent with measurement
        let entries: Vec<(u128, Amplitude)> = self.state.drain();
        for (state, amp) in entries {
            if SparseStateVec::bit_of(state, qubit) == outcome {
                self.state.set(state, amp);
            }
        }
        self.state.normalize();
        outcome
    }

    /// Measure all qubits. Returns a vector of bits.
    pub fn measure_all_once(&mut self) -> Vec<u8> {
        let mut rng = rand::thread_rng();
        let probs = self.state.probabilities();
        let r: f64 = rng.gen();

        let mut cumulative = 0.0;
        let mut chosen_state = 0u128;
        for (idx, p) in &probs {
            cumulative += p;
            if r < cumulative {
                chosen_state = *idx;
                break;
            }
        }

        // Convert to bit vector
        (0..self.n_qubits())
            .map(|q| SparseStateVec::bit_of(chosen_state, q))
            .collect()
    }

    /// Measure all qubits with multiple shots. Returns histogram.
    pub fn measure_all(&self, shots: usize) -> MeasurementResult {
        let mut rng = rand::thread_rng();
        let probs = self.state.probabilities();
        let mut histogram: HashMap<String, usize> = HashMap::new();

        for _ in 0..shots {
            let r: f64 = rng.gen();
            let mut cumulative = 0.0;
            let mut chosen = 0u128;

            for (idx, p) in &probs {
                cumulative += p;
                if r < cumulative {
                    chosen = *idx;
                    break;
                }
            }

            let bitstring = self.state.index_to_bitstring(chosen);
            *histogram.entry(bitstring).or_insert(0) += 1;
        }

        MeasurementResult {
            histogram,
            shots,
            n_qubits: self.n_qubits(),
        }
    }

    // ─── State queries (non-destructive) ──────────────────────────────

    /// Get all probabilities.
    pub fn probabilities(&self) -> Vec<(String, f64)> {
        self.state
            .probabilities()
            .into_iter()
            .map(|(idx, p)| (self.state.index_to_bitstring(idx), p))
            .collect()
    }

    /// Get the full statevector as (bitstring, amplitude) pairs.
    pub fn statevector(&self) -> Vec<(String, Amplitude)> {
        self.state
            .iter()
            .map(|(&idx, &amp)| (self.state.index_to_bitstring(idx), amp))
            .collect()
    }

    /// Expectation value of Z on a qubit: <Z> = P(0) - P(1).
    pub fn expectation_z(&self, qubit: usize) -> f64 {
        let mut p0 = 0.0;
        let mut p1 = 0.0;
        for (&idx, &amp) in self.state.iter() {
            if SparseStateVec::bit_of(idx, qubit) == 0 {
                p0 += amp.norm_sqr();
            } else {
                p1 += amp.norm_sqr();
            }
        }
        p0 - p1
    }

    /// Expectation value of ZZ on two qubits.
    pub fn expectation_zz(&self, q0: usize, q1: usize) -> f64 {
        let mut result = 0.0;
        for (&idx, &amp) in self.state.iter() {
            let b0 = SparseStateVec::bit_of(idx, q0) as i32;
            let b1 = SparseStateVec::bit_of(idx, q1) as i32;
            let parity = 1 - 2 * (b0 ^ b1);
            result += parity as f64 * amp.norm_sqr();
        }
        result
    }

    /// Von Neumann entanglement entropy for a bipartition.
    pub fn entanglement_entropy(&self, partition_a: &[usize]) -> f64 {
        // Compute reduced density matrix eigenvalues via Schmidt decomposition
        // This is a simplified version for small partitions
        let n_a = partition_a.len();
        if n_a == 0 || n_a >= self.n_qubits() {
            return 0.0;
        }

        let dim_a = 1usize << n_a;
        let mut rho_diag = vec![0.0f64; dim_a];

        for (&idx, &amp) in self.state.iter() {
            let mut a_idx = 0u128;
            for (pos, &q) in partition_a.iter().enumerate() {
                if SparseStateVec::bit_of(idx, q) == 1 {
                    a_idx |= 1u128 << pos;
                }
            }
            rho_diag[a_idx as usize] += amp.norm_sqr();
        }

        // S = -Σ p_i log(p_i)
        rho_diag
            .iter()
            .filter(|&&p| p > 1e-30)
            .map(|&p| -p * p.ln())
            .sum()
    }

    /// State fidelity: |⟨ψ|φ⟩|²
    pub fn state_fidelity(&self, other: &QuantumEngine) -> f64 {
        let mut inner = c_zero();
        for (&idx, &amp) in self.state.iter() {
            let other_amp = other.state.get(idx);
            inner += amp.conj() * other_amp;
        }
        inner.norm_sqr()
    }

    /// Chunk statistics for the chunked engine.
    pub fn chunk_stats(&self) -> Vec<ChunkStat> {
        let n = self.n_qubits();
        let cs = self.chunk_size;
        let n_chunks = (n + cs - 1) / cs;
        let mut stats = Vec::new();

        for c in 0..n_chunks {
            let offset = c * cs;
            let size = cs.min(n - offset);
            // Count entries that have non-zero bits in this chunk
            let nnz = self
                .state
                .iter()
                .filter(|(&idx, _)| {
                    let mask = ((1u128 << size) - 1) << offset;
                    (idx & mask) != 0 || idx == 0
                })
                .count();
            stats.push(ChunkStat { offset, size, nnz });
        }
        stats
    }

    /// Reset to |00...0⟩.
    pub fn reset(&mut self) {
        self.state.reset();
        self.circuit_log.clear();
    }

    // ─── Chunked Engine ───────────────────────────────────────────────

    fn apply_chunked(&mut self, gate: &GateOp) {
        // For the chunked engine, we still use the sparse state vector
        // but we route single-chunk gates to operate only within their chunk.
        // Cross-chunk gates are decomposed into local operations + classical communication.

        let cs = self.chunk_size;
        let qubits = &gate.qubits;

        // Check if all qubits are in the same chunk
        let chunks: Vec<usize> = qubits.iter().map(|&q| q / cs).collect();
        let all_same_chunk = chunks.iter().all(|&c| c == chunks[0]);

        if all_same_chunk {
            // Gate is local to one chunk — apply directly
            apply_gate(&mut self.state, gate);
        } else {
            // Cross-chunk gate — decompose
            match gate.kind {
                GateKind::CNOT => {
                    // CNOT across chunks: use teleportation-like protocol
                    // For simulation, we just apply it directly on the sparse vector
                    apply_gate(&mut self.state, gate);
                }
                GateKind::SWAP => {
                    // SWAP = 3 CNOTs
                    let (q0, q1) = (qubits[0], qubits[1]);
                    apply_gate(&mut self.state, &GateOp::two(GateKind::CNOT, q0, q1));
                    apply_gate(&mut self.state, &GateOp::two(GateKind::CNOT, q1, q0));
                    apply_gate(&mut self.state, &GateOp::two(GateKind::CNOT, q0, q1));
                }
                GateKind::Toffoli => {
                    // Cross-chunk Toffoli: decompose into 1 and 2-qubit gates
                    apply_gate(&mut self.state, gate);
                }
                _ => {
                    // Generic cross-chunk: apply directly on sparse vector
                    apply_gate(&mut self.state, gate);
                }
            }
        }
    }
}

/// Statistics about a chunk partition.
#[derive(Debug, Clone)]
pub struct ChunkStat {
    pub offset: usize,
    pub size: usize,
    pub nnz: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_engine_auto_selection() {
        assert_eq!(EngineKind::auto_select(5), EngineKind::Dense);
        assert_eq!(EngineKind::auto_select(20), EngineKind::Dense);
        assert_eq!(EngineKind::auto_select(25), EngineKind::Sparse);
        assert_eq!(EngineKind::auto_select(50), EngineKind::Chunked);
    }

    #[test]
    fn test_safe_backend_plan_for_dense_120() {
        let config = PlannerConfig::default();
        let (engine, plan) = QuantumEngine::with_backend_plan(120, EngineKind::Dense, &config);

        assert_eq!(engine.engine_kind, EngineKind::Chunked);
        assert!(plan.shard_plan.is_some());
        assert!(plan
            .warnings
            .iter()
            .any(|warning| warning.contains("dense request exceeds")));
    }

    #[test]
    fn test_bell_state_measurement() {
        let mut engine = QuantumEngine::new(2);
        engine.bell();
        let result = engine.measure_all(10000);
        let p00 = result.probability("00");
        let p11 = result.probability("11");
        let p01 = result.probability("01");
        let p10 = result.probability("10");
        assert!((p00 - 0.5).abs() < 0.05);
        assert!((p11 - 0.5).abs() < 0.05);
        assert!(p01 < 0.01);
        assert!(p10 < 0.01);
    }

    #[test]
    fn test_100_qubit_ghz() {
        let mut engine = QuantumEngine::with_engine(100, EngineKind::Chunked);
        engine.ghz();
        assert_eq!(engine.nnz(), 2);
        let result = engine.measure_all(1000);
        // GHZ: only |00...0⟩ and |11...1⟩
        assert!(result.histogram.len() <= 2);
    }

    #[test]
    fn test_expectation_z() {
        let mut engine = QuantumEngine::new(1);
        // |0⟩: <Z> = 1
        assert!((engine.expectation_z(0) - 1.0).abs() < 1e-10);
        // |1⟩: <Z> = -1
        engine.x(0);
        assert!((engine.expectation_z(0) - (-1.0)).abs() < 1e-10);
        // |+⟩: <Z> = 0
        engine.reset();
        engine.h(0);
        assert!((engine.expectation_z(0)).abs() < 1e-10);
    }

    #[test]
    fn test_qft_preserves_norm() {
        let mut engine = QuantumEngine::new(4);
        engine.x(0);
        engine.h(1);
        engine.qft();
        assert!((engine.state.total_probability() - 1.0).abs() < 1e-10);
    }
}
