//! Automatic backend planning.
//!
//! The planner is intentionally conservative. It separates the method Sansqrit
//! would like to use from the runtime engine available today, then records the
//! fallback chain and safety warnings. That makes `engine("auto")` explainable
//! without silently pretending that unimplemented GPU, tensor-network, or QEC
//! backends already exist.

use crate::engine::EngineKind;
use crate::gates::{GateKind, GateOp};
use crate::sharding::{choose_local_qubits, dense_state_bytes_exact, ShardPlan};

/// Simulation method family, aligned with major SDK terminology.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum SimulationMethod {
    Automatic,
    DenseStateVector,
    SparseStateVector,
    ChunkedSparse,
    DistributedStateVector,
    DensityMatrix,
    Stabilizer,
    ExtendedStabilizer,
    MatrixProductState,
    TensorNetwork,
    GpuStateVector,
    GpuTensorNetwork,
    QecStabilizer,
    ResourceEstimator,
    ExternalHardware,
}

/// Whether a planned method is natively executable in this package today.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum BackendAvailability {
    Native,
    ExternalIntegrationRequired,
    FallbackOnly,
}

/// High-level workload intent.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum WorkloadKind {
    General,
    Clifford,
    CliffordPlusT,
    Noisy,
    Qec,
    TensorNetworkFriendly,
    HardwareRun,
    ResourceEstimation,
}

/// Static profile of a circuit or planned run.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CircuitProfile {
    pub n_qubits: usize,
    pub n_gates: usize,
    pub two_qubit_gates: usize,
    pub non_clifford_gates: usize,
    pub measurement_count: usize,
    pub reset_count: usize,
    pub noise_ops: usize,
    pub qec_detector_count: usize,
    pub max_entanglement_width: Option<usize>,
    pub requires_mid_circuit_measurement: bool,
    pub preferred_workload: WorkloadKind,
    pub expected_nnz: Option<usize>,
}

impl CircuitProfile {
    pub fn new(n_qubits: usize) -> Self {
        CircuitProfile {
            n_qubits,
            n_gates: 0,
            two_qubit_gates: 0,
            non_clifford_gates: 0,
            measurement_count: 0,
            reset_count: 0,
            noise_ops: 0,
            qec_detector_count: 0,
            max_entanglement_width: None,
            requires_mid_circuit_measurement: false,
            preferred_workload: WorkloadKind::General,
            expected_nnz: None,
        }
    }

    pub fn from_gates(n_qubits: usize, gates: &[GateOp]) -> Self {
        let mut profile = CircuitProfile::new(n_qubits);
        profile.n_gates = gates.len();
        profile.two_qubit_gates = gates.iter().filter(|g| g.qubits.len() == 2).count();
        profile.non_clifford_gates = gates.iter().filter(|g| !is_clifford_gate(g.kind)).count();
        profile.preferred_workload = if profile.non_clifford_gates == 0 {
            WorkloadKind::Clifford
        } else if gates
            .iter()
            .all(|g| is_clifford_gate(g.kind) || g.kind == GateKind::T || g.kind == GateKind::Tdg)
        {
            WorkloadKind::CliffordPlusT
        } else {
            WorkloadKind::General
        };
        profile
    }

    pub fn noisy(mut self, noise_ops: usize) -> Self {
        self.noise_ops = noise_ops;
        self.preferred_workload = WorkloadKind::Noisy;
        self
    }

    pub fn qec(mut self, detectors: usize) -> Self {
        self.qec_detector_count = detectors;
        self.preferred_workload = WorkloadKind::Qec;
        self
    }

    pub fn expected_nnz(mut self, expected_nnz: usize) -> Self {
        self.expected_nnz = Some(expected_nnz);
        self
    }
}

/// Planner configuration.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlannerConfig {
    pub available_memory_bytes: u128,
    pub max_dense_qubits: usize,
    pub max_dense_memory_fraction_percent: u8,
    pub gpu_available: bool,
    pub distributed_workers: usize,
    pub worker_memory_limit_bytes: u128,
    pub max_local_shard_qubits: usize,
    pub require_exact: bool,
    pub allow_approximate: bool,
    pub safe_mode: bool,
}

impl Default for PlannerConfig {
    fn default() -> Self {
        let gib = 1024u128 * 1024 * 1024;
        PlannerConfig {
            available_memory_bytes: 8 * gib,
            max_dense_qubits: 20,
            max_dense_memory_fraction_percent: 50,
            gpu_available: false,
            distributed_workers: 1,
            worker_memory_limit_bytes: gib,
            max_local_shard_qubits: 30,
            require_exact: true,
            allow_approximate: false,
            safe_mode: true,
        }
    }
}

