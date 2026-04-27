//! # Sansqrit Core
//!
//! The quantum simulation engine powering the Sansqrit DSL.
//!
//! ## Three-Tier Engine Architecture
//!
//! | Engine  | Qubits | Strategy |
//! |---------|--------|----------|
//! | Dense   | ≤20    | Full state vector, fastest for small circuits |
//! | Sparse  | ≤28    | Only non-zero amplitudes stored |
//! | Chunked | >28    | Splits into 10-qubit chunks, parallel execution |
//!
//! ## Key Features
//!
//! - **Sparse by default**: 100-qubit GHZ state uses ~100 bytes
//! - **O(1) gate lookup**: Pre-computed gate tables for instant application
//! - **Parallel execution**: Rayon-based threading for chunked engine
//! - **Hardware export**: OpenQASM, IBM, IonQ, Cirq, Braket

pub mod advanced_engines;
pub mod algorithms;
pub mod applications;
pub mod backend_planner;
pub mod circuit_library;
pub mod circuits;
pub mod complex;
pub mod conformance;
pub mod distributed;
pub mod engine;
pub mod external;
pub mod gates;
pub mod gpu;
pub mod lookup;
pub mod measurement;
pub mod mitigation;
pub mod openqasm3_import;
pub mod provider;
pub mod qasm_export;
pub mod qec;
pub mod qec_pipeline;
pub mod sharding;
pub mod sparse;
pub mod stabilizer;
pub mod tensor_engines;
pub mod transpiler;

// Re-exports for convenience
pub use advanced_engines::{
    advanced_engine_capabilities, AdvancedEngineCapability, AdvancedEngineKind, DensityMatrixEngine,
};
pub use algorithms::{
    amplitude_estimation, bb84_qkd, bernstein_vazirani, deutsch_jozsa, grover_search,
    grover_search_multi, hhl_solve, qaoa_maxcut, quantum_counting, quantum_phase_estimation,
    quantum_walk_line, shor_factor, simon_algorithm, superdense_coding, swap_test, teleport,
    variational_classifier, vqe, vqe_h2,
};
pub use applications::{
    assess_quantum_application, build_quantum_workflow, classify_quantum_problem,
    error_mitigation_plan, hardware_transpile_plan, market_standard_capabilities,
    production_readiness_report, rough_fault_tolerant_resource_estimate, surface_code_plan,
    ErrorMitigationPlan, FaultTolerantResourceEstimate, HardwareTranspilePlan, LocalFeasibility,
    MarketCapability, ProductionReadinessReport, QuantumApplicationAssessment,
    QuantumApplicationKind, QuantumWorkflow, SurfaceCodePlan, WorkflowStage,
};
pub use backend_planner::{
    BackendAvailability, BackendPlan, BackendPlanner, CircuitProfile, PlannerConfig,
    SimulationMethod, WorkloadKind,
};
pub use circuit_library::{
    amplitude_amplification_circuit, apply_circuit_template, bell_state_circuit,
    bernstein_vazirani_circuit, bit_flip_code_circuit, block_encoding_circuit,
    boson_sampling_circuit, braiding_circuit, circuit_family_catalog, ctqw_circuit,
    data_reuploading_circuit, deutsch_jozsa_circuit, dtqw_circuit, element_distinctness_circuit,
    ghz_state_circuit, grover_circuit, hardware_efficient_ansatz_circuit, hhl_circuit,
    mbqc_cluster_circuit, phase_flip_code_circuit, qaoa_circuit, qec_circuit, qft_circuit,
    qnn_circuit, qpe_circuit, qsp_circuit, qsvt_circuit, quantum_counting_circuit,
    quantum_kernel_estimation_circuit, quantum_walk_circuit, shor_9qubit_code_circuit,
    shor_factoring_circuit, steane_code_circuit, superdense_coding_circuit, surface_code_circuit,
    swap_test_circuit, szegedy_walk_circuit, teleportation_circuit, triangle_finding_circuit,
    vqc_circuit, vqe_ansatz_circuit, CircuitRegister, CircuitTemplate,
};
pub use circuits::{
    amplitude_encoding, angle_encoding, basis_encoding, bit_flip_encode, create_cat_state,
    create_cluster_state, create_dicke_state, create_w_state, draper_qft_adder,
    entanglement_swapping, hardware_efficient_ansatz, phase_flip_encode, quantum_multiplier,
    random_circuit, shor_9qubit_encode, steane_7qubit_encode, uccsd_ansatz,
};
pub use complex::{c, c_exp_i, c_imag, c_one, c_real, c_zero, Amplitude};
pub use conformance::{
    conformance_plan, conformance_python_harness, ConformancePlan, ConformanceTarget,
};
pub use distributed::{
    DistributedConfig, DistributedExecutionPlan, DistributedExecutor, DistributedRuntime,
};
pub use engine::{EngineKind, QuantumEngine};
pub use external::{
    detect_all_integrations, detect_integration, require_integration, IntegrationKind,
    IntegrationStatus,
};
pub use gates::{GateKind, GateOp};
pub use gpu::{plan_cuquantum_backend, GpuBackendPlan, GpuComponent};
pub use lookup::GateLookupTable;
pub use measurement::MeasurementResult;
pub use mitigation::{
    mitigate_single_qubit_readout, zero_noise_extrapolate, MitigatedDistribution,
    ReadoutCalibration,
};
pub use openqasm3_import::{import_qasm3, Qasm3Import, Qasm3ImportError, Qasm3Measurement};
pub use provider::{
    provider_script, submit_provider_job, ProviderJobRequest, ProviderJobResult, ProviderKind,
};
pub use qasm_export::{export_circuit, export_to_file, CircuitInfo, ExportFormat};
pub use qec::{export_stim_circuit, qec_integration_status, QecIntegrationStatus, StimExport};
pub use qec_pipeline::{
    decode_repetition_code, qec_pipeline_plan, QecPipelinePlan, RepetitionDecodeResult,
};
pub use sharding::{
    choose_local_qubits, dense_state_bytes_exact, ShardGatePlan, ShardGateStrategy, ShardPlan,
};
pub use sparse::SparseStateVec;
pub use stabilizer::{is_supported_clifford, Pauli, StabilizerEngine, StabilizerGenerator};
pub use tensor_engines::{tensor_network_plan, MpsEngine, TensorNetworkPlan};
pub use transpiler::{transpile_circuit, TranspileResult, TranspileTarget};
