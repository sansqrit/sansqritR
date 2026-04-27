//! O(1) Lookup Table System for quantum gates.
//!
//! Pre-computed gate results for 10-qubit chunks:
//!   - Single-qubit: 27 gates × 10 qubits × 1024 states = ~6 MB
//!   - Two-qubit: 10 gates × 90 pairs × 1024 states = ~45 MB
//!   - Phase table: 65536 entries of e^(iθ) = ~1 MB
//!
//! At runtime: ONE memory read per gate instead of matrix multiplication.

use crate::complex::*;
use memmap2::Mmap;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

const CHUNK_QUBITS: usize = 10;
const CHUNK_DIM: usize = 1 << CHUNK_QUBITS; // 1024
const PHASE_TABLE_SIZE: usize = 65536;

/// Manifest describing the layout of binary lookup files.
#[derive(Debug, Serialize, Deserialize)]
pub struct LookupManifest {
    pub version: String,
    pub chunk_qubits: usize,
    pub single_qubit_gates: Vec<String>,
    pub two_qubit_gates: Vec<String>,
    pub phase_table_entries: usize,
    /// Map from "gate_name" to byte offset in the binary file.
    pub single_qubit_offsets: HashMap<String, usize>,
    pub two_qubit_offsets: HashMap<String, usize>,
}

/// Pre-computed transition for a single-qubit gate applied to a chunk state.
#[derive(Clone, Copy, Debug)]
#[repr(C)]
pub struct SingleQubitTransition {
    /// Output state index when input qubit was 0.
    pub out0: u16,
    /// Output state index when input qubit was 1.
    pub out1: u16,
    /// Amplitude multiplier for the out0 component.
    pub amp0: ComplexPair,
    /// Amplitude multiplier for the out1 component.
    pub amp1: ComplexPair,
}

unsafe impl bytemuck::Pod for SingleQubitTransition {}
unsafe impl bytemuck::Zeroable for SingleQubitTransition {}

/// Pre-computed transition for a two-qubit gate.
#[derive(Clone, Copy, Debug)]
#[repr(C)]
pub struct TwoQubitTransition {
    pub n_outputs: u8,
    pub _pad: [u8; 7],
    pub outputs: [(u16, ComplexPair); 4], // up to 4 output states
}

unsafe impl bytemuck::Pod for TwoQubitTransition {}
unsafe impl bytemuck::Zeroable for TwoQubitTransition {}

/// The main lookup table, loaded from precomputed binary files.
pub struct GateLookupTable {
    /// Memory-mapped single-qubit gate data.
    single_data: Option<Mmap>,
    /// Memory-mapped two-qubit gate data.
    #[allow(dead_code)]
    two_data: Option<Mmap>,
    /// In-memory phase table.
    phase_table: Vec<ComplexPair>,
    /// Manifest with offsets.
    manifest: LookupManifest,
    /// Whether tables are available.
    available: bool,
}

impl GateLookupTable {
    /// Try to load lookup tables from a directory.
    /// Returns a table with `available = false` if files don't exist.
    pub fn from_dir(dir: impl AsRef<Path>) -> Result<Self, LookupError> {
        let dir = dir.as_ref();
        let manifest_path = dir.join("manifest.json");

        if !manifest_path.exists() {
            log::info!("Lookup tables not found at {:?} — using compute mode", dir);
            return Ok(Self::empty());
        }

        let manifest_json =
            fs::read_to_string(&manifest_path).map_err(|e| LookupError::IoError(e.to_string()))?;
        let manifest: LookupManifest = serde_json::from_str(&manifest_json)
            .map_err(|e| LookupError::ParseError(e.to_string()))?;

        let single_path = dir.join("single_qubit_all.bin");
        let two_path = dir.join("two_qubit_all.bin");
        let phase_path = dir.join("phase_table.bin");

        let single_data = if single_path.exists() {
            let file =
                fs::File::open(&single_path).map_err(|e| LookupError::IoError(e.to_string()))?;
            Some(unsafe { Mmap::map(&file) }.map_err(|e| LookupError::IoError(e.to_string()))?)
        } else {
            None
        };

        let two_data = if two_path.exists() {
            let file =
                fs::File::open(&two_path).map_err(|e| LookupError::IoError(e.to_string()))?;
            Some(unsafe { Mmap::map(&file) }.map_err(|e| LookupError::IoError(e.to_string()))?)
        } else {
            None
        };

        let phase_table = if phase_path.exists() {
            let bytes = fs::read(&phase_path).map_err(|e| LookupError::IoError(e.to_string()))?;
            bytemuck::cast_slice::<u8, ComplexPair>(&bytes).to_vec()
        } else {
            Vec::new()
        };

        log::info!(
            "Loaded lookup tables: {} single gates, {} two-qubit gates, {} phase entries",
            manifest.single_qubit_gates.len(),
            manifest.two_qubit_gates.len(),
            phase_table.len()
        );

        Ok(GateLookupTable {
            single_data,
            two_data,
            phase_table,
            manifest,
            available: true,
        })
    }