/// Explainable output from the planner.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BackendPlan {
    pub selected_method: SimulationMethod,
    pub availability: BackendAvailability,
    pub runtime_engine: EngineKind,
    pub estimated_dense_state_bytes: Option<u128>,
    pub shard_plan: Option<ShardPlan>,
    pub fallback_chain: Vec<SimulationMethod>,
    pub reasons: Vec<String>,
    pub warnings: Vec<String>,
}

impl BackendPlan {
    pub fn is_native(&self) -> bool {
        self.availability == BackendAvailability::Native
    }
}

pub struct BackendPlanner;

impl BackendPlanner {
    pub fn plan(profile: &CircuitProfile, config: &PlannerConfig) -> BackendPlan {
        let dense_bytes = dense_state_bytes_exact(profile.n_qubits);
        let mut reasons = Vec::new();
        let mut warnings = Vec::new();
        let mut fallback_chain = Vec::new();
        let mut shard_plan = None;

        let dense_fits = dense_bytes
            .map(|bytes| {
                bytes <= dense_memory_budget(config) && profile.n_qubits <= config.max_dense_qubits
            })
            .unwrap_or(false);

        if profile.preferred_workload == WorkloadKind::ResourceEstimation {
            reasons.push("Resource-estimation workload requested.".to_string());
            return external_plan(
                SimulationMethod::ResourceEstimator,
                EngineKind::Chunked,
                dense_bytes,
                reasons,
                warnings,
                fallback_chain,
                shard_plan,
            );
        }

        if profile.preferred_workload == WorkloadKind::HardwareRun {
            reasons.push(
                "Hardware execution requested; simulation engine is only a local fallback."
                    .to_string(),
            );
            fallback_chain.push(SimulationMethod::SparseStateVector);
            return external_plan(
                SimulationMethod::ExternalHardware,
                EngineKind::Sparse,
                dense_bytes,
                reasons,
                warnings,
                fallback_chain,
                shard_plan,
            );
        }

        if profile.noise_ops > 0 {
            reasons.push(
                "Noise operations require density-matrix or trajectory semantics.".to_string(),
            );
            if profile.n_qubits <= 12 && dense_bytes.is_some() {
                warnings.push("Native density-matrix simulation is not implemented yet; using sparse fallback.".to_string());
                return fallback_plan(
                    SimulationMethod::DensityMatrix,
                    EngineKind::Sparse,
                    dense_bytes,
                    reasons,
                    warnings,
                    vec![SimulationMethod::SparseStateVector],
                    shard_plan,
                );
            }
        }

        if profile.preferred_workload == WorkloadKind::Qec || profile.qec_detector_count > 0 {
            reasons.push(
                "QEC workload should use stabilizer sampling plus MWPM decoding.".to_string(),
            );
            warnings.push("Use Stim/PyMatching integration for production QEC; native decoder is educational.".to_string());
            fallback_chain.push(SimulationMethod::ChunkedSparse);
            return external_plan(
                SimulationMethod::QecStabilizer,
                EngineKind::Chunked,
                dense_bytes,
                reasons,
                warnings,
                fallback_chain,
                shard_plan,
            );
        }

        if profile.preferred_workload == WorkloadKind::Clifford && profile.n_qubits > 28 {
            reasons.push(
                "All inspected gates are Clifford; a stabilizer backend is asymptotically better."
                    .to_string(),
            );
            warnings.push("Native stabilizer tableau backend is not implemented; chunked sparse is the safe fallback.".to_string());
            fallback_chain.push(SimulationMethod::ChunkedSparse);
            return external_plan(
                SimulationMethod::Stabilizer,
                EngineKind::Chunked,
                dense_bytes,
                reasons,
                warnings,
                fallback_chain,
                shard_plan,
            );
        }

        if dense_fits {
            reasons.push("Dense state vector fits the configured memory budget.".to_string());
            return native_plan(
                SimulationMethod::DenseStateVector,
                EngineKind::Dense,
                dense_bytes,
                reasons,
                warnings,
                fallback_chain,
                shard_plan,
            );
        }

        if profile
            .expected_nnz
            .map(|nnz| nnz <= 1_000_000)
            .unwrap_or(profile.n_qubits <= 28)
        {
            reasons.push("Sparse state is expected to remain compact.".to_string());
            return native_plan(
                SimulationMethod::SparseStateVector,
                EngineKind::Sparse,
                dense_bytes,
                reasons,
                warnings,
                fallback_chain,
                shard_plan,
            );
        }

        if config.gpu_available && profile.n_qubits >= 28 {
            reasons.push("Large dense or tensor workload with GPU available.".to_string());
            warnings.push("Native GPU backend is not implemented; use cuQuantum-style integration, fallback to chunked sparse.".to_string());
            fallback_chain.push(SimulationMethod::ChunkedSparse);
            return external_plan(
                SimulationMethod::GpuStateVector,
                EngineKind::Chunked,
                dense_bytes,
                reasons,
                warnings,
                fallback_chain,
                shard_plan,
            );
        }

        if profile.n_qubits >= 60 || config.distributed_workers > 1 {
            let local = choose_local_qubits(profile.n_qubits, config.worker_memory_limit_bytes)
                .min(config.max_local_shard_qubits);
            let plan = ShardPlan::new(profile.n_qubits, local, config.worker_memory_limit_bytes);
            reasons.push("Dense state is too large for one process; use sharding plan plus safe sparse fallback.".to_string());
            warnings.push(
                "Exact dense sharding at this width is an HPC/cluster job, not a laptop job."
                    .to_string(),
            );
            shard_plan = Some(plan);
            fallback_chain.push(SimulationMethod::ChunkedSparse);
            return native_plan(
                SimulationMethod::DistributedStateVector,
                EngineKind::Chunked,
                dense_bytes,
                reasons,
                warnings,
                fallback_chain,
                shard_plan,
            );
        }

        reasons.push("Defaulting to chunked sparse simulation for safety.".to_string());
        native_plan(
            SimulationMethod::ChunkedSparse,
            EngineKind::Chunked,
            dense_bytes,
            reasons,
            warnings,
            fallback_chain,
            shard_plan,
        )
    }

