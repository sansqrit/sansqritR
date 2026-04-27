//! GPU backend planning.

use crate::backend_planner::{BackendAvailability, SimulationMethod};
use crate::external::{detect_integration, IntegrationKind, IntegrationStatus};
use crate::sharding::dense_state_bytes_exact;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum GpuComponent {
    CuStateVec,
    CuTensorNet,
    CuDensityMat,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GpuBackendPlan {
    pub selected_method: SimulationMethod,
    pub component: GpuComponent,
    pub availability: BackendAvailability,
    pub n_qubits: usize,
    pub estimated_dense_state_bytes: Option<u128>,
    pub integration: IntegrationStatus,
    pub warnings: Vec<String>,
}

pub fn plan_cuquantum_backend(n_qubits: usize, prefer_density_matrix: bool) -> GpuBackendPlan {
    let integration = detect_integration(IntegrationKind::CuQuantum);
    let dense_bytes = dense_state_bytes_exact(n_qubits);
    let mut warnings = Vec::new();

    let (selected_method, component) = if prefer_density_matrix {
        warnings.push(
            "Density-matrix GPU simulation scales as 4^n; keep this for small noisy workloads."
                .to_string(),
        );
        (SimulationMethod::DensityMatrix, GpuComponent::CuDensityMat)
    } else if n_qubits >= 32 {
        warnings.push(
            "Large GPU workloads should use tensor-network slicing or multi-GPU chunking."
                .to_string(),
        );
        (
            SimulationMethod::GpuTensorNetwork,
            GpuComponent::CuTensorNet,
        )
    } else {
        (SimulationMethod::GpuStateVector, GpuComponent::CuStateVec)
    };

    let availability = if integration.available {
        BackendAvailability::ExternalIntegrationRequired
    } else {
        warnings.push("cuQuantum Python bindings were not detected on this machine.".to_string());
        BackendAvailability::FallbackOnly
    };

    GpuBackendPlan {
        selected_method,
        component,
        availability,
        n_qubits,
        estimated_dense_state_bytes: dense_bytes,
        integration,
        warnings,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cuquantum_plan_selects_tensor_network_for_large_width() {
        let plan = plan_cuquantum_backend(48, false);
        assert_eq!(plan.component, GpuComponent::CuTensorNet);
        assert_eq!(plan.selected_method, SimulationMethod::GpuTensorNetwork);
    }
}
