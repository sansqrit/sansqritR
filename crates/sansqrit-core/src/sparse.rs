//! Sparse state vector for quantum simulation.
//!
//! Instead of storing 2^n amplitudes (exponential), we store only
//! the non-zero entries. A 100-qubit GHZ state requires only 2 entries
//! (~100 bytes) instead of 2^100 × 16 bytes.

use crate::complex::{c_one, c_zero, Amplitude};
use dashmap::DashMap;
use std::collections::HashMap;

/// Thread-safe sparse state vector.
/// Keys are basis state indices (u128 supports up to 128 qubits).
/// Values are complex amplitudes.
#[derive(Clone, Debug)]
pub struct SparseStateVec {
    /// Number of qubits in this register.
    pub n_qubits: usize,
    /// Sparse amplitudes: basis_state_index -> amplitude.
    entries: HashMap<u128, Amplitude>,
    /// Tolerance below which amplitudes are pruned.
    prune_tol: f64,
}

impl SparseStateVec {
    /// Create a new sparse state vector initialized to |00...0⟩.
    pub fn new(n_qubits: usize) -> Self {
        let mut entries = HashMap::new();
        entries.insert(0u128, c_one());
        SparseStateVec {
            n_qubits,
            entries,
            prune_tol: 1e-15,
        }
    }

    /// Create from a dense vector (converting to sparse).
    pub fn from_dense(n_qubits: usize, amplitudes: &[Amplitude]) -> Self {
        let mut entries = HashMap::new();
        for (i, &amp) in amplitudes.iter().enumerate() {
            if amp.norm_sqr() > 1e-30 {
                entries.insert(i as u128, amp);
            }
        }
        SparseStateVec {
            n_qubits,
            entries,
            prune_tol: 1e-15,
        }
    }

    /// Number of non-zero entries.
    pub fn nnz(&self) -> usize {
        self.entries.len()
    }

    /// Total dimension 2^n (for reference — we never allocate this).
    pub fn dim(&self) -> u128 {
        1u128 << self.n_qubits
    }

    /// Get amplitude of a basis state.
    pub fn get(&self, index: u128) -> Amplitude {
        self.entries.get(&index).copied().unwrap_or(c_zero())
    }

    /// Set amplitude of a basis state.
    pub fn set(&mut self, index: u128, amp: Amplitude) {
        if amp.norm_sqr() < self.prune_tol * self.prune_tol {
            self.entries.remove(&index);
        } else {
            self.entries.insert(index, amp);
        }
    }

    /// Add to an amplitude (accumulate).
    pub fn add_to(&mut self, index: u128, amp: Amplitude) {
        let current = self.get(index);
        self.set(index, current + amp);
    }

    /// Iterate over all non-zero (index, amplitude) pairs.
    pub fn iter(&self) -> impl Iterator<Item = (&u128, &Amplitude)> {
        self.entries.iter()
    }

    /// Iterate mutably.
    pub fn iter_mut(&mut self) -> impl Iterator<Item = (&u128, &mut Amplitude)> {
        self.entries.iter_mut()
    }

    /// Drain all entries (for building a new state).
    pub fn drain(&mut self) -> Vec<(u128, Amplitude)> {
        self.entries.drain().collect()
    }

    /// Prune near-zero amplitudes.
    pub fn prune(&mut self) {
        let tol_sq = self.prune_tol * self.prune_tol;
        self.entries.retain(|_, amp| amp.norm_sqr() > tol_sq);
    }

    /// Normalize the state vector so probabilities sum to 1.
    pub fn normalize(&mut self) {
        let norm_sq: f64 = self.entries.values().map(|a| a.norm_sqr()).sum();
        if norm_sq > 1e-30 {
            let inv_norm = 1.0 / norm_sq.sqrt();
            for amp in self.entries.values_mut() {
                *amp *= inv_norm;
            }
        }
    }

    /// Total probability (should be ~1.0 for a valid state).
    pub fn total_probability(&self) -> f64 {
        self.entries.values().map(|a| a.norm_sqr()).sum()
    }

    /// Probability of measuring a specific basis state.
    pub fn probability_of(&self, index: u128) -> f64 {
        self.get(index).norm_sqr()
    }

    /// Get all probabilities as a vector of (index, probability) pairs.
    pub fn probabilities(&self) -> Vec<(u128, f64)> {
        self.entries
            .iter()
            .map(|(&idx, &amp)| (idx, amp.norm_sqr()))
            .filter(|(_, p)| *p > 1e-30)
            .collect()
    }

    /// Extract the bit value of qubit `q` from basis state `state`.
    pub fn bit_of(state: u128, qubit: usize) -> u8 {
        ((state >> qubit) & 1) as u8
    }