    pub fn enforce_requested(
        n_qubits: usize,
        requested: EngineKind,
        config: &PlannerConfig,
    ) -> BackendPlan {
        let mut profile = CircuitProfile::new(n_qubits);
        profile.expected_nnz = None;
        let mut plan = Self::plan(&profile, config);

        if requested == EngineKind::Auto {
            return plan;
        }

        if requested == EngineKind::Dense {
            let dense_bytes = dense_state_bytes_exact(n_qubits);
            let dense_fits = dense_bytes
                .map(|bytes| {
                    bytes <= dense_memory_budget(config) && n_qubits <= config.max_dense_qubits
                })
                .unwrap_or(false);
            if dense_fits || !config.safe_mode {
                plan.selected_method = SimulationMethod::DenseStateVector;
                plan.runtime_engine = EngineKind::Dense;
                plan.availability = BackendAvailability::Native;
                plan.reasons
                    .push("Explicit dense engine request accepted.".to_string());
            } else {
                plan.selected_method = SimulationMethod::DistributedStateVector;
                plan.runtime_engine = EngineKind::Chunked;
                plan.availability = BackendAvailability::Native;
                plan.warnings.push("Explicit dense request exceeds safe memory limits; falling back to chunked/distributed planning.".to_string());
                let local = choose_local_qubits(n_qubits, config.worker_memory_limit_bytes)
                    .min(config.max_local_shard_qubits);
                plan.shard_plan = Some(ShardPlan::new(
                    n_qubits,
                    local,
                    config.worker_memory_limit_bytes,
                ));
                plan.fallback_chain.push(SimulationMethod::ChunkedSparse);
            }
            return plan;
        }

        let selected_method = match requested {
            EngineKind::Sparse => SimulationMethod::SparseStateVector,
            EngineKind::Chunked => SimulationMethod::ChunkedSparse,
            EngineKind::Dense => SimulationMethod::DenseStateVector,
            EngineKind::Auto => SimulationMethod::Automatic,
        };
        native_plan(
            selected_method,
            requested,
            dense_state_bytes_exact(n_qubits),
            vec![format!("Explicit {:?} engine request.", requested)],
            Vec::new(),
            Vec::new(),
            None,
        )
    }

    pub fn method_to_engine(method: SimulationMethod) -> EngineKind {
        match method {
            SimulationMethod::DenseStateVector => EngineKind::Dense,
            SimulationMethod::SparseStateVector => EngineKind::Sparse,
            SimulationMethod::ChunkedSparse | SimulationMethod::DistributedStateVector => {
                EngineKind::Chunked
            }
            _ => EngineKind::Chunked,
        }
    }
}

