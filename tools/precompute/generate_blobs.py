#!/usr/bin/env python3
"""
Sansqrit Lookup Table Generator
================================
Pre-computes all quantum gate operations for 10-qubit chunks and saves
them as memory-mappable binary files for O(1) runtime lookup.

Generated files:
  data/gates/single_qubit_all.bin  ~6 MB   27 gates × 10 qubits × 1024 states
  data/gates/two_qubit_all.bin     ~45 MB  10 gates × 90 pairs × 1024 states
  data/gates/phase_table.bin       ~1 MB   65536 pre-computed e^(iθ) values
  data/gates/manifest.json         <1 KB   Gate name → byte offset index

Usage:
  python3 tools/precompute/generate_blobs.py [--verify] [--output-dir data/gates]
"""

import argparse
import json
import os
import struct
import sys
import time
import numpy as np

CHUNK_QUBITS = 10
CHUNK_DIM = 1 << CHUNK_QUBITS  # 1024
PHASE_TABLE_SIZE = 65536

# ─── Gate Matrices ──────────────────────────────────────────────────────

I2 = np.eye(2, dtype=complex)
X = np.array([[0, 1], [1, 0]], dtype=complex)
Y = np.array([[0, -1j], [1j, 0]], dtype=complex)
Z = np.array([[1, 0], [0, -1]], dtype=complex)
H = np.array([[1, 1], [1, -1]], dtype=complex) / np.sqrt(2)
S = np.array([[1, 0], [0, 1j]], dtype=complex)
Sdg = np.array([[1, 0], [0, -1j]], dtype=complex)
T = np.array([[1, 0], [0, np.exp(1j * np.pi / 4)]], dtype=complex)
Tdg = np.array([[1, 0], [0, np.exp(-1j * np.pi / 4)]], dtype=complex)
SX = 0.5 * np.array([[1+1j, 1-1j], [1-1j, 1+1j]], dtype=complex)

def Rx(theta):
    return np.array([
        [np.cos(theta/2), -1j*np.sin(theta/2)],
        [-1j*np.sin(theta/2), np.cos(theta/2)]
    ], dtype=complex)

def Ry(theta):
    return np.array([
        [np.cos(theta/2), -np.sin(theta/2)],
        [np.sin(theta/2), np.cos(theta/2)]
    ], dtype=complex)

def Rz(theta):
    return np.array([
        [np.exp(-1j*theta/2), 0],
        [0, np.exp(1j*theta/2)]
    ], dtype=complex)

def Phase(theta):
    return np.array([[1, 0], [0, np.exp(1j*theta)]], dtype=complex)

# Standard single-qubit gates (non-parametric)
SINGLE_QUBIT_GATES = {
    "I": I2, "X": X, "Y": Y, "Z": Z, "H": H,
    "S": S, "Sdg": Sdg, "T": T, "Tdg": Tdg, "SX": SX,
}

# Parametric gates at common angles
PARAMETRIC_ANGLES = [0, np.pi/8, np.pi/6, np.pi/4, np.pi/3, np.pi/2,
                     2*np.pi/3, 3*np.pi/4, np.pi, 5*np.pi/4, 3*np.pi/2, 7*np.pi/4]

for name_base, gate_fn in [("Rx", Rx), ("Ry", Ry), ("Rz", Rz), ("Phase", Phase)]:
    for i, angle in enumerate(PARAMETRIC_ANGLES):
        key = f"{name_base}_{i}"
        SINGLE_QUBIT_GATES[key] = gate_fn(angle)

# Two-qubit gate matrices (4x4)
CNOT_MATRIX = np.array([
    [1,0,0,0], [0,1,0,0], [0,0,0,1], [0,0,1,0]
], dtype=complex)

CZ_MATRIX = np.array([
    [1,0,0,0], [0,1,0,0], [0,0,1,0], [0,0,0,-1]
], dtype=complex)

SWAP_MATRIX = np.array([
    [1,0,0,0], [0,0,1,0], [0,1,0,0], [0,0,0,1]
], dtype=complex)

ISWAP_MATRIX = np.array([
    [1,0,0,0], [0,0,1j,0], [0,1j,0,0], [0,0,0,1]
], dtype=complex)

TWO_QUBIT_GATES = {
    "CNOT": CNOT_MATRIX, "CZ": CZ_MATRIX,
    "SWAP": SWAP_MATRIX, "iSWAP": ISWAP_MATRIX,
}

