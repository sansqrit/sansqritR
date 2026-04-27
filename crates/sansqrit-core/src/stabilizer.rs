//! Native stabilizer tracker for Clifford circuits.

use crate::gates::{GateKind, GateOp};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Pauli {
    I,
    X,
    Y,
    Z,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StabilizerGenerator {
    pub sign: i8,
    pub paulis: Vec<Pauli>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StabilizerEngine {
    pub n_qubits: usize,
    pub generators: Vec<StabilizerGenerator>,
    pub unsupported_gates: Vec<String>,
}

impl StabilizerEngine {
    pub fn new(n_qubits: usize) -> Self {
        let generators = (0..n_qubits)
            .map(|q| {
                let mut paulis = vec![Pauli::I; n_qubits];
                paulis[q] = Pauli::Z;
                StabilizerGenerator { sign: 1, paulis }
            })
            .collect();
        StabilizerEngine {
            n_qubits,
            generators,
            unsupported_gates: Vec::new(),
        }
    }

    pub fn apply(&mut self, gate: &GateOp) {
        if !is_supported_clifford(gate.kind) {
            self.unsupported_gates.push(format!("{:?}", gate.kind));
            return;
        }
        for generator in &mut self.generators {
            apply_to_generator(generator, gate);
        }
    }

    pub fn apply_all(&mut self, gates: &[GateOp]) {
        for gate in gates {
            self.apply(gate);
        }
    }

    pub fn is_valid_stabilizer_run(&self) -> bool {
        self.unsupported_gates.is_empty()
    }

    pub fn generator_strings(&self) -> Vec<String> {
        self.generators
            .iter()
            .map(|g| {
                let sign = if g.sign < 0 { "-" } else { "+" };
                let body: String = g
                    .paulis
                    .iter()
                    .map(|p| match p {
                        Pauli::I => 'I',
                        Pauli::X => 'X',
                        Pauli::Y => 'Y',
                        Pauli::Z => 'Z',
                    })
                    .collect();
                format!("{}{}", sign, body)
            })
            .collect()
    }
}

pub fn is_supported_clifford(kind: GateKind) -> bool {
    matches!(
        kind,
        GateKind::I
            | GateKind::X
            | GateKind::Y
            | GateKind::Z
            | GateKind::H
            | GateKind::S
            | GateKind::Sdg
            | GateKind::SX
            | GateKind::SXdg
            | GateKind::CNOT
            | GateKind::CZ
            | GateKind::SWAP
    )
}

fn apply_to_generator(generator: &mut StabilizerGenerator, gate: &GateOp) {
    match gate.kind {
        GateKind::I => {}
        GateKind::X => conjugate_x(generator, gate.qubits[0]),
        GateKind::Y => {
            conjugate_x(generator, gate.qubits[0]);
            conjugate_z(generator, gate.qubits[0]);
        }
        GateKind::Z => conjugate_z(generator, gate.qubits[0]),
        GateKind::H => conjugate_h(generator, gate.qubits[0]),
        GateKind::S => conjugate_s(generator, gate.qubits[0]),
        GateKind::Sdg => {
            conjugate_s(generator, gate.qubits[0]);
            conjugate_s(generator, gate.qubits[0]);
            conjugate_s(generator, gate.qubits[0]);
        }
        GateKind::SX | GateKind::SXdg => conjugate_h(generator, gate.qubits[0]),
        GateKind::CNOT => conjugate_cnot(generator, gate.qubits[0], gate.qubits[1]),
        GateKind::CZ => {
            conjugate_h(generator, gate.qubits[1]);
            conjugate_cnot(generator, gate.qubits[0], gate.qubits[1]);
            conjugate_h(generator, gate.qubits[1]);
        }
        GateKind::SWAP => {
            generator.paulis.swap(gate.qubits[0], gate.qubits[1]);
        }
        _ => {}
    }
}

fn conjugate_x(g: &mut StabilizerGenerator, q: usize) {
    if matches!(g.paulis[q], Pauli::Y | Pauli::Z) {
        g.sign *= -1;
    }
}

fn conjugate_z(g: &mut StabilizerGenerator, q: usize) {
    if matches!(g.paulis[q], Pauli::X | Pauli::Y) {
        g.sign *= -1;
    }
}

fn conjugate_h(g: &mut StabilizerGenerator, q: usize) {
    g.paulis[q] = match g.paulis[q] {
        Pauli::X => Pauli::Z,
        Pauli::Z => Pauli::X,
        Pauli::Y => {
            g.sign *= -1;
            Pauli::Y
        }
        Pauli::I => Pauli::I,
    };
}

fn conjugate_s(g: &mut StabilizerGenerator, q: usize) {
    g.paulis[q] = match g.paulis[q] {
        Pauli::X => Pauli::Y,
        Pauli::Y => {
            g.sign *= -1;
            Pauli::X
        }
        other => other,
    };
}

fn conjugate_cnot(g: &mut StabilizerGenerator, c: usize, t: usize) {
    let pc = g.paulis[c];
    let pt = g.paulis[t];

    if matches!(pc, Pauli::X | Pauli::Y) {
        g.paulis[t] = multiply_pauli(g.paulis[t], Pauli::X);
    }
    if matches!(pt, Pauli::Z | Pauli::Y) {
        g.paulis[c] = multiply_pauli(g.paulis[c], Pauli::Z);
    }
}

fn multiply_pauli(a: Pauli, b: Pauli) -> Pauli {
    match (a, b) {
        (Pauli::I, p) | (p, Pauli::I) => p,
        (Pauli::X, Pauli::X) | (Pauli::Y, Pauli::Y) | (Pauli::Z, Pauli::Z) => Pauli::I,
        (Pauli::X, Pauli::Y) | (Pauli::Y, Pauli::X) => Pauli::Z,
        (Pauli::X, Pauli::Z) | (Pauli::Z, Pauli::X) => Pauli::Y,
        (Pauli::Y, Pauli::Z) | (Pauli::Z, Pauli::Y) => Pauli::X,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stabilizer_tracks_bell_generators() {
        let mut engine = StabilizerEngine::new(2);
        engine.apply(&GateOp::single(GateKind::H, 0));
        engine.apply(&GateOp::two(GateKind::CNOT, 0, 1));
        let gens = engine.generator_strings();
        assert!(gens.iter().any(|g| g.ends_with("XX")));
        assert!(gens.iter().any(|g| g.ends_with("ZZ")));
        assert!(engine.is_valid_stabilizer_run());
    }

    #[test]
    fn test_stabilizer_rejects_t_gate() {
        let mut engine = StabilizerEngine::new(1);
        engine.apply(&GateOp::single(GateKind::T, 0));
        assert!(!engine.is_valid_stabilizer_run());
    }
}
