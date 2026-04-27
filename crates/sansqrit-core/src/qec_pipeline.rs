//! Executable QEC pipeline helpers.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RepetitionDecodeResult {
    pub logical_bit: u8,
    pub corrections: Vec<usize>,
    pub syndrome_weight: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct QecPipelinePlan {
    pub code: String,
    pub distance: usize,
    pub executable_native: bool,
    pub external_decoder: String,
    pub steps: Vec<String>,
}

pub fn decode_repetition_code(bits: &[u8]) -> RepetitionDecodeResult {
    let ones = bits.iter().filter(|&&b| b == 1).count();
    let zeros = bits.len().saturating_sub(ones);
    let logical = if ones > zeros { 1 } else { 0 };
    let corrections = bits
        .iter()
        .enumerate()
        .filter_map(|(i, &b)| (b != logical).then_some(i))
        .collect::<Vec<_>>();
    RepetitionDecodeResult {
        logical_bit: logical,
        syndrome_weight: corrections.len(),
        corrections,
    }
}

pub fn qec_pipeline_plan(code: &str, distance: usize) -> QecPipelinePlan {
    let lower = code.to_ascii_lowercase();
    let executable_native = lower.contains("repetition");
    QecPipelinePlan {
        code: code.to_string(),
        distance,
        executable_native,
        external_decoder: if executable_native {
            "native majority decoder".to_string()
        } else {
            "Stim detector sampling + PyMatching MWPM".to_string()
        },
        steps: vec![
            "encode logical state".to_string(),
            "sample syndrome rounds".to_string(),
            "decode syndrome".to_string(),
            "apply corrections".to_string(),
            "estimate logical failure rate".to_string(),
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_repetition_decoder_majority() {
        let decoded = decode_repetition_code(&[1, 1, 0, 1, 0]);
        assert_eq!(decoded.logical_bit, 1);
        assert_eq!(decoded.corrections, vec![2, 4]);
    }
}