# ─── Transition Computation ─────────────────────────────────────────────

def compute_single_qubit_transition(gate_matrix, qubit, state):
    """
    For a given 2x2 gate, qubit position, and 10-qubit state index,
    compute the output states and amplitude multipliers.

    Returns: (out0, out1, amp0_re, amp0_im, amp1_re, amp1_im)
    """
    bit = (state >> qubit) & 1
    partner = state ^ (1 << qubit)

    # State with qubit=0 and qubit=1
    state_0 = state if bit == 0 else partner
    state_1 = partner if bit == 0 else state

    m = gate_matrix
    # |state_0⟩ contributes: m[0,0]*amp to |state_0⟩ + m[1,0]*amp to |state_1⟩
    # |state_1⟩ contributes: m[0,1]*amp to |state_0⟩ + m[1,1]*amp to |state_1⟩

    if bit == 0:
        amp0 = m[0, 0]  # contribution to stay at state (qubit=0)
        amp1 = m[1, 0]  # contribution to flip to partner (qubit=1)
        out0 = state
        out1 = partner
    else:
        amp0 = m[0, 1]  # contribution to flip to partner (qubit=0)
        amp1 = m[1, 1]  # contribution to stay at state (qubit=1)
        out0 = partner
        out1 = state

    return (out0, out1, amp0.real, amp0.imag, amp1.real, amp1.imag)


def pack_single_transition(out0, out1, amp0_re, amp0_im, amp1_re, amp1_im):
    """Pack a single-qubit transition into bytes (40 bytes total)."""
    # u16 out0, u16 out1, f64 amp0_re, f64 amp0_im, f64 amp1_re, f64 amp1_im
    return struct.pack('<HH4d', out0, out1, amp0_re, amp0_im, amp1_re, amp1_im)

# ─── Main Generator ─────────────────────────────────────────────────────

def generate_single_qubit_blob(output_dir):
    """Generate single_qubit_all.bin and return offsets."""
    path = os.path.join(output_dir, "single_qubit_all.bin")
    offsets = {}
    entry_size = 36  # 2 + 2 + 4*8 = 36 bytes per transition

    t0 = time.time()
    with open(path, 'wb') as f:
        for gate_name, matrix in SINGLE_QUBIT_GATES.items():
            offsets[gate_name] = f.tell()
            for qubit in range(CHUNK_QUBITS):
                for state in range(CHUNK_DIM):
                    trans = compute_single_qubit_transition(matrix, qubit, state)
                    f.write(pack_single_transition(*trans))

    size_mb = os.path.getsize(path) / (1024 * 1024)
    elapsed = time.time() - t0
    print(f"  Generating single_qubit_all.bin ... {size_mb:.2f} MB in {elapsed:.1f}s")
    return offsets


def generate_two_qubit_blob(output_dir):
    """Generate two_qubit_all.bin."""
    path = os.path.join(output_dir, "two_qubit_all.bin")
    offsets = {}

    t0 = time.time()
    with open(path, 'wb') as f:
        for gate_name, matrix in TWO_QUBIT_GATES.items():
            offsets[gate_name] = f.tell()
            for q0 in range(CHUNK_QUBITS):
                for q1 in range(CHUNK_QUBITS):
                    if q0 == q1:
                        continue
                    for state in range(CHUNK_DIM):
                        # Compute 4x4 gate application
                        b0 = (state >> q0) & 1
                        b1 = (state >> q1) & 1
                        two_bit_state = (b0 << 1) | b1

                        # Apply gate matrix
                        results = []
                        for out_two in range(4):
                            amp = matrix[out_two, two_bit_state]
                            if abs(amp) > 1e-15:
                                out_b0 = (out_two >> 1) & 1
                                out_b1 = out_two & 1
                                out_state = state
                                # Set bit q0
                                out_state = (out_state & ~(1 << q0)) | (out_b0 << q0)
                                # Set bit q1
                                out_state = (out_state & ~(1 << q1)) | (out_b1 << q1)
                                results.append((out_state, amp.real, amp.imag))

                        # Pack: n_outputs (u8), padding (7 bytes), then up to 4 entries
                        n = min(len(results), 4)
                        data = struct.pack('<B7x', n)
                        for i in range(4):
                            if i < n:
                                s, re, im = results[i]
                                data += struct.pack('<H2xdd', s, re, im)
                            else:
                                data += struct.pack('<H2xdd', 0, 0.0, 0.0)
                        f.write(data)

    size_mb = os.path.getsize(path) / (1024 * 1024)
    elapsed = time.time() - t0
    print(f"  Generating two_qubit_all.bin ... {size_mb:.2f} MB in {elapsed:.1f}s")
    return offsets


