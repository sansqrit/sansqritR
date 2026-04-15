//! Quantum gate operations on sparse state vectors.
//!
//! All gates operate on [`SparseStateVec`] and modify amplitudes in-place
//! by iterating ONLY over non-zero entries — never over the full 2^n space.

use crate::complex::*;
use crate::sparse::SparseStateVec;
use std::f64::consts::PI;

/// Gate identifier for lookup table indexing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub enum GateKind {
    // Single-qubit (18 total)
    I, X, Y, Z, H, S, Sdg, T, Tdg, SX, SXdg,
    Rx, Ry, Rz, Phase, U1, U2, U3,
    // Two-qubit (21 total)
    CNOT, CZ, CY, CH, CSX, SWAP, ISWAP, SqrtSWAP, FSWAP, DCX,
    CRx, CRy, CRz, CP, CU,
    RXX, RYY, RZZ, RZX,
    ECR, MS,
    // Three-qubit (3 total)
    Toffoli, Fredkin, CCZ,
    // Multi-qubit (4 total)
    MCX, MCZ, C3X, C4X,
}

impl GateKind {
    pub fn name(&self) -> &'static str {
        match self {
            GateKind::I => "I", GateKind::X => "X", GateKind::Y => "Y",
            GateKind::Z => "Z", GateKind::H => "H", GateKind::S => "S",
            GateKind::Sdg => "Sdg", GateKind::T => "T", GateKind::Tdg => "Tdg",
            GateKind::SX => "SX", GateKind::SXdg => "SXdg",
            GateKind::Rx => "Rx", GateKind::Ry => "Ry",
            GateKind::Rz => "Rz", GateKind::Phase => "Phase",
            GateKind::U1 => "U1", GateKind::U2 => "U2", GateKind::U3 => "U3",
            GateKind::CNOT => "CNOT", GateKind::CZ => "CZ", GateKind::CY => "CY",
            GateKind::CH => "CH", GateKind::CSX => "CSX",
            GateKind::SWAP => "SWAP", GateKind::ISWAP => "iSWAP",
            GateKind::SqrtSWAP => "SqrtSWAP", GateKind::FSWAP => "fSWAP",
            GateKind::DCX => "DCX",
            GateKind::CRx => "CRx", GateKind::CRy => "CRy",
            GateKind::CRz => "CRz", GateKind::CP => "CP", GateKind::CU => "CU",
            GateKind::RXX => "RXX", GateKind::RYY => "RYY",
            GateKind::RZZ => "RZZ", GateKind::RZX => "RZX",
            GateKind::ECR => "ECR", GateKind::MS => "MS",
            GateKind::Toffoli => "Toffoli", GateKind::Fredkin => "Fredkin",
            GateKind::CCZ => "CCZ",
            GateKind::MCX => "MCX", GateKind::MCZ => "MCZ",
            GateKind::C3X => "C3X", GateKind::C4X => "C4X",
        }
    }

    pub fn is_single(&self) -> bool {
        matches!(self, GateKind::I | GateKind::X | GateKind::Y | GateKind::Z |
                 GateKind::H | GateKind::S | GateKind::Sdg | GateKind::T |
                 GateKind::Tdg | GateKind::SX | GateKind::SXdg |
                 GateKind::Rx | GateKind::Ry | GateKind::Rz |
                 GateKind::Phase | GateKind::U1 | GateKind::U2 | GateKind::U3)
    }

    pub fn is_parametric(&self) -> bool {
        matches!(self, GateKind::Rx | GateKind::Ry | GateKind::Rz |
                 GateKind::Phase | GateKind::U1 | GateKind::U2 | GateKind::U3 |
                 GateKind::CRx | GateKind::CRy | GateKind::CRz |
                 GateKind::CP | GateKind::CU |
                 GateKind::RXX | GateKind::RYY | GateKind::RZZ | GateKind::RZX)
    }
}

/// A gate operation to be applied.
#[derive(Debug, Clone)]
pub struct GateOp {
    pub kind: GateKind,
    pub qubits: Vec<usize>,
    pub params: Vec<f64>,
}

impl GateOp {
    pub fn single(kind: GateKind, qubit: usize) -> Self {
        GateOp { kind, qubits: vec![qubit], params: vec![] }
    }

    pub fn single_param(kind: GateKind, qubit: usize, theta: f64) -> Self {
        GateOp { kind, qubits: vec![qubit], params: vec![theta] }
    }

    pub fn two(kind: GateKind, q0: usize, q1: usize) -> Self {
        GateOp { kind, qubits: vec![q0, q1], params: vec![] }
    }

