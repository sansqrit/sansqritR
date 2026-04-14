# Sansqrit

**Hybrid Classical-Quantum Programming Language for Scientists**

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Rust](https://img.shields.io/badge/rust-1.75+-orange.svg)](https://www.rust-lang.org)

Sansqrit is a free, open-source DSL that lets scientists run quantum computations using simple, Python-like syntax — without learning quantum computing frameworks. Under the hood, it compiles to high-performance Rust and uses sparse matrix simulation to run **100+ qubits on a laptop**.

```
# 5 lines to find H2 ground state energy — replaces 60+ lines of Qiskit
import chemistry
let h2 = molecule("H2")
let result = vqe(h2)
print(f"Ground state energy: {result.energy:.6f} Ha")
```

---

## Why Sansqrit?

Existing frameworks (Qiskit, Cirq, PennyLane) require substantial software engineering knowledge. Sansqrit eliminates this overhead with a three-tier quantum engine that auto-selects the optimal simulation strategy.

| Engine | Qubits | Memory (30q) | Strategy |
|--------|--------|-------------|----------|
| **Dense** | ≤20 | Full 2ⁿ vector | Fastest for small circuits |
| **Sparse** | ≤28 | Only non-zero amps | 100-qubit GHZ = 100 bytes |
| **Chunked** | Unlimited | 10-qubit shards | Parallel via Rayon threads |

### Key Features

- **Python-like syntax** — any scientist can read and write it in under an hour
- **O(1) lookup table gates** — pre-computed gate results, 50–200× faster than naive simulation
- **Spark-like distributed execution** — splits registers into 10-qubit chunks
- **7 science packages** — chemistry, biology, genetics, medical, physics, ML, math
- **Hardware export** — OpenQASM 2/3, IBM Quantum, IonQ, Google Cirq, AWS Braket
- **Apache 2.0** — free forever, commercial use fully permitted

---

## Installation

### Prerequisites

| Requirement | Minimum | Why |
|-------------|---------|-----|
| Rust | 1.80+ | Compiles the engine |
| Python 3 | 3.8+ | Generates lookup tables |
| NumPy | Latest | Used by table generator |
| RAM | 4 GB (8 recommended) | Quantum sim is memory-intensive |

### Install via Cargo (all platforms)

```bash
# Install Rust (if needed):
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# Install Sansqrit:
cargo install sansqrit-lang

# Verify:
sansqrit version
```

### Build from Source

```bash
git clone https://github.com/sansqrit-lang/sansqrit.git
cd sansqrit
cargo build --release

# Generate O(1) lookup tables (one-time, ~30 seconds):
pip3 install numpy
python3 tools/precompute/generate_blobs.py --verify

# Run a sample:
./target/release/sansqrit run samples/hello.sq
```

---

## Quick Start

### Hello Quantum World

Create `hello.sq`:

```python
print("Hello, Quantum World!")

simulate {
    let q = quantum_register(2)
    H(q[0])                    # Hadamard: superposition
    CNOT(q[0], q[1])           # Entangle
    let result = measure_all(q, shots=1000)
    print("Bell state:", result)
    # Output: {"00": ~500, "11": ~500}
}
```

```bash
sansqrit run hello.sq
```

### 100-Qubit GHZ State (on your laptop!)

```python
simulate(engine="chunked") {
    let q = quantum_register(100)
    H(q[0])
    for i in range(99) {
        CNOT(q[i], q[i+1])
    }
    print(f"Non-zero amplitudes: {engine_nnz()}")  # Always 2!
    print(f"Memory used: ~100 bytes (vs 10^30 for dense)")
    let results = measure_all(q, shots=200)
    print("Results:", results)
}
```

---

## Language Reference

### Variables and Types

```python
let n_qubits = 10          # Integer
let energy = -1.137275     # Float
let name = "H2O"           # String
let converged = true        # Boolean
const PLANCK = 6.626e-34   # Immutable constant
```

### Control Flow

```python
if temp > 38.5 { print("Fever") }
else if temp > 37.5 { print("Mild") }
else { print("Normal") }

for i in range(10) { print(i) }
while energy > tol { energy *= 0.5 }

match result {
    Ok(e) => print(f"Energy: {e}"),
    Err(e) => print(f"Error: {e}"),
    _ => print("Unknown"),
}
```

### Functions

```python
fn greet(name: string) -> string {
    return f"Hello, {name}!"
}

fn statistics(data: list) -> (float, float) {
    return (mean(data), stdev(data))
}

let square = fn(x) => x * x           # Lambda
let result = data |> filter(fn(x) => x > 0) |> sum  # Pipeline
```

### Quantum Gates

| Gate | Call | What It Does |
|------|------|-------------|
| Hadamard | `H(q[0])` | Creates superposition |
| Pauli-X | `X(q[0])` | Bit flip (NOT) |
| Pauli-Y | `Y(q[0])` | Rotation + phase |
| Pauli-Z | `Z(q[0])` | Phase flip |
| Rx(θ) | `Rx(q[0], PI/4)` | X-axis rotation |
| Ry(θ) | `Ry(q[0], PI/2)` | Y-axis rotation (VQE) |
| Rz(θ) | `Rz(q[0], PI/3)` | Z-axis rotation |
| CNOT | `CNOT(q[0], q[1])` | Controlled-NOT |
| CZ | `CZ(q[0], q[1])` | Controlled-Z |
| SWAP | `SWAP(q[0], q[1])` | Exchange qubits |
| Toffoli | `Toffoli(q[0], q[1], q[2])` | Flip if both controls |
| QFT | `qft(q)` | Quantum Fourier Transform |

### Measurement

```python
simulate {
    let q = quantum_register(4)
    H(q[0]); CNOT(q[0], q[1])

    let bit = measure(q[0])                # Single qubit → 0 or 1
    let hist = measure_all(q, shots=10000) # Histogram
    let probs = probabilities(q)           # All probabilities
    let ez = expectation_z(q[0])           # ⟨Z⟩ = P(0) - P(1)
    let ezz = expectation_zz(q[0], q[1])  # Two-body ⟨ZZ⟩
}
```

---

## Science Packages

### Chemistry — `import chemistry`

```python
import chemistry
molecule H2 { atoms: [H, H], bond_length: 0.74, basis_set: "STO-3G" }

simulate {
    let result = vqe(H2, ansatz="EfficientSU2", layers=2)
    print(f"Ground state: {result.energy:.6f} Hartree")

    let pes = potential_energy_surface(H2, parameter="bond_length",
        range=(0.4, 3.0, 0.1), method="VQE")
}
```

### Biology — `import biology`

```python
import biology
let dna = "ATGCGATCGATCG"
let rna = dna.transcribe()
let protein = rna.translate()

simulate {
    let fold = fold_protein("HPPHPPHH", method="QAOA", n_layers=3)
    print(f"Energy: {fold.energy:.4f}")
}
```

### Medical — `import medical`

```python
import medical
let hits = screen_drugs(target="ACE2", library=load_library("FDA_approved"), top_n=10)
let vaccine = design_vaccine(protein=spike, mhc_alleles=["HLA-A*02:01"])
```

### Physics — `import physics`

```python
import physics
let model = ising_model(n_spins=8, J=1.0, h=1.0)
let gs = ground_state_energy(model)
let maxcut = solve_maxcut(edges=[(0,1),(1,2),(2,3)], n_nodes=4, layers=3)
```

### Machine Learning — `import ml`

```python
import ml
simulate {
    let qnn = quantum_neural_net(n_qubits=4, n_layers=4, encoding="angle")
    let history = qnn.train(x_train, y_train, epochs=100)
}
```

### Mathematics — `import math`

```python
import math
simulate {
    let factors = shor_factor(15)          # [3, 5]
    let found = grover_search(n_qubits=7, target=42)
    let x = hhl_solve(A, b)               # Quantum linear solver
}
```

---

## Hardware Export

Export circuits to run on real quantum computers:

```python
circuit MyCircuit {
    let q = quantum_register(3)
    H(q[0]); CNOT(q[0], q[1]); CNOT(q[1], q[2])
    measure_all(q)
}

MyCircuit.export_qasm("circuit.qasm")      # OpenQASM 2.0
MyCircuit.export_ibm("circuit_ibm.json")   # IBM Quantum
MyCircuit.export_ionq("circuit_ionq.json") # IonQ
MyCircuit.export_cirq("circuit.py")        # Google Cirq
MyCircuit.export_braket("circuit.py")      # AWS Braket
```

```bash
sansqrit qasm hello.sq --format ibm
```

---

## Lookup Tables (O(1) Gate Application)

The lookup table system pre-computes every gate result for 10-qubit chunks. At runtime: **one memory read per gate** instead of thousands of arithmetic operations.

```bash
# Generate tables (one-time, ~30 seconds):
python3 tools/precompute/generate_blobs.py --verify

# Files created in data/gates/:
#   single_qubit_all.bin    ~6 MB    27 gates × 10 qubits × 1024 states
#   two_qubit_all.bin       ~45 MB   10 gates × 90 pairs × 1024 states
#   phase_table.bin         ~1 MB    65536 pre-computed e^(iθ) values
#   manifest.json           <1 KB    gate name → byte offset
```

Place `data/gates/` next to your `.sq` files — Sansqrit detects and uses it automatically.

---

## Distributed Execution

For circuits beyond a single machine:

```python
simulate(engine="chunked") {
    let q = quantum_register(50)     # 5 chunks of 10 qubits
    H_all(q)                         # All 50 H gates in parallel
    CNOT(q[9], q[10])                # Cross-chunk: transparent
    qft(q)                           # Full 50-qubit QFT
    let bits = measure_all(q)

    for stat in chunk_stats(q) {
        print(f"Qubits {stat.offset}..{stat.offset+9}: nnz={stat.nnz}")
    }
}
```

---

## Project Structure

```
sansqrit/
├── Cargo.toml                      # Workspace root
├── crates/
│   ├── sansqrit-core/              # Quantum engines (dense/sparse/chunked)
│   │   └── src/
│   │       ├── complex.rs          # Complex number types
│   │       ├── sparse.rs           # Sparse state vector
│   │       ├── gates.rs            # All quantum gates
│   │       ├── lookup.rs           # O(1) lookup table system
│   │       ├── engine.rs           # 3-tier quantum engine
│   │       ├── measurement.rs      # Measurement & statistics
│   │       ├── distributed.rs      # Cluster execution
│   │       └── qasm_export.rs      # Hardware format export
│   ├── sansqrit-lang/              # DSL parser & interpreter
│   │   └── src/
│   │       ├── main.rs             # CLI entry point
│   │       ├── lexer.rs            # Tokenizer
│   │       ├── parser.rs           # Recursive descent parser
│   │       ├── ast.rs              # AST node definitions
│   │       └── interpreter.rs      # Tree-walking interpreter
│   ├── sansqrit-stdlib/            # Classical standard library
│   ├── sansqrit-chemistry/         # Quantum chemistry (VQE, PES)
│   ├── sansqrit-biology/           # Protein folding, alignment
│   ├── sansqrit-medical/           # Drug discovery, vaccines
│   ├── sansqrit-physics/           # Ising model, QAOA, MaxCut
│   ├── sansqrit-genetics/          # CRISPR design, GWAS
│   ├── sansqrit-ml/                # Quantum neural networks
│   ├── sansqrit-math/              # Shor, Grover, HHL
│   └── sansqrit-qasm/              # QASM format utilities
├── tools/precompute/               # Lookup table generator
│   └── generate_blobs.py
├── samples/                        # Example .sq programs
├── data/gates/                     # Pre-computed lookup tables
└── README.md
```

---

## CLI Reference

| Command | Description |
|---------|-------------|
| `sansqrit run file.sq` | Run a program |
| `sansqrit check file.sq` | Check for errors without running |
| `sansqrit qasm file.sq --format v2` | Export to OpenQASM 2.0 |
| `sansqrit qasm file.sq --format ibm` | Export for IBM Quantum |
| `sansqrit repl` | Interactive REPL |
| `sansqrit new my_project` | Create new project |
| `sansqrit version` | Show version info |

---

## Extending Sansqrit

Add new functions in 3 steps without touching existing code:

**Step 1** — Create a new `.rs` file:
```rust
// crates/sansqrit-stdlib/src/climate.rs
pub fn co2_forcing(co2_ppm: f64) -> f64 {
    5.35 * (co2_ppm / 280.0).ln()
}
```

**Step 2** — Add ONE line to `lib.rs`:
```rust
pub mod climate; // ← only change
```

**Step 3** — Use in Sansqrit:
```python
import stdlib.climate as climate
let forcing = climate.co2_forcing(420.0)
print(f"Forcing: {forcing:.3f} W/m²")
```

---

## Contributing

1. Fork the repository
2. Create a branch: `git checkout -b my-feature`
3. Make changes and add tests
4. Run: `cargo test --workspace`
5. Push and open a Pull Request

---

## License

Apache 2.0 — free forever, commercial use fully permitted.

See [LICENSE](LICENSE) for full text.

---

**github.com/sansqrit-lang/sansqrit** • Apache 2.0 • Made for Scientists
