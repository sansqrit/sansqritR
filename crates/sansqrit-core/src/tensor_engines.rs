//! Native structured MPS and tensor-network execution helpers.

use crate::gates::GateOp;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MpsEngine {
    pub n_qubits: usize,
    pub max_bond_dim: usize,
    pub bond_dims: Vec<usize>,
    pub applied_gates: usize,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TensorNetworkPlan {
    pub n_qubits: usize,
    pub tensor_count: usize,
    pub max_tensor_rank: usize,
    pub estimated_contraction_width: usize,
    pub executable_locally: bool,
    pub notes: Vec<String>,
}

impl MpsEngine {
    pub fn new(n_qubits: usize, max_bond_dim: usize) -> Self {
        MpsEngine {
            n_qubits,
            max_bond_dim: max_bond_dim.max(1),
            bond_dims: vec![1; n_qubits.saturating_sub(1)],
            applied_gates: 0,
            warnings: Vec::new(),
        }
    }

    pub fn apply(&mut self, gate: &GateOp) {
        self.applied_gates += 1;
        if gate.qubits.len() == 2 {
            let a = gate.qubits[0].min(gate.qubits[1]);
            let b = gate.qubits[0].max(gate.qubits[1]);
            if b != a + 1 {
                self.warnings.push(
                    "Non-adjacent two-qubit gate requires SWAP routing before native MPS execution."
                        .to_string(),
                );
                return;
            }
            if let Some(bond) = self.bond_dims.get_mut(a) {
                *bond = (*bond * 2).min(self.max_bond_dim);
            }
        } else if gate.qubits.len() > 2 {
            self.warnings
                .push("Multi-qubit gate should be decomposed before MPS execution.".to_string());
        }
    }

    pub fn apply_all(&mut self, gates: &[GateOp]) {
        for gate in gates {
            self.apply(gate);
        }
    }

    pub fn max_observed_bond(&self) -> usize {
        self.bond_dims.iter().copied().max().unwrap_or(1)
    }
}

pub fn tensor_network_plan(
    n_qubits: usize,
    two_qubit_gates: usize,
    entanglement_width: usize,
) -> TensorNetworkPlan {
    let width = entanglement_width.max((two_qubit_gates as f64).sqrt() as usize);
    TensorNetworkPlan {
        n_qubits,
        tensor_count: n_qubits + two_qubit_gates,
        max_tensor_rank: 4,
        estimated_contraction_width: width,
        executable_locally: width <= 28,
        notes: vec![
            "Exact tensor-network execution is feasible only when contraction width stays small."
                .to_string(),
            "Use cuTensorNet/cuQuantum for production GPU tensor contraction.".to_string(),
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gates::{GateKind, GateOp};

    #[test]
    fn test_mps_engine_tracks_bond_growth() {
        let mut mps = MpsEngine::new(4, 16);
        mps.apply(&GateOp::two(GateKind::CNOT, 1, 2));
        assert_eq!(mps.max_observed_bond(), 2);
        mps.apply(&GateOp::two(GateKind::CNOT, 0, 3));
        assert!(!mps.warnings.is_empty());
    }

    #[test]
    fn test_tensor_network_plan_marks_width() {
        let plan = tensor_network_plan(120, 20, 12);
        assert!(plan.executable_locally);
        let hard = tensor_network_plan(120, 10_000, 90);
        assert!(!hard.executable_locally);
    }
}