    pub fn two_param(kind: GateKind, q0: usize, q1: usize, theta: f64) -> Self {
        GateOp { kind, qubits: vec![q0, q1], params: vec![theta] }
    }

    pub fn three(kind: GateKind, q0: usize, q1: usize, q2: usize) -> Self {
        GateOp { kind, qubits: vec![q0, q1, q2], params: vec![] }
    }

    pub fn multi(kind: GateKind, qubits: Vec<usize>) -> Self {
        GateOp { kind, qubits, params: vec![] }
    }
}

// ─── Single-Qubit Gate Application ────────────────────────────────────────

/// Apply a single-qubit gate to the sparse state vector.
/// This iterates over existing non-zero entries and computes new amplitudes.
pub fn apply_single_qubit(sv: &mut SparseStateVec, gate: &GateOp) {
    let qubit = gate.qubits[0];
    let old_entries: Vec<(u128, Amplitude)> = sv.drain();
    let mut new_entries: std::collections::HashMap<u128, Amplitude> = std::collections::HashMap::new();

    for (state, amp) in old_entries {
        let bit = SparseStateVec::bit_of(state, qubit);
        let partner = SparseStateVec::flip_bit(state, qubit);

        // Get the 2x2 matrix elements [a b; c d] where:
        // |0⟩ → a|0⟩ + c|1⟩
        // |1⟩ → b|0⟩ + d|1⟩
        let (m00, m01, m10, m11) = gate_matrix_2x2(&gate.kind, &gate.params);

        if bit == 0 {
            // |state⟩ has qubit=0: contributes m00*amp to |state⟩ and m10*amp to |partner⟩
            *new_entries.entry(state).or_insert(c_zero()) += m00 * amp;
            *new_entries.entry(partner).or_insert(c_zero()) += m10 * amp;
        } else {
            // |state⟩ has qubit=1: contributes m01*amp to |partner⟩ and m11*amp to |state⟩
            *new_entries.entry(partner).or_insert(c_zero()) += m01 * amp;
            *new_entries.entry(state).or_insert(c_zero()) += m11 * amp;
        }
    }

    // Write back non-zero entries
    for (idx, amp) in new_entries {
        sv.set(idx, amp);
    }
}

/// Get the 2x2 unitary matrix for a single-qubit gate.
/// Returns (m00, m01, m10, m11) i.e. [[m00, m01], [m10, m11]].
pub fn gate_matrix_2x2(kind: &GateKind, params: &[f64]) -> (Amplitude, Amplitude, Amplitude, Amplitude) {
    match kind {
        GateKind::I => (c_one(), c_zero(), c_zero(), c_one()),

        GateKind::X => (c_zero(), c_one(), c_one(), c_zero()),

        GateKind::Y => (c_zero(), c(0.0, -1.0), c(0.0, 1.0), c_zero()),

        GateKind::Z => (c_one(), c_zero(), c_zero(), c(-1.0, 0.0)),

        GateKind::H => {
            let h = c_real(FRAC_1_SQRT2);
            (h, h, h, -h)
        }

        GateKind::S => (c_one(), c_zero(), c_zero(), c(0.0, 1.0)),

        GateKind::Sdg => (c_one(), c_zero(), c_zero(), c(0.0, -1.0)),

        GateKind::T => (c_one(), c_zero(), c_zero(), c_exp_i(PI / 4.0)),

        GateKind::Tdg => (c_one(), c_zero(), c_zero(), c_exp_i(-PI / 4.0)),

        GateKind::SX => {
            let half = c(0.5, 0.0);
            let half_i = c(0.0, 0.5);
            (half + half_i, half - half_i, half - half_i, half + half_i)
        }

        GateKind::SXdg => {
            // Inverse of √X: (1-i)/2 [[1, 1+i], [1+i, 1]] — conjugate transpose of SX
            let half = c(0.5, 0.0);
            let half_i = c(0.0, -0.5);
            (half - half_i, half + half_i, half + half_i, half - half_i)
        }

        GateKind::Rx => {
            let theta = params[0];
            let cos_h = c_real((theta / 2.0).cos());
            let sin_h = c(0.0, -(theta / 2.0).sin());
            (cos_h, sin_h, sin_h, cos_h)
        }

        GateKind::Ry => {
            let theta = params[0];
            let cos_h = c_real((theta / 2.0).cos());
            let sin_h = c_real((theta / 2.0).sin());
            (cos_h, -sin_h, sin_h, cos_h)
        }

        GateKind::Rz => {
            let theta = params[0];
            (c_exp_i(-theta / 2.0), c_zero(), c_zero(), c_exp_i(theta / 2.0))
        }

        GateKind::Phase | GateKind::U1 => {
            let theta = params[0];
            (c_one(), c_zero(), c_zero(), c_exp_i(theta))
        }

        GateKind::U2 => {
            // U2(φ, λ) = U3(π/2, φ, λ)
            let (phi, lambda) = (params[0], params[1]);
            let h = FRAC_1_SQRT2;
            (
                c_real(h),
                -c_exp_i(lambda) * h,
                c_exp_i(phi) * h,
                c_exp_i(phi + lambda) * h,
            )
        }

        GateKind::U3 => {
            let (theta, phi, lambda) = (params[0], params[1], params[2]);
            let cos_h = (theta / 2.0).cos();
            let sin_h = (theta / 2.0).sin();
            (
                c_real(cos_h),
                -c_exp_i(lambda) * sin_h,
                c_exp_i(phi) * sin_h,
                c_exp_i(phi + lambda) * cos_h,
            )
        }

        _ => panic!("Not a single-qubit gate: {:?}", kind),
    }
}

