# Sansqrit Industry Gap Analysis

Checked: 2026-04-27

This document tracks what Sansqrit needs to reach serious parity with mature
quantum software stacks. It is deliberately blunt: matching Qiskit, Azure
Quantum, Amazon Braket, Cirq, Stim, PyMatching, and cuQuantum is a multi-release
program, not a one-patch feature.

## Sources Reviewed

- Qiskit Aer `AerSimulator`: automatic, statevector, density matrix, stabilizer,
  extended stabilizer, matrix product state, unitary, superop, tensor network,
  GPU, MPI/cache-blocking, batching, and memory limits.
  <https://qiskit.github.io/qiskit-aer/stubs/qiskit_aer.AerSimulator.html>
- NVIDIA cuQuantum: state-vector, tensor-network, MPS, tensor slicing, and
  density-matrix oriented APIs.
  <https://docs.nvidia.com/cuda/cuquantum/latest/>
- OpenQASM 3 language specification: classical control, extern calls,
  subroutines, timing, delay, frames, calibration-oriented semantics, and
  hardware-native gate relationships.
  <https://openqasm.com/versions/3.0/language/index.html>
- Stim: high-performance stabilizer and QEC circuit simulation.
  <https://github.com/quantumlib/Stim>
- PyMatching: fast MWPM decoding for QEC syndrome data, with Stim integration.
  <https://pymatching.readthedocs.io/en/stable/>
- Microsoft Azure Quantum Resource Estimator: logical/physical qubits, runtime,
  QEC schemes, hardware assumptions, and formula transparency.
  <https://learn.microsoft.com/en-us/azure/quantum/intro-to-resource-estimation>
- Amazon Braket devices and simulators: local simulators plus SV1, DM1, TN1,
  QPU device access, and hardware provider routing.
  <https://docs.aws.amazon.com/braket/latest/developerguide/braket-devices.html>
- Cirq simulation docs: pure-state and density-matrix simulation model, noise,
  precision selection, and external simulator interfaces.
  <https://quantumai.google/cirq/simulate/simulation>

## Implemented In This Pass

- Added an explainable backend planner in `sansqrit-core`.
- Replaced hard-coded `engine("auto")` selection with planner-based selection.
- Added `QuantumEngine::backend_plan` and `QuantumEngine::with_backend_plan`.
- Added explicit `SimulationMethod` families aligned with industry terminology:
  dense state vector, sparse state vector, chunked sparse, distributed state
  vector, density matrix, stabilizer, extended stabilizer, matrix product state,
  tensor network, GPU state vector, GPU tensor network, QEC stabilizer, resource
  estimator, and external hardware.
- Added `CircuitProfile` so future parser/interpreter passes can report circuit
  size, Clifford/non-Clifford mix, noise, QEC detectors, measurements, resets,
  entanglement width, and expected sparsity.
- Added safe-mode enforcement for explicit dense requests. A 120-qubit dense
  request now falls back to chunked/distributed planning instead of trying to
  allocate an impossible state vector.
- Added dense amplitude-sharding plans with worker-local gates, pairwise shard
  exchange, multi-shard exchange, transfer estimates, and per-worker memory
  limits.
- Added tests for planner selection, 120-qubit sharding, safe dense fallback,
  QEC planner behavior, and Clifford planner behavior.
- Added DSL builtins: `backend_plan`, `explain_engine`, `integration_status`,
  `cuquantum_plan`, `qec_status`, `stim_export`, `qasm3_import`,
  `advanced_engines`, `distributed_plan`, `conformance_plan`, and
  `conformance_harness`.
- Added external adapter detection for Ray, Dask, MPI, cuQuantum, Stim,
  PyMatching, Qiskit, Cirq, and Braket.
- Added a small exact density-matrix engine for native low-qubit noisy-engine
  groundwork, plus capability records for stabilizer, MPS, and tensor-network
  engines.
- Added OpenQASM 3 import for executable gate subsets while preserving
  classical control, timing, externs, and calibration blocks as metadata.
- Added Stim export for supported Clifford circuits and warnings for unsupported
  non-Clifford/QEC paths.
- Added conformance-test planning and a Python harness template that skips
  unavailable external packages.
- Added quantum-application assessment for chemistry/materials, simulation,
  optimization, ML, cryptanalysis, search, linear systems, finance, QEC, and
  hardware utility workloads. The DSL now exposes `assess_quantum_problem`,
  `quantum_challenge_assessment`, `solve_strategy`, and
  `production_readiness`.

## Backend Planner Gaps

