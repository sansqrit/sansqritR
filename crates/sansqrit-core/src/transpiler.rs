//! Native circuit transpiler passes.

use crate::gates::{GateKind, GateOp};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TranspileTarget {
    pub name: String,
    pub basis_gates: Vec<GateKind>,
    pub coupling_edges: Vec<(usize, usize)>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TranspileResult {
    pub gates: Vec<GateOp>,
    pub passes: Vec<String>,
    pub inserted_swaps: usize,
    pub cancelled_gates: usize,
    pub warnings: Vec<String>,
}

impl TranspileTarget {
    pub fn line(name: &str, n_qubits: usize) -> Self {
        let edges = (0..n_qubits.saturating_sub(1))
            .flat_map(|i| [(i, i + 1), (i + 1, i)])
            .collect();
        TranspileTarget {
            name: name.to_string(),
            basis_gates: vec![
                GateKind::H,
                GateKind::X,
                GateKind::Z,
                GateKind::Rz,
                GateKind::CNOT,
                GateKind::SWAP,
            ],
            coupling_edges: edges,
        }
    }
}

pub fn transpile_circuit(gates: &[GateOp], target: &TranspileTarget) -> TranspileResult {
    let mut passes = Vec::new();
    let mut warnings = Vec::new();

    let (translated, translate_warnings) = basis_translate(gates, &target.basis_gates);
    warnings.extend(translate_warnings);
    passes.push("basis translation".to_string());

    let (routed, swaps) = route_to_coupling(&translated, &target.coupling_edges);
    passes.push("routing / swap insertion".to_string());

    let (optimized, cancelled) = cancel_adjacent_inverses(&routed);
    passes.push("adjacent inverse cancellation".to_string());

    TranspileResult {
        gates: optimized,
        passes,
        inserted_swaps: swaps,
        cancelled_gates: cancelled,
        warnings,
    }
}

fn basis_translate(gates: &[GateOp], basis: &[GateKind]) -> (Vec<GateOp>, Vec<String>) {
    let mut out = Vec::new();
    let mut warnings = Vec::new();
    for gate in gates {
        if basis.contains(&gate.kind) {
            out.push(gate.clone());
            continue;
        }
        match gate.kind {
            GateKind::S if basis.contains(&GateKind::Rz) => {
                out.push(GateOp::single_param(
                    GateKind::Rz,
                    gate.qubits[0],
                    std::f64::consts::FRAC_PI_2,
                ));
            }
            GateKind::Sdg if basis.contains(&GateKind::Rz) => {
                out.push(GateOp::single_param(
                    GateKind::Rz,
                    gate.qubits[0],
                    -std::f64::consts::FRAC_PI_2,
                ));
            }
            GateKind::T if basis.contains(&GateKind::Rz) => {
                out.push(GateOp::single_param(
                    GateKind::Rz,
                    gate.qubits[0],
                    std::f64::consts::FRAC_PI_4,
                ));
            }
            GateKind::Tdg if basis.contains(&GateKind::Rz) => {
                out.push(GateOp::single_param(
                    GateKind::Rz,
                    gate.qubits[0],
                    -std::f64::consts::FRAC_PI_4,
                ));
            }
            GateKind::CZ if basis.contains(&GateKind::H) && basis.contains(&GateKind::CNOT) => {
                let (a, b) = (gate.qubits[0], gate.qubits[1]);
                out.push(GateOp::single(GateKind::H, b));
                out.push(GateOp::two(GateKind::CNOT, a, b));
                out.push(GateOp::single(GateKind::H, b));
            }
            _ => {
                warnings.push(format!(
                    "No native translation for {:?}; preserving gate.",
                    gate.kind
                ));
                out.push(gate.clone());
            }
        }
    }
    (out, warnings)
}

fn route_to_coupling(gates: &[GateOp], edges: &[(usize, usize)]) -> (Vec<GateOp>, usize) {
    if edges.is_empty() {
        return (gates.to_vec(), 0);
    }
    let mut out = Vec::new();
    let mut swaps = 0;
    for gate in gates {
        if gate.qubits.len() == 2 && !edges.contains(&(gate.qubits[0], gate.qubits[1])) {
            let (a, b) = (gate.qubits[0], gate.qubits[1]);
            if a.abs_diff(b) > 1 {
                let step = if a < b { 1isize } else { -1isize };
                let mut cur = a as isize;
                while (cur + step) != b as isize {
                    out.push(GateOp::two(
                        GateKind::SWAP,
                        cur as usize,
                        (cur + step) as usize,
                    ));
                    swaps += 1;
                    cur += step;
                }
                let near = cur as usize;
                out.push(GateOp {
                    kind: gate.kind,
                    qubits: vec![near, b],
                    params: gate.params.clone(),
                });
                continue;
            }
        }
        out.push(gate.clone());
    }
    (out, swaps)
}

fn cancel_adjacent_inverses(gates: &[GateOp]) -> (Vec<GateOp>, usize) {
    let mut out: Vec<GateOp> = Vec::new();
    let mut cancelled = 0;
    for gate in gates {
        if let Some(prev) = out.last() {
            if are_inverse(prev, gate) {
                out.pop();
                cancelled += 2;
                continue;
            }
        }
        out.push(gate.clone());
    }
    (out, cancelled)
}

fn are_inverse(a: &GateOp, b: &GateOp) -> bool {
    if a.qubits != b.qubits {
        return false;
    }
    matches!(
        (a.kind, b.kind),
        (GateKind::H, GateKind::H)
            | (GateKind::X, GateKind::X)
            | (GateKind::Y, GateKind::Y)
            | (GateKind::Z, GateKind::Z)
            | (GateKind::CNOT, GateKind::CNOT)
            | (GateKind::SWAP, GateKind::SWAP)
            | (GateKind::S, GateKind::Sdg)
            | (GateKind::Sdg, GateKind::S)
            | (GateKind::T, GateKind::Tdg)
            | (GateKind::Tdg, GateKind::T)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_transpiler_cancels_and_routes() {
        let gates = vec![
            GateOp::single(GateKind::H, 0),
            GateOp::single(GateKind::H, 0),
            GateOp::two(GateKind::CNOT, 0, 3),
        ];
        let target = TranspileTarget::line("line4", 4);
        let result = transpile_circuit(&gates, &target);
        assert!(result.cancelled_gates >= 2);
        assert!(result.inserted_swaps >= 1);
    }
}
