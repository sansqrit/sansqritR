//! Executable error mitigation helpers.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ReadoutCalibration {
    pub p00: f64,
    pub p01: f64,
    pub p10: f64,
    pub p11: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MitigatedDistribution {
    pub probabilities: Vec<(String, f64)>,
    pub warnings: Vec<String>,
}

pub fn mitigate_single_qubit_readout(
    histogram: &HashMap<String, usize>,
    calibration: &ReadoutCalibration,
) -> MitigatedDistribution {
    let shots: f64 = histogram.values().sum::<usize>().max(1) as f64;
    let observed0 = *histogram.get("0").unwrap_or(&0) as f64 / shots;
    let observed1 = *histogram.get("1").unwrap_or(&0) as f64 / shots;
    let det = calibration.p00 * calibration.p11 - calibration.p01 * calibration.p10;
    let mut warnings = Vec::new();
    if det.abs() < 1e-12 {
        warnings.push(
            "Readout calibration matrix is singular; returning observed probabilities.".to_string(),
        );
        return MitigatedDistribution {
            probabilities: vec![("0".to_string(), observed0), ("1".to_string(), observed1)],
            warnings,
        };
    }

    let true0 = (calibration.p11 * observed0 - calibration.p01 * observed1) / det;
    let true1 = (-calibration.p10 * observed0 + calibration.p00 * observed1) / det;
    let mut probs = vec![true0.max(0.0), true1.max(0.0)];
    let norm: f64 = probs.iter().sum();
    if norm > 0.0 {
        for p in &mut probs {
            *p /= norm;
        }
    }
    MitigatedDistribution {
        probabilities: vec![("0".to_string(), probs[0]), ("1".to_string(), probs[1])],
        warnings,
    }
}

pub fn zero_noise_extrapolate(noise_scales: &[f64], values: &[f64]) -> Result<f64, String> {
    if noise_scales.len() != values.len() || noise_scales.len() < 2 {
        return Err("ZNE requires at least two matching noise scales and values.".to_string());
    }
    let n = noise_scales.len() as f64;
    let sx: f64 = noise_scales.iter().sum();
    let sy: f64 = values.iter().sum();
    let sxx: f64 = noise_scales.iter().map(|x| x * x).sum();
    let sxy: f64 = noise_scales.iter().zip(values).map(|(x, y)| x * y).sum();
    let denom = n * sxx - sx * sx;
    if denom.abs() < 1e-12 {
        return Err("Noise scales are degenerate.".to_string());
    }
    let slope = (n * sxy - sx * sy) / denom;
    let intercept = (sy - slope * sx) / n;
    Ok(intercept)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_readout_mitigation() {
        let mut hist = HashMap::new();
        hist.insert("0".to_string(), 900);
        hist.insert("1".to_string(), 100);
        let out = mitigate_single_qubit_readout(
            &hist,
            &ReadoutCalibration {
                p00: 0.9,
                p01: 0.1,
                p10: 0.1,
                p11: 0.9,
            },
        );
        assert!(out.probabilities[0].1 > 0.9);
    }

    #[test]
    fn test_zne_linear_intercept() {
        let value = zero_noise_extrapolate(&[1.0, 3.0], &[0.8, 0.6]).unwrap();
        assert!((value - 0.9).abs() < 1e-10);
    }
}