- Add a DSL-facing `backend_plan()` function that prints method, memory,
  fallback chain, shard count, warnings, and reasons.
- Add circuit profiling from real DSL AST/circuit logs, not only manual
  `CircuitProfile` construction.
- Add exact feature-gating for optional integrations: `qiskit`, `cirq`, `braket`,
  `stim`, `pymatching`, `cuquantum`, `mpi`, `ray`, and `dask`.
- Add configuration file support for memory budgets, GPU availability, cluster
  topology, target provider, precision, batching, checkpoint paths, and safe
  mode.
- Add policy modes:
  - `safe`: never allocate dense states beyond budget.
  - `exact`: reject approximate methods unless explicitly allowed.
  - `approx`: allow extended stabilizer, MPS truncation, tensor-network slicing,
    and reduced precision.
  - `hardware`: compile/export instead of local simulation.
- Add planner explanations to runtime errors so a failed simulation reports the
  chosen method, the rejected alternatives, and the next recommended backend.

## Simulation Method Gaps

- Dense state vector:
  - Add a true dense array engine for small fully dense states.
  - Add SIMD kernels and multithreaded gate application.
  - Add sampling optimized for final measurements.
  - Add precision options: complex64 and complex128.
- Sparse state vector:
  - Keep as default for GHZ, oracle, and low-support states.
  - Add pruning threshold and exact/no-prune modes.
  - Add sparse gate fusion and batch application.
- Chunked sparse:
  - Add gate batching across chunk boundaries.
  - Add hot-qubit remapping to reduce cross-shard exchanges.
  - Add checkpoint/resume.
- Density matrix:
  - Add mixed-state representation.
  - Add Kraus channels, reset noise, thermal relaxation, depolarizing,
    amplitude damping, phase damping, and readout error.
  - Add trajectory simulation as an alternative when exact density matrix is too
    large.
- Stabilizer:
  - Add tableau representation for Clifford circuits.
  - Add Pauli measurement, reset, detector, and observable support.
  - Route large Clifford circuits away from sparse amplitude simulation.
- Extended stabilizer:
  - Add approximate Clifford+T decomposition only under explicit approximate
    mode.
  - Report error bounds and T-count sensitivity.
- MPS and tensor network:
  - Add MPS backend with bond-dimension controls.
  - Add truncation thresholds and exact no-truncation mode.
  - Add tensor-network contraction planner and slicing.
- Unitary and superoperator:
  - Add optional unitary simulation for compiler verification.
  - Add superoperator simulation for channel-level tests.
- Resource estimation:
  - Add logical/physical qubit estimates, T-count, T-depth, QEC code distance,
    runtime, and hardware assumption models.

## Distributed Execution Gaps

- Add a real distributed runtime abstraction:
  - single process
  - thread pool
  - Ray
  - Dask
  - MPI
  - custom worker RPC
- Add worker-local gate batches for gates touching only local amplitude bits.
- Add pairwise shard exchange for gates touching one shard-prefix bit.
- Add staged multi-shard exchange for gates touching multiple shard-prefix bits.
- Add compressed state transfer:
  - zero-run compression
  - sparse support compression
  - quantized lossy compression only in approximate mode
  - checksum validation for exact mode
- Add checkpointing:
  - periodic shard snapshots
  - manifest with circuit offset and RNG seed
  - atomic writes
  - resume after worker failure
- Add execution telemetry:
  - bytes transferred
  - shard swaps
  - local gates
  - global gates
  - compression ratio
  - checkpoint time
  - fallback events
- Add cluster safety:
  - refuse dense sharding when shard count is astronomically high unless a real
    cluster backend is configured.
  - keep sparse fallback enabled for states with tiny support.

## 120-Qubit Dense Sharding Analysis

A dense `n`-qubit state vector stores `2^n` complex amplitudes. At 16 bytes per
complex128 amplitude, 120 dense qubits require `16 * 2^120 = 2^124` bytes. This
is not a workstation-scale allocation.

With a 1 GiB worker memory limit:

- one shard can store `2^26` amplitudes because `16 * 2^26 = 2^30` bytes.
- local shard width is 26 qubits.
- shard-prefix width is `120 - 26 = 94` bits.
- the exact dense state therefore needs `2^94` logical shards.

That number is far beyond practical cluster execution. The correct safe planner
behavior is:

- Use sparse/chunked simulation when the state support is small.
- Use external tensor-network, stabilizer, or resource-estimation backends when
  the circuit structure permits it.
