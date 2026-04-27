//! Measurement results and analysis.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Result of measuring a quantum register with multiple shots.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeasurementResult {
    pub histogram: HashMap<String, usize>,
    pub shots: usize,
    pub n_qubits: usize,
}

impl MeasurementResult {
    /// Probability of a specific outcome.
    pub fn probability(&self, bitstring: &str) -> f64 {
        let count = self.histogram.get(bitstring).copied().unwrap_or(0);
        count as f64 / self.shots as f64
    }

    /// Most probable outcome.
    pub fn most_probable(&self) -> (&str, f64) {
        let (bs, &count) = self.histogram.iter().max_by_key(|(_, &v)| v).unwrap();
        (bs.as_str(), count as f64 / self.shots as f64)
    }

    /// Top-k most probable outcomes.
    pub fn top_k(&self, k: usize) -> Vec<(String, f64)> {
        let mut sorted: Vec<_> = self
            .histogram
            .iter()
            .map(|(bs, &count)| (bs.clone(), count as f64 / self.shots as f64))
            .collect();
        sorted.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
        sorted.truncate(k);
        sorted
    }

    /// Shannon entropy of the distribution.
    pub fn entropy(&self) -> f64 {
        let mut h = 0.0;
        for &count in self.histogram.values() {
            let p = count as f64 / self.shots as f64;
            if p > 1e-30 {
                h -= p * p.log2();
            }
        }
        h
    }

    /// Number of unique outcomes observed.
    pub fn n_unique(&self) -> usize {
        self.histogram.len()
    }

    /// Format as a human-readable table.
    pub fn display(&self) -> String {
        let mut sorted: Vec<_> = self.histogram.iter().collect();
        sorted.sort_by(|a, b| b.1.cmp(a.1));

        let mut out = format!(
            "Measurement Results ({} shots, {} qubits):\n",
            self.shots, self.n_qubits
        );
        out.push_str(&format!(
            "{:<20} {:>8} {:>10}\n",
            "Outcome", "Count", "Prob"
        ));
        out.push_str(&"-".repeat(40));
        out.push('\n');

        for (bs, count) in sorted.iter().take(20) {
            let prob = **count as f64 / self.shots as f64;
            out.push_str(&format!("{:<20} {:>8} {:>10.4}\n", bs, count, prob));
        }
        if sorted.len() > 20 {
            out.push_str(&format!("... and {} more outcomes\n", sorted.len() - 20));
        }
        out
    }
}

impl std::fmt::Display for MeasurementResult {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:?}", self.histogram)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_measurement_result() {
        let mut hist = HashMap::new();
        hist.insert("00".to_string(), 500);
        hist.insert("11".to_string(), 500);
        let result = MeasurementResult {
            histogram: hist,
            shots: 1000,
            n_qubits: 2,
        };
        assert!((result.probability("00") - 0.5).abs() < 1e-10);
        assert!((result.probability("01")).abs() < 1e-10);
        assert_eq!(result.n_unique(), 2);
    }
}