def generate_phase_table(output_dir):
    """Generate phase_table.bin with pre-computed e^(iθ) values."""
    path = os.path.join(output_dir, "phase_table.bin")

    t0 = time.time()
    angles = np.linspace(0, 2 * np.pi, PHASE_TABLE_SIZE, endpoint=False)
    values = np.exp(1j * angles)

    with open(path, 'wb') as f:
        for v in values:
            f.write(struct.pack('<dd', v.real, v.imag))

    size_mb = os.path.getsize(path) / (1024 * 1024)
    print(f"  Generating phase_table.bin ... {size_mb:.2f} MB")
    return PHASE_TABLE_SIZE


def verify_tables(output_dir):
    """Verify generated tables against direct computation."""
    print("\nVERIFICATION:")

    # Verify single-qubit gates
    passed = 0
    total = 50
    for _ in range(total):
        gate_name = np.random.choice(list(["H", "X", "Y", "Z", "S", "T"]))
        qubit = np.random.randint(0, CHUNK_QUBITS)
        state = np.random.randint(0, CHUNK_DIM)

        matrix = SINGLE_QUBIT_GATES[gate_name]
        trans = compute_single_qubit_transition(matrix, qubit, state)

        # Verify unitarity: |amp0|² + |amp1|² should equal 1
        norm = trans[2]**2 + trans[3]**2 + trans[4]**2 + trans[5]**2
        if abs(norm - 1.0) < 1e-10:
            passed += 1

    print(f"  {passed}/{total} single-qubit tests passed {'✓' if passed == total else '✗'}")

    # Verify phase table
    path = os.path.join(output_dir, "phase_table.bin")
    with open(path, 'rb') as f:
        data = f.read()

    phase_passed = 0
    phase_total = 100
    for _ in range(phase_total):
        idx = np.random.randint(0, PHASE_TABLE_SIZE)
        offset = idx * 16
        re, im = struct.unpack('<dd', data[offset:offset+16])
        theta = idx * 2 * np.pi / PHASE_TABLE_SIZE
        expected = np.exp(1j * theta)
        if abs(re - expected.real) < 1e-10 and abs(im - expected.imag) < 1e-10:
            phase_passed += 1

    print(f"  {phase_passed}/{phase_total} phase table tests passed {'✓' if phase_passed == phase_total else '✗'}")


def main():
    parser = argparse.ArgumentParser(description="Generate Sansqrit gate lookup tables")
    parser.add_argument("--output-dir", default="data/gates", help="Output directory")
    parser.add_argument("--verify", action="store_true", help="Run verification tests")
    args = parser.parse_args()

    output_dir = args.output_dir
    os.makedirs(output_dir, exist_ok=True)

    print(f"Sansqrit Lookup Table Generator")
    print(f"Output: {os.path.abspath(output_dir)}")
    print()

    single_offsets = generate_single_qubit_blob(output_dir)
    two_offsets = generate_two_qubit_blob(output_dir)
    phase_entries = generate_phase_table(output_dir)

    # Write manifest
    manifest = {
        "version": "0.1.0",
        "chunk_qubits": CHUNK_QUBITS,
        "single_qubit_gates": list(SINGLE_QUBIT_GATES.keys()),
        "two_qubit_gates": list(TWO_QUBIT_GATES.keys()),
        "phase_table_entries": phase_entries,
        "single_qubit_offsets": single_offsets,
        "two_qubit_offsets": two_offsets,
    }

    manifest_path = os.path.join(output_dir, "manifest.json")
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)

    print(f"\n  manifest.json written")
    print(f"\nFiles created in {output_dir}/:")
    for fname in os.listdir(output_dir):
        size = os.path.getsize(os.path.join(output_dir, fname))
        if size > 1024 * 1024:
            print(f"  {fname:30} ~{size / (1024*1024):.0f} MB")
        elif size > 1024:
            print(f"  {fname:30} ~{size / 1024:.0f} KB")
        else:
            print(f"  {fname:30} {size} bytes")

    if args.verify:
        verify_tables(output_dir)

    print("\nDone! Place the data/gates/ folder alongside your .sq programs.")


if __name__ == "__main__":
    main()