- Reject or warn for exact dense execution unless a production distributed
  backend, storage layer, and checkpoint policy are configured.
- Keep fallback enabled if dense execution fails or memory estimates exceed
  limits.

The new `ShardPlan` encodes this explicitly. It can classify gates as
worker-local, pairwise exchange, multi-shard exchange, or global fallback.

## QEC Gaps

- Keep the current built-in surface-code decoder labeled educational.
- Add a detector-error-model data structure compatible with Stim-style workflows.
- Add Stim export/import for QEC circuits.
- Add PyMatching-compatible syndrome and graph export.
- Add MWPM decode results, correction application, logical observable failure
  tracking, and threshold experiment helpers.
- Add QEC conformance tests:
  - repetition code
  - rotated surface code
  - toric code
  - detector sampling round trips
  - logical error rate smoke tests

## GPU Gaps

- Add feature-gated GPU backend trait with CPU fallback.
- Add cuQuantum-style architecture:
  - state-vector kernels
  - tensor-network contraction/slicing
  - density-matrix kernels
  - MPS operations
  - workspace/memory manager
- Add device discovery, memory budget checks, and multi-GPU chunking.
- Add batched-shot and batched-parameter execution.
- Add GPU-specific tests that are skipped when CUDA is unavailable.

## OpenQASM 3 Gaps

- Add OpenQASM 3 parser/importer, not only exporter.
- Add classical registers and bit/array slicing semantics.
- Add mid-circuit measurement and classical control.
- Add loops, branches, breaks, continues, and subroutines.
- Add `extern` declarations and calls.
- Add timing types, delay, barrier timing, stretch, frames, play, and capture.
- Add calibration block preservation and hardware-native decomposition.
- Add QASM 3 round-trip conformance tests.

## Provider And Hardware Gaps

- IBM/Qiskit:
  - target model
  - coupling map
  - basis gates
  - transpiler passes
  - primitives-like sampler and estimator API
  - backend noise model import
- Azure Quantum:
  - QIR/Q# bridge
  - resource-estimation API
  - target profile support
  - job submission abstraction
- Amazon Braket:
  - device ARN and region model
  - local simulator adapters
  - SV1/DM1/TN1 target selection
  - hybrid job packaging
  - OpenQASM 3 and Braket IR export/import
- Cirq:
  - Cirq JSON export/import
  - device constraints
  - moments/scheduling model
  - noiseless and noisy simulator conformance fixtures

## Formal Verification And Conformance Gaps

- Add optional Python-based conformance tests for small circuits against:
  - Qiskit Aer
  - Cirq
  - Stim
  - Amazon Braket local simulators
- Add QASM 2 and QASM 3 round-trip tests.
- Add property tests:
  - every gate preserves norm in exact modes
  - inverse gates undo gates
  - measurement probabilities sum to 1
  - exported and imported circuits are equivalent
- Add stabilizer-specific tests:
  - Clifford circuits match Stim/Qiskit stabilizer simulation
  - non-Clifford circuits are rejected by stabilizer exact mode
- Add QEC tests:
  - generated detector samples decode consistently
  - known single faults produce expected corrections
- Add CI matrix:
  - Rust stable
  - Windows/Linux/macOS
  - optional Python conformance environment
  - optional CUDA runners

## Immediate Next Build Targets

1. Promote the external adapter layer into feature-gated provider crates.
2. Add real Ray/Dask/MPI worker processes with shard manifests and checkpoint
   storage.
3. Add cuQuantum execution calls behind a CUDA/cuQuantum feature instead of only
   planning/probing.
4. Add full QEC detector-error-model generation and PyMatching correction
   application.
5. Extend OpenQASM 3 import from preservation of timing/classical/calibration
   metadata into full execution semantics.
6. Add executable conformance tests in CI environments that install
   Qiskit/Cirq/Stim/Braket.

## Production Reality For 100+ Local Qubits

Sansqrit can support 100+ qubit local workflows only when the circuit structure
allows it:

- sparse states with tiny support, such as GHZ-like states.
- Clifford/stabilizer/QEC circuits via Stim-style external execution.
- low-entanglement circuits through future MPS/tensor-network execution.
- resource-estimation and planning workflows that do not allocate a dense
  state vector.

Sansqrit cannot, and should not claim to, exactly simulate arbitrary dense
100+ qubit states on commodity local hardware. A dense 100-qubit complex128
state needs `16 * 2^100` bytes. A dense 120-qubit state needs `2^124` bytes.
The production behavior must be safe refusal, structured fallback, or external
HPC/provider execution.