// ─── Two-Qubit Gate Application ───────────────────────────────────────────

/// Apply a two-qubit gate to the sparse state vector.
pub fn apply_two_qubit(sv: &mut SparseStateVec, gate: &GateOp) {
    let q0 = gate.qubits[0]; // control or first qubit
    let q1 = gate.qubits[1]; // target or second qubit

    match gate.kind {
        GateKind::CNOT => apply_cnot(sv, q0, q1),
        GateKind::CZ => apply_cz(sv, q0, q1),
        GateKind::CY => apply_cy(sv, q0, q1),
        GateKind::CH => apply_controlled_single(sv, q0, q1, &GateKind::H, &[]),
        GateKind::CSX => apply_controlled_single(sv, q0, q1, &GateKind::SX, &[]),
        GateKind::SWAP => apply_swap(sv, q0, q1),
        GateKind::ISWAP => apply_iswap(sv, q0, q1),
        GateKind::SqrtSWAP => apply_sqrt_swap(sv, q0, q1),
        GateKind::FSWAP => apply_fswap(sv, q0, q1),
        GateKind::DCX => apply_dcx(sv, q0, q1),
        GateKind::CRx => apply_controlled_single(sv, q0, q1, &GateKind::Rx, &gate.params),
        GateKind::CRy => apply_controlled_single(sv, q0, q1, &GateKind::Ry, &gate.params),
        GateKind::CRz => apply_crz(sv, q0, q1, gate.params[0]),
        GateKind::CP => apply_cp(sv, q0, q1, gate.params[0]),
        GateKind::CU => apply_controlled_single(sv, q0, q1, &GateKind::U3, &gate.params),
        GateKind::RXX => apply_rxx(sv, q0, q1, gate.params[0]),
        GateKind::RYY => apply_ryy(sv, q0, q1, gate.params[0]),
        GateKind::RZZ => apply_rzz(sv, q0, q1, gate.params[0]),
        GateKind::RZX => apply_rzx(sv, q0, q1, gate.params[0]),
        GateKind::ECR => apply_ecr(sv, q0, q1),
        GateKind::MS => apply_ms(sv, q0, q1),
        _ => panic!("Not a two-qubit gate: {:?}", gate.kind),
    }
}

fn apply_cnot(sv: &mut SparseStateVec, control: usize, target: usize) {
    let entries: Vec<(u128, Amplitude)> = sv.drain();
    for (state, amp) in entries {
        if SparseStateVec::bit_of(state, control) == 1 {
            sv.set(SparseStateVec::flip_bit(state, target), amp);
        } else {
            sv.set(state, amp);
        }
    }
}

fn apply_cz(sv: &mut SparseStateVec, q0: usize, q1: usize) {
    let entries: Vec<(u128, Amplitude)> = sv.drain();
    for (state, amp) in entries {
        if SparseStateVec::bit_of(state, q0) == 1 && SparseStateVec::bit_of(state, q1) == 1 {
            sv.set(state, -amp);
        } else {
            sv.set(state, amp);
        }
    }
}

