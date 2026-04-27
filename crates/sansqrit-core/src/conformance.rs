//! Optional conformance test planning against external simulators.

use crate::external::{detect_integration, IntegrationKind, IntegrationStatus};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ConformanceTarget {
    pub name: String,
    pub integration: IntegrationStatus,
    pub runnable: bool,
    pub focus: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ConformancePlan {
    pub targets: Vec<ConformanceTarget>,
    pub notes: Vec<String>,
}

pub fn conformance_plan() -> ConformancePlan {
    let specs = [
        (
            "qiskit",
            IntegrationKind::Qiskit,
            vec![
                "small circuits",
                "QASM round trips",
                "statevector/density matrix",
            ],
        ),
        (
            "cirq",
            IntegrationKind::Cirq,
            vec![
                "small circuits",
                "pure-state simulation",
                "noisy simulation",
            ],
        ),
        (
            "stim",
            IntegrationKind::Stim,
            vec!["Clifford circuits", "detector sampling", "QEC circuits"],
        ),
        (
            "braket",
            IntegrationKind::Braket,
            vec![
                "local state-vector simulator",
                "OpenQASM 3 export",
                "Braket IR",
            ],
        ),
    ];

    let targets = specs
        .into_iter()
        .map(|(name, kind, focus)| {
            let integration = detect_integration(kind);
            ConformanceTarget {
                name: name.to_string(),
                runnable: integration.available,
                integration,
                focus: focus.into_iter().map(str::to_string).collect(),
            }
        })
        .collect();

    ConformancePlan {
        targets,
        notes: vec![
            "Conformance tests are optional and run only when external Python packages are installed.".to_string(),
            "Exact comparisons should use small circuits and tight tolerances; QEC sampling uses statistical checks.".to_string(),
        ],
    }
}

pub fn conformance_python_harness() -> String {
    r#"#!/usr/bin/env python3
"""Optional Sansqrit conformance harness.

Install qiskit, qiskit-aer, cirq, stim, and amazon-braket-sdk to enable all
checks. This harness intentionally skips missing packages.
"""
import importlib.util

def has(module):
    return importlib.util.find_spec(module) is not None

print("qiskit", "ok" if has("qiskit") else "missing")
print("cirq", "ok" if has("cirq") else "missing")
print("stim", "ok" if has("stim") else "missing")
print("braket", "ok" if has("braket") else "missing")
"#
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_conformance_plan_has_targets() {
        let plan = conformance_plan();
        assert_eq!(plan.targets.len(), 4);
        assert!(plan.targets.iter().any(|t| t.name == "stim"));
    }

    #[test]
    fn test_harness_mentions_all_targets() {
        let script = conformance_python_harness();
        assert!(script.contains("qiskit"));
        assert!(script.contains("cirq"));
        assert!(script.contains("stim"));
        assert!(script.contains("braket"));
    }
}
