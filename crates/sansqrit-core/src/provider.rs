//! Provider job execution adapters.
//!
//! These adapters generate and optionally execute provider SDK jobs. They are
//! real execution paths when the corresponding SDK and credentials exist, and
//! deterministic dry-run paths for tests and planning.

use crate::external::{detect_integration, IntegrationKind};
use serde::{Deserialize, Serialize};
use std::fs;
use std::process::Command;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ProviderKind {
    Ibm,
    AwsBraket,
    AzureQuantum,
    LocalOnly,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProviderJobRequest {
    pub provider: ProviderKind,
    pub target: String,
    pub qasm3: String,
    pub shots: usize,
    pub dry_run: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProviderJobResult {
    pub provider: ProviderKind,
    pub submitted: bool,
    pub job_id: Option<String>,
    pub command: String,
    pub stdout: String,
    pub stderr: String,
    pub warnings: Vec<String>,
}

pub fn submit_provider_job(request: &ProviderJobRequest) -> Result<ProviderJobResult, String> {
    if request.provider == ProviderKind::LocalOnly {
        return Ok(ProviderJobResult {
            provider: request.provider,
            submitted: false,
            job_id: None,
            command: "local simulator".to_string(),
            stdout: "Use Sansqrit local simulator; no provider job submitted.".to_string(),
            stderr: String::new(),
            warnings: vec![],
        });
    }

    let integration = match request.provider {
        ProviderKind::Ibm => detect_integration(IntegrationKind::Qiskit),
        ProviderKind::AwsBraket => detect_integration(IntegrationKind::Braket),
        ProviderKind::AzureQuantum => detect_integration(IntegrationKind::Qiskit),
        ProviderKind::LocalOnly => unreachable!(),
    };
    let script = provider_script(request);

    if request.dry_run {
        return Ok(ProviderJobResult {
            provider: request.provider,
            submitted: false,
            job_id: None,
            command: "dry-run provider script".to_string(),
            stdout: script,
            stderr: String::new(),
            warnings: vec!["Dry run only; no remote job submitted.".to_string()],
        });
    }

    if !integration.available {
        return Err(format!(
            "Provider SDK is unavailable for {:?}: {}",
            request.provider, integration.detail
        ));
    }

    let dir = std::env::temp_dir().join("sansqrit-provider");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let script_path = dir.join("submit_job.py");
    fs::write(&script_path, script).map_err(|e| e.to_string())?;

    let output = Command::new("python")
        .arg(&script_path)
        .output()
        .map_err(|e| format!("Failed to launch provider script: {}", e))?;

    Ok(ProviderJobResult {
        provider: request.provider,
        submitted: output.status.success(),
        job_id: extract_job_id(&String::from_utf8_lossy(&output.stdout)),
        command: format!("python {}", script_path.display()),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        warnings: if output.status.success() {
            vec![]
        } else {
            vec!["Provider SDK returned a non-zero status.".to_string()]
        },
    })
}

pub fn provider_script(request: &ProviderJobRequest) -> String {
    match request.provider {
        ProviderKind::Ibm => format!(
            r#"from qiskit import qasm3
from qiskit_ibm_runtime import QiskitRuntimeService, SamplerV2 as Sampler

QASM = {qasm:?}
circuit = qasm3.loads(QASM)
service = QiskitRuntimeService()
backend = service.backend({target:?})
sampler = Sampler(mode=backend)
job = sampler.run([circuit], shots={shots})
print("JOB_ID=" + job.job_id())
"#,
            qasm = request.qasm3,
            target = request.target,
            shots = request.shots
        ),
        ProviderKind::AwsBraket => format!(
            r#"from braket.aws import AwsDevice
from braket.ir.openqasm import Program

QASM = {qasm:?}
device = AwsDevice({target:?})
task = device.run(Program(source=QASM), shots={shots})
print("JOB_ID=" + task.id)
"#,
            qasm = request.qasm3,
            target = request.target,
            shots = request.shots
        ),
        ProviderKind::AzureQuantum => format!(
            r#"from azure.quantum import Workspace
from azure.quantum.qiskit import AzureQuantumProvider
from qiskit import qasm3

QASM = {qasm:?}
workspace = Workspace.from_connection_string()
provider = AzureQuantumProvider(workspace)
backend = provider.get_backend({target:?})
circuit = qasm3.loads(QASM)
job = backend.run(circuit, shots={shots})
print("JOB_ID=" + job.id())
"#,
            qasm = request.qasm3,
            target = request.target,
            shots = request.shots
        ),
        ProviderKind::LocalOnly => "# local only".to_string(),
    }
}

fn extract_job_id(stdout: &str) -> Option<String> {
    stdout
        .lines()
        .find_map(|line| line.strip_prefix("JOB_ID=").map(str::to_string))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_provider_dry_run_generates_script() {
        let request = ProviderJobRequest {
            provider: ProviderKind::AwsBraket,
            target: "arn:aws:braket:::device/quantum-simulator/amazon/sv1".to_string(),
            qasm3: "OPENQASM 3.0; qubit[1] q; h q[0];".to_string(),
            shots: 100,
            dry_run: true,
        };
        let result = submit_provider_job(&request).unwrap();
        assert!(!result.submitted);
        assert!(result.stdout.contains("AwsDevice"));
    }
}