    /// Create an empty (unavailable) lookup table.
    pub fn empty() -> Self {
        GateLookupTable {
            single_data: None,
            two_data: None,
            phase_table: Vec::new(),
            manifest: LookupManifest {
                version: "0.0.0".into(),
                chunk_qubits: CHUNK_QUBITS,
                single_qubit_gates: vec![],
                two_qubit_gates: vec![],
                phase_table_entries: 0,
                single_qubit_offsets: HashMap::new(),
                two_qubit_offsets: HashMap::new(),
            },
            available: false,
        }
    }

    /// Check if lookup tables are available.
    pub fn is_available(&self) -> bool {
        self.available
    }

    /// O(1) lookup for a single-qubit gate transition.
    ///
    /// Given a gate name, qubit position within the chunk, and the chunk state,
    /// returns the transition (output states and amplitude multipliers).
    pub fn single_qubit_transition(
        &self,
        gate: &str,
        qubit: usize,
        state: u16,
    ) -> Option<SingleQubitTransition> {
        if !self.available {
            return None;
        }
        let data = self.single_data.as_ref()?;
        let base_offset = *self.manifest.single_qubit_offsets.get(gate)?;

        // Layout: [gate][qubit][state] -> SingleQubitTransition
        let entry_size = std::mem::size_of::<SingleQubitTransition>();
        let offset = base_offset + qubit * CHUNK_DIM * entry_size + (state as usize) * entry_size;

        if offset + entry_size > data.len() {
            return None;
        }

        let bytes = &data[offset..offset + entry_size];
        Some(*bytemuck::from_bytes::<SingleQubitTransition>(bytes))
    }

    /// O(1) phase lookup: returns e^(iθ) from the precomputed table.
    /// θ is mapped to the nearest table entry.
    pub fn phase(&self, theta: f64) -> Option<Amplitude> {
        if self.phase_table.is_empty() {
            return None;
        }
        // Normalize θ to [0, 2π)
        let two_pi = 2.0 * std::f64::consts::PI;
        let normalized = ((theta % two_pi) + two_pi) % two_pi;
        let index = ((normalized / two_pi) * PHASE_TABLE_SIZE as f64) as usize;
        let index = index.min(self.phase_table.len() - 1);
        Some(self.phase_table[index].into())
    }

    /// Scan for lookup tables in standard locations.
    pub fn auto_discover() -> Self {
        let search_paths = vec![
            PathBuf::from("data/gates"),
            PathBuf::from("./data/gates"),
            dirs_data().join("sansqrit/gates"),
        ];

        for path in search_paths {
            if path.join("manifest.json").exists() {
                match Self::from_dir(&path) {
                    Ok(table) if table.is_available() => {
                        log::info!("Auto-discovered lookup tables at {:?}", path);
                        return table;
                    }
                    _ => continue,
                }
            }
        }

        log::info!("No lookup tables found — using compute-only mode");
        Self::empty()
    }
}

fn dirs_data() -> PathBuf {
    dirs_home().join(".local/share")
}

fn dirs_home() -> PathBuf {
    std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("/tmp"))
}

/// Errors from lookup table operations.
#[derive(Debug, thiserror::Error)]
pub enum LookupError {
    #[error("I/O error: {0}")]
    IoError(String),
    #[error("Parse error: {0}")]
    ParseError(String),
    #[error("Table not found for gate: {0}")]
    NotFound(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_table() {
        let table = GateLookupTable::empty();
        assert!(!table.is_available());
        assert!(table.single_qubit_transition("H", 0, 0).is_none());
        assert!(table.phase(1.0).is_none());
    }
}
