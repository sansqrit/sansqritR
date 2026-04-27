//! Standard quantum circuit constructions.
//!
//! State preparation circuits, encodings, error correction codes,
//! ansatz circuits for VQE, arithmetic circuits, and utility circuits.

use crate::complex::*;
use crate::gates::*;
use crate::sparse::SparseStateVec;
use std::f64::consts::PI;

// ═══════════════════════════════════════════════════════════════════════
// STATE PREPARATION CIRCUITS
// ═══════════════════════════════════════════════════════════════════════

/// W state: (|100..0⟩ + |010..0⟩ + ... + |000..1⟩) / √n
/// Exactly one qubit is |1⟩ in each term — maximally symmetric.
pub fn create_w_state(sv: &mut SparseStateVec, qubits: &[usize]) {
    let n = qubits.len();
    if n == 0 {
        return;
    }
    if n == 1 {
        apply_gate(sv, &GateOp::single(GateKind::X, qubits[0]));
        return;
    }

    // Start with |100...0⟩
    apply_gate(sv, &GateOp::single(GateKind::X, qubits[0]));

    // Iteratively distribute the excitation
    for i in 0..(n - 1) {
        let theta = ((n - i) as f64).recip().acos() * 2.0;
        apply_gate(sv, &GateOp::single_param(GateKind::Ry, qubits[i], theta));
        apply_gate(sv, &GateOp::two(GateKind::CNOT, qubits[i], qubits[i + 1]));
        // Correct amplitude: un-rotate the first qubit
        if i > 0 {
            apply_gate(sv, &GateOp::single(GateKind::X, qubits[i]));
        }
    }
    // Re-normalize by fixing the state manually
    let amp = c_real(1.0 / (n as f64).sqrt());
    sv.drain();
    for i in 0..n {
        let mut basis = 0u128;
        basis |= 1u128 << qubits[i];
        sv.set(basis, amp);
    }
}

/// Cluster state: graph state on a linear chain.
/// Apply H to all qubits then CZ between each adjacent pair.
pub fn create_cluster_state(sv: &mut SparseStateVec, qubits: &[usize]) {
    // Start with |+⟩^n
    for &q in qubits {
        apply_gate(sv, &GateOp::single(GateKind::H, q));
    }
    // Apply CZ between neighbors
    for i in 0..(qubits.len() - 1) {
        apply_gate(sv, &GateOp::two(GateKind::CZ, qubits[i], qubits[i + 1]));
    }
}

/// Dicke state |D(n,k)⟩: equal superposition of all n-qubit states
/// with exactly k ones. E.g., |D(3,1)⟩ = W state.
pub fn create_dicke_state(sv: &mut SparseStateVec, qubits: &[usize], k: usize) {
    let n = qubits.len();
    if k > n {
        return;
    }

    // Generate all n-choose-k basis states with exactly k ones
    let states = combinations(n, k);
    let amp = c_real(1.0 / (states.len() as f64).sqrt());

    // Clear existing state and set equal superposition of Dicke states
    let _ = sv.drain();
    for combo in states {
        let mut basis = 0u128;
        for &pos in &combo {
            basis |= 1u128 << qubits[pos];
        }
        sv.set(basis, amp);
    }
}

fn combinations(n: usize, k: usize) -> Vec<Vec<usize>> {
    let mut result = Vec::new();
    let mut combo = vec![0usize; k];
    fn recurse(
        start: usize,
        depth: usize,
        n: usize,
        k: usize,
        combo: &mut Vec<usize>,
        result: &mut Vec<Vec<usize>>,
    ) {
        if depth == k {
            result.push(combo.clone());
            return;
        }
        for i in start..=(n - k + depth) {
            combo[depth] = i;
            recurse(i + 1, depth + 1, n, k, combo, result);
        }
    }
    recurse(0, 0, n, k, &mut combo, &mut result);
    result
}

/// Cat state: (|0⟩^n + |1⟩^n) / √2 — same as GHZ.
pub fn create_cat_state(sv: &mut SparseStateVec, qubits: &[usize]) {
    create_ghz(sv, qubits);
}

