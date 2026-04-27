//! External integration detection and command adapters.
//!
//! These adapters are deliberately fail-fast: Sansqrit can expose production
//! integrations without pretending that Ray, Dask, MPI, cuQuantum, Stim,
//! PyMatching, Qiskit, Cirq, or Braket are installed on every machine.

use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum IntegrationKind {
    Ray,
    Dask,
    Mpi,
    CuQuantum,
    Stim,
    PyMatching,
    Qiskit,
    Cirq,
    Braket,
}

impl IntegrationKind {
    pub fn label(self) -> &'static str {
        match self {
            IntegrationKind::Ray => "ray",
            IntegrationKind::Dask => "dask",
            IntegrationKind::Mpi => "mpi",
            IntegrationKind::CuQuantum => "cuquantum",
            IntegrationKind::Stim => "stim",
            IntegrationKind::PyMatching => "pymatching",
            IntegrationKind::Qiskit => "qiskit",
            IntegrationKind::Cirq => "cirq",
            IntegrationKind::Braket => "braket",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct IntegrationStatus {
    pub kind: IntegrationKind,
    pub available: bool,
    pub command: String,
    pub detail: String,
}

impl IntegrationStatus {
    pub fn unavailable(kind: IntegrationKind, command: &str, detail: String) -> Self {
        IntegrationStatus {
            kind,
            available: false,
            command: command.to_string(),
            detail,
        }
    }
}

pub fn detect_all_integrations() -> Vec<IntegrationStatus> {
    [
        IntegrationKind::Ray,
        IntegrationKind::Dask,
        IntegrationKind::Mpi,
        IntegrationKind::CuQuantum,
        IntegrationKind::Stim,
        IntegrationKind::PyMatching,
        IntegrationKind::Qiskit,
        IntegrationKind::Cirq,
        IntegrationKind::Braket,
    ]
    .into_iter()
    .map(detect_integration)
    .collect()
}

pub fn detect_integration(kind: IntegrationKind) -> IntegrationStatus {
    match kind {
        IntegrationKind::Ray => python_module_status(kind, "ray"),
        IntegrationKind::Dask => python_module_status(kind, "dask"),
        IntegrationKind::CuQuantum => python_module_status(kind, "cuquantum"),
        IntegrationKind::Stim => python_module_status(kind, "stim"),
        IntegrationKind::PyMatching => python_module_status(kind, "pymatching"),
        IntegrationKind::Qiskit => python_module_status(kind, "qiskit"),
        IntegrationKind::Cirq => python_module_status(kind, "cirq"),
        IntegrationKind::Braket => python_module_status(kind, "braket"),
        IntegrationKind::Mpi => command_status(kind, &["mpiexec", "mpirun"]),
    }
}

pub fn require_integration(kind: IntegrationKind) -> Result<IntegrationStatus, String> {
    let status = detect_integration(kind);
    if status.available {
        Ok(status)
    } else {
        Err(format!(
            "{} integration is unavailable: {}",
            kind.label(),
            status.detail
        ))
    }
}

fn python_module_status(kind: IntegrationKind, module: &str) -> IntegrationStatus {
    let script = format!(
        "import importlib.util; import sys; sys.exit(0 if importlib.util.find_spec({:?}) else 1)",
        module
    );

    for python in ["python", "py"] {
        match Command::new(python).args(["-c", &script]).output() {
            Ok(output) if output.status.success() => {
                return IntegrationStatus {
                    kind,
                    available: true,
                    command: format!("{} -c import {}", python, module),
                    detail: format!("Python module '{}' is importable.", module),
                };
            }
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                if !stderr.is_empty() {
                    return IntegrationStatus::unavailable(kind, python, stderr);
                }
            }
            Err(_) => {}
        }
    }

    IntegrationStatus::unavailable(
        kind,
        "python",
        format!("Python module '{}' was not found.", module),
    )
}

fn command_status(kind: IntegrationKind, commands: &[&str]) -> IntegrationStatus {
    for command in commands {
        match Command::new(command).arg("--version").output() {
            Ok(output)
                if output.status.success()
                    || !output.stdout.is_empty()
                    || !output.stderr.is_empty() =>
            {
                return IntegrationStatus {
                    kind,
                    available: true,
                    command: (*command).to_string(),
                    detail: format!("Command '{}' is callable.", command),
                };
            }
            Ok(_) | Err(_) => {}
        }
    }

    IntegrationStatus::unavailable(
        kind,
        &commands.join("|"),
        "No MPI launcher found; install mpiexec or mpirun.".to_string(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_all_integrations_is_stable_without_tools() {
        let statuses = detect_all_integrations();
        assert_eq!(statuses.len(), 9);
        assert!(statuses.iter().any(|s| s.kind == IntegrationKind::Stim));
    }

    #[test]
    fn test_require_missing_or_available_has_message() {
        let result = require_integration(IntegrationKind::CuQuantum);
        match result {
            Ok(status) => assert!(status.available),
            Err(message) => assert!(message.contains("cuquantum")),
        }
    }
}