fn apply_cy(sv: &mut SparseStateVec, control: usize, target: usize) {
    let old: Vec<(u128, Amplitude)> = sv.drain();
    let mut new_entries: std::collections::HashMap<u128, Amplitude> = std::collections::HashMap::new();
    for (state, amp) in old {
        if SparseStateVec::bit_of(state, control) == 1 {
            let bit_t = SparseStateVec::bit_of(state, target);
            let partner = SparseStateVec::flip_bit(state, target);
            if bit_t == 0 {
                *new_entries.entry(partner).or_insert(c_zero()) += c(0.0, 1.0) * amp;
            } else {
                *new_entries.entry(partner).or_insert(c_zero()) += c(0.0, -1.0) * amp;
            }
        } else {
            *new_entries.entry(state).or_insert(c_zero()) += amp;
        }
    }
    for (idx, amp) in new_entries { sv.set(idx, amp); }
}

fn apply_swap(sv: &mut SparseStateVec, q0: usize, q1: usize) {
    let entries: Vec<(u128, Amplitude)> = sv.drain();
    for (state, amp) in entries {
        let b0 = SparseStateVec::bit_of(state, q0);
        let b1 = SparseStateVec::bit_of(state, q1);
        if b0 != b1 {
            let mut new_state = state;
            new_state = SparseStateVec::set_bit(new_state, q0, b1);
            new_state = SparseStateVec::set_bit(new_state, q1, b0);
            sv.set(new_state, amp);
        } else {
            sv.set(state, amp);
        }
    }
}

fn apply_iswap(sv: &mut SparseStateVec, q0: usize, q1: usize) {
    let old: Vec<(u128, Amplitude)> = sv.drain();
    let mut new_entries: std::collections::HashMap<u128, Amplitude> = std::collections::HashMap::new();
    for (state, amp) in old {
        let b0 = SparseStateVec::bit_of(state, q0);
        let b1 = SparseStateVec::bit_of(state, q1);
        if b0 != b1 {
            let mut swapped = state;
            swapped = SparseStateVec::set_bit(swapped, q0, b1);
            swapped = SparseStateVec::set_bit(swapped, q1, b0);
            *new_entries.entry(swapped).or_insert(c_zero()) += c(0.0, 1.0) * amp;
        } else {
            *new_entries.entry(state).or_insert(c_zero()) += amp;
        }
    }
    for (idx, amp) in new_entries { sv.set(idx, amp); }
}

fn apply_crz(sv: &mut SparseStateVec, control: usize, target: usize, theta: f64) {
    let entries: Vec<(u128, Amplitude)> = sv.drain();
    for (state, amp) in entries {
        if SparseStateVec::bit_of(state, control) == 1 {
            let bit_t = SparseStateVec::bit_of(state, target);
            let phase = if bit_t == 0 {
                c_exp_i(-theta / 2.0)
            } else {
                c_exp_i(theta / 2.0)
            };
            sv.set(state, phase * amp);
        } else {
            sv.set(state, amp);
        }
    }
}

fn apply_cp(sv: &mut SparseStateVec, control: usize, target: usize, theta: f64) {
    let entries: Vec<(u128, Amplitude)> = sv.drain();
    for (state, amp) in entries {
        if SparseStateVec::bit_of(state, control) == 1 && SparseStateVec::bit_of(state, target) == 1 {
            sv.set(state, c_exp_i(theta) * amp);
        } else {
            sv.set(state, amp);
        }
    }
}

fn apply_rzz(sv: &mut SparseStateVec, q0: usize, q1: usize, theta: f64) {
    let entries: Vec<(u128, Amplitude)> = sv.drain();
    for (state, amp) in entries {
        let b0 = SparseStateVec::bit_of(state, q0) as i32;
        let b1 = SparseStateVec::bit_of(state, q1) as i32;
        // Parity: (-1)^(b0 XOR b1)
        let parity = if b0 == b1 { 1.0 } else { -1.0 };
        sv.set(state, c_exp_i(theta / 2.0 * parity) * amp);
    }
}

