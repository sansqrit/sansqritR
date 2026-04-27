//! Dense state-vector sharding plans.
//!
//! This module does not pretend that a laptop can hold a 120-qubit dense
//! state. It models the industry-standard amplitude-sharding approach: split
//! the 2^n amplitudes by high-order index bits, run gates on low-order local
//! bits inside each worker, and use pairwise shard exchange when a gate touches
//! a shard-index bit.

use crate::gates::{GateKind, GateOp};

/// How a gate can be executed under dense amplitude sharding.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ShardGateStrategy {
    /// Every shard can apply the gate independently.
    WorkerLocal,
    /// Two shards whose prefixes differ in one bit must exchange paired blocks.
    PairwiseExchange { shard_qubit: usize },
    /// More than one shard-index bit is involved; remap or stage exchanges.
    MultiShardExchange { shard_qubits: Vec<usize> },
    /// The gate is too wide for the configured local shard width.
    GlobalFallback,
}

/// Execution plan for one gate under a shard layout.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShardGatePlan {
    pub gate_kind: GateKind,
    pub qubits: Vec<usize>,
    pub strategy: ShardGateStrategy,
    pub estimated_transfer_bytes: u128,
    pub reason: String,
}

/// Dense amplitude-sharding layout.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShardPlan {
    pub n_qubits: usize,
    pub local_qubits: usize,
    pub shard_prefix_bits: usize,
    pub num_shards: u128,
    pub bytes_per_shard: u128,
    pub total_state_bytes: Option<u128>,
    pub worker_memory_limit_bytes: u128,
    pub notes: Vec<String>,
}

impl ShardPlan {
    /// Build a plan where each worker owns 2^local_qubits complex amplitudes.
    pub fn new(n_qubits: usize, local_qubits: usize, worker_memory_limit_bytes: u128) -> Self {
        let local_qubits = local_qubits.min(n_qubits);
        let shard_prefix_bits = n_qubits.saturating_sub(local_qubits);
        let num_shards = pow2_u128(shard_prefix_bits);
        let bytes_per_shard = dense_state_bytes_exact(local_qubits).unwrap_or(u128::MAX);
        let total_state_bytes = dense_state_bytes_exact(n_qubits);
        let mut notes = Vec::new();

        if bytes_per_shard > worker_memory_limit_bytes {
            notes.push(format!(
                "Each shard needs {} bytes, above the configured per-worker limit of {} bytes.",
                bytes_per_shard, worker_memory_limit_bytes
            ));
        }
        if shard_prefix_bits > 0 {
            notes.push(format!(
                "{} shard prefix bits require {} logical shards.",
                shard_prefix_bits, num_shards
            ));
        }
        if n_qubits >= 64 {
            notes.push(
                "Dense simulation is an HPC workload; local sparse/chunked fallback should stay enabled."
                    .to_string(),
            );
        }

        ShardPlan {
            n_qubits,
            local_qubits,
            shard_prefix_bits,
            num_shards,
            bytes_per_shard,
            total_state_bytes,
            worker_memory_limit_bytes,
            notes,
        }
    }

    /// Whether a qubit index is stored inside each worker-local shard.
    pub fn is_local_qubit(&self, qubit: usize) -> bool {
        qubit < self.local_qubits
    }

    /// Plan one gate for this shard layout.
    pub fn plan_gate(&self, gate: &GateOp) -> ShardGatePlan {
        if gate.qubits.iter().any(|&q| q >= self.n_qubits) {
            return ShardGatePlan {
                gate_kind: gate.kind,
                qubits: gate.qubits.clone(),
                strategy: ShardGateStrategy::GlobalFallback,
                estimated_transfer_bytes: 0,
                reason: "Gate references a qubit outside the planned register.".to_string(),
            };
        }

        let shard_qubits: Vec<usize> = gate
            .qubits
            .iter()
            .copied()
            .filter(|&q| !self.is_local_qubit(q))
            .collect();

        match shard_qubits.len() {
            0 => ShardGatePlan {
                gate_kind: gate.kind,
                qubits: gate.qubits.clone(),
                strategy: ShardGateStrategy::WorkerLocal,
                estimated_transfer_bytes: 0,
                reason: "All gate qubits are within the worker-local amplitude index.".to_string(),
            },
            1 => ShardGatePlan {
                gate_kind: gate.kind,
                qubits: gate.qubits.clone(),
                strategy: ShardGateStrategy::PairwiseExchange {
                    shard_qubit: shard_qubits[0],
                },
                estimated_transfer_bytes: self.bytes_per_shard.saturating_mul(self.num_shards),
                reason: "Gate touches one shard-prefix bit; exchange paired shards that differ on that bit."
                    .to_string(),
            },
            _ => ShardGatePlan {
                gate_kind: gate.kind,
                qubits: gate.qubits.clone(),
                strategy: ShardGateStrategy::MultiShardExchange {
                    shard_qubits: shard_qubits.clone(),
                },
                estimated_transfer_bytes: self
                    .bytes_per_shard
                    .saturating_mul(self.num_shards)
                    .saturating_mul(shard_qubits.len() as u128),
                reason: "Gate touches multiple shard-prefix bits; remap hot qubits or stage exchanges."
                    .to_string(),
            },
        }
    }
}

/// Dense state vector size using 16-byte complex amplitudes.
pub fn dense_state_bytes_exact(n_qubits: usize) -> Option<u128> {
    if n_qubits >= 124 {
        None
    } else {
        Some(16u128 << n_qubits)
    }
}

/// Choose local shard width that fits within a worker memory limit.
pub fn choose_local_qubits(n_qubits: usize, worker_memory_limit_bytes: u128) -> usize {
    let mut local = n_qubits.min(123);
    while local > 0 {
        if dense_state_bytes_exact(local)
            .map(|bytes| bytes <= worker_memory_limit_bytes)
            .unwrap_or(false)
        {
            return local;
        }
        local -= 1;
    }
    0
}

fn pow2_u128(exp: usize) -> u128 {
    if exp >= 128 {
        u128::MAX
    } else {
        1u128 << exp
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_120_qubit_dense_sharding_plan() {
        let one_gib = 1024u128 * 1024 * 1024;
        let local = choose_local_qubits(120, one_gib);
        assert_eq!(local, 26);

        let plan = ShardPlan::new(120, local, one_gib);
        assert_eq!(plan.shard_prefix_bits, 94);
        assert_eq!(plan.bytes_per_shard, one_gib);
        assert!(plan.total_state_bytes.unwrap() > one_gib);
    }

    #[test]
    fn test_gate_strategy_classification() {
        let plan = ShardPlan::new(40, 20, 16u128 << 20);
        let local = plan.plan_gate(&GateOp::single(GateKind::H, 3));
        assert_eq!(local.strategy, ShardGateStrategy::WorkerLocal);

        let exchange = plan.plan_gate(&GateOp::single(GateKind::H, 25));
        assert_eq!(
            exchange.strategy,
            ShardGateStrategy::PairwiseExchange { shard_qubit: 25 }
        );

        let staged = plan.plan_gate(&GateOp::two(GateKind::CNOT, 25, 30));
        assert!(matches!(
            staged.strategy,
            ShardGateStrategy::MultiShardExchange { .. }
        ));
    }
}
