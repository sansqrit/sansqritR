//! Advanced simulation engine families.
//!
//! Native Sansqrit still uses sparse amplitudes as its default workhorse. This
//! module adds a real small-qubit density-matrix engine and capability records
//! for production stabilizer, MPS, and tensor-network paths.

use crate::complex::*;
use crate::external::{detect_integration, IntegrationKind};
use crate::gates::{GateKind, GateOp};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AdvancedEngineKind {
    DensityMatrix,
    Stabilizer,
    MatrixProductState,
    TensorNetwork,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AdvancedEngineCapability {
    pub kind: AdvancedEngineKind,
    pub native_available: bool,
    pub external_available: bool,
    pub exact_by_default: bool,
    pub max_native_qubits: Option<usize>,
    pub integration: Option<String>,
    pub notes: Vec<String>,
}

pub fn advanced_engine_capabilities() -> Vec<AdvancedEngineCapability> {
    let stim = detect_integration(IntegrationKind::Stim);
    let cuquantum = detect_integration(IntegrationKind::CuQuantum);

    vec![
        AdvancedEngineCapability {
            kind: AdvancedEngineKind::DensityMatrix,
            native_available: true,
            external_available: cuquantum.available,
            exact_by_default: true,
            max_native_qubits: Some(DensityMatrixEngine::MAX_QUBITS),
            integration: Some("native-small / cuQuantum-cuDensityMat".to_string()),
            notes: vec![
                "Native density matrix is exact and intended for small noisy circuits.".to_string(),
            ],
        },
        AdvancedEngineCapability {
            kind: AdvancedEngineKind::Stabilizer,
            native_available: false,
            external_available: stim.available,
            exact_by_default: true,
            max_native_qubits: None,
            integration: Some("Stim".to_string()),
            notes: vec![
                "Use Stim for production Clifford/stabilizer and QEC workloads.".to_string(),
            ],
        },
        AdvancedEngineCapability {
            kind: AdvancedEngineKind::MatrixProductState,
            native_available: false,
            external_available: cuquantum.available,
            exact_by_default: false,
            max_native_qubits: None,
            integration: Some("cuTensorNet MPS".to_string()),
            notes: vec![
                "MPS needs bond-dimension and truncation controls before native execution."
                    .to_string(),
            ],
        },
        AdvancedEngineCapability {
            kind: AdvancedEngineKind::TensorNetwork,
            native_available: false,
            external_available: cuquantum.available,
            exact_by_default: false,
            max_native_qubits: None,
            integration: Some("cuTensorNet".to_string()),
            notes: vec![
                "Tensor-network execution should use slicing and contraction planning.".to_string(),
            ],
        },
    ]
}

#[derive(Debug, Clone, PartialEq)]
pub struct DensityMatrixEngine {
    pub n_qubits: usize,
    pub rho: Vec<Amplitude>,
}

impl DensityMatrixEngine {
    pub const MAX_QUBITS: usize = 10;

    pub fn new(n_qubits: usize) -> Result<Self, String> {
        if n_qubits > Self::MAX_QUBITS {
            return Err(format!(
                "Native density-matrix engine is limited to {} qubits; use cuQuantum or trajectories for larger noisy circuits.",
                Self::MAX_QUBITS
            ));
        }
        let dim = 1usize << n_qubits;
        let mut rho = vec![c_zero(); dim * dim];
        rho[0] = c_one();
        Ok(DensityMatrixEngine { n_qubits, rho })
    }

    pub fn apply(&mut self, gate: &GateOp) -> Result<(), String> {
        let unitary = unitary_for_gate(gate)?;
        self.apply_unitary(&gate.qubits, &unitary)
    }

    pub fn probabilities(&self) -> Vec<f64> {
        let dim = 1usize << self.n_qubits;
        (0..dim)
            .map(|i| self.rho[i * dim + i].re.max(0.0))
            .collect()
    }

    pub fn trace(&self) -> Amplitude {
        let dim = 1usize << self.n_qubits;
        (0..dim).fold(c_zero(), |acc, i| acc + self.rho[i * dim + i])
    }

    fn apply_unitary(&mut self, qubits: &[usize], unitary: &[Amplitude]) -> Result<(), String> {
        if qubits.iter().any(|&q| q >= self.n_qubits) {
            return Err("Gate references a qubit outside the density matrix.".to_string());
        }
        let dim = 1usize << self.n_qubits;
        let local_dim = 1usize << qubits.len();
        if unitary.len() != local_dim * local_dim {
            return Err("Unitary size does not match gate arity.".to_string());
        }

        let mut left = vec![c_zero(); dim * dim];
        for new_row in 0..dim {
            let new_sub = extract_bits(new_row, qubits);
            for old_sub in 0..local_dim {
                let old_row = replace_bits(new_row, qubits, old_sub);
                let coeff = unitary[new_sub * local_dim + old_sub];
                if coeff.norm_sqr() == 0.0 {
                    continue;
                }
                for col in 0..dim {
                    left[new_row * dim + col] += coeff * self.rho[old_row * dim + col];
                }
            }
        }

        let mut out = vec![c_zero(); dim * dim];
        for row in 0..dim {
            for new_col in 0..dim {
                let new_sub = extract_bits(new_col, qubits);
                for old_sub in 0..local_dim {
                    let old_col = replace_bits(new_col, qubits, old_sub);
                    let coeff = unitary[new_sub * local_dim + old_sub].conj();
                    if coeff.norm_sqr() == 0.0 {
                        continue;
                    }
                    out[row * dim + new_col] += left[row * dim + old_col] * coeff;
                }
            }
        }

        self.rho = out;
        Ok(())
    }
}

fn unitary_for_gate(gate: &GateOp) -> Result<Vec<Amplitude>, String> {
    match gate.kind {
        GateKind::I => Ok(vec![c_one(), c_zero(), c_zero(), c_one()]),
        GateKind::X => Ok(vec![c_zero(), c_one(), c_one(), c_zero()]),
        GateKind::Y => Ok(vec![c_zero(), c(0.0, -1.0), c(0.0, 1.0), c_zero()]),
        GateKind::Z => Ok(vec![c_one(), c_zero(), c_zero(), c_real(-1.0)]),
        GateKind::H => {
            let s = c_real(FRAC_1_SQRT2);
            Ok(vec![s, s, s, -s])
        }
        GateKind::S => Ok(vec![c_one(), c_zero(), c_zero(), c(0.0, 1.0)]),
        GateKind::Sdg => Ok(vec![c_one(), c_zero(), c_zero(), c(0.0, -1.0)]),
        GateKind::T => Ok(vec![
            c_one(),
            c_zero(),
            c_zero(),
            c_exp_i(std::f64::consts::PI / 4.0),
        ]),
        GateKind::Tdg => Ok(vec![
            c_one(),
            c_zero(),
            c_zero(),
            c_exp_i(-std::f64::consts::PI / 4.0),
        ]),
        GateKind::Rx => {
            let theta = gate.params.first().copied().unwrap_or(0.0);
            let c0 = c_real((theta / 2.0).cos());
            let s = c(0.0, -(theta / 2.0).sin());
            Ok(vec![c0, s, s, c0])
        }
        GateKind::Ry => {
            let theta = gate.params.first().copied().unwrap_or(0.0);
            let c0 = c_real((theta / 2.0).cos());
            let s = c_real((theta / 2.0).sin());
            Ok(vec![c0, -s, s, c0])
        }
        GateKind::Rz => {
            let theta = gate.params.first().copied().unwrap_or(0.0);
            Ok(vec![
                c_exp_i(-theta / 2.0),
                c_zero(),
                c_zero(),
                c_exp_i(theta / 2.0),
            ])
        }
        GateKind::CNOT => Ok(permutation_unitary(2, |basis| {
            if basis & 0b01 != 0 {
                basis ^ 0b10
            } else {
                basis
            }
        })),
        GateKind::CZ => Ok(diagonal_unitary(2, |basis| {
            if basis == 0b11 {
                c_real(-1.0)
            } else {
                c_one()
            }
        })),
        GateKind::SWAP => Ok(permutation_unitary(2, |basis| {
            let a = basis & 0b01;
            let b = (basis & 0b10) >> 1;
            (a << 1) | b
        })),
        GateKind::Toffoli => Ok(permutation_unitary(3, |basis| {
            if basis & 0b011 == 0b011 {
                basis ^ 0b100
            } else {
                basis
            }
        })),
        _ => Err(format!(
            "Density-matrix gate {:?} is not implemented yet.",
            gate.kind
        )),
    }
}

fn permutation_unitary(width: usize, f: impl Fn(usize) -> usize) -> Vec<Amplitude> {
    let dim = 1usize << width;
    let mut u = vec![c_zero(); dim * dim];
    for old in 0..dim {
        let new = f(old);
        u[new * dim + old] = c_one();
    }
    u
}

fn diagonal_unitary(width: usize, f: impl Fn(usize) -> Amplitude) -> Vec<Amplitude> {
    let dim = 1usize << width;
    let mut u = vec![c_zero(); dim * dim];
    for i in 0..dim {
        u[i * dim + i] = f(i);
    }
    u
}

fn extract_bits(index: usize, qubits: &[usize]) -> usize {
    qubits.iter().enumerate().fold(0usize, |acc, (pos, &q)| {
        if (index >> q) & 1 == 1 {
            acc | (1usize << pos)
        } else {
            acc
        }
    })
}

fn replace_bits(mut index: usize, qubits: &[usize], local: usize) -> usize {
    for (pos, &q) in qubits.iter().enumerate() {
        if (local >> pos) & 1 == 1 {
            index |= 1usize << q;
        } else {
            index &= !(1usize << q);
        }
    }
    index
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_density_matrix_bell_probabilities() {
        let mut dm = DensityMatrixEngine::new(2).unwrap();
        dm.apply(&GateOp::single(GateKind::H, 0)).unwrap();
        dm.apply(&GateOp::two(GateKind::CNOT, 0, 1)).unwrap();
        let probs = dm.probabilities();
        assert!((probs[0] - 0.5).abs() < 1e-10);
        assert!((probs[3] - 0.5).abs() < 1e-10);
        assert!(probs[1] < 1e-10);
        assert!(probs[2] < 1e-10);
        assert!((dm.trace().re - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_capabilities_include_advanced_families() {
        let caps = advanced_engine_capabilities();
        assert_eq!(caps.len(), 4);
        assert!(caps
            .iter()
            .any(|c| c.kind == AdvancedEngineKind::TensorNetwork));
    }
}