fn apply_ecr(sv: &mut SparseStateVec, q0: usize, q1: usize) {
    // ECR = Echoed Cross-Resonance gate (IBM native)
    // Decomposed as: (IX + XY) / sqrt(2)
    let old: Vec<(u128, Amplitude)> = sv.drain();
    let mut new_entries: std::collections::HashMap<u128, Amplitude> = std::collections::HashMap::new();
    let h = FRAC_1_SQRT2;
    for (state, amp) in old {
        let b0 = SparseStateVec::bit_of(state, q0);
        let b1 = SparseStateVec::bit_of(state, q1);
        match (b0, b1) {
            (0, 0) => {
                *new_entries.entry(state).or_insert(c_zero()) += c_real(h) * amp;
                *new_entries.entry(SparseStateVec::flip_bit(SparseStateVec::flip_bit(state, q0), q1)).or_insert(c_zero()) += c(0.0, h) * amp;
            }
            (0, 1) => {
                *new_entries.entry(SparseStateVec::flip_bit(state, q1)).or_insert(c_zero()) += c_real(h) * amp;
                *new_entries.entry(SparseStateVec::flip_bit(state, q0)).or_insert(c_zero()) += c(0.0, -h) * amp;
            }
            (1, 0) => {
                *new_entries.entry(SparseStateVec::flip_bit(SparseStateVec::flip_bit(state, q0), q1)).or_insert(c_zero()) += c(0.0, -h) * amp;
                *new_entries.entry(state).or_insert(c_zero()) += c_real(h) * amp;
            }
            (1, 1) => {
                *new_entries.entry(SparseStateVec::flip_bit(state, q0)).or_insert(c_zero()) += c(0.0, h) * amp;
                *new_entries.entry(SparseStateVec::flip_bit(state, q1)).or_insert(c_zero()) += c_real(h) * amp;
            }
            _ => unreachable!(),
        }
    }
    for (idx, amp) in new_entries { sv.set(idx, amp); }
}

fn apply_ms(sv: &mut SparseStateVec, q0: usize, q1: usize) {
    // Mølmer-Sørensen gate: exp(-i * pi/4 * XX)
    apply_rzz(sv, q0, q1, PI / 2.0);
}

/// Generic controlled single-qubit gate: apply gate to target when control=|1⟩.
fn apply_controlled_single(
    sv: &mut SparseStateVec,
    control: usize,
    target: usize,
    gate_kind: &GateKind,
    params: &[f64],
) {
    let old: Vec<(u128, Amplitude)> = sv.drain();
    let mut new_entries: std::collections::HashMap<u128, Amplitude> =
        std::collections::HashMap::new();
    let (m00, m01, m10, m11) = gate_matrix_2x2(gate_kind, params);

    for (state, amp) in old {
        if SparseStateVec::bit_of(state, control) == 1 {
            let bit_t = SparseStateVec::bit_of(state, target);
            let partner = SparseStateVec::flip_bit(state, target);
            if bit_t == 0 {
                *new_entries.entry(state).or_insert(c_zero()) += m00 * amp;
                *new_entries.entry(partner).or_insert(c_zero()) += m10 * amp;
            } else {
                *new_entries.entry(partner).or_insert(c_zero()) += m01 * amp;
                *new_entries.entry(state).or_insert(c_zero()) += m11 * amp;
            }
        } else {
            *new_entries.entry(state).or_insert(c_zero()) += amp;
        }
    }
    for (idx, amp) in new_entries {
        sv.set(idx, amp);
    }
}

fn apply_sqrt_swap(sv: &mut SparseStateVec, q0: usize, q1: usize) {
    // √SWAP: |00⟩→|00⟩, |11⟩→|11⟩, |01⟩→(1+i)/2|01⟩+(1-i)/2|10⟩, etc
    let old: Vec<(u128, Amplitude)> = sv.drain();
    let mut new_entries: std::collections::HashMap<u128, Amplitude> =
        std::collections::HashMap::new();
    let half_pi = c(0.5, 0.5); // (1+i)/2
    let half_mi = c(0.5, -0.5); // (1-i)/2

    for (state, amp) in old {
        let b0 = SparseStateVec::bit_of(state, q0);
        let b1 = SparseStateVec::bit_of(state, q1);
        if b0 == b1 {
            *new_entries.entry(state).or_insert(c_zero()) += amp;
        } else {
            let mut swapped = state;
            swapped = SparseStateVec::set_bit(swapped, q0, b1);
            swapped = SparseStateVec::set_bit(swapped, q1, b0);
            *new_entries.entry(state).or_insert(c_zero()) += half_pi * amp;
            *new_entries.entry(swapped).or_insert(c_zero()) += half_mi * amp;
        }
    }
    for (idx, amp) in new_entries {
        sv.set(idx, amp);
    }
}

fn apply_fswap(sv: &mut SparseStateVec, q0: usize, q1: usize) {
    // Fermionic SWAP: SWAP with (-1) phase when both qubits are |1⟩
    let entries: Vec<(u128, Amplitude)> = sv.drain();
    for (state, amp) in entries {
        let b0 = SparseStateVec::bit_of(state, q0);
        let b1 = SparseStateVec::bit_of(state, q1);
        let mut new_state = state;
        if b0 != b1 {
            new_state = SparseStateVec::set_bit(new_state, q0, b1);
            new_state = SparseStateVec::set_bit(new_state, q1, b0);
        }
        let phase = if b0 == 1 && b1 == 1 { -amp } else { amp };
        sv.set(new_state, phase);
    }
}