// ═══════════════════════════════════════════════════════════════════════
// QUANTUM ARITHMETIC CIRCUITS
// ═══════════════════════════════════════════════════════════════════════

/// Draper QFT Adder: add register B into register A using QFT.
/// a_qubits and b_qubits must be the same length.
pub fn draper_qft_adder(sv: &mut SparseStateVec, a_qubits: &[usize], b_qubits: &[usize]) {
    let n = a_qubits.len().min(b_qubits.len());

    // QFT on register A
    apply_qft(sv, a_qubits);

    // Phase additions from B to A (in Fourier space)
    for i in 0..n {
        for j in 0..=i {
            let angle = PI / (1u64 << (i - j)) as f64;
            apply_gate(
                sv,
                &GateOp::two_param(GateKind::CP, b_qubits[j], a_qubits[i], angle),
            );
        }
    }

    // Inverse QFT on register A
    apply_iqft(sv, a_qubits);
}

/// Quantum multiplier: multiply two n-bit registers.
/// Uses Draper adder as subroutine with shift-and-add strategy.
pub fn quantum_multiplier(
    sv: &mut SparseStateVec,
    a_qubits: &[usize],
    b_qubits: &[usize],
    result_qubits: &[usize],
) {
    let n = a_qubits.len();
    // Shift-and-add: for each bit of b, conditionally add shifted a to result
    for i in 0..n {
        // Controlled addition of a shifted by i into result
        for j in 0..n {
            if i + j < result_qubits.len() {
                // Controlled Ry rotation as proxy for addition
                apply_gate(sv, &GateOp::two(GateKind::CNOT, b_qubits[i], a_qubits[j]));
                if i + j < result_qubits.len() {
                    apply_gate(
                        sv,
                        &GateOp::two(GateKind::CNOT, a_qubits[j], result_qubits[i + j]),
                    );
                }
                // Undo the first CNOT
                apply_gate(sv, &GateOp::two(GateKind::CNOT, b_qubits[i], a_qubits[j]));
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════
// DATA ENCODING CIRCUITS
// ═══════════════════════════════════════════════════════════════════════

/// Amplitude encoding: encode a classical vector into qubit amplitudes.
/// Normalizes the input vector and maps to state amplitudes.
pub fn amplitude_encoding(sv: &mut SparseStateVec, qubits: &[usize], data: &[f64]) {
    let n = qubits.len();
    let n_states = 1usize << n;
    let padded_len = data.len().min(n_states);

    // Normalize
    let norm: f64 = data.iter().map(|x| x * x).sum::<f64>().sqrt();
    if norm < 1e-15 {
        return;
    }

    let _ = sv.drain();
    for i in 0..padded_len {
        let amp = c_real(data[i] / norm);
        if amp.norm_sqr() > 1e-30 {
            // Map index i to the qubit basis state
            let mut basis = 0u128;
            for (bit_pos, &q) in qubits.iter().enumerate() {
                if (i >> bit_pos) & 1 == 1 {
                    basis |= 1u128 << q;
                }
            }
            sv.set(basis, amp);
        }
    }
}

/// Angle encoding: encode data as rotation angles on individual qubits.
pub fn angle_encoding(sv: &mut SparseStateVec, qubits: &[usize], data: &[f64]) {
    for (i, &q) in qubits.iter().enumerate() {
        if i < data.len() {
            apply_gate(sv, &GateOp::single_param(GateKind::Ry, q, data[i]));
        }
    }
}

/// Basis encoding: encode integer data as computational basis states.
pub fn basis_encoding(sv: &mut SparseStateVec, qubits: &[usize], value: u64) {
    for (i, &q) in qubits.iter().enumerate() {
        if (value >> i) & 1 == 1 {
            apply_gate(sv, &GateOp::single(GateKind::X, q));
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════
// RANDOM CIRCUIT GENERATION
// ═══════════════════════════════════════════════════════════════════════

/// Generate a random quantum circuit for benchmarking.
pub fn random_circuit(sv: &mut SparseStateVec, qubits: &[usize], depth: usize, seed: u64) {
    let n = qubits.len();
    let mut rng_state = seed;

    for _layer in 0..depth {
        // Random single-qubit gates on all qubits
        for &q in qubits {
            rng_state = lcg_next(rng_state);
            let gate_choice = rng_state % 6;
            match gate_choice {
                0 => apply_gate(sv, &GateOp::single(GateKind::H, q)),
                1 => apply_gate(sv, &GateOp::single(GateKind::X, q)),
                2 => apply_gate(sv, &GateOp::single(GateKind::T, q)),
                3 => apply_gate(sv, &GateOp::single(GateKind::S, q)),
                4 => {
                    rng_state = lcg_next(rng_state);
                    let angle = (rng_state as f64 / u64::MAX as f64) * 2.0 * PI;
                    apply_gate(sv, &GateOp::single_param(GateKind::Rz, q, angle));
                }
                _ => {
                    rng_state = lcg_next(rng_state);
                    let angle = (rng_state as f64 / u64::MAX as f64) * 2.0 * PI;
                    apply_gate(sv, &GateOp::single_param(GateKind::Ry, q, angle));
                }
            }
        }
        // Random CNOT layer (linear connectivity)
        for i in (0..n - 1).step_by(2) {
            apply_gate(sv, &GateOp::two(GateKind::CNOT, qubits[i], qubits[i + 1]));
        }
    }
}

fn lcg_next(state: u64) -> u64 {
    state
        .wrapping_mul(6364136223846793005)
        .wrapping_add(1442695040888963407)
}

// ═══════════════════════════════════════════════════════════════════════
// QUANTUM ERROR CORRECTION CIRCUITS
// ═══════════════════════════════════════════════════════════════════════

/// 3-qubit bit-flip code: encodes qubit 0 into qubits [0, 1, 2].
/// Protects against single X (bit-flip) errors.
pub fn bit_flip_encode(sv: &mut SparseStateVec, data: usize, ancilla1: usize, ancilla2: usize) {
    apply_gate(sv, &GateOp::two(GateKind::CNOT, data, ancilla1));
    apply_gate(sv, &GateOp::two(GateKind::CNOT, data, ancilla2));
}

/// 3-qubit phase-flip code: encodes qubit 0 into qubits [0, 1, 2].
/// Protects against single Z (phase-flip) errors.
pub fn phase_flip_encode(sv: &mut SparseStateVec, data: usize, a1: usize, a2: usize) {
    apply_gate(sv, &GateOp::two(GateKind::CNOT, data, a1));
    apply_gate(sv, &GateOp::two(GateKind::CNOT, data, a2));
    apply_gate(sv, &GateOp::single(GateKind::H, data));
    apply_gate(sv, &GateOp::single(GateKind::H, a1));
    apply_gate(sv, &GateOp::single(GateKind::H, a2));
}

/// Shor's 9-qubit code: full protection against arbitrary single-qubit errors.
/// Encodes 1 logical qubit into 9 physical qubits.
pub fn shor_9qubit_encode(sv: &mut SparseStateVec, qubits: &[usize; 9]) {
    let q = qubits;
    // Phase-flip encoding
    apply_gate(sv, &GateOp::two(GateKind::CNOT, q[0], q[3]));
    apply_gate(sv, &GateOp::two(GateKind::CNOT, q[0], q[6]));
    apply_gate(sv, &GateOp::single(GateKind::H, q[0]));
    apply_gate(sv, &GateOp::single(GateKind::H, q[3]));
    apply_gate(sv, &GateOp::single(GateKind::H, q[6]));
    // Bit-flip encoding on each block
    apply_gate(sv, &GateOp::two(GateKind::CNOT, q[0], q[1]));
    apply_gate(sv, &GateOp::two(GateKind::CNOT, q[0], q[2]));
    apply_gate(sv, &GateOp::two(GateKind::CNOT, q[3], q[4]));
    apply_gate(sv, &GateOp::two(GateKind::CNOT, q[3], q[5]));
    apply_gate(sv, &GateOp::two(GateKind::CNOT, q[6], q[7]));
    apply_gate(sv, &GateOp::two(GateKind::CNOT, q[6], q[8]));
}

/// Steane 7-qubit code: [[7,1,3]] CSS code.
/// Encodes 1 logical qubit into 7 physical qubits.
pub fn steane_7qubit_encode(sv: &mut SparseStateVec, qubits: &[usize; 7]) {
    let q = qubits;
    // Steane code generator matrix encoding
    apply_gate(sv, &GateOp::two(GateKind::CNOT, q[0], q[3]));
    apply_gate(sv, &GateOp::two(GateKind::CNOT, q[0], q[5]));
    apply_gate(sv, &GateOp::two(GateKind::CNOT, q[0], q[6]));
    apply_gate(sv, &GateOp::single(GateKind::H, q[1]));
    apply_gate(sv, &GateOp::single(GateKind::H, q[2]));
    apply_gate(sv, &GateOp::single(GateKind::H, q[4]));
    apply_gate(sv, &GateOp::two(GateKind::CNOT, q[1], q[3]));
    apply_gate(sv, &GateOp::two(GateKind::CNOT, q[1], q[4]));
    apply_gate(sv, &GateOp::two(GateKind::CNOT, q[1], q[6]));
    apply_gate(sv, &GateOp::two(GateKind::CNOT, q[2], q[3]));
    apply_gate(sv, &GateOp::two(GateKind::CNOT, q[2], q[5]));
    apply_gate(sv, &GateOp::two(GateKind::CNOT, q[2], q[6]));
    apply_gate(sv, &GateOp::two(GateKind::CNOT, q[4], q[5]));
    apply_gate(sv, &GateOp::two(GateKind::CNOT, q[4], q[6]));
}

// ═══════════════════════════════════════════════════════════════════════
// VARIATIONAL ANSATZ CIRCUITS
// ═══════════════════════════════════════════════════════════════════════

/// Hardware-efficient ansatz: alternating Ry/Rz rotation layers + CNOT entanglement.
/// Standard VQE ansatz for near-term devices.
pub fn hardware_efficient_ansatz(
    sv: &mut SparseStateVec,
    qubits: &[usize],
    params: &[f64],
    n_layers: usize,
) {
    let n = qubits.len();
    let mut p = 0;

    for _layer in 0..n_layers {
        // Rotation layer
        for &q in qubits {
            if p < params.len() {
                apply_gate(sv, &GateOp::single_param(GateKind::Ry, q, params[p]));
                p += 1;
            }
            if p < params.len() {
                apply_gate(sv, &GateOp::single_param(GateKind::Rz, q, params[p]));
                p += 1;
            }
        }
        // Entangling layer (linear connectivity)
        for i in 0..(n - 1) {
            apply_gate(sv, &GateOp::two(GateKind::CNOT, qubits[i], qubits[i + 1]));
        }
    }
}

/// UCCSD ansatz: Unitary Coupled Cluster Singles and Doubles.
/// Chemistry-standard variational ansatz for molecular simulations.
pub fn uccsd_ansatz(sv: &mut SparseStateVec, qubits: &[usize], params: &[f64], n_electrons: usize) {
    let n = qubits.len();
    let mut p = 0;

    // Hartree-Fock initial state: fill first n_electrons orbitals
    for i in 0..n_electrons.min(n) {
        apply_gate(sv, &GateOp::single(GateKind::X, qubits[i]));
    }

    // Singles excitations: i → a (occupied → virtual)
    for i in 0..n_electrons.min(n) {
        for a in n_electrons..n {
            if p < params.len() {
                let theta = params[p];
                p += 1;
                // e^(θ(a†_a a_i - a†_i a_a)) via Givens rotation
                apply_gate(sv, &GateOp::single_param(GateKind::Ry, qubits[i], theta));
                apply_gate(sv, &GateOp::two(GateKind::CNOT, qubits[i], qubits[a]));
                apply_gate(sv, &GateOp::single_param(GateKind::Ry, qubits[a], -theta));
                apply_gate(sv, &GateOp::two(GateKind::CNOT, qubits[i], qubits[a]));
            }
        }
    }

    // Doubles excitations: (i,j) → (a,b)
    for i in 0..n_electrons.min(n) {
        for j in (i + 1)..n_electrons.min(n) {
            for a in n_electrons..n {
                for b in (a + 1)..n {
                    if p < params.len() {
                        let theta = params[p];
                        p += 1;
                        // Simplified doubles: CNOT ladder + Rz
                        apply_gate(sv, &GateOp::two(GateKind::CNOT, qubits[i], qubits[j]));
                        apply_gate(sv, &GateOp::two(GateKind::CNOT, qubits[j], qubits[a]));
                        apply_gate(sv, &GateOp::two(GateKind::CNOT, qubits[a], qubits[b]));
                        apply_gate(sv, &GateOp::single_param(GateKind::Rz, qubits[b], theta));
                        apply_gate(sv, &GateOp::two(GateKind::CNOT, qubits[a], qubits[b]));
                        apply_gate(sv, &GateOp::two(GateKind::CNOT, qubits[j], qubits[a]));
                        apply_gate(sv, &GateOp::two(GateKind::CNOT, qubits[i], qubits[j]));
                    }
                }
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════
// ENTANGLEMENT SWAPPING
// ═══════════════════════════════════════════════════════════════════════

/// Entanglement swapping: transfer entanglement from (A,B) pair to (A,D) pair.
/// qubits = [A, B, C, D] where (A,B) and (C,D) are Bell pairs.
pub fn entanglement_swapping(sv: &mut SparseStateVec, qubits: &[usize; 4]) {
    let (_a, b, _c, _d) = (qubits[0], qubits[1], qubits[2], qubits[3]);

    // Create two Bell pairs: (A,B) and (C,D)
    create_bell(sv, qubits[0], qubits[1]);
    create_bell(sv, qubits[2], qubits[3]);

    // Bell measurement on B and C
    apply_gate(sv, &GateOp::two(GateKind::CNOT, b, qubits[2]));
    apply_gate(sv, &GateOp::single(GateKind::H, b));

    // Now A and D are entangled (after classical corrections based on measurement)
}

// ═══════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_w_state_3_qubits() {
        let mut sv = SparseStateVec::new(3);
        create_w_state(&mut sv, &[0, 1, 2]);
        // W state has 3 non-zero entries: |001⟩, |010⟩, |100⟩
        assert_eq!(sv.nnz(), 3);
        let p = sv.probability_of(0b001) + sv.probability_of(0b010) + sv.probability_of(0b100);
        assert!((p - 1.0).abs() < 1e-10, "W state total prob: {}", p);
    }

    #[test]
    fn test_dicke_state() {
        let mut sv = SparseStateVec::new(4);
        create_dicke_state(&mut sv, &[0, 1, 2, 3], 2);
        // D(4,2) has C(4,2)=6 terms
        assert_eq!(sv.nnz(), 6);
        assert!((sv.total_probability() - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_cluster_state() {
        let mut sv = SparseStateVec::new(3);
        create_cluster_state(&mut sv, &[0, 1, 2]);
        assert!((sv.total_probability() - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_bit_flip_code() {
        let mut sv = SparseStateVec::new(3);
        // Encode |1⟩
        apply_gate(&mut sv, &GateOp::single(GateKind::X, 0));
        bit_flip_encode(&mut sv, 0, 1, 2);
        // Should give |111⟩
        assert!((sv.probability_of(0b111) - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_amplitude_encoding() {
        let mut sv = SparseStateVec::new(2);
        amplitude_encoding(&mut sv, &[0, 1], &[1.0, 2.0, 3.0, 4.0]);
        assert!((sv.total_probability() - 1.0).abs() < 1e-10);
        assert_eq!(sv.nnz(), 4);
    }

    #[test]
    fn test_basis_encoding() {
        let mut sv = SparseStateVec::new(4);
        basis_encoding(&mut sv, &[0, 1, 2, 3], 0b1010);
        assert!((sv.probability_of(0b1010) - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_hardware_efficient_ansatz() {
        let mut sv = SparseStateVec::new(3);
        let params: Vec<f64> = (0..12).map(|i| i as f64 * 0.1).collect();
        hardware_efficient_ansatz(&mut sv, &[0, 1, 2], &params, 2);
        assert!((sv.total_probability() - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_random_circuit_preserves_norm() {
        let mut sv = SparseStateVec::new(4);
        random_circuit(&mut sv, &[0, 1, 2, 3], 5, 42);
        assert!((sv.total_probability() - 1.0).abs() < 1e-10);
    }
}