fn native_plan(
    selected_method: SimulationMethod,
    runtime_engine: EngineKind,
    estimated_dense_state_bytes: Option<u128>,
    reasons: Vec<String>,
    warnings: Vec<String>,
    fallback_chain: Vec<SimulationMethod>,
    shard_plan: Option<ShardPlan>,
) -> BackendPlan {
    BackendPlan {
        selected_method,
        availability: BackendAvailability::Native,
        runtime_engine,
        estimated_dense_state_bytes,
        shard_plan,
        fallback_chain,
        reasons,
        warnings,
    }
}

fn external_plan(
    selected_method: SimulationMethod,
    runtime_engine: EngineKind,
    estimated_dense_state_bytes: Option<u128>,
    reasons: Vec<String>,
    warnings: Vec<String>,
    fallback_chain: Vec<SimulationMethod>,
    shard_plan: Option<ShardPlan>,
) -> BackendPlan {
    BackendPlan {
        selected_method,
        availability: BackendAvailability::ExternalIntegrationRequired,
        runtime_engine,
        estimated_dense_state_bytes,
        shard_plan,
        fallback_chain,
        reasons,
        warnings,
    }
}

fn fallback_plan(
    selected_method: SimulationMethod,
    runtime_engine: EngineKind,
    estimated_dense_state_bytes: Option<u128>,
    reasons: Vec<String>,
    warnings: Vec<String>,
    fallback_chain: Vec<SimulationMethod>,
    shard_plan: Option<ShardPlan>,
) -> BackendPlan {
    BackendPlan {
        selected_method,
        availability: BackendAvailability::FallbackOnly,
        runtime_engine,
        estimated_dense_state_bytes,
        shard_plan,
        fallback_chain,
        reasons,
        warnings,
    }
}

fn dense_memory_budget(config: &PlannerConfig) -> u128 {
    config
        .available_memory_bytes
        .saturating_mul(config.max_dense_memory_fraction_percent as u128)
        / 100
}

fn is_clifford_gate(kind: GateKind) -> bool {
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
            | GateKind::CY
            | GateKind::CH
            | GateKind::SWAP
            | GateKind::DCX
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_dense_sparse_chunked_shape() {
        let config = PlannerConfig::default();
        assert_eq!(
            BackendPlanner::plan(&CircuitProfile::new(5), &config).runtime_engine,
            EngineKind::Dense
        );
        assert_eq!(
            BackendPlanner::plan(&CircuitProfile::new(25), &config).runtime_engine,
            EngineKind::Sparse
        );
        assert_eq!(
            BackendPlanner::plan(&CircuitProfile::new(50), &config).runtime_engine,
            EngineKind::Chunked
        );
    }

    #[test]
    fn test_safe_dense_120_falls_back_to_sharded_chunked() {
        let config = PlannerConfig::default();
        let plan = BackendPlanner::enforce_requested(120, EngineKind::Dense, &config);
        assert_eq!(plan.runtime_engine, EngineKind::Chunked);
        assert_eq!(
            plan.selected_method,
            SimulationMethod::DistributedStateVector
        );
        assert!(plan.shard_plan.is_some());
        assert!(plan
            .warnings
            .iter()
            .any(|w| w.contains("dense request exceeds")));
    }

    #[test]
    fn test_qec_prefers_external_stabilizer_stack() {
        let config = PlannerConfig::default();
        let profile = CircuitProfile::new(100).qec(10_000);
        let plan = BackendPlanner::plan(&profile, &config);
        assert_eq!(plan.selected_method, SimulationMethod::QecStabilizer);
        assert_eq!(
            plan.availability,
            BackendAvailability::ExternalIntegrationRequired
        );
    }

    #[test]
    fn test_clifford_profile_prefers_stabilizer_with_fallback() {
        let gates = vec![
            GateOp::single(GateKind::H, 0),
            GateOp::two(GateKind::CNOT, 0, 1),
        ];
        let profile = CircuitProfile::from_gates(80, &gates);
        let plan = BackendPlanner::plan(&profile, &PlannerConfig::default());
        assert_eq!(profile.preferred_workload, WorkloadKind::Clifford);
        assert_eq!(plan.selected_method, SimulationMethod::Stabilizer);
        assert_eq!(plan.runtime_engine, EngineKind::Chunked);
    }
}