fn apply_dcx(sv: &mut SparseStateVec, q0: usize, q1: usize) {
    // Double CNOT: CNOT(q0,q1) followed by CNOT(q1,q0)
    apply_cnot(sv, q0, q1);
    apply_cnot(sv, q1, q0);
}

fn apply_rxx(sv: &mut SparseStateVec, q0: usize, q1: usize, theta: f64) {
    // RXX(θ) = exp(-i θ/2 XX) — XX Ising coupling
    let old: Vec<(u128, Amplitude)> = sv.drain();
    let mut new_entries: std::collections::HashMap<u128, Amplitude> =
        std::collections::HashMap::new();
    let cos_h = c_real((theta / 2.0).cos());
    let sin_h = c(0.0, -(theta / 2.0).sin());

    for (state, amp) in old {
        let b0 = SparseStateVec::bit_of(state, q0);
        let b1 = SparseStateVec::bit_of(state, q1);
        let flipped = SparseStateVec::flip_bit(
            SparseStateVec::flip_bit(state, q0),
            q1,
        );
        *new_entries.entry(state).or_insert(c_zero()) += cos_h * amp;
        *new_entries.entry(flipped).or_insert(c_zero()) += sin_h * amp;
    }
    for (idx, amp) in new_entries {
        sv.set(idx, amp);
    }
}

fn apply_ryy(sv: &mut SparseStateVec, q0: usize, q1: usize, theta: f64) {
    // RYY(θ) = exp(-i θ/2 YY) — YY Ising coupling
    let old: Vec<(u128, Amplitude)> = sv.drain();
    let mut new_entries: std::collections::HashMap<u128, Amplitude> =
        std::collections::HashMap::new();
    let cos_h = c_real((theta / 2.0).cos());
    let sin_h = c(0.0, (theta / 2.0).sin());

    for (state, amp) in old {
        let b0 = SparseStateVec::bit_of(state, q0);
        let b1 = SparseStateVec::bit_of(state, q1);
        let flipped = SparseStateVec::flip_bit(
            SparseStateVec::flip_bit(state, q0),
            q1,
        );
        let parity = if b0 == b1 { 1.0 } else { -1.0 };
        *new_entries.entry(state).or_insert(c_zero()) += cos_h * amp;
        *new_entries.entry(flipped).or_insert(c_zero()) += c_real(parity) * sin_h * amp;
    }
    for (idx, amp) in new_entries {
        sv.set(idx, amp);
    }
}

fn apply_rzx(sv: &mut SparseStateVec, q0: usize, q1: usize, theta: f64) {
    // RZX(θ) = exp(-i θ/2 ZX) — ZX cross-resonance coupling
    // Decomposition: H(q1) · RZZ(θ) · H(q1)
    apply_single_qubit(sv, &GateOp::single(GateKind::H, q1));
    apply_rzz(sv, q0, q1, theta);
    apply_single_qubit(sv, &GateOp::single(GateKind::H, q1));
}

// ─── Three-Qubit Gate Application ──────────────────────────────────────────

/// Apply a three-qubit gate.
pub fn apply_three_qubit(sv: &mut SparseStateVec, gate: &GateOp) {
    match gate.kind {
        GateKind::Toffoli | GateKind::C3X => {
            apply_toffoli(sv, gate.qubits[0], gate.qubits[1], gate.qubits[2])
        }
        GateKind::Fredkin => {
            apply_fredkin(sv, gate.qubits[0], gate.qubits[1], gate.qubits[2])
        }
        GateKind::CCZ => {
            apply_ccz(sv, gate.qubits[0], gate.qubits[1], gate.qubits[2])
        }
        _ => panic!("Not a three-qubit gate: {:?}", gate.kind),
    }
}

fn apply_toffoli(sv: &mut SparseStateVec, c0: usize, c1: usize, target: usize) {
    let entries: Vec<(u128, Amplitude)> = sv.drain();
    for (state, amp) in entries {
        if SparseStateVec::bit_of(state, c0) == 1 && SparseStateVec::bit_of(state, c1) == 1 {
            sv.set(SparseStateVec::flip_bit(state, target), amp);
        } else {
            sv.set(state, amp);
        }
    }
}

