//! Named circuit templates for the Sansqrit DSL.
//!
//! The templates in this module provide a common representation for major
//! quantum circuit families. They are intentionally explicit: every template
//! returns gate operations where a native gate model exists, plus notes when a
//! real production implementation needs an oracle, qRAM, photonic primitive, or
//! fault-tolerant runtime outside the local sparse simulator.

use crate::engine::QuantumEngine;
use crate::gates::{GateKind, GateOp};
use serde::{Deserialize, Serialize};
use std::f64::consts::PI;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CircuitRegister {
    pub name: String,
    pub start: usize,
    pub len: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CircuitTemplate {
    pub name: String,
    pub family: String,
    pub n_qubits: usize,
    pub registers: Vec<CircuitRegister>,
    pub gates: Vec<GateOp>,
    pub measurements: Vec<usize>,
    pub parameters: Vec<String>,
    pub executable_native: bool,
    pub notes: Vec<String>,
}

impl CircuitTemplate {
    pub fn new(name: &str, family: &str, n_qubits: usize) -> Self {
        CircuitTemplate {
            name: name.to_string(),
            family: family.to_string(),
            n_qubits,
            registers: vec![CircuitRegister {
                name: "q".to_string(),
                start: 0,
                len: n_qubits,
            }],
            gates: Vec::new(),
            measurements: Vec::new(),
            parameters: Vec::new(),
            executable_native: true,
            notes: Vec::new(),
        }
    }

    pub fn with_registers(mut self, registers: Vec<CircuitRegister>) -> Self {
        self.registers = registers;
        self
    }

    pub fn with_measurements(mut self, measurements: Vec<usize>) -> Self {
        self.measurements = measurements;
        self
    }

    pub fn with_parameters(mut self, parameters: Vec<String>) -> Self {
        self.parameters = parameters;
        self
    }

    pub fn with_notes(mut self, notes: Vec<String>) -> Self {
        self.notes = notes;
        self
    }

    pub fn non_native(mut self) -> Self {
        self.executable_native = false;
        self
    }

    pub fn gate_count(&self) -> usize {
        self.gates.len()
    }

    pub fn two_qubit_gate_count(&self) -> usize {
        self.gates
            .iter()
            .filter(|gate| gate.qubits.len() == 2)
            .count()
    }
}

pub fn apply_circuit_template(
    engine: &mut QuantumEngine,
    template: &CircuitTemplate,
) -> Result<(), String> {
    if engine.n_qubits() < template.n_qubits {
        return Err(format!(
            "Circuit '{}' requires {} qubits but active engine has {}.",
            template.name,
            template.n_qubits,
            engine.n_qubits()
        ));
    }

    for gate in &template.gates {
        engine.apply(gate.clone());
    }
    Ok(())
}

fn reg(name: &str, start: usize, len: usize) -> CircuitRegister {
    CircuitRegister {
        name: name.to_string(),
        start,
        len,
    }
}

fn qubits(n: usize) -> Vec<usize> {
    (0..n).collect()
}

fn h(q: usize) -> GateOp {
    GateOp::single(GateKind::H, q)
}

fn x(q: usize) -> GateOp {
    GateOp::single(GateKind::X, q)
}

fn z(q: usize) -> GateOp {
    GateOp::single(GateKind::Z, q)
}

fn rx(q: usize, theta: f64) -> GateOp {
    GateOp::single_param(GateKind::Rx, q, theta)
}

fn ry(q: usize, theta: f64) -> GateOp {
    GateOp::single_param(GateKind::Ry, q, theta)
}

fn rz(q: usize, theta: f64) -> GateOp {
    GateOp::single_param(GateKind::Rz, q, theta)
}

fn cnot(c: usize, t: usize) -> GateOp {
    GateOp::two(GateKind::CNOT, c, t)
}

fn cz(a: usize, b: usize) -> GateOp {
    GateOp::two(GateKind::CZ, a, b)
}

fn swap(a: usize, b: usize) -> GateOp {
    GateOp::two(GateKind::SWAP, a, b)
}

fn cp(c: usize, t: usize, theta: f64) -> GateOp {
    GateOp::two_param(GateKind::CP, c, t, theta)
}

fn rzz(a: usize, b: usize, theta: f64) -> GateOp {
    GateOp::two_param(GateKind::RZZ, a, b, theta)
}

fn rxx(a: usize, b: usize, theta: f64) -> GateOp {
    GateOp::two_param(GateKind::RXX, a, b, theta)
}

fn ryy(a: usize, b: usize, theta: f64) -> GateOp {
    GateOp::two_param(GateKind::RYY, a, b, theta)
}

fn toffoli(a: usize, b: usize, c: usize) -> GateOp {
    GateOp::three(GateKind::Toffoli, a, b, c)
}

fn fredkin(c: usize, a: usize, b: usize) -> GateOp {
    GateOp::three(GateKind::Fredkin, c, a, b)
}

fn all_controlled_z(register: &[usize]) -> Option<GateOp> {
    match register.len() {
        0 => None,
        1 => Some(z(register[0])),
        2 => Some(cz(register[0], register[1])),
        3 => Some(GateOp::three(
            GateKind::CCZ,
            register[0],
            register[1],
            register[2],
        )),
        _ => Some(GateOp::multi(GateKind::MCZ, register.to_vec())),
    }
}

fn qft_gates(register: &[usize]) -> Vec<GateOp> {
    let n = register.len();
    let mut gates = Vec::new();
    for i in 0..n {
        gates.push(h(register[i]));
        for j in (i + 1)..n {
            let angle = PI / (1u64 << (j - i)) as f64;
            gates.push(cp(register[j], register[i], angle));
        }
    }
    for i in 0..(n / 2) {
        gates.push(swap(register[i], register[n - 1 - i]));
    }
    gates
}

fn inverse_qft_gates(register: &[usize]) -> Vec<GateOp> {
    let n = register.len();
    let mut gates = Vec::new();
    for i in 0..(n / 2) {
        gates.push(swap(register[i], register[n - 1 - i]));
    }
    for i in (0..n).rev() {
        for j in ((i + 1)..n).rev() {
            let angle = -PI / (1u64 << (j - i)) as f64;
            gates.push(cp(register[j], register[i], angle));
        }
        gates.push(h(register[i]));
    }
    gates
}

fn marked_state_oracle_gates(n_qubits: usize, target: u64) -> Vec<GateOp> {
    let register = qubits(n_qubits);
    let mut gates = Vec::new();
    for q in 0..n_qubits {
        if ((target >> q) & 1) == 0 {
            gates.push(x(q));
        }
    }
    if let Some(phase) = all_controlled_z(&register) {
        gates.push(phase);
    }
    for q in 0..n_qubits {
        if ((target >> q) & 1) == 0 {
            gates.push(x(q));
        }
    }
    gates
}

fn diffusion_gates(n_qubits: usize) -> Vec<GateOp> {
    let register = qubits(n_qubits);
    let mut gates = Vec::new();
    gates.extend(register.iter().map(|&q| h(q)));
    gates.extend(register.iter().map(|&q| x(q)));
    if let Some(phase) = all_controlled_z(&register) {
        gates.push(phase);
    }
    gates.extend(register.iter().map(|&q| x(q)));
    gates.extend(register.iter().map(|&q| h(q)));
    gates
}

pub fn bell_state_circuit() -> CircuitTemplate {
    let mut template =
        CircuitTemplate::new("bell_state", "state_preparation", 2).with_measurements(vec![0, 1]);
    template.gates = vec![h(0), cnot(0, 1)];
    template
}

pub fn ghz_state_circuit(n_qubits: usize) -> CircuitTemplate {
    let n = n_qubits.max(2);
    let mut template =
        CircuitTemplate::new("ghz_state", "state_preparation", n).with_measurements(qubits(n));
    template.gates.push(h(0));
    for q in 1..n {
        template.gates.push(cnot(0, q));
    }
    template
}

pub fn qft_circuit(n_qubits: usize) -> CircuitTemplate {
    let n = n_qubits.max(1);
    let mut template =
        CircuitTemplate::new("qft", "subroutine", n).with_parameters(vec!["register".to_string()]);
    template.gates = qft_gates(&qubits(n));
    template
}

pub fn qpe_circuit(n_counting_bits: usize, unitary_angle: f64) -> CircuitTemplate {
    let count = n_counting_bits.max(1);
    let target = count;
    let mut template = CircuitTemplate::new("quantum_phase_estimation", "subroutine", count + 1)
        .with_registers(vec![
            reg("counting", 0, count),
            reg("eigenstate", target, 1),
        ])
        .with_measurements((0..count).collect())
        .with_parameters(vec!["unitary_angle".to_string()]);
    template.gates.push(x(target));
    for q in 0..count {
        template.gates.push(h(q));
    }
    for k in 0..count {
        template
            .gates
            .push(cp(k, target, unitary_angle * (1u64 << k) as f64));
    }
    template
        .gates
        .extend(inverse_qft_gates(&(0..count).collect::<Vec<_>>()));
    template
}

pub fn amplitude_amplification_circuit(
    n_qubits: usize,
    target: u64,
    iterations: usize,
) -> CircuitTemplate {
    let n = n_qubits.max(1);
    let max_target = if n >= 63 { u64::MAX } else { (1u64 << n) - 1 };
    let safe_target = target.min(max_target);
    let mut template = CircuitTemplate::new("amplitude_amplification", "oracular", n)
        .with_measurements(qubits(n))
        .with_parameters(vec![
            "oracle".to_string(),
            "target".to_string(),
            "iterations".to_string(),
        ]);
    for q in 0..n {
        template.gates.push(h(q));
    }
    for _ in 0..iterations.max(1) {
        template
            .gates
            .extend(marked_state_oracle_gates(n, safe_target));
        template.gates.extend(diffusion_gates(n));
    }
    template
}

pub fn grover_circuit(n_qubits: usize, target: u64, iterations: usize) -> CircuitTemplate {
    let mut template = amplitude_amplification_circuit(n_qubits, target, iterations);
    template.name = "grover_search".to_string();
    template.notes.push(
        "Grover circuit uses a marked computational-basis oracle and diffusion operator."
            .to_string(),
    );
    template
}

pub fn vqe_ansatz_circuit(n_qubits: usize, layers: usize) -> CircuitTemplate {
    hardware_efficient_ansatz_circuit(n_qubits, layers).with_notes(vec![
        "Use this ansatz inside a classical optimizer for VQE.".to_string(),
    ])
}

pub fn qaoa_circuit(n_qubits: usize, edges: &[(usize, usize)], layers: usize) -> CircuitTemplate {
    let n = n_qubits.max(1);
    let p = layers.max(1);
    let safe_edges = if edges.is_empty() {
        (0..n.saturating_sub(1))
            .map(|i| (i, i + 1))
            .collect::<Vec<_>>()
    } else {
        edges
            .iter()
            .copied()
            .filter(|(a, b)| *a < n && *b < n && a != b)
            .collect::<Vec<_>>()
    };
    let mut template = CircuitTemplate::new("qaoa_maxcut", "variational", n)
        .with_measurements(qubits(n))
        .with_parameters(vec!["gamma[layer]".to_string(), "beta[layer]".to_string()]);
    for q in 0..n {
        template.gates.push(h(q));
    }
    for layer in 0..p {
        let gamma = 0.7 + layer as f64 * 0.05;
        let beta = 0.35 + layer as f64 * 0.03;
        for &(a, b) in &safe_edges {
            template.gates.push(rzz(a, b, gamma));
        }
        for q in 0..n {
            template.gates.push(rx(q, 2.0 * beta));
        }
    }
    template
}

pub fn bernstein_vazirani_circuit(secret: &[u8]) -> CircuitTemplate {
    let n = secret.len().max(1);
    let ancilla = n;
    let mut template = CircuitTemplate::new("bernstein_vazirani", "oracular", n + 1)
        .with_registers(vec![reg("input", 0, n), reg("ancilla", ancilla, 1)])
        .with_measurements((0..n).collect())
        .with_parameters(vec!["secret_bitstring".to_string()]);
    template.gates.push(x(ancilla));
    template.gates.push(h(ancilla));
    for q in 0..n {
        template.gates.push(h(q));
    }
    for (q, bit) in secret.iter().enumerate() {
        if *bit == 1 {
            template.gates.push(cnot(q, ancilla));
        }
    }
    for q in 0..n {
        template.gates.push(h(q));
    }
    template
}

pub fn deutsch_jozsa_circuit(n_bits: usize, oracle_type: &str) -> CircuitTemplate {
    let n = n_bits.max(1);
    let ancilla = n;
    let mut template = CircuitTemplate::new("deutsch_jozsa", "oracular", n + 1)
        .with_registers(vec![reg("input", 0, n), reg("ancilla", ancilla, 1)])
        .with_measurements((0..n).collect())
        .with_parameters(vec!["oracle_type".to_string()]);
    template.gates.push(x(ancilla));
    template.gates.push(h(ancilla));
    for q in 0..n {
        template.gates.push(h(q));
    }
    match oracle_type {
        "constant_0" => {}
        "constant_1" => template.gates.push(x(ancilla)),
        _ => {
            for q in 0..n {
                template.gates.push(cnot(q, ancilla));
            }
        }
    }
    for q in 0..n {
        template.gates.push(h(q));
    }
    template
}

pub fn teleportation_circuit() -> CircuitTemplate {
    let mut template = CircuitTemplate::new("quantum_teleportation", "communication", 3)
        .with_registers(vec![reg("message", 0, 1), reg("bell_pair", 1, 2)])
        .with_measurements(vec![0, 1])
        .with_notes(vec![
            "Classical feed-forward applies X/Z corrections to qubit 2 after measuring qubits 0 and 1."
                .to_string(),
        ]);
    template.gates = vec![h(1), cnot(1, 2), cnot(0, 1), h(0)];
    template
}

pub fn superdense_coding_circuit(bit0: u8, bit1: u8) -> CircuitTemplate {
    let mut template = CircuitTemplate::new("superdense_coding", "communication", 2)
        .with_measurements(vec![0, 1])
        .with_parameters(vec!["bit0".to_string(), "bit1".to_string()]);
    template.gates = vec![h(0), cnot(0, 1)];
    if bit1 == 1 {
        template.gates.push(x(0));
    }
    if bit0 == 1 {
        template.gates.push(z(0));
    }
    template.gates.push(cnot(0, 1));
    template.gates.push(h(0));
    template
}

pub fn bit_flip_code_circuit() -> CircuitTemplate {
    let mut template = CircuitTemplate::new("bit_flip_code", "fault_tolerant", 3)
        .with_registers(vec![reg("data", 0, 1), reg("redundant", 1, 2)])
        .with_measurements(vec![0, 1, 2]);
    template.gates = vec![cnot(0, 1), cnot(0, 2)];
    template
}

pub fn phase_flip_code_circuit() -> CircuitTemplate {
    let mut template = CircuitTemplate::new("phase_flip_code", "fault_tolerant", 3)
        .with_registers(vec![reg("data", 0, 1), reg("redundant", 1, 2)])
        .with_measurements(vec![0, 1, 2]);
    template.gates = vec![cnot(0, 1), cnot(0, 2), h(0), h(1), h(2)];
    template
}

pub fn shor_9qubit_code_circuit() -> CircuitTemplate {
    let mut template = CircuitTemplate::new("shor_9qubit_code", "fault_tolerant", 9)
        .with_registers(vec![reg("logical", 0, 1), reg("physical", 0, 9)])
        .with_measurements((0..9).collect());
    template.gates = vec![
        cnot(0, 3),
        cnot(0, 6),
        h(0),
        h(3),
        h(6),
        cnot(0, 1),
        cnot(0, 2),
        cnot(3, 4),
        cnot(3, 5),
        cnot(6, 7),
        cnot(6, 8),
    ];
    template
}

pub fn steane_code_circuit() -> CircuitTemplate {
    let mut template = CircuitTemplate::new("steane_7qubit_code", "fault_tolerant", 7)
        .with_registers(vec![reg("logical", 0, 1), reg("physical", 0, 7)])
        .with_measurements((0..7).collect());
    template.gates = vec![
        cnot(0, 3),
        cnot(0, 5),
        cnot(0, 6),
        h(1),
        h(2),
        h(4),
        cnot(1, 3),
        cnot(1, 4),
        cnot(1, 6),
        cnot(2, 3),
        cnot(2, 5),
        cnot(2, 6),
        cnot(4, 5),
        cnot(4, 6),
    ];
    template
}

pub fn surface_code_circuit(distance: usize, rounds: usize) -> CircuitTemplate {
    let d = distance.max(3);
    let data = d * d;
    let x_ancillas = (d - 1) * (d - 1);
    let z_ancillas = (d - 1) * (d - 1);
    let x_start = data;
    let z_start = data + x_ancillas;
    let mut template = CircuitTemplate::new(
        "surface_code",
        "fault_tolerant",
        data + x_ancillas + z_ancillas,
    )
    .with_registers(vec![
        reg("data", 0, data),
        reg("x_syndrome", x_start, x_ancillas),
        reg("z_syndrome", z_start, z_ancillas),
    ])
    .with_measurements((data..(data + x_ancillas + z_ancillas)).collect())
    .with_parameters(vec!["distance".to_string(), "rounds".to_string()])
    .with_notes(vec![
        "Surface-code template builds syndrome-extraction rounds on a square patch.".to_string(),
        "Production decoding should use detector sampling plus MWPM/union-find decoders."
            .to_string(),
    ]);
    let rounds = rounds.max(1);
    for _ in 0..rounds {
        for a in 0..x_ancillas {
            let anc = x_start + a;
            template.gates.push(h(anc));
            let row = a / (d - 1);
            let col = a % (d - 1);
            for (r, c) in [
                (row, col),
                (row + 1, col),
                (row, col + 1),
                (row + 1, col + 1),
            ] {
                template.gates.push(cnot(anc, r * d + c));
            }
            template.gates.push(h(anc));
        }
        for a in 0..z_ancillas {
            let anc = z_start + a;
            let row = a / (d - 1);
            let col = a % (d - 1);
            for (r, c) in [
                (row, col),
                (row + 1, col),
                (row, col + 1),
                (row + 1, col + 1),
            ] {
                template.gates.push(cnot(r * d + c, anc));
            }
        }
    }
    template
}

pub fn qec_circuit(code: &str, distance: usize) -> CircuitTemplate {
    match code.to_ascii_lowercase().as_str() {
        "phase" | "phase_flip" => phase_flip_code_circuit(),
        "shor" | "shor9" | "shor_9" | "shor_9qubit" => shor_9qubit_code_circuit(),
        "steane" | "steane7" | "steane_7" => steane_code_circuit(),
        "surface" | "surface_code" => surface_code_circuit(distance, distance),
        _ => bit_flip_code_circuit(),
    }
}

pub fn shor_factoring_circuit(n: u64) -> CircuitTemplate {
    let bits = (u64::BITS - n.max(2).leading_zeros()) as usize;
    let count = (2 * bits).max(4);
    let work = bits.max(2);
    let mut template = CircuitTemplate::new("shor_factoring", "algebraic", count + work)
        .with_registers(vec![reg("counting", 0, count), reg("work", count, work)])
        .with_measurements((0..count).collect())
        .with_parameters(vec!["N".to_string(), "modular_exponentiation".to_string()])
        .with_notes(vec![
            "Template includes counting register, modular-exponentiation placeholder, and inverse QFT."
                .to_string(),
            "Exact large-N modular exponentiation must be synthesized from reversible arithmetic."
                .to_string(),
        ]);
    for q in 0..count {
        template.gates.push(h(q));
    }
    template.gates.push(x(count));
    for k in 0..count {
        template
            .gates
            .push(cp(k, count + (k % work), PI / (k + 1) as f64));
    }
    template
        .gates
        .extend(inverse_qft_gates(&(0..count).collect::<Vec<_>>()));
    template
}

pub fn hhl_circuit() -> CircuitTemplate {
    let mut template = CircuitTemplate::new("hhl", "algebraic", 4)
        .with_registers(vec![reg("state", 0, 1), reg("phase", 1, 2), reg("ancilla", 3, 1)])
        .with_measurements(vec![0, 3])
        .with_parameters(vec!["matrix_block_encoding".to_string()])
        .with_notes(vec![
            "Small HHL template: prepare |b>, estimate eigenvalues, rotate an ancilla, uncompute QPE."
                .to_string(),
        ]);
    template.gates = vec![
        h(0),
        h(1),
        h(2),
        cp(1, 0, PI / 2.0),
        cp(2, 0, PI),
        ry(3, PI / 4.0),
    ];
    template.gates.extend(inverse_qft_gates(&[1, 2]));
    template.gates.extend(qft_gates(&[1, 2]));
    template.gates.push(cp(2, 0, -PI));
    template.gates.push(cp(1, 0, -PI / 2.0));
    template
}

pub fn swap_test_circuit(register_qubits: usize) -> CircuitTemplate {
    let n = register_qubits.max(1);
    let mut template = CircuitTemplate::new("swap_test", "utility", 2 * n + 1)
        .with_registers(vec![
            reg("ancilla", 0, 1),
            reg("left", 1, n),
            reg("right", n + 1, n),
        ])
        .with_measurements(vec![0]);
    template.gates.push(h(0));
    for i in 0..n {
        template.gates.push(fredkin(0, 1 + i, n + 1 + i));
    }
    template.gates.push(h(0));
    template
}

pub fn hardware_efficient_ansatz_circuit(n_qubits: usize, layers: usize) -> CircuitTemplate {
    let n = n_qubits.max(1);
    let depth = layers.max(1);
    let mut template = CircuitTemplate::new("hardware_efficient_ansatz", "nisq", n)
        .with_parameters(vec![
            "theta[layer][qubit]".to_string(),
            "phi[layer][qubit]".to_string(),
        ]);
    for layer in 0..depth {
        for q in 0..n {
            template.gates.push(ry(q, 0.1 * (layer + q + 1) as f64));
            template.gates.push(rz(q, 0.05 * (layer + q + 1) as f64));
        }
        for q in 0..n.saturating_sub(1) {
            template.gates.push(cnot(q, q + 1));
        }
    }
    template
}

pub fn vqc_circuit(n_features: usize, layers: usize) -> CircuitTemplate {
    let n = n_features.max(1);
    let mut template =
        CircuitTemplate::new("variational_quantum_classifier", "machine_learning", n)
            .with_measurements(vec![0])
            .with_parameters(vec!["features".to_string(), "weights".to_string()]);
    for q in 0..n {
        template.gates.push(ry(q, 0.25 * (q + 1) as f64));
    }
    template
        .gates
        .extend(hardware_efficient_ansatz_circuit(n, layers).gates);
    template
}

pub fn qnn_circuit(n_qubits: usize, layers: usize) -> CircuitTemplate {
    let n = n_qubits.max(1);
    let depth = layers.max(1);
    let mut template = CircuitTemplate::new("quantum_neural_network", "machine_learning", n)
        .with_measurements(vec![0])
        .with_parameters(vec![
            "input_features".to_string(),
            "trainable_weights".to_string(),
        ]);
    for layer in 0..depth {
        for q in 0..n {
            template.gates.push(ry(q, 0.2 * (layer + 1) as f64));
            template.gates.push(rz(q, 0.13 * (q + 1) as f64));
        }
        for q in 0..n {
            template.gates.push(cz(q, (q + 1) % n));
        }
    }
    template
}

pub fn data_reuploading_circuit(n_features: usize, layers: usize) -> CircuitTemplate {
    let n = n_features.max(1);
    let mut template = CircuitTemplate::new("data_reuploading", "machine_learning", n)
        .with_parameters(vec![
            "features_per_layer".to_string(),
            "weights".to_string(),
        ]);
    for layer in 0..layers.max(1) {
        for q in 0..n {
            template.gates.push(ry(q, 0.17 * (layer + q + 1) as f64));
            template.gates.push(rz(q, 0.11 * (layer + q + 1) as f64));
        }
        for q in 0..n.saturating_sub(1) {
            template.gates.push(cnot(q, q + 1));
        }
    }
    template
}

pub fn quantum_kernel_estimation_circuit(n_features: usize) -> CircuitTemplate {
    let n = n_features.max(1);
    let mut template = CircuitTemplate::new("quantum_kernel_estimation", "machine_learning", n)
        .with_measurements(qubits(n))
        .with_parameters(vec!["x".to_string(), "y".to_string()])
        .with_notes(vec![
            "Applies feature map for x followed by inverse-like feature map for y; all-zero probability estimates kernel overlap."
                .to_string(),
        ]);
    for q in 0..n {
        template.gates.push(ry(q, 0.2 * (q + 1) as f64));
        template.gates.push(rz(q, 0.1 * (q + 1) as f64));
    }
    for q in 0..n.saturating_sub(1) {
        template.gates.push(cz(q, q + 1));
    }
    for q in (0..n).rev() {
        template.gates.push(rz(q, -0.12 * (q + 1) as f64));
        template.gates.push(ry(q, -0.22 * (q + 1) as f64));
    }
    template
}

pub fn quantum_walk_circuit(kind: &str, n_positions: usize, steps: usize) -> CircuitTemplate {
    match kind.to_ascii_lowercase().as_str() {
        "ctqw" | "continuous" => ctqw_circuit(n_positions, steps),
        "szegedy" => szegedy_walk_circuit(n_positions, steps),
        _ => dtqw_circuit(n_positions, steps),
    }
}

pub fn dtqw_circuit(n_positions: usize, steps: usize) -> CircuitTemplate {
    let pos = n_positions.max(2);
    let position_bits = ((pos - 1).ilog2() + 1) as usize;
    let coin = position_bits;
    let mut template = CircuitTemplate::new(
        "discrete_time_quantum_walk",
        "walk_based",
        position_bits + 1,
    )
    .with_registers(vec![
        reg("position", 0, position_bits),
        reg("coin", coin, 1),
    ])
    .with_measurements((0..position_bits).collect());
    for _ in 0..steps.max(1) {
        template.gates.push(h(coin));
        for q in 0..position_bits {
            template.gates.push(cnot(coin, q));
        }
    }
    template
}

pub fn ctqw_circuit(n_nodes: usize, trotter_steps: usize) -> CircuitTemplate {
    let n = n_nodes.max(2);
    let mut template = CircuitTemplate::new("continuous_time_quantum_walk", "walk_based", n)
        .with_measurements(qubits(n))
        .with_parameters(vec!["graph_adjacency".to_string(), "time".to_string()]);
    for _ in 0..trotter_steps.max(1) {
        for q in 0..n.saturating_sub(1) {
            template.gates.push(rxx(q, q + 1, 0.2));
            template.gates.push(ryy(q, q + 1, 0.2));
        }
    }
    template
}

pub fn szegedy_walk_circuit(n_nodes: usize, steps: usize) -> CircuitTemplate {
    let n = n_nodes.max(2);
    let mut template = CircuitTemplate::new("szegedy_walk", "walk_based", 2 * n)
        .with_registers(vec![reg("left", 0, n), reg("right", n, n)])
        .with_measurements((0..(2 * n)).collect())
        .with_parameters(vec!["transition_matrix".to_string()]);
    for _ in 0..steps.max(1) {
        for q in 0..n {
            template.gates.push(h(q));
            template.gates.push(cnot(q, n + q));
        }
        for q in 0..n {
            template.gates.push(swap(q, n + q));
        }
    }
    template
}

pub fn quantum_counting_circuit(n_search_bits: usize, n_counting_bits: usize) -> CircuitTemplate {
    let search = n_search_bits.max(1);
    let counting = n_counting_bits.max(1);
    let mut template = CircuitTemplate::new("quantum_counting", "oracular", search + counting)
        .with_registers(vec![
            reg("counting", 0, counting),
            reg("search", counting, search),
        ])
        .with_measurements((0..counting).collect())
        .with_parameters(vec!["grover_operator".to_string()]);
    for q in 0..counting {
        template.gates.push(h(q));
    }
    for q in counting..(counting + search) {
        template.gates.push(h(q));
    }
    for c in 0..counting {
        template
            .gates
            .push(cp(c, counting + (c % search), PI / (c + 1) as f64));
    }
    template
        .gates
        .extend(inverse_qft_gates(&(0..counting).collect::<Vec<_>>()));
    template
}

pub fn element_distinctness_circuit(items: usize) -> CircuitTemplate {
    let n = items.max(2);
    let mut template = CircuitTemplate::new("element_distinctness", "search_optimization", n + 1)
        .with_registers(vec![reg("items", 0, n), reg("flag", n, 1)])
        .with_measurements(vec![n])
        .with_notes(vec![
            "Comparator oracle is represented by pairwise Toffoli checks into a flag qubit."
                .to_string(),
        ]);
    for i in 0..n {
        template.gates.push(h(i));
    }
    for i in 0..n {
        for j in (i + 1)..n {
            template.gates.push(toffoli(i, j, n));
        }
    }
    template
}

pub fn triangle_finding_circuit(n_nodes: usize) -> CircuitTemplate {
    let n = n_nodes.max(3);
    let edge_bits = n * (n - 1) / 2;
    let flag = edge_bits;
    let mut template =
        CircuitTemplate::new("triangle_finding", "search_optimization", edge_bits + 1)
            .with_registers(vec![
                reg("edges", 0, edge_bits),
                reg("triangle_flag", flag, 1),
            ])
            .with_measurements(vec![flag]);
    for q in 0..edge_bits {
        template.gates.push(h(q));
    }
    let mut edge = 0;
    for _a in 0..n {
        for _b in 0..n {
            if edge + 2 < edge_bits {
                template.gates.push(toffoli(edge, edge + 1, flag));
                template.gates.push(cnot(edge + 2, flag));
                edge += 1;
            }
        }
    }
    template
}

pub fn block_encoding_circuit(system_qubits: usize) -> CircuitTemplate {
    let system = system_qubits.max(1);
    let ancilla = system;
    let mut template = CircuitTemplate::new("block_encoding", "linear_algebra", system + 1)
        .with_registers(vec![reg("system", 0, system), reg("ancilla", ancilla, 1)])
        .with_measurements(vec![ancilla])
        .with_parameters(vec!["matrix_oracle".to_string()]);
    template.gates.push(h(ancilla));
    for q in 0..system {
        template.gates.push(cp(ancilla, q, PI / (q + 2) as f64));
    }
    template.gates.push(h(ancilla));
    template
}

pub fn qsp_circuit(system_qubits: usize, phases: &[f64]) -> CircuitTemplate {
    let system = system_qubits.max(1);
    let signal = system;
    let phase_list = if phases.is_empty() {
        vec![0.0, PI / 4.0, PI / 2.0]
    } else {
        phases.to_vec()
    };
    let mut template =
        CircuitTemplate::new("quantum_signal_processing", "linear_algebra", system + 1)
            .with_registers(vec![reg("system", 0, system), reg("signal", signal, 1)])
            .with_parameters(vec!["phases".to_string(), "block_encoding".to_string()]);
    for (i, phase) in phase_list.iter().enumerate() {
        template.gates.push(rz(signal, *phase));
        template.gates.push(cp(signal, i % system, PI / 3.0));
    }
    template
}

pub fn qsvt_circuit(system_qubits: usize, phases: &[f64]) -> CircuitTemplate {
    let mut template = qsp_circuit(system_qubits, phases);
    template.name = "quantum_singular_value_transformation".to_string();
    template
        .notes
        .push("QSVT template alternates signal rotations with block-encoding calls.".to_string());
    template
}

pub fn boson_sampling_circuit(modes: usize, depth: usize) -> CircuitTemplate {
    let n = modes.max(2);
    let mut template = CircuitTemplate::new("boson_sampling", "hardware_specific", n)
        .with_measurements(qubits(n))
        .with_notes(vec![
            "Photonic beamsplitters are represented with RXX/RYY-style two-mode mixers for simulator planning."
                .to_string(),
        ]);
    for layer in 0..depth.max(1) {
        for q in (layer % 2..n.saturating_sub(1)).step_by(2) {
            template.gates.push(rxx(q, q + 1, PI / 4.0));
            template.gates.push(ryy(q, q + 1, PI / 4.0));
        }
    }
    template
}

pub fn braiding_circuit(anyons: usize, exchanges: usize) -> CircuitTemplate {
    let n = anyons.max(2);
    let mut template = CircuitTemplate::new("topological_braiding", "hardware_specific", n)
        .with_notes(vec![
            "Topological braids are represented as exchange/SWAP skeletons plus statistical phases."
                .to_string(),
        ]);
    for i in 0..exchanges.max(1) {
        let a = i % (n - 1);
        template.gates.push(swap(a, a + 1));
        template.gates.push(rz(a + 1, PI / 8.0));
    }
    template
}

pub fn mbqc_cluster_circuit(width: usize, depth: usize) -> CircuitTemplate {
    let w = width.max(2);
    let d = depth.max(2);
    let n = w * d;
    let mut template = CircuitTemplate::new("measurement_based_cluster", "hardware_specific", n)
        .with_measurements(qubits(n))
        .with_notes(vec![
            "MBQC starts from a 2D cluster state; computation is controlled by adaptive measurements."
                .to_string(),
        ]);
    for q in 0..n {
        template.gates.push(h(q));
    }
    for row in 0..d {
        for col in 0..w {
            let q = row * w + col;
            if col + 1 < w {
                template.gates.push(cz(q, q + 1));
            }
            if row + 1 < d {
                template.gates.push(cz(q, q + w));
            }
        }
    }
    template
}

pub fn circuit_family_catalog() -> Vec<CircuitTemplate> {
    vec![
        bell_state_circuit(),
        ghz_state_circuit(3),
        qft_circuit(3),
        qpe_circuit(3, PI / 4.0),
        amplitude_amplification_circuit(3, 5, 1),
        grover_circuit(3, 5, 1),
        vqe_ansatz_circuit(4, 2),
        qaoa_circuit(4, &[(0, 1), (1, 2), (2, 3)], 1),
        bernstein_vazirani_circuit(&[1, 0, 1]),
        deutsch_jozsa_circuit(3, "balanced"),
        teleportation_circuit(),
        superdense_coding_circuit(1, 0),
        bit_flip_code_circuit(),
        phase_flip_code_circuit(),
        shor_9qubit_code_circuit(),
        steane_code_circuit(),
        surface_code_circuit(3, 1),
        shor_factoring_circuit(15),
        hhl_circuit(),
        swap_test_circuit(1),
        vqc_circuit(3, 2),
        qnn_circuit(3, 2),
        dtqw_circuit(4, 2),
        ctqw_circuit(4, 2),
        szegedy_walk_circuit(3, 1),
        element_distinctness_circuit(4),
        triangle_finding_circuit(4),
        quantum_counting_circuit(3, 3),
        block_encoding_circuit(2),
        qsp_circuit(2, &[0.0, PI / 4.0]),
        qsvt_circuit(2, &[0.0, PI / 4.0]),
        hardware_efficient_ansatz_circuit(3, 2),
        data_reuploading_circuit(3, 2),
        quantum_kernel_estimation_circuit(3),
        boson_sampling_circuit(4, 2),
        braiding_circuit(4, 3),
        mbqc_cluster_circuit(2, 3),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn requested_circuits_are_available() {
        let catalog = circuit_family_catalog();
        let names = catalog.iter().map(|c| c.name.as_str()).collect::<Vec<_>>();
        for required in [
            "bell_state",
            "ghz_state",
            "qft",
            "quantum_phase_estimation",
            "grover_search",
            "qaoa_maxcut",
            "surface_code",
            "steane_7qubit_code",
            "shor_factoring",
            "hhl",
            "variational_quantum_classifier",
            "quantum_neural_network",
            "quantum_singular_value_transformation",
        ] {
            assert!(names.contains(&required), "missing {required}");
        }
    }

    #[test]
    fn bell_template_executes_on_engine() {
        let template = bell_state_circuit();
        let mut engine = QuantumEngine::new(template.n_qubits);
        apply_circuit_template(&mut engine, &template).unwrap();
        assert_eq!(engine.nnz(), 2);
    }
}
