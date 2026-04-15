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

pub mod complex;
pub mod sparse;
pub mod gates;
pub mod lookup;
pub mod engine;
pub mod measurement;
pub mod distributed;
pub mod qasm_export;
pub mod algorithms;
pub mod circuits;

// Re-exports for convenience
pub use complex::{Amplitude, c, c_real, c_imag, c_zero, c_one, c_exp_i};
pub use sparse::SparseStateVec;
pub use gates::{GateKind, GateOp};
pub use lookup::GateLookupTable;
pub use engine::{QuantumEngine, EngineKind};
pub use measurement::MeasurementResult;
pub use distributed::{DistributedExecutor, DistributedConfig};
pub use qasm_export::{ExportFormat, CircuitInfo, export_circuit, export_to_file};
pub use algorithms::{
    grover_search, grover_search_multi, shor_factor, vqe, vqe_h2,
    qaoa_maxcut, quantum_phase_estimation, hhl_solve,
    bernstein_vazirani, simon_algorithm, deutsch_jozsa,
    quantum_walk_line, quantum_counting, swap_test,
    teleport, superdense_coding, bb84_qkd,
    amplitude_estimation, variational_classifier,
};
pub use circuits::{
    create_w_state, create_cluster_state, create_dicke_state, create_cat_state,
    draper_qft_adder, quantum_multiplier,
    amplitude_encoding, angle_encoding, basis_encoding,
    random_circuit,
    bit_flip_encode, phase_flip_encode, shor_9qubit_encode, steane_7qubit_encode,
    hardware_efficient_ansatz, uccsd_ansatz,
    entanglement_swapping,
};