fn apply_fredkin(sv: &mut SparseStateVec, control: usize, q1: usize, q2: usize) {
    let entries: Vec<(u128, Amplitude)> = sv.drain();
    for (state, amp) in entries {
        if SparseStateVec::bit_of(state, control) == 1 {
            let b1 = SparseStateVec::bit_of(state, q1);
            let b2 = SparseStateVec::bit_of(state, q2);
            if b1 != b2 {
                let mut new_state = state;
                new_state = SparseStateVec::set_bit(new_state, q1, b2);
                new_state = SparseStateVec::set_bit(new_state, q2, b1);
                sv.set(new_state, amp);
            } else {
                sv.set(state, amp);
            }
        } else {
            sv.set(state, amp);
        }
    }
}

fn apply_ccz(sv: &mut SparseStateVec, c0: usize, c1: usize, target: usize) {
    // CCZ: flip phase when all three qubits are |1⟩
    let entries: Vec<(u128, Amplitude)> = sv.drain();
    for (state, amp) in entries {
        if SparseStateVec::bit_of(state, c0) == 1
            && SparseStateVec::bit_of(state, c1) == 1
            && SparseStateVec::bit_of(state, target) == 1
        {
            sv.set(state, -amp);
        } else {
            sv.set(state, amp);
        }
    }
}

// ─── Multi-Qubit Gate Application ────────────────────────────────────────

fn apply_multi_qubit(sv: &mut SparseStateVec, gate: &GateOp) {
    match gate.kind {
        GateKind::MCX => {
            // Multi-controlled X: flip target when ALL controls are |1⟩
            let controls = &gate.qubits[..gate.qubits.len() - 1];
            let target = *gate.qubits.last().unwrap();
            let entries: Vec<(u128, Amplitude)> = sv.drain();
            for (state, amp) in entries {
                let all_one = controls
                    .iter()
                    .all(|&c| SparseStateVec::bit_of(state, c) == 1);
                if all_one {
                    sv.set(SparseStateVec::flip_bit(state, target), amp);
                } else {
                    sv.set(state, amp);
                }
            }
        }
        GateKind::MCZ => {
            // Multi-controlled Z: flip phase when ALL qubits are |1⟩
            let entries: Vec<(u128, Amplitude)> = sv.drain();
            for (state, amp) in entries {
                let all_one = gate
                    .qubits
                    .iter()
                    .all(|&q| SparseStateVec::bit_of(state, q) == 1);
                if all_one {
                    sv.set(state, -amp);
                } else {
                    sv.set(state, amp);
                }
            }
        }
        GateKind::C3X => {
            // 3-controlled X (4 qubits total)
            let controls = &gate.qubits[..3];
            let target = gate.qubits[3];
            let entries: Vec<(u128, Amplitude)> = sv.drain();
            for (state, amp) in entries {
                let all_one = controls
                    .iter()
                    .all(|&c| SparseStateVec::bit_of(state, c) == 1);
                if all_one {
                    sv.set(SparseStateVec::flip_bit(state, target), amp);
                } else {
                    sv.set(state, amp);
                }
            }
        }
        GateKind::C4X => {
            // 4-controlled X (5 qubits total)
            let controls = &gate.qubits[..4];
            let target = gate.qubits[4];
            let entries: Vec<(u128, Amplitude)> = sv.drain();
            for (state, amp) in entries {
                let all_one = controls
                    .iter()
                    .all(|&c| SparseStateVec::bit_of(state, c) == 1);
                if all_one {
                    sv.set(SparseStateVec::flip_bit(state, target), amp);
                } else {
                    sv.set(state, amp);
                }
            }
        }
        _ => panic!("Not a multi-qubit gate: {:?}", gate.kind),
    }
}

// ─── Dispatch ──────────────────────────────────────────────────────────────

/// Apply any gate operation to the sparse state vector.
pub fn apply_gate(sv: &mut SparseStateVec, gate: &GateOp) {
    match gate.qubits.len() {
        1 => apply_single_qubit(sv, gate),
        2 => apply_two_qubit(sv, gate),
        3 => apply_three_qubit(sv, gate),
        _ => apply_multi_qubit(sv, gate),
    }
}

// ─── Built-in Circuits ────────────────────────────────────────────────────

/// Apply QFT (Quantum Fourier Transform) to qubits[start..end].
pub fn apply_qft(sv: &mut SparseStateVec, qubits: &[usize]) {
    let n = qubits.len();
    for i in 0..n {
        apply_gate(sv, &GateOp::single(GateKind::H, qubits[i]));
        for j in (i + 1)..n {
            let angle = PI / (1u64 << (j - i)) as f64;
            apply_gate(sv, &GateOp::two_param(GateKind::CP, qubits[j], qubits[i], angle));
        }
    }
    // Swap qubits to get standard ordering
    for i in 0..(n / 2) {
        apply_gate(sv, &GateOp::two(GateKind::SWAP, qubits[i], qubits[n - 1 - i]));
    }
}