    /// Flip bit `q` in basis state.
    pub fn flip_bit(state: u128, qubit: usize) -> u128 {
        state ^ (1u128 << qubit)
    }

    /// Set bit `q` to value `v` in basis state.
    pub fn set_bit(state: u128, qubit: usize, val: u8) -> u128 {
        if val == 1 {
            state | (1u128 << qubit)
        } else {
            state & !(1u128 << qubit)
        }
    }

    /// Convert to dense vector (only for small qubit counts!).
    pub fn to_dense(&self) -> Vec<Amplitude> {
        assert!(
            self.n_qubits <= 28,
            "Cannot convert >28 qubits to dense (would use >4GB RAM)"
        );
        let dim = 1usize << self.n_qubits;
        let mut dense = vec![c_zero(); dim];
        for (&idx, &amp) in &self.entries {
            dense[idx as usize] = amp;
        }
        dense
    }

    /// Convert basis state index to bit string.
    pub fn index_to_bitstring(&self, index: u128) -> String {
        let mut s = String::with_capacity(self.n_qubits);
        for i in (0..self.n_qubits).rev() {
            s.push(if Self::bit_of(index, i) == 1 {
                '1'
            } else {
                '0'
            });
        }
        s
    }

    /// Parse bit string to basis state index.
    pub fn bitstring_to_index(bits: &str) -> u128 {
        let mut idx = 0u128;
        for (i, ch) in bits.chars().rev().enumerate() {
            if ch == '1' {
                idx |= 1u128 << i;
            }
        }
        idx
    }

    /// Merge another sparse vector into this one (for chunked engine recombination).
    pub fn merge_from(&mut self, other: &SparseStateVec) {
        for (&idx, &amp) in &other.entries {
            self.add_to(idx, amp);
        }
    }

    /// Memory estimate in bytes.
    pub fn memory_bytes(&self) -> usize {
        // Each entry: 16 bytes (u128) + 16 bytes (Complex64) + HashMap overhead (~48 bytes)
        self.entries.len() * 80 + std::mem::size_of::<Self>()
    }

    /// Clear all entries and reset to |0⟩.
    pub fn reset(&mut self) {
        self.entries.clear();
        self.entries.insert(0u128, c_one());
    }
}

/// Concurrent sparse vector for parallel gate application.
pub struct ConcurrentSparseVec {
    pub n_qubits: usize,
    entries: DashMap<u128, Amplitude>,
}

impl ConcurrentSparseVec {
    pub fn new(n_qubits: usize) -> Self {
        let entries = DashMap::new();
        entries.insert(0u128, c_one());
        ConcurrentSparseVec { n_qubits, entries }
    }

    pub fn from_sparse(sv: &SparseStateVec) -> Self {
        let entries = DashMap::new();
        for (&idx, &amp) in sv.iter() {
            entries.insert(idx, amp);
        }
        ConcurrentSparseVec {
            n_qubits: sv.n_qubits,
            entries,
        }
    }

    pub fn add_to(&self, index: u128, amp: Amplitude) {
        self.entries
            .entry(index)
            .and_modify(|v| *v += amp)
            .or_insert(amp);
    }

    pub fn into_sparse(self) -> SparseStateVec {
        let mut entries = HashMap::new();
        for entry in self.entries.into_iter() {
            if entry.1.norm_sqr() > 1e-30 {
                entries.insert(entry.0, entry.1);
            }
        }
        SparseStateVec {
            n_qubits: self.n_qubits,
            entries,
            prune_tol: 1e-15,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_state_is_zero_ket() {
        let sv = SparseStateVec::new(4);
        assert_eq!(sv.nnz(), 1);
        assert!((sv.get(0).re - 1.0).abs() < 1e-15);
        assert!((sv.total_probability() - 1.0).abs() < 1e-15);
    }

    #[test]
    fn test_bit_operations() {
        assert_eq!(SparseStateVec::bit_of(0b1010, 1), 1);
        assert_eq!(SparseStateVec::bit_of(0b1010, 0), 0);
        assert_eq!(SparseStateVec::flip_bit(0b1010, 0), 0b1011);
    }

    #[test]
    fn test_bitstring_conversion() {
        let sv = SparseStateVec::new(4);
        assert_eq!(sv.index_to_bitstring(0b1010), "1010");
        assert_eq!(SparseStateVec::bitstring_to_index("1010"), 0b1010);
    }

    #[test]
    fn test_memory_efficiency() {
        // 100-qubit state with only 2 entries: ~200 bytes
        let mut sv = SparseStateVec::new(100);
        let half = crate::complex::c(crate::complex::FRAC_1_SQRT2, 0.0);
        sv.set(0, half);
        let all_ones = (1u128 << 100) - 1;
        sv.set(all_ones, half);
        assert_eq!(sv.nnz(), 2);
        assert!(sv.memory_bytes() < 300);
    }
}
