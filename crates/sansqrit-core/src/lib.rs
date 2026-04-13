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

// Re-exports for convenience
pub use complex::{Amplitude, c, c_real, c_imag, c_zero, c_one, c_exp_i};
pub use sparse::SparseStateVec;
pub use gates::{GateKind, GateOp};
pub use lookup::GateLookupTable;
pub use engine::{QuantumEngine, EngineKind};
pub use measurement::MeasurementResult;
pub use distributed::{DistributedExecutor, DistributedConfig};
pub use qasm_export::{ExportFormat, CircuitInfo, export_circuit, export_to_file};