/// Apply inverse QFT.
pub fn apply_iqft(sv: &mut SparseStateVec, qubits: &[usize]) {
    let n = qubits.len();
    for i in 0..(n / 2) {
        apply_gate(sv, &GateOp::two(GateKind::SWAP, qubits[i], qubits[n - 1 - i]));
    }
    for i in (0..n).rev() {
        for j in ((i + 1)..n).rev() {
            let angle = -PI / (1u64 << (j - i)) as f64;
            apply_gate(sv, &GateOp::two_param(GateKind::CP, qubits[j], qubits[i], angle));
        }
        apply_gate(sv, &GateOp::single(GateKind::H, qubits[i]));
    }
}

/// Create a GHZ state on n qubits: (|00...0⟩ + |11...1⟩) / √2.
pub fn create_ghz(sv: &mut SparseStateVec, qubits: &[usize]) {
    apply_gate(sv, &GateOp::single(GateKind::H, qubits[0]));
    for i in 1..qubits.len() {
        apply_gate(sv, &GateOp::two(GateKind::CNOT, qubits[0], qubits[i]));
    }
}

/// Create a Bell state on two qubits.
pub fn create_bell(sv: &mut SparseStateVec, q0: usize, q1: usize) {
    apply_gate(sv, &GateOp::single(GateKind::H, q0));
    apply_gate(sv, &GateOp::two(GateKind::CNOT, q0, q1));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hadamard_creates_superposition() {
        let mut sv = SparseStateVec::new(1);
        apply_gate(&mut sv, &GateOp::single(GateKind::H, 0));
        assert_eq!(sv.nnz(), 2);
        let p0 = sv.probability_of(0);
        let p1 = sv.probability_of(1);
        assert!((p0 - 0.5).abs() < 1e-10);
        assert!((p1 - 0.5).abs() < 1e-10);
    }

    #[test]
    fn test_x_gate_flips() {
        let mut sv = SparseStateVec::new(1);
        apply_gate(&mut sv, &GateOp::single(GateKind::X, 0));
        assert!((sv.probability_of(1) - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_bell_state() {
        let mut sv = SparseStateVec::new(2);
        create_bell(&mut sv, 0, 1);
        assert_eq!(sv.nnz(), 2);
        assert!((sv.probability_of(0b00) - 0.5).abs() < 1e-10);
        assert!((sv.probability_of(0b11) - 0.5).abs() < 1e-10);
    }

    #[test]
    fn test_ghz_100_qubits_stays_sparse() {
        let mut sv = SparseStateVec::new(100);
        let qubits: Vec<usize> = (0..100).collect();
        create_ghz(&mut sv, &qubits);
        assert_eq!(sv.nnz(), 2, "100-qubit GHZ should have exactly 2 non-zero entries");
        assert!(sv.memory_bytes() < 500, "100-qubit GHZ should use <500 bytes");
    }

    #[test]
    fn test_cnot_entanglement() {
        let mut sv = SparseStateVec::new(2);
        apply_gate(&mut sv, &GateOp::single(GateKind::H, 0));
        apply_gate(&mut sv, &GateOp::two(GateKind::CNOT, 0, 1));
        // Should produce Bell state: (|00⟩ + |11⟩)/√2
        assert!((sv.probability_of(0b01) - 0.0).abs() < 1e-10); // |01⟩ = 0
        assert!((sv.probability_of(0b10) - 0.0).abs() < 1e-10); // |10⟩ = 0
    }

    #[test]
    fn test_toffoli() {
        let mut sv = SparseStateVec::new(3);
        apply_gate(&mut sv, &GateOp::single(GateKind::X, 0));
        apply_gate(&mut sv, &GateOp::single(GateKind::X, 1));
        apply_gate(&mut sv, &GateOp::three(GateKind::Toffoli, 0, 1, 2));
        assert!((sv.probability_of(0b111) - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_unitarity() {
        // After any gate, total probability must remain 1.0
        let mut sv = SparseStateVec::new(3);
        apply_gate(&mut sv, &GateOp::single(GateKind::H, 0));
        apply_gate(&mut sv, &GateOp::single_param(GateKind::Ry, 1, 1.23));
        assert!((sv.total_probability() - 1.0).abs() < 1e-10);
    }
}

// Helper trait for test convenience
impl GateOp {
    #[allow(dead_code)]
    fn params_with(mut self, params: Vec<f64>) -> Self {
        self.params = params;
        self
    }
}
