//! Quantum application assessment.
//!
//! This module turns current quantum-computing reality into planner-visible
//! facts. It is intentionally conservative about 100+ qubit local execution:
//! Sansqrit can run sparse, Clifford/stabilizer-style, and low-entanglement
//! workloads locally, but cannot exactly simulate arbitrary dense 100+ qubit
//! states on commodity hardware.

use crate::backend_planner::{
    BackendPlanner, CircuitProfile, PlannerConfig, SimulationMethod, WorkloadKind,
};
use crate::external::{detect_integration, IntegrationKind};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum QuantumApplicationKind {
    QuantumSimulation,
    Chemistry,
    Materials,
    Optimization,
    MachineLearning,
    Cryptanalysis,
    Search,
    LinearSystems,
    MonteCarloFinance,
    QuantumErrorCorrection,
    DrugDiscovery,
    HardwareUtility,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LocalFeasibility {
    LocalExact,
    LocalSparseOrStructured,
    LocalApproximate,
    ExternalAcceleratorRecommended,
    ExternalProviderRequired,
    FaultTolerantRequired,
    NotEnoughInformation,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct QuantumApplicationAssessment {
    pub problem: String,
    pub kind: QuantumApplicationKind,
    pub n_qubits: usize,
    pub can_run_100q_locally: bool,
    pub local_feasibility: LocalFeasibility,
    pub recommended_algorithm: String,
    pub recommended_backend: String,
    pub selected_method: SimulationMethod,
    pub production_status: String,
    pub sansqrit_ready: bool,
    pub shortcomings: Vec<String>,
    pub next_steps: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProductionReadinessReport {
    pub n_qubits: usize,
    pub arbitrary_dense_local_possible: bool,
    pub local_success_modes: Vec<String>,
    pub external_success_modes: Vec<String>,
    pub blockers: Vec<String>,
    pub required_work: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MarketCapability {
    pub area: String,
    pub market_standard: String,
    pub sansqrit_function: String,
    pub status: String,
    pub missing_work: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorkflowStage {
    pub name: String,
    pub action: String,
    pub dsl_function: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct QuantumWorkflow {
    pub problem: String,
    pub n_qubits: usize,
    pub kind: QuantumApplicationKind,
    pub stages: Vec<WorkflowStage>,
    pub validation_checks: Vec<String>,
    pub recommended_syntax: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FaultTolerantResourceEstimate {
    pub logical_qubits: usize,
    pub t_count: u128,
    pub error_budget: f64,
    pub code_distance_hint: usize,
    pub physical_qubits_lower_bound: u128,
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SurfaceCodePlan {
    pub logical_qubits: usize,
    pub distance: usize,
    pub rounds: usize,
    pub physical_error_rate: f64,
    pub data_qubits_per_patch: usize,
    pub physical_qubits_lower_bound: u128,
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ErrorMitigationPlan {
    pub shots: usize,
    pub noise_level_label: String,
    pub methods: Vec<String>,
    pub validation: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HardwareTranspilePlan {
    pub target: String,
    pub n_qubits: usize,
    pub basis_gates: Vec<String>,
    pub connectivity: String,
    pub passes: Vec<String>,
    pub warnings: Vec<String>,
}

pub fn classify_quantum_problem(problem: &str) -> QuantumApplicationKind {
    let p = problem.to_ascii_lowercase();
    if p.contains("chem") || p.contains("hamiltonian") || p.contains("vqe") || p.contains("energy")
    {
        QuantumApplicationKind::Chemistry
    } else if p.contains("material")
        || p.contains("battery")
        || p.contains("superconductor")
        || p.contains("catalyst")
    {
        QuantumApplicationKind::Materials
    } else if p.contains("drug") || p.contains("protein") || p.contains("pharma") {
        QuantumApplicationKind::DrugDiscovery
    } else if p.contains("optim")
        || p.contains("schedule")
        || p.contains("routing")
        || p.contains("portfolio")
        || p.contains("maxcut")
    {
        QuantumApplicationKind::Optimization
    } else if p.contains("machine")
        || p.contains("learning")
        || p.contains("classifier")
        || p.contains("kernel")
    {
        QuantumApplicationKind::MachineLearning
    } else if p.contains("rsa")
        || p.contains("ecc")
        || p.contains("shor")
        || p.contains("crypto")
        || p.contains("factor")
    {
        QuantumApplicationKind::Cryptanalysis
    } else if p.contains("search") || p.contains("grover") || p.contains("oracle") {
        QuantumApplicationKind::Search
    } else if p.contains("linear") || p.contains("hhl") {
        QuantumApplicationKind::LinearSystems
    } else if p.contains("finance")
        || p.contains("monte")
        || p.contains("derivative")
        || p.contains("risk")
    {
        QuantumApplicationKind::MonteCarloFinance
    } else if p.contains("qec")
        || p.contains("error correction")
        || p.contains("surface code")
        || p.contains("decoder")
    {
        QuantumApplicationKind::QuantumErrorCorrection
    } else if p.contains("hardware")
        || p.contains("utility")
        || p.contains("mitigation")
        || p.contains("dynamic")
    {
        QuantumApplicationKind::HardwareUtility
    } else if p.contains("simulation")
        || p.contains("dynamics")
        || p.contains("many-body")
        || p.contains("field")
    {
        QuantumApplicationKind::QuantumSimulation
    } else {
        QuantumApplicationKind::Unknown
    }
}

pub fn assess_quantum_application(problem: &str, n_qubits: usize) -> QuantumApplicationAssessment {
    let kind = classify_quantum_problem(problem);
    let mut profile = CircuitProfile::new(n_qubits);
    let mut shortcomings = Vec::new();
    let mut next_steps = Vec::new();
    let recommended_algorithm;
    let recommended_backend;
    let production_status;

    match kind {
        QuantumApplicationKind::Chemistry
        | QuantumApplicationKind::Materials
        | QuantumApplicationKind::DrugDiscovery => {
            profile.preferred_workload = WorkloadKind::TensorNetworkFriendly;
            recommended_algorithm = "VQE for small active spaces; quantum phase estimation/resource estimation for fault-tolerant chemistry.".to_string();
            recommended_backend = "Sparse/dense for toy active spaces; MPS/tensor network/cuQuantum or cloud provider for larger structured circuits.".to_string();
            production_status = "Research/early production planning; practical advantage needs resource estimation and fault tolerance.".to_string();
            shortcomings.extend([
                "No full electronic-structure frontend or fermion-to-qubit mapping pipeline yet.".to_string(),
                "No production tensor-network contraction planner or native MPS truncation controls yet.".to_string(),
            ]);
            next_steps.extend([
                "Add OpenFermion/PySCF-style Hamiltonian import.".to_string(),
                "Add active-space, ansatz, optimizer, and resource-estimation workflows."
                    .to_string(),
            ]);
        }
        QuantumApplicationKind::QuantumSimulation => {
            profile.preferred_workload = WorkloadKind::TensorNetworkFriendly;
            recommended_algorithm =
                "Trotterization, qubitization, Hamiltonian simulation, tensor-network prechecks."
                    .to_string();
            recommended_backend = "Local sparse for structured states; tensor network/GPU/provider for entangled dynamics.".to_string();
            production_status =
                "Promising; exact local dense simulation is limited by exponential memory."
                    .to_string();
            shortcomings.push(
                "No production Hamiltonian simulation compiler or tensor slicing scheduler yet."
                    .to_string(),
            );
            next_steps.push("Add Hamiltonian IR, product-formula synthesis, and tensor-network cost estimation.".to_string());
        }
        QuantumApplicationKind::Optimization => {
            recommended_algorithm =
                "QAOA, quantum annealing-style formulations, hybrid classical search.".to_string();
            recommended_backend = "Local sparse for tiny/structured QAOA; provider or tensor-network approximation for larger graphs.".to_string();
            production_status =
                "Hybrid heuristics can be explored; broad quantum advantage is problem-dependent."
                    .to_string();
            shortcomings.extend([
                "No graph/problem modeling DSL for constraints, penalties, and QUBO/Ising conversion yet.".to_string(),
                "No optimizer benchmarking against classical baselines yet.".to_string(),
            ]);
            next_steps.extend([
                "Add QUBO/Ising model builders and classical baseline comparisons.".to_string(),
                "Add parameter optimization loops with reproducible seeds and telemetry."
                    .to_string(),
            ]);
        }
        QuantumApplicationKind::MachineLearning => {
            recommended_algorithm =
                "Quantum kernels, variational classifiers, tensor-feature experiments.".to_string();
            recommended_backend =
                "Local small circuits; tensor-network/GPU for batched parameter evaluation."
                    .to_string();
            production_status =
                "Experimental; requires careful comparison with classical ML baselines."
                    .to_string();
            shortcomings.push("No dataset pipeline, kernel matrix cache, or rigorous classical-baseline suite yet.".to_string());
            next_steps.push(
                "Add kernel estimation, batched circuit execution, and baseline reporting."
                    .to_string(),
            );
        }
        QuantumApplicationKind::Cryptanalysis => {
            profile.preferred_workload = WorkloadKind::ResourceEstimation;
            recommended_algorithm = "Shor for factoring/discrete logarithms; Grover for symmetric-key search estimates.".to_string();
            recommended_backend =
                "Resource estimator only for real targets; local execution only for toy factoring."
                    .to_string();
            production_status =
                "Fault-tolerant quantum computer required for real public-key cryptanalysis."
                    .to_string();
            shortcomings.push("Toy Shor exists, but no production reversible arithmetic/resource-estimation compiler for RSA/ECC scale.".to_string());
            next_steps.push("Add reversible arithmetic libraries and cryptographic resource-estimation templates.".to_string());
        }
        QuantumApplicationKind::Search => {
            recommended_algorithm =
                "Grover/amplitude amplification with explicit oracle cost model.".to_string();
            recommended_backend = "Local sparse only for tiny or highly structured oracles; hardware/resource estimation for large unstructured search.".to_string();
            production_status = "Useful for algorithm design; local exact 100+ qubit uniform search is dense and infeasible.".to_string();
            shortcomings.push("No oracle synthesis/cost-model DSL yet.".to_string());
            next_steps.push(
                "Add reversible oracle builder and amplitude-amplification planner.".to_string(),
            );
        }
        QuantumApplicationKind::LinearSystems => {
            recommended_algorithm =
                "HHL/block-encoding/QSVT-style resource estimation.".to_string();
            recommended_backend = "Local toy HHL only; fault-tolerant block-encoding pipeline for real sparse systems.".to_string();
            production_status = "Promising only with strong input assumptions; QRAM/state preparation is a major bottleneck.".to_string();
            shortcomings.push(
                "No block-encoding, QRAM, condition-number analysis, or error-bound reporting yet."
                    .to_string(),
            );
            next_steps.push("Add sparse-matrix loaders, condition estimates, and block-encoding/resource estimates.".to_string());
        }
        QuantumApplicationKind::MonteCarloFinance => {
            recommended_algorithm =
                "Amplitude estimation for quadratic Monte Carlo speedup.".to_string();
            recommended_backend = "Local toy amplitude estimation; resource estimator/provider for advantage-scale derivative pricing.".to_string();
            production_status =
                "Requires end-to-end resource estimates and reversible payoff/oracle synthesis."
                    .to_string();
            shortcomings
                .push("No finance payoff DSL or reversible arithmetic pipeline yet.".to_string());
            next_steps
                .push("Add payoff/oracle builders and Azure-style resource estimates.".to_string());
        }
        QuantumApplicationKind::QuantumErrorCorrection => {
            profile.preferred_workload = WorkloadKind::Qec;
            recommended_algorithm =
                "Stim-style detector sampling plus PyMatching MWPM decoding.".to_string();
            recommended_backend =
                "Stim/PyMatching external integration; native educational decoder only."
                    .to_string();
            production_status = "External production stack can be used when installed; native stack is not production QEC yet.".to_string();
            let stim = detect_integration(IntegrationKind::Stim);
            let pymatching = detect_integration(IntegrationKind::PyMatching);
            if !stim.available {
                shortcomings.push("Stim is not installed; production stabilizer/QEC sampling unavailable locally.".to_string());
            }
            if !pymatching.available {
                shortcomings.push(
                    "PyMatching is not installed; production MWPM decoding unavailable locally."
                        .to_string(),
                );
            }
            shortcomings.push(
                "No full detector-error-model generation from Sansqrit QEC DSL yet.".to_string(),
            );
            next_steps.push("Add detector declarations, observable tracking, and PyMatching correction application.".to_string());
        }
        QuantumApplicationKind::HardwareUtility => {
            profile.preferred_workload = WorkloadKind::HardwareRun;
            recommended_algorithm =
                "Dynamic circuits, error mitigation, provider runtime primitives.".to_string();
            recommended_backend =
                "Qiskit Runtime/Azure/Braket provider integrations with local conformance tests."
                    .to_string();
            production_status =
                "Requires provider credentials and hardware/runtime access.".to_string();
            shortcomings.push(
                "No authenticated job-submission layer or hardware calibration import yet."
                    .to_string(),
            );
            next_steps.push(
                "Add provider credential profiles, job tracking, and target-aware transpilation."
                    .to_string(),
            );
        }
        QuantumApplicationKind::Unknown => {
            recommended_algorithm = "Unknown; classify the workload first.".to_string();
            recommended_backend = "Use backend_plan/explain_engine after describing qubit count, gates, noise, and entanglement.".to_string();
            production_status = "Not enough information.".to_string();
            shortcomings.push(
                "Problem type is not recognized by the quantum application catalog.".to_string(),
            );
            next_steps.push("Describe whether this is chemistry, optimization, QEC, cryptography, simulation, ML, search, or finance.".to_string());
        }
    }

    let plan = BackendPlanner::plan(&profile, &PlannerConfig::default());
    let local_feasibility = local_feasibility(kind, n_qubits);
    if n_qubits >= 100
        && !matches!(
            local_feasibility,
            LocalFeasibility::LocalSparseOrStructured | LocalFeasibility::LocalApproximate
        )
    {
        shortcomings.push("Arbitrary exact dense 100+ qubit simulation is not possible on local commodity hardware.".to_string());
    }

    let can_run_100q_locally = n_qubits >= 100
        && matches!(
            local_feasibility,
            LocalFeasibility::LocalSparseOrStructured | LocalFeasibility::LocalApproximate
        );
    let sansqrit_ready = shortcomings.is_empty()
        || matches!(
            local_feasibility,
            LocalFeasibility::LocalExact | LocalFeasibility::LocalSparseOrStructured
        );

    QuantumApplicationAssessment {
        problem: problem.to_string(),
        kind,
        n_qubits,
        can_run_100q_locally,
        local_feasibility,
        recommended_algorithm,
        recommended_backend,
        selected_method: plan.selected_method,
        production_status,
        sansqrit_ready,
        shortcomings,
        next_steps,
    }
}

pub fn production_readiness_report(n_qubits: usize) -> ProductionReadinessReport {
    let mut blockers = Vec::new();
    if n_qubits >= 100 {
        blockers.push(
            "Exact dense local state-vector simulation would require exponential memory."
                .to_string(),
        );
    }

    ProductionReadinessReport {
        n_qubits,
        arbitrary_dense_local_possible: n_qubits <= 28,
        local_success_modes: vec![
            "Sparse states such as GHZ, low-support oracle states, and structured superpositions.".to_string(),
            "Small exact dense/density-matrix circuits.".to_string(),
            "External Stim/PyMatching workflows for large Clifford/QEC circuits when installed.".to_string(),
            "Approximate tensor/MPS planning for low-entanglement circuits.".to_string(),
        ],
        external_success_modes: vec![
            "cuQuantum GPU state-vector/tensor-network/density-matrix execution when CUDA/cuQuantum is installed.".to_string(),
            "Ray/Dask/MPI cluster execution when worker runtimes are configured.".to_string(),
            "Qiskit/Cirq/Braket conformance and provider-backed execution when SDKs and credentials are configured.".to_string(),
            "Azure-style fault-tolerant resource estimation for practical-scale algorithms.".to_string(),
        ],
        blockers,
        required_work: vec![
            "Implement provider job submission and credential profiles.".to_string(),
            "Implement native stabilizer tableau and MPS/tensor-network execution, not only planning.".to_string(),
            "Implement Hamiltonian/QUBO/oracle/problem-specific frontends.".to_string(),
            "Implement production checkpointing and telemetry for distributed execution.".to_string(),
            "Add CI conformance runs with Qiskit, Cirq, Stim, PyMatching, Braket, and cuQuantum where available.".to_string(),
        ],
    }
}

pub fn market_standard_capabilities() -> Vec<MarketCapability> {
    vec![
        MarketCapability {
            area: "Backend planning".to_string(),
            market_standard: "Qiskit Aer automatic methods, Braket SV1/DM1/TN1, Cirq simulator choices.".to_string(),
            sansqrit_function: "backend_plan, sparse_backend_plan, explain_engine".to_string(),
            status: "Implemented as explainable safe planner.".to_string(),
            missing_work: vec!["Attach real cost models from benchmark telemetry.".to_string()],
        },
        MarketCapability {
            area: "Hardware compilation".to_string(),
            market_standard: "Target-aware transpilation to native ISA, coupling maps, calibration-aware scheduling.".to_string(),
            sansqrit_function: "hardware_transpile_plan".to_string(),
            status: "Planning syntax implemented; executable transpiler passes still needed.".to_string(),
            missing_work: vec![
                "Native circuit DAG IR.".to_string(),
                "Routing, layout, basis translation, and scheduling passes.".to_string(),
            ],
        },
        MarketCapability {
            area: "Runtime primitives".to_string(),
            market_standard: "Sampler and Estimator primitives for shot distributions and expectation values.".to_string(),
            sansqrit_function: "sampler_plan, estimator_plan".to_string(),
            status: "Local measurement/expectation exists; provider primitive adapters still needed.".to_string(),
            missing_work: vec!["Provider job submission and async result handles.".to_string()],
        },
        MarketCapability {
            area: "Error mitigation".to_string(),
            market_standard: "Readout mitigation, twirling, dynamical decoupling, ZNE, PEC where practical.".to_string(),
            sansqrit_function: "error_mitigation_plan".to_string(),
            status: "Planning syntax implemented.".to_string(),
            missing_work: vec!["Calibration ingestion and executable mitigation transforms.".to_string()],
        },
        MarketCapability {
            area: "Resource estimation".to_string(),
            market_standard: "Logical counts, T-count, code distance, physical-qubit estimates, error budgets.".to_string(),
            sansqrit_function: "ft_resource_estimate, surface_code_plan".to_string(),
            status: "Rough local estimator implemented; Azure-grade estimator adapter still needed.".to_string(),
            missing_work: vec!["Validated FT compiler and technology-specific factories.".to_string()],
        },
        MarketCapability {
            area: "Domain modeling".to_string(),
            market_standard: "Hamiltonians, QUBO/Ising, oracles, QEC detectors, finance payoffs, ML kernels.".to_string(),
            sansqrit_function: "pauli_term, hamiltonian, qubo_model, oracle_model".to_string(),
            status: "DSL helper syntax implemented for structured metadata.".to_string(),
            missing_work: vec!["Full chemistry/QUBO/oracle compilers.".to_string()],
        },
    ]
}

pub fn build_quantum_workflow(problem: &str, n_qubits: usize) -> QuantumWorkflow {
    let assessment = assess_quantum_application(problem, n_qubits);
    let mut stages = vec![
        WorkflowStage {
            name: "Classify".to_string(),
            action: "Classify the quantum workload and expected structure.".to_string(),
            dsl_function: "assess_quantum_problem(problem, n_qubits)".to_string(),
        },
        WorkflowStage {
            name: "Model".to_string(),
            action: "Build a domain model: Hamiltonian, QUBO, oracle, circuit, or QEC detector model.".to_string(),
            dsl_function: "pauli_term / hamiltonian / qubo_model / oracle_model".to_string(),
        },
        WorkflowStage {
            name: "Plan backend".to_string(),
            action: "Choose sparse, dense, stabilizer, tensor, GPU, distributed, provider, or resource-estimation path.".to_string(),
            dsl_function: "backend_plan or sparse_backend_plan".to_string(),
        },
        WorkflowStage {
            name: "Validate".to_string(),
            action: "Run small conformance checks against local statevector, QASM round trips, and external simulators when installed.".to_string(),
            dsl_function: "conformance_plan".to_string(),
        },
    ];

    match assessment.kind {
        QuantumApplicationKind::Cryptanalysis
        | QuantumApplicationKind::MonteCarloFinance
        | QuantumApplicationKind::LinearSystems => {
            stages.push(WorkflowStage {
                name: "Estimate FT resources".to_string(),
                action: "Estimate logical qubits, T-count, code distance, and physical-qubit lower bounds.".to_string(),
                dsl_function: "ft_resource_estimate".to_string(),
            });
        }
        QuantumApplicationKind::QuantumErrorCorrection => {
            stages.push(WorkflowStage {
                name: "Decode".to_string(),
                action: "Export Stim-compatible circuits and decode syndromes with PyMatching when available.".to_string(),
                dsl_function: "qec_status / export_stim / surface_code_plan".to_string(),
            });
        }
        _ => {}
    }

    QuantumWorkflow {
        problem: problem.to_string(),
        n_qubits,
        kind: assessment.kind,
        stages,
        validation_checks: vec![
            "Norm/fidelity checks for exact simulations.".to_string(),
            "QASM 3 import/export preservation checks.".to_string(),
            "Small-circuit cross checks against Qiskit/Cirq/Stim/Braket when installed."
                .to_string(),
            "Classical baseline comparison for optimization and ML.".to_string(),
        ],
        recommended_syntax: vec![
            "let a = assess_quantum_problem(problem, n)".to_string(),
            "let p = sparse_backend_plan(n, expected_nnz)".to_string(),
            "let hw = hardware_transpile_plan(\"ibm\", n)".to_string(),
            "let mit = error_mitigation_plan(\"moderate\", 4096)".to_string(),
        ],
    }
}

pub fn rough_fault_tolerant_resource_estimate(
    logical_qubits: usize,
    t_count: u128,
    error_budget: f64,
) -> FaultTolerantResourceEstimate {
    let safe_error = if error_budget > 0.0 {
        error_budget
    } else {
        1e-3
    };
    let log_scale = ((t_count.max(1) as f64) / safe_error)
        .log10()
        .ceil()
        .max(1.0) as usize;
    let mut distance = (2 * log_scale + 1).max(3);
    if distance % 2 == 0 {
        distance += 1;
    }
    let per_patch = 2u128 * distance as u128 * distance as u128;
    let physical = logical_qubits as u128 * per_patch;

    FaultTolerantResourceEstimate {
        logical_qubits,
        t_count,
        error_budget: safe_error,
        code_distance_hint: distance,
        physical_qubits_lower_bound: physical,
        notes: vec![
            "This is a rough lower-bound estimate, not a replacement for Azure Quantum Resource Estimator.".to_string(),
            "Magic-state factories, routing overhead, lattice surgery, and technology-specific timing are not included.".to_string(),
        ],
    }
}

pub fn surface_code_plan(
    logical_qubits: usize,
    distance: usize,
    rounds: usize,
    physical_error_rate: f64,
) -> SurfaceCodePlan {
    let distance = distance.max(3);
    let data_qubits_per_patch = 2 * distance * distance;
    SurfaceCodePlan {
        logical_qubits,
        distance,
        rounds,
        physical_error_rate,
        data_qubits_per_patch,
        physical_qubits_lower_bound: logical_qubits as u128 * data_qubits_per_patch as u128,
        notes: vec![
            "Use odd distances for standard surface-code studies.".to_string(),
            "Decoder integration should use Stim detector sampling plus PyMatching MWPM."
                .to_string(),
        ],
    }
}

pub fn error_mitigation_plan(noise_level: &str, shots: usize) -> ErrorMitigationPlan {
    let level = noise_level.to_ascii_lowercase();
    let mut methods = vec![
        "readout calibration matrix".to_string(),
        "measurement-error mitigation".to_string(),
        "randomized compiling / Pauli twirling".to_string(),
    ];
    let mut warnings = Vec::new();
    if level == "moderate" || level == "high" {
        methods.push("zero-noise extrapolation".to_string());
        methods.push("dynamical decoupling for idle windows".to_string());
    }
    if level == "high" {
        warnings.push(
            "High-noise results need hardware calibration and classical validation before use."
                .to_string(),
        );
    }
    if shots < 1024 {
        warnings
            .push("Shot count is low for mitigation; consider at least 4096 shots.".to_string());
    }

    ErrorMitigationPlan {
        shots,
        noise_level_label: noise_level.to_string(),
        methods,
        validation: vec![
            "Run unmitigated and mitigated outputs side by side.".to_string(),
            "Track confidence intervals and quasi-probability negativity.".to_string(),
            "Benchmark against exact simulator for small circuit slices.".to_string(),
        ],
        warnings,
    }
}

pub fn hardware_transpile_plan(target: &str, n_qubits: usize) -> HardwareTranspilePlan {
    let lower = target.to_ascii_lowercase();
    let (basis, connectivity) = if lower.contains("ibm") {
        (
            vec!["rz", "sx", "x", "ecr", "measure"],
            "heavy-hex / target coupling map",
        )
    } else if lower.contains("braket") || lower.contains("aws") {
        (
            vec!["h", "x", "rz", "cnot", "cz", "measure"],
            "device ARN dependent",
        )
    } else if lower.contains("ion") || lower.contains("ionq") {
        (
            vec!["gpi", "gpi2", "ms", "measure"],
            "all-to-all with native ion gates",
        )
    } else {
        (
            vec!["h", "x", "rz", "cx", "measure"],
            "unknown; require target profile",
        )
    };

    let mut warnings = Vec::new();
    if n_qubits > 100 {
        warnings.push(
            "Check provider queue, topology, calibration age, and circuit depth before submission."
                .to_string(),
        );
    }

    HardwareTranspilePlan {
        target: target.to_string(),
        n_qubits,
        basis_gates: basis.into_iter().map(str::to_string).collect(),
        connectivity: connectivity.to_string(),
        passes: vec![
            "basis translation".to_string(),
            "initial layout".to_string(),
            "routing / swap insertion".to_string(),
            "gate cancellation".to_string(),
            "scheduling / timing preservation".to_string(),
            "measurement mapping".to_string(),
        ],
        warnings,
    }
}

fn local_feasibility(kind: QuantumApplicationKind, n_qubits: usize) -> LocalFeasibility {
    if n_qubits <= 20 {
        return LocalFeasibility::LocalExact;
    }
    match kind {
        QuantumApplicationKind::QuantumErrorCorrection => {
            LocalFeasibility::ExternalAcceleratorRecommended
        }
        QuantumApplicationKind::Cryptanalysis
        | QuantumApplicationKind::MonteCarloFinance
        | QuantumApplicationKind::LinearSystems => LocalFeasibility::FaultTolerantRequired,
        QuantumApplicationKind::Chemistry
        | QuantumApplicationKind::Materials
        | QuantumApplicationKind::DrugDiscovery
        | QuantumApplicationKind::QuantumSimulation => {
            if n_qubits <= 100 {
                LocalFeasibility::LocalApproximate
            } else {
                LocalFeasibility::ExternalProviderRequired
            }
        }
        QuantumApplicationKind::Optimization
        | QuantumApplicationKind::MachineLearning
        | QuantumApplicationKind::Search => {
            if n_qubits <= 128 {
                LocalFeasibility::LocalSparseOrStructured
            } else {
                LocalFeasibility::ExternalProviderRequired
            }
        }
        QuantumApplicationKind::HardwareUtility => LocalFeasibility::ExternalProviderRequired,
        QuantumApplicationKind::Unknown => LocalFeasibility::NotEnoughInformation,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_assess_chemistry_120_is_not_local_dense() {
        let assessment = assess_quantum_application("chemistry hamiltonian", 120);
        assert_eq!(assessment.kind, QuantumApplicationKind::Chemistry);
        assert!(!assessment.can_run_100q_locally);
        assert!(assessment.shortcomings.iter().any(|s| s.contains("100+")));
    }

    #[test]
    fn test_assess_qec_points_to_external_stack() {
        let assessment = assess_quantum_application("surface code qec decoder", 1000);
        assert_eq!(
            assessment.kind,
            QuantumApplicationKind::QuantumErrorCorrection
        );
        assert!(assessment.recommended_algorithm.contains("Stim"));
    }

    #[test]
    fn test_readiness_report_marks_dense_limit() {
        let report = production_readiness_report(120);
        assert!(!report.arbitrary_dense_local_possible);
        assert!(!report.blockers.is_empty());
    }

    #[test]
    fn test_market_workflow_and_resource_helpers() {
        let caps = market_standard_capabilities();
        assert!(caps.iter().any(|c| c.area == "Resource estimation"));

        let workflow = build_quantum_workflow("rsa cryptanalysis", 2048);
        assert_eq!(workflow.kind, QuantumApplicationKind::Cryptanalysis);
        assert!(workflow.stages.iter().any(|s| s.name.contains("Estimate")));

        let estimate = rough_fault_tolerant_resource_estimate(100, 1_000_000, 1e-3);
        assert!(estimate.code_distance_hint >= 3);

        let mitigation = error_mitigation_plan("high", 512);
        assert!(!mitigation.warnings.is_empty());
    }
}
