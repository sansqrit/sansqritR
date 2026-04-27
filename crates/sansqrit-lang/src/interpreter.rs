//! Tree-walking interpreter for the Sansqrit DSL.
//!
//! Executes AST nodes directly, managing:
//! - Classical variables and functions
//! - Quantum engine lifecycle (simulate/quantum blocks)
//! - Built-in functions (gates, measurement, math, I/O)
//! - Science package dispatch

use crate::ast::*;
use crate::lexer::Lexer;
use crate::parser::Parser;
use sansqrit_core::{
    advanced_engine_capabilities, amplitude_amplification_circuit, apply_circuit_template,
    assess_quantum_application, bell_state_circuit, bernstein_vazirani_circuit,
    bit_flip_code_circuit, block_encoding_circuit, boson_sampling_circuit, braiding_circuit,
    build_quantum_workflow, circuit_family_catalog, conformance_plan, conformance_python_harness,
    ctqw_circuit, data_reuploading_circuit, decode_repetition_code, detect_all_integrations,
    deutsch_jozsa_circuit, dtqw_circuit, element_distinctness_circuit, error_mitigation_plan,
    export_circuit, export_stim_circuit, ghz_state_circuit, grover_circuit,
    hardware_efficient_ansatz_circuit, hardware_transpile_plan, hhl_circuit, import_qasm3,
    market_standard_capabilities, mbqc_cluster_circuit, mitigate_single_qubit_readout,
    phase_flip_code_circuit, plan_cuquantum_backend, production_readiness_report, qaoa_circuit,
    qec_circuit, qec_integration_status, qec_pipeline_plan, qft_circuit, qnn_circuit, qpe_circuit,
    qsp_circuit, qsvt_circuit, quantum_counting_circuit, quantum_kernel_estimation_circuit,
    quantum_walk_circuit, rough_fault_tolerant_resource_estimate, shor_9qubit_code_circuit,
    shor_factoring_circuit, steane_code_circuit, submit_provider_job, superdense_coding_circuit,
    surface_code_circuit, surface_code_plan, swap_test_circuit, szegedy_walk_circuit,
    teleportation_circuit, tensor_network_plan, transpile_circuit, triangle_finding_circuit,
    vqc_circuit, vqe_ansatz_circuit, zero_noise_extrapolate, AdvancedEngineCapability, BackendPlan,
    BackendPlanner, CircuitInfo, CircuitProfile, CircuitTemplate, ConformancePlan,
    DistributedConfig, DistributedExecutor, DistributedRuntime, EngineKind, ErrorMitigationPlan,
    ExportFormat, FaultTolerantResourceEstimate, GateKind, GateOp, GpuBackendPlan,
    HardwareTranspilePlan, IntegrationStatus, MarketCapability, MitigatedDistribution, MpsEngine,
    PlannerConfig, ProductionReadinessReport, ProviderJobRequest, ProviderJobResult, ProviderKind,
    Qasm3Import, QecIntegrationStatus, QecPipelinePlan, QuantumApplicationAssessment,
    QuantumEngine, QuantumWorkflow, ReadoutCalibration, RepetitionDecodeResult, StabilizerEngine,
    StimExport, SurfaceCodePlan, TensorNetworkPlan, TranspileResult, TranspileTarget,
};
use std::collections::HashMap;
use std::fmt;

/// Runtime values.
#[derive(Debug, Clone)]
pub enum Value {
    Int(i64),
    Float(f64),
    String(String),
    Bool(bool),
    None,
    List(Vec<Value>),
    Dict(Vec<(Value, Value)>),
    #[allow(dead_code)]
    Set(Vec<Value>),
    Tuple(Vec<Value>),
    Function {
        name: String,
        params: Vec<Param>,
        body: Vec<Stmt>,
    },
    #[allow(dead_code)]
    Lambda {
        params: Vec<Param>,
        body: Box<Expr>,
    },
    QuantumRegister {
        n_qubits: usize,
    },
    MeasurementResult(sansqrit_core::MeasurementResult),
    Object {
        class: String,
        fields: HashMap<String, Value>,
    },
}

impl fmt::Display for Value {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Value::Int(v) => write!(f, "{}", v),
            Value::Float(v) => write!(f, "{}", v),
            Value::String(s) => write!(f, "{}", s),
            Value::Bool(b) => write!(f, "{}", b),
            Value::None => write!(f, "None"),
            Value::List(items) => {
                let strs: Vec<String> = items.iter().map(|v| format!("{}", v)).collect();
                write!(f, "[{}]", strs.join(", "))
            }
            Value::Dict(pairs) => {
                let strs: Vec<String> =
                    pairs.iter().map(|(k, v)| format!("{}: {}", k, v)).collect();
                write!(f, "{{{}}}", strs.join(", "))
            }
            Value::Tuple(items) => {
                let strs: Vec<String> = items.iter().map(|v| format!("{}", v)).collect();
                write!(f, "({})", strs.join(", "))
            }
            Value::QuantumRegister { n_qubits } => write!(f, "QuantumRegister({})", n_qubits),
            Value::MeasurementResult(r) => write!(f, "{:?}", r.histogram),
            Value::Function { name, .. } => write!(f, "<fn {}>", name),
            Value::Object { class, fields } => {
                write!(f, "<{} object: {} fields>", class, fields.len())
            }
            _ => write!(f, "<value>"),
        }
    }
}

impl Value {
    pub fn as_float(&self) -> Result<f64, InterpError> {
        match self {
            Value::Float(v) => Ok(*v),
            Value::Int(v) => Ok(*v as f64),
            _ => Err(InterpError::type_error("Expected number")),
        }
    }

    pub fn as_int(&self) -> Result<i64, InterpError> {
        match self {
            Value::Int(v) => Ok(*v),
            Value::Float(v) => Ok(*v as i64),
            _ => Err(InterpError::type_error("Expected integer")),
        }
    }

    pub fn as_bool(&self) -> bool {
        match self {
            Value::Bool(b) => *b,
            Value::Int(v) => *v != 0,
            Value::Float(v) => *v != 0.0,
            Value::String(s) => !s.is_empty(),
            Value::None => false,
            Value::List(v) => !v.is_empty(),
            _ => true,
        }
    }

    pub fn as_string(&self) -> String {
        format!("{}", self)
    }
}

/// Variable scope / environment.
#[derive(Debug, Clone)]
struct Env {
    vars: HashMap<String, Value>,
    parent: Option<Box<Env>>,
}

impl Env {
    fn new() -> Self {
        Env {
            vars: HashMap::new(),
            parent: None,
        }
    }

    fn child(parent: &Env) -> Self {
        Env {
            vars: HashMap::new(),
            parent: Some(Box::new(parent.clone())),
        }
    }

    fn get(&self, name: &str) -> Option<Value> {
        self.vars
            .get(name)
            .cloned()
            .or_else(|| self.parent.as_ref().and_then(|p| p.get(name)))
    }

    fn set(&mut self, name: String, value: Value) {
        self.vars.insert(name, value);
    }
}

/// Control flow signal.
enum ControlFlow {
    None,
    Return(Value),
    Break,
    Continue,
}

/// The Sansqrit interpreter.
pub struct Interpreter {
    env: Env,
    engine: Option<QuantumEngine>,
    output: Vec<String>,
}

impl Interpreter {
    pub fn new() -> Self {
        let mut env = Env::new();
        // Built-in constants
        env.set("PI".into(), Value::Float(std::f64::consts::PI));
        env.set("E".into(), Value::Float(std::f64::consts::E));
        env.set("PLANCK".into(), Value::Float(6.62607015e-34));
        env.set("BOLTZMANN".into(), Value::Float(1.380649e-23));
        env.set("AVOGADRO".into(), Value::Float(6.02214076e23));

        Interpreter {
            env,
            engine: None,
            output: Vec::new(),
        }
    }

    /// Run a complete program.
    pub fn run(&mut self, program: &Program) -> Result<(), InterpError> {
        for stmt in &program.statements {
            match self.exec_stmt(stmt)? {
                ControlFlow::Return(_) => break,
                _ => {}
            }
        }
        Ok(())
    }

    /// Get captured output.
    #[allow(dead_code)]
    pub fn get_output(&self) -> &[String] {
        &self.output
    }

    // ─── Statement Execution ──────────────────────────────────────

    fn exec_stmt(&mut self, stmt: &Stmt) -> Result<ControlFlow, InterpError> {
        match stmt {
            Stmt::LetDecl { name, value, .. } => {
                let val = match value {
                    Some(expr) => self.eval_expr(expr)?,
                    None => Value::None,
                };
                self.env.set(name.clone(), val);
                Ok(ControlFlow::None)
            }

            Stmt::Assign {
                target, op, value, ..
            } => {
                let val = self.eval_expr(value)?;
                match target {
                    Expr::Ident(name, _) => {
                        let final_val = match op {
                            AssignOp::Assign => val,
                            AssignOp::AddAssign => self.binary_op(
                                BinOp::Add,
                                &self.env.get(name).unwrap_or(Value::Int(0)),
                                &val,
                            )?,
                            AssignOp::SubAssign => self.binary_op(
                                BinOp::Sub,
                                &self.env.get(name).unwrap_or(Value::Int(0)),
                                &val,
                            )?,
                            AssignOp::MulAssign => self.binary_op(
                                BinOp::Mul,
                                &self.env.get(name).unwrap_or(Value::Int(1)),
                                &val,
                            )?,
                            AssignOp::DivAssign => self.binary_op(
                                BinOp::Div,
                                &self.env.get(name).unwrap_or(Value::Int(1)),
                                &val,
                            )?,
                        };
                        self.env.set(name.clone(), final_val);
                    }
                    _ => {} // Index/field assignment would go here
                }
                Ok(ControlFlow::None)
            }

            Stmt::ExprStmt { expr, .. } => {
                self.eval_expr(expr)?;
                Ok(ControlFlow::None)
            }

            Stmt::FnDecl {
                name, params, body, ..
            } => {
                self.env.set(
                    name.clone(),
                    Value::Function {
                        name: name.clone(),
                        params: params.clone(),
                        body: body.clone(),
                    },
                );
                Ok(ControlFlow::None)
            }

            Stmt::Import { module, alias, .. } => {
                let mod_name = alias.as_ref().unwrap_or(&module[0]).clone();
                self.env.set(
                    mod_name,
                    Value::Object {
                        class: module.join("."),
                        fields: HashMap::new(),
                    },
                );
                Ok(ControlFlow::None)
            }

            Stmt::If {
                condition,
                then_body,
                elifs,
                else_body,
                ..
            } => {
                let cond = self.eval_expr(condition)?;
                if cond.as_bool() {
                    return self.exec_block(then_body);
                }
                for (elif_cond, elif_body) in elifs {
                    if self.eval_expr(elif_cond)?.as_bool() {
                        return self.exec_block(elif_body);
                    }
                }
                if let Some(else_b) = else_body {
                    return self.exec_block(else_b);
                }
                Ok(ControlFlow::None)
            }

            Stmt::For {
                var, iter, body, ..
            } => {
                let iter_val = self.eval_expr(iter)?;
                let items = match iter_val {
                    Value::List(items) => items,
                    _ => return Err(InterpError::type_error("For loop requires iterable")),
                };
                for item in items {
                    self.env.set(var.clone(), item);
                    match self.exec_block(body)? {
                        ControlFlow::Break => break,
                        ControlFlow::Continue => continue,
                        ControlFlow::Return(v) => return Ok(ControlFlow::Return(v)),
                        _ => {}
                    }
                }
                Ok(ControlFlow::None)
            }

            Stmt::While {
                condition, body, ..
            } => {
                loop {
                    if !self.eval_expr(condition)?.as_bool() {
                        break;
                    }
                    match self.exec_block(body)? {
                        ControlFlow::Break => break,
                        ControlFlow::Continue => continue,
                        ControlFlow::Return(v) => return Ok(ControlFlow::Return(v)),
                        _ => {}
                    }
                }
                Ok(ControlFlow::None)
            }

            Stmt::Return { value, .. } => {
                let val = match value {
                    Some(e) => self.eval_expr(e)?,
                    None => Value::None,
                };
                Ok(ControlFlow::Return(val))
            }

            Stmt::Break { .. } => Ok(ControlFlow::Break),
            Stmt::Continue { .. } => Ok(ControlFlow::Continue),

            Stmt::Simulate {
                engine: eng_name,
                body,
                ..
            } => {
                // Create engine — default 0 qubits, will be set by quantum_register()
                let kind = match eng_name.as_deref() {
                    Some("chunked") => EngineKind::Chunked,
                    Some("sparse") => EngineKind::Sparse,
                    Some("dense") => EngineKind::Dense,
                    _ => EngineKind::Auto,
                };
                // Engine will be created when quantum_register is called
                self.env.set(
                    "__engine_kind__".into(),
                    Value::String(format!("{:?}", kind)),
                );
                self.exec_block(body)?;
                self.engine = None;
                Ok(ControlFlow::None)
            }

            Stmt::ClassicalBlock { body, .. } | Stmt::QuantumBlock { body, .. } => {
                self.exec_block(body)
            }

            _ => Ok(ControlFlow::None),
        }
    }

    fn exec_block(&mut self, stmts: &[Stmt]) -> Result<ControlFlow, InterpError> {
        for stmt in stmts {
            match self.exec_stmt(stmt)? {
                ControlFlow::None => continue,
                flow => return Ok(flow),
            }
        }
        Ok(ControlFlow::None)
    }

    // ─── Expression Evaluation ────────────────────────────────────

    fn eval_expr(&mut self, expr: &Expr) -> Result<Value, InterpError> {
        match expr {
            Expr::IntLit(v, _) => Ok(Value::Int(*v)),
            Expr::FloatLit(v, _) => Ok(Value::Float(*v)),
            Expr::StringLit(s, _) => Ok(Value::String(s.clone())),
            Expr::BoolLit(b, _) => Ok(Value::Bool(*b)),
            Expr::NoneLit(_) => Ok(Value::None),

            Expr::FStringLit(template, _) => Ok(Value::String(self.eval_fstring(template)?)),

            Expr::Ident(name, _) => self
                .env
                .get(name)
                .ok_or_else(|| InterpError::name_error(&format!("Undefined: {}", name))),

            Expr::BinOp {
                left, op, right, ..
            } => {
                let l = self.eval_expr(left)?;
                let r = self.eval_expr(right)?;
                self.binary_op(*op, &l, &r)
            }

            Expr::UnaryOp { op, operand, .. } => {
                let val = self.eval_expr(operand)?;
                match op {
                    UnaryOp::Neg => match val {
                        Value::Int(v) => Ok(Value::Int(-v)),
                        Value::Float(v) => Ok(Value::Float(-v)),
                        _ => Err(InterpError::type_error("Cannot negate")),
                    },
                    UnaryOp::Not => Ok(Value::Bool(!val.as_bool())),
                    _ => Err(InterpError::type_error("Unknown unary op")),
                }
            }

            Expr::Call { callee, args, .. } => self.eval_call(callee, args),

            Expr::MethodCall {
                object,
                method,
                args,
                ..
            } => {
                let obj = self.eval_expr(object)?;
                self.eval_method_call(&obj, method, args)
            }

            Expr::Index { object, index, .. } => {
                let obj = self.eval_expr(object)?;
                let idx = self.eval_expr(index)?;
                match (&obj, &idx) {
                    (Value::QuantumRegister { .. }, Value::Int(i)) => {
                        // q[i] returns the qubit index directly
                        Ok(Value::Int(*i))
                    }
                    (Value::List(items), Value::Int(i)) => {
                        let i = if *i < 0 { items.len() as i64 + i } else { *i } as usize;
                        items
                            .get(i)
                            .cloned()
                            .ok_or_else(|| InterpError::index_error("Index out of bounds"))
                    }
                    (Value::Dict(pairs), key) => {
                        for (k, v) in pairs {
                            if format!("{}", k) == format!("{}", key) {
                                return Ok(v.clone());
                            }
                        }
                        Err(InterpError::index_error("Key not found"))
                    }
                    _ => Err(InterpError::type_error("Not indexable")),
                }
            }

            Expr::ListLit(items, _) => {
                let vals: Result<Vec<Value>, _> = items.iter().map(|e| self.eval_expr(e)).collect();
                Ok(Value::List(vals?))
            }

            Expr::DictLit(pairs, _) => {
                let mut dict = Vec::new();
                for (k, v) in pairs {
                    dict.push((self.eval_expr(k)?, self.eval_expr(v)?));
                }
                Ok(Value::Dict(dict))
            }

            Expr::TupleLit(items, _) => {
                let vals: Result<Vec<Value>, _> = items.iter().map(|e| self.eval_expr(e)).collect();
                Ok(Value::Tuple(vals?))
            }

            Expr::ListComp {
                expr: body,
                var,
                iter,
                filter,
                ..
            } => {
                let iter_val = self.eval_expr(iter)?;
                let items = match iter_val {
                    Value::List(items) => items,
                    _ => {
                        return Err(InterpError::type_error(
                            "List comprehension requires iterable",
                        ))
                    }
                };
                let mut result = Vec::new();
                for item in items {
                    self.env.set(var.clone(), item);
                    if let Some(f) = filter {
                        if !self.eval_expr(f)?.as_bool() {
                            continue;
                        }
                    }
                    result.push(self.eval_expr(body)?);
                }
                Ok(Value::List(result))
            }

            Expr::Pipeline { left, right, .. } => {
                let arg = self.eval_expr(left)?;
                // right should be a function — call it with arg
                match right.as_ref() {
                    Expr::Ident(name, _span) => {
                        // Store arg temporarily
                        let saved = self.env.get("__pipe_arg__");
                        self.env.set("__pipe_arg__".into(), arg.clone());
                        let func = self.env.get(name).ok_or_else(|| {
                            InterpError::name_error(&format!("Undefined: {}", name))
                        })?;
                        self.env
                            .set("__pipe_arg__".into(), saved.unwrap_or(Value::None));
                        // Call function with arg
                        self.call_function(&func, &[arg])
                    }
                    _ => Err(InterpError::type_error(
                        "Pipeline target must be a function",
                    )),
                }
            }

            _ => Ok(Value::None),
        }
    }

    // ─── Built-in Function Dispatch ───────────────────────────────

    fn eval_call(&mut self, callee: &Expr, args: &[CallArg]) -> Result<Value, InterpError> {
        let func_name = match callee {
            Expr::Ident(name, _) => name.clone(),
            _ => {
                let func = self.eval_expr(callee)?;
                let arg_vals: Result<Vec<Value>, _> =
                    args.iter().map(|a| self.eval_expr(&a.value)).collect();
                return self.call_function(&func, &arg_vals?);
            }
        };

        let arg_vals: Result<Vec<Value>, _> =
            args.iter().map(|a| self.eval_expr(&a.value)).collect();
        let arg_vals = arg_vals?;

        match func_name.as_str() {
            // ── I/O ──
            "print" => {
                let strs: Vec<String> = arg_vals.iter().map(|v| v.as_string()).collect();
                let line = strs.join(" ");
                println!("{}", line);
                self.output.push(line);
                Ok(Value::None)
            }

            // ── Quantum Register ──
            "quantum_register" => {
                let n = arg_vals[0].as_int()? as usize;
                let kind = self
                    .env
                    .get("__engine_kind__")
                    .and_then(|v| match v {
                        Value::String(s) => Some(s),
                        _ => None,
                    })
                    .unwrap_or_else(|| "Auto".into());
                let engine_kind = match kind.as_str() {
                    "Chunked" => EngineKind::Chunked,
                    "Sparse" => EngineKind::Sparse,
                    "Dense" => EngineKind::Dense,
                    _ => EngineKind::Auto,
                };
                let (engine, plan) =
                    QuantumEngine::with_backend_plan(n, engine_kind, &PlannerConfig::default());
                self.env.set(
                    "__last_backend_plan__".into(),
                    Self::backend_plan_to_value(&plan),
                );
                self.engine = Some(engine);
                self.env
                    .set("q".into(), Value::QuantumRegister { n_qubits: n });
                Ok(Value::QuantumRegister { n_qubits: n })
            }

            // ── Quantum Gates ──
            "H" | "X" | "Y" | "Z" | "S" | "Sdg" | "T" | "Tdg" | "SX" | "I" => {
                let qubit = self.extract_qubit(&arg_vals[0])?;
                let gate = match func_name.as_str() {
                    "H" => GateKind::H,
                    "X" => GateKind::X,
                    "Y" => GateKind::Y,
                    "Z" => GateKind::Z,
                    "S" => GateKind::S,
                    "Sdg" => GateKind::Sdg,
                    "T" => GateKind::T,
                    "Tdg" => GateKind::Tdg,
                    "SX" => GateKind::SX,
                    "I" => GateKind::I,
                    _ => unreachable!(),
                };
                if let Some(eng) = &mut self.engine {
                    eng.apply(GateOp::single(gate, qubit));
                }
                Ok(Value::None)
            }

            "Rx" | "Ry" | "Rz" | "Phase" => {
                let qubit = self.extract_qubit(&arg_vals[0])?;
                let theta = arg_vals[1].as_float()?;
                let gate = match func_name.as_str() {
                    "Rx" => GateKind::Rx,
                    "Ry" => GateKind::Ry,
                    "Rz" => GateKind::Rz,
                    "Phase" => GateKind::Phase,
                    _ => unreachable!(),
                };
                if let Some(eng) = &mut self.engine {
                    eng.apply(GateOp::single_param(gate, qubit, theta));
                }
                Ok(Value::None)
            }

            "U3" => {
                let q = self.extract_qubit(&arg_vals[0])?;
                let (t, p, l) = (
                    arg_vals[1].as_float()?,
                    arg_vals[2].as_float()?,
                    arg_vals[3].as_float()?,
                );
                if let Some(eng) = &mut self.engine {
                    eng.u3(q, t, p, l);
                }
                Ok(Value::None)
            }

            "CNOT" | "CZ" | "CY" | "SWAP" | "iSWAP" => {
                let q0 = self.extract_qubit(&arg_vals[0])?;
                let q1 = self.extract_qubit(&arg_vals[1])?;
                let gate = match func_name.as_str() {
                    "CNOT" => GateKind::CNOT,
                    "CZ" => GateKind::CZ,
                    "CY" => GateKind::CY,
                    "SWAP" => GateKind::SWAP,
                    "iSWAP" => GateKind::ISWAP,
                    _ => unreachable!(),
                };
                if let Some(eng) = &mut self.engine {
                    eng.apply(GateOp::two(gate, q0, q1));
                }
                Ok(Value::None)
            }

            "CRz" | "CP" | "RZZ" => {
                let q0 = self.extract_qubit(&arg_vals[0])?;
                let q1 = self.extract_qubit(&arg_vals[1])?;
                let theta = arg_vals[2].as_float()?;
                let gate = match func_name.as_str() {
                    "CRz" => GateKind::CRz,
                    "CP" => GateKind::CP,
                    "RZZ" => GateKind::RZZ,
                    _ => unreachable!(),
                };
                if let Some(eng) = &mut self.engine {
                    eng.apply(GateOp::two_param(gate, q0, q1, theta));
                }
                Ok(Value::None)
            }

            "Toffoli" | "CCX" => {
                let (q0, q1, q2) = (
                    self.extract_qubit(&arg_vals[0])?,
                    self.extract_qubit(&arg_vals[1])?,
                    self.extract_qubit(&arg_vals[2])?,
                );
                if let Some(eng) = &mut self.engine {
                    eng.toffoli(q0, q1, q2);
                }
                Ok(Value::None)
            }

            "Fredkin" | "CSWAP" => {
                let (q0, q1, q2) = (
                    self.extract_qubit(&arg_vals[0])?,
                    self.extract_qubit(&arg_vals[1])?,
                    self.extract_qubit(&arg_vals[2])?,
                );
                if let Some(eng) = &mut self.engine {
                    eng.fredkin(q0, q1, q2);
                }
                Ok(Value::None)
            }

            "H_all" | "Rx_all" | "Ry_all" => {
                if let Some(eng) = &mut self.engine {
                    match func_name.as_str() {
                        "H_all" => eng.h_all(),
                        "Rx_all" => {
                            let t = arg_vals
                                .get(1)
                                .and_then(|v| v.as_float().ok())
                                .unwrap_or(0.0);
                            eng.rx_all(t);
                        }
                        "Ry_all" => {
                            let t = arg_vals
                                .get(1)
                                .and_then(|v| v.as_float().ok())
                                .unwrap_or(0.0);
                            eng.ry_all(t);
                        }
                        _ => {}
                    }
                }
                Ok(Value::None)
            }

            // ── Measurement ──
            "measure" => {
                let qubit = self.extract_qubit(&arg_vals[0])?;
                if let Some(eng) = &mut self.engine {
                    Ok(Value::Int(eng.measure(qubit) as i64))
                } else {
                    Ok(Value::Int(0))
                }
            }

            "measure_all" => {
                let shots = args
                    .iter()
                    .find(|a| a.name.as_deref() == Some("shots"))
                    .and_then(|a| {
                        if let Expr::IntLit(v, _) = &a.value {
                            Some(*v as usize)
                        } else {
                            None
                        }
                    })
                    .unwrap_or(1);

                if shots > 1 {
                    if let Some(eng) = &self.engine {
                        Ok(Value::MeasurementResult(eng.measure_all(shots)))
                    } else {
                        Ok(Value::None)
                    }
                } else {
                    if let Some(eng) = &mut self.engine {
                        let bits = eng.measure_all_once();
                        Ok(Value::List(
                            bits.into_iter().map(|b| Value::Int(b as i64)).collect(),
                        ))
                    } else {
                        Ok(Value::None)
                    }
                }
            }

            // ── State queries ──
            "probabilities" => {
                if let Some(eng) = &self.engine {
                    let probs = eng.probabilities();
                    Ok(Value::List(
                        probs
                            .into_iter()
                            .map(|(bs, p)| Value::Tuple(vec![Value::String(bs), Value::Float(p)]))
                            .collect(),
                    ))
                } else {
                    Ok(Value::List(vec![]))
                }
            }

            "expectation_z" => {
                let q = self.extract_qubit(&arg_vals[0])?;
                if let Some(eng) = &self.engine {
                    Ok(Value::Float(eng.expectation_z(q)))
                } else {
                    Ok(Value::Float(0.0))
                }
            }

            "expectation_zz" => {
                let q0 = self.extract_qubit(&arg_vals[0])?;
                let q1 = self.extract_qubit(&arg_vals[1])?;
                if let Some(eng) = &self.engine {
                    Ok(Value::Float(eng.expectation_zz(q0, q1)))
                } else {
                    Ok(Value::Float(0.0))
                }
            }

            "engine_nnz" => {
                if let Some(eng) = &self.engine {
                    Ok(Value::Int(eng.nnz() as i64))
                } else {
                    Ok(Value::Int(0))
                }
            }

            "backend_plan" | "plan_backend" => {
                let plan = self.make_backend_plan_from_args(&arg_vals)?;
                Ok(Self::backend_plan_to_value(&plan))
            }

            "sparse_backend_plan" | "plan_sparse_backend" => {
                let n = self.resolve_qubit_count(arg_vals.get(0))?;
                let expected_nnz =
                    arg_vals.get(1).map(Value::as_int).transpose()?.unwrap_or(2) as usize;
                let profile = CircuitProfile::new(n).expected_nnz(expected_nnz);
                let plan = BackendPlanner::plan(&profile, &PlannerConfig::default());
                Ok(Self::backend_plan_to_value(&plan))
            }

            "explain_engine" | "explain_backend" => {
                let plan = self.make_backend_plan_from_args(&arg_vals)?;
                Ok(Value::String(Self::format_backend_plan(&plan)))
            }

            "integration_status"
            | "quantum_integration_status"
            | "provider_status"
            | "runtime_status" => Ok(Value::List(
                detect_all_integrations()
                    .into_iter()
                    .map(Self::integration_status_to_value)
                    .collect(),
            )),

            "gpu_plan" | "cuquantum_plan" | "plan_gpu" | "plan_cuquantum" => {
                let n = self.resolve_qubit_count(arg_vals.get(0))?;
                let density = arg_vals.get(1).map(Value::as_bool).unwrap_or(false);
                Ok(Self::gpu_plan_to_value(&plan_cuquantum_backend(n, density)))
            }

            "qec_status" | "qec_backend_status" => {
                Ok(Self::qec_status_to_value(&qec_integration_status()))
            }

            "stim_export" | "export_stim" => {
                if let Some(eng) = &self.engine {
                    Ok(Self::stim_export_to_value(&export_stim_circuit(
                        eng.n_qubits(),
                        &eng.circuit_log,
                    )))
                } else {
                    Err(InterpError::runtime_error(
                        "stim_export requires an active quantum engine",
                    ))
                }
            }

            "qasm3_import" | "import_qasm3" => {
                let source = arg_vals
                    .get(0)
                    .ok_or_else(|| {
                        InterpError::type_error("qasm3_import/import_qasm3 requires source text")
                    })?
                    .as_string();
                let imported = import_qasm3(&source)
                    .map_err(|e| InterpError::runtime_error(&e.to_string()))?;
                Ok(Self::qasm3_import_to_value(&imported))
            }

            "advanced_engines" | "engine_capabilities" | "production_engines" => Ok(Value::List(
                advanced_engine_capabilities()
                    .into_iter()
                    .map(Self::advanced_capability_to_value)
                    .collect(),
            )),

            "distributed_plan" | "plan_distributed" => {
                let n = self.resolve_qubit_count(arg_vals.get(0))?;
                let runtime = arg_vals
                    .get(1)
                    .map(Value::as_string)
                    .map(|s| Self::parse_distributed_runtime(&s))
                    .transpose()?
                    .unwrap_or(DistributedRuntime::LocalThreads);
                let config = DistributedConfig {
                    runtime,
                    ..Default::default()
                };
                let plan = DistributedExecutor::execution_plan(n, &config);
                Ok(Self::dict(vec![
                    ("runtime", Value::String(format!("{:?}", plan.runtime))),
                    ("available", Value::Bool(plan.available)),
                    ("worker_count", Value::Int(plan.worker_count as i64)),
                    ("batch_local_gates", Value::Bool(plan.batch_local_gates)),
                    ("compressed_transfer", Value::Bool(plan.compressed_transfer)),
                    ("safe_fallback", Value::Bool(plan.safe_fallback)),
                    ("notes", Self::string_list(plan.notes)),
                    (
                        "integration",
                        plan.integration
                            .map(Self::integration_status_to_value)
                            .unwrap_or(Value::None),
                    ),
                ]))
            }

            "ray_plan" | "dask_plan" | "mpi_plan" => {
                let n = self.resolve_qubit_count(arg_vals.get(0))?;
                let runtime = match func_name.as_str() {
                    "ray_plan" => DistributedRuntime::Ray,
                    "dask_plan" => DistributedRuntime::Dask,
                    "mpi_plan" => DistributedRuntime::Mpi,
                    _ => unreachable!(),
                };
                let config = DistributedConfig {
                    runtime,
                    ..Default::default()
                };
                let plan = DistributedExecutor::execution_plan(n, &config);
                Ok(Self::dict(vec![
                    ("runtime", Value::String(format!("{:?}", plan.runtime))),
                    ("available", Value::Bool(plan.available)),
                    ("worker_count", Value::Int(plan.worker_count as i64)),
                    ("batch_local_gates", Value::Bool(plan.batch_local_gates)),
                    ("compressed_transfer", Value::Bool(plan.compressed_transfer)),
                    ("safe_fallback", Value::Bool(plan.safe_fallback)),
                    ("notes", Self::string_list(plan.notes)),
                    (
                        "integration",
                        plan.integration
                            .map(Self::integration_status_to_value)
                            .unwrap_or(Value::None),
                    ),
                ]))
            }

            "conformance_plan" | "simulator_conformance_plan" => {
                Ok(Self::conformance_plan_to_value(&conformance_plan()))
            }
            "conformance_harness" | "conformance_python_harness" => {
                Ok(Value::String(conformance_python_harness()))
            }

            "assess_quantum_problem"
            | "quantum_problem_assessment"
            | "quantum_challenge_assessment"
            | "solve_strategy" => {
                let problem = arg_vals
                    .get(0)
                    .ok_or_else(|| InterpError::type_error("assessment requires a problem string"))?
                    .as_string();
                let n = arg_vals
                    .get(1)
                    .map(Value::as_int)
                    .transpose()?
                    .map(|v| v as usize)
                    .unwrap_or_else(|| {
                        self.engine
                            .as_ref()
                            .map(QuantumEngine::n_qubits)
                            .unwrap_or(0)
                    });
                let assessment = assess_quantum_application(&problem, n);
                Ok(Self::quantum_assessment_to_value(&assessment))
            }

            "production_readiness" | "local_100q_readiness" => {
                let n = self.resolve_qubit_count(arg_vals.get(0))?;
                let report = production_readiness_report(n);
                Ok(Self::production_readiness_to_value(&report))
            }

            "market_standard_review" | "quantum_capability_review" => Ok(Value::List(
                market_standard_capabilities()
                    .into_iter()
                    .map(Self::market_capability_to_value)
                    .collect(),
            )),

            "quantum_workflow" | "pro_workflow" => {
                let problem = arg_vals
                    .get(0)
                    .ok_or_else(|| {
                        InterpError::type_error("quantum_workflow requires a problem string")
                    })?
                    .as_string();
                let n = arg_vals
                    .get(1)
                    .map(Value::as_int)
                    .transpose()?
                    .map(|v| v as usize)
                    .unwrap_or_else(|| {
                        self.engine
                            .as_ref()
                            .map(QuantumEngine::n_qubits)
                            .unwrap_or(0)
                    });
                Ok(Self::quantum_workflow_to_value(&build_quantum_workflow(
                    &problem, n,
                )))
            }

            "ft_resource_estimate" | "fault_tolerant_resource_estimate" => {
                let logical = arg_vals
                    .get(0)
                    .ok_or_else(|| {
                        InterpError::type_error("resource estimate requires logical qubits")
                    })?
                    .as_int()? as usize;
                let t_count = arg_vals
                    .get(1)
                    .ok_or_else(|| InterpError::type_error("resource estimate requires T-count"))?
                    .as_int()? as u128;
                let error_budget = arg_vals
                    .get(2)
                    .map(Value::as_float)
                    .transpose()?
                    .unwrap_or(1e-3);
                Ok(Self::ft_estimate_to_value(
                    &rough_fault_tolerant_resource_estimate(logical, t_count, error_budget),
                ))
            }

            "surface_code_plan" => {
                let logical = arg_vals
                    .get(0)
                    .ok_or_else(|| {
                        InterpError::type_error("surface_code_plan requires logical qubits")
                    })?
                    .as_int()? as usize;
                let distance = arg_vals
                    .get(1)
                    .ok_or_else(|| InterpError::type_error("surface_code_plan requires distance"))?
                    .as_int()? as usize;
                let rounds = arg_vals
                    .get(2)
                    .map(Value::as_int)
                    .transpose()?
                    .unwrap_or(distance as i64) as usize;
                let p = arg_vals
                    .get(3)
                    .map(Value::as_float)
                    .transpose()?
                    .unwrap_or(1e-3);
                Ok(Self::surface_code_plan_to_value(&surface_code_plan(
                    logical, distance, rounds, p,
                )))
            }

            "error_mitigation_plan" | "mitigation_plan" => {
                let noise = arg_vals
                    .get(0)
                    .map(Value::as_string)
                    .unwrap_or_else(|| "moderate".to_string());
                let shots = arg_vals
                    .get(1)
                    .map(Value::as_int)
                    .transpose()?
                    .unwrap_or(4096) as usize;
                Ok(Self::error_mitigation_to_value(&error_mitigation_plan(
                    &noise, shots,
                )))
            }

            "hardware_transpile_plan" | "transpile_plan" => {
                let target = arg_vals
                    .get(0)
                    .map(Value::as_string)
                    .unwrap_or_else(|| "generic".to_string());
                let n = arg_vals
                    .get(1)
                    .map(Value::as_int)
                    .transpose()?
                    .map(|v| v as usize)
                    .unwrap_or_else(|| {
                        self.engine
                            .as_ref()
                            .map(QuantumEngine::n_qubits)
                            .unwrap_or(0)
                    });
                Ok(Self::hardware_transpile_to_value(&hardware_transpile_plan(
                    &target, n,
                )))
            }

            "submit_provider_job" | "provider_job" | "run_provider_job" => {
                let provider = arg_vals
                    .get(0)
                    .map(Value::as_string)
                    .map(|s| Self::parse_provider_kind(&s))
                    .transpose()?
                    .unwrap_or(ProviderKind::LocalOnly);
                let target = arg_vals
                    .get(1)
                    .map(Value::as_string)
                    .unwrap_or_else(|| "local".to_string());
                let shots = arg_vals
                    .get(2)
                    .map(Value::as_int)
                    .transpose()?
                    .unwrap_or(1024)
                    .max(1) as usize;
                let dry_run = arg_vals.get(3).map(Value::as_bool).unwrap_or(true);
                let engine = self.engine.as_ref().ok_or_else(|| {
                    InterpError::runtime_error(
                        "submit_provider_job requires an active quantum engine",
                    )
                })?;
                let circuit = CircuitInfo::from_engine_log(
                    "sansqrit_provider_job",
                    engine.n_qubits(),
                    engine.circuit_log.clone(),
                );
                let request = ProviderJobRequest {
                    provider,
                    target,
                    qasm3: export_circuit(&circuit, ExportFormat::Qasm3),
                    shots,
                    dry_run,
                };
                let result =
                    submit_provider_job(&request).map_err(|e| InterpError::runtime_error(&e))?;
                Ok(Self::provider_result_to_value(&result))
            }

            "native_transpile" | "transpile_active_circuit" | "transpile_circuit" => {
                let target_name = arg_vals
                    .get(0)
                    .map(Value::as_string)
                    .unwrap_or_else(|| "line".to_string());
                let engine = self.engine.as_ref().ok_or_else(|| {
                    InterpError::runtime_error("native_transpile requires an active quantum engine")
                })?;
                let target = TranspileTarget::line(&target_name, engine.n_qubits());
                let result = transpile_circuit(&engine.circuit_log, &target);
                Ok(Self::transpile_result_to_value(&result))
            }

            "stabilizer_run" | "native_stabilizer_run" | "run_stabilizer" => {
                let engine = self.engine.as_ref().ok_or_else(|| {
                    InterpError::runtime_error("stabilizer_run requires an active quantum engine")
                })?;
                let mut stabilizer = StabilizerEngine::new(engine.n_qubits());
                stabilizer.apply_all(&engine.circuit_log);
                Ok(Self::stabilizer_to_value(&stabilizer))
            }

            "mps_run" | "native_mps_run" | "run_mps" => {
                let max_bond_dim = arg_vals
                    .get(0)
                    .map(Value::as_int)
                    .transpose()?
                    .unwrap_or(64)
                    .max(1) as usize;
                let engine = self.engine.as_ref().ok_or_else(|| {
                    InterpError::runtime_error("mps_run requires an active quantum engine")
                })?;
                let mut mps = MpsEngine::new(engine.n_qubits(), max_bond_dim);
                mps.apply_all(&engine.circuit_log);
                Ok(Self::mps_to_value(&mps))
            }

            "tensor_network_plan" | "tensor_network_execute" | "native_tensor_plan" => {
                let active = self.engine.as_ref();
                let n = arg_vals
                    .get(0)
                    .map(Value::as_int)
                    .transpose()?
                    .map(|v| v as usize)
                    .or_else(|| active.map(QuantumEngine::n_qubits))
                    .ok_or_else(|| {
                        InterpError::type_error(
                            "tensor_network_plan requires qubit count when no engine is active",
                        )
                    })?;
                let active_two_qubit = active
                    .map(|eng| {
                        eng.circuit_log
                            .iter()
                            .filter(|g| g.qubits.len() == 2)
                            .count()
                    })
                    .unwrap_or(0);
                let active_width = active
                    .map(|eng| {
                        eng.circuit_log
                            .iter()
                            .filter(|g| g.qubits.len() == 2)
                            .map(|g| g.qubits[0].abs_diff(g.qubits[1]).max(1))
                            .max()
                            .unwrap_or(1)
                    })
                    .unwrap_or(1);
                let two_qubit_gates = arg_vals
                    .get(1)
                    .map(Value::as_int)
                    .transpose()?
                    .map(|v| v as usize)
                    .unwrap_or(active_two_qubit);
                let entanglement_width = arg_vals
                    .get(2)
                    .map(Value::as_int)
                    .transpose()?
                    .map(|v| v as usize)
                    .unwrap_or(active_width);
                Ok(Self::tensor_plan_to_value(&tensor_network_plan(
                    n,
                    two_qubit_gates,
                    entanglement_width,
                )))
            }

            "mitigate_readout" | "readout_mitigation" | "mitigate_single_qubit_readout" => {
                let histogram = Self::histogram_from_value(arg_vals.get(0).ok_or_else(|| {
                    InterpError::type_error(
                        "mitigate_readout requires a histogram or MeasurementResult",
                    )
                })?)?;
                let calibration = ReadoutCalibration {
                    p00: arg_vals
                        .get(1)
                        .map(Value::as_float)
                        .transpose()?
                        .unwrap_or(0.95),
                    p01: arg_vals
                        .get(2)
                        .map(Value::as_float)
                        .transpose()?
                        .unwrap_or(0.05),
                    p10: arg_vals
                        .get(3)
                        .map(Value::as_float)
                        .transpose()?
                        .unwrap_or(0.05),
                    p11: arg_vals
                        .get(4)
                        .map(Value::as_float)
                        .transpose()?
                        .unwrap_or(0.95),
                };
                Ok(Self::mitigated_distribution_to_value(
                    &mitigate_single_qubit_readout(&histogram, &calibration),
                ))
            }

            "zne" | "zero_noise_extrapolate" | "zero_noise_extrapolation" => {
                let scales = Self::float_list_from_value(
                    arg_vals
                        .get(0)
                        .ok_or_else(|| InterpError::type_error("zne requires noise scale list"))?,
                    "noise scales",
                )?;
                let values = Self::float_list_from_value(
                    arg_vals
                        .get(1)
                        .ok_or_else(|| InterpError::type_error("zne requires value list"))?,
                    "expectation values",
                )?;
                let value = zero_noise_extrapolate(&scales, &values)
                    .map_err(|e| InterpError::runtime_error(&e))?;
                Ok(Value::Float(value))
            }

            "qec_decode_repetition" | "repetition_decode" | "decode_repetition_code" => {
                let bits = Self::u8_list_from_value(arg_vals.get(0).ok_or_else(|| {
                    InterpError::type_error("qec_decode_repetition requires a bit list")
                })?)?;
                Ok(Self::repetition_decode_to_value(&decode_repetition_code(
                    &bits,
                )))
            }

            "qec_pipeline" | "qec_pipeline_plan" => {
                let code = arg_vals
                    .get(0)
                    .map(Value::as_string)
                    .unwrap_or_else(|| "repetition".to_string());
                let distance = arg_vals
                    .get(1)
                    .map(Value::as_int)
                    .transpose()?
                    .unwrap_or(3)
                    .max(1) as usize;
                Ok(Self::qec_pipeline_plan_to_value(&qec_pipeline_plan(
                    &code, distance,
                )))
            }

            "sampler_plan" => {
                let shots = arg_vals
                    .get(0)
                    .map(Value::as_int)
                    .transpose()?
                    .unwrap_or(1024);
                Ok(Self::dict(vec![
                    ("primitive", Value::String("Sampler".to_string())),
                    ("shots", Value::Int(shots)),
                    (
                        "local_function",
                        Value::String("measure_all(shots=...)".to_string()),
                    ),
                    ("provider_ready", Value::Bool(false)),
                    (
                        "notes",
                        Self::string_list(vec![
                            "Local sampling is implemented.".to_string(),
                            "Provider Sampler adapters need credentials and job handles."
                                .to_string(),
                        ]),
                    ),
                ]))
            }

            "estimator_plan" => Ok(Self::dict(vec![
                ("primitive", Value::String("Estimator".to_string())),
                (
                    "local_functions",
                    Self::string_list(vec![
                        "expectation_z".to_string(),
                        "expectation_zz".to_string(),
                    ]),
                ),
                ("provider_ready", Value::Bool(false)),
                (
                    "notes",
                    Self::string_list(vec![
                        "Single Z/ZZ local estimators are implemented.".to_string(),
                        "General Pauli-sum estimator and provider adapters are next.".to_string(),
                    ]),
                ),
            ])),

            "pauli_term" => {
                let label = arg_vals
                    .get(0)
                    .ok_or_else(|| InterpError::type_error("pauli_term requires label"))?
                    .as_string();
                let coeff = arg_vals
                    .get(1)
                    .ok_or_else(|| InterpError::type_error("pauli_term requires coefficient"))?
                    .as_float()?;
                let qubits = arg_vals.get(2).cloned().unwrap_or(Value::List(vec![]));
                Ok(Self::dict(vec![
                    ("type", Value::String("pauli_term".to_string())),
                    ("label", Value::String(label)),
                    ("coefficient", Value::Float(coeff)),
                    ("qubits", qubits),
                ]))
            }

            "hamiltonian" => {
                let terms = arg_vals.get(0).cloned().unwrap_or(Value::List(vec![]));
                let term_count = match &terms {
                    Value::List(items) => items.len(),
                    _ => 0,
                };
                Ok(Self::dict(vec![
                    ("type", Value::String("pauli_hamiltonian".to_string())),
                    ("terms", terms),
                    ("term_count", Value::Int(term_count as i64)),
                    (
                        "recommended_algorithm",
                        Value::String("VQE/QPE/resource estimation".to_string()),
                    ),
                ]))
            }

            "qubo_model" => {
                let n_vars = arg_vals
                    .get(0)
                    .ok_or_else(|| InterpError::type_error("qubo_model requires n_vars"))?
                    .as_int()?;
                let n_terms = arg_vals.get(1).map(Value::as_int).transpose()?.unwrap_or(0);
                Ok(Self::dict(vec![
                    ("type", Value::String("qubo".to_string())),
                    ("n_vars", Value::Int(n_vars)),
                    ("n_terms", Value::Int(n_terms)),
                    (
                        "recommended_algorithm",
                        Value::String("QAOA / classical baseline / annealing adapter".to_string()),
                    ),
                    (
                        "backend_hint",
                        Value::String("sparse or tensor-network for structured QAOA".to_string()),
                    ),
                ]))
            }

            "oracle_model" => {
                let name = arg_vals
                    .get(0)
                    .map(Value::as_string)
                    .unwrap_or_else(|| "oracle".to_string());
                let qubits = arg_vals.get(1).map(Value::as_int).transpose()?.unwrap_or(0);
                let t_count = arg_vals.get(2).map(Value::as_int).transpose()?.unwrap_or(0);
                Ok(Self::dict(vec![
                    ("type", Value::String("oracle".to_string())),
                    ("name", Value::String(name)),
                    ("n_qubits", Value::Int(qubits)),
                    ("t_count_hint", Value::Int(t_count)),
                    (
                        "recommended_algorithm",
                        Value::String("Grover / amplitude amplification".to_string()),
                    ),
                ]))
            }

            "circuit_catalog" | "circuit_family_catalog" | "quantum_circuit_catalog" => {
                Ok(Value::List(
                    circuit_family_catalog()
                        .iter()
                        .map(Self::circuit_template_to_value)
                        .collect(),
                ))
            }

            "apply_circuit" | "run_circuit_template" | "apply_circuit_template" => {
                let circuit_name = arg_vals
                    .get(0)
                    .ok_or_else(|| {
                        InterpError::type_error("apply_circuit requires a circuit name")
                    })?
                    .as_string();
                let template = self.build_circuit_template(&circuit_name, &arg_vals[1..])?;
                if self
                    .engine
                    .as_ref()
                    .map(|engine| engine.n_qubits() < template.n_qubits)
                    .unwrap_or(true)
                {
                    self.engine = Some(QuantumEngine::new(template.n_qubits));
                    self.env.set(
                        "q".into(),
                        Value::QuantumRegister {
                            n_qubits: template.n_qubits,
                        },
                    );
                }
                let engine = self
                    .engine
                    .as_mut()
                    .ok_or_else(|| InterpError::runtime_error("failed to create quantum engine"))?;
                apply_circuit_template(engine, &template)
                    .map_err(|e| InterpError::runtime_error(&e))?;
                Ok(Self::circuit_template_to_value(&template))
            }

            "bell_circuit"
            | "bell_state_circuit"
            | "ghz_circuit"
            | "ghz_state_circuit"
            | "qft_circuit"
            | "quantum_fourier_transform_circuit"
            | "qpe_circuit"
            | "quantum_phase_estimation_circuit"
            | "amplitude_amplification_circuit"
            | "grover_circuit"
            | "grover_search_circuit"
            | "vqe_circuit"
            | "vqe_ansatz_circuit"
            | "qaoa_circuit"
            | "qaoa_maxcut_circuit"
            | "bernstein_vazirani_circuit"
            | "deutsch_jozsa_circuit"
            | "teleportation_circuit"
            | "quantum_teleportation_circuit"
            | "superdense_coding_circuit"
            | "qec_circuit"
            | "bit_flip_code_circuit"
            | "phase_flip_code_circuit"
            | "surface_code_circuit"
            | "steane_code_circuit"
            | "shor_code_circuit"
            | "shor_9qubit_code_circuit"
            | "shor_factoring_circuit"
            | "shor_circuit"
            | "hhl_circuit"
            | "swap_test_circuit"
            | "vqc_circuit"
            | "variational_quantum_classifier_circuit"
            | "qnn_circuit"
            | "quantum_neural_network_circuit"
            | "quantum_walk_circuit"
            | "dtqw_circuit"
            | "ctqw_circuit"
            | "szegedy_walk_circuit"
            | "element_distinctness_circuit"
            | "triangle_finding_circuit"
            | "quantum_counting_circuit"
            | "block_encoding_circuit"
            | "qsp_circuit"
            | "qsvt_circuit"
            | "hardware_efficient_ansatz_circuit"
            | "data_reuploading_circuit"
            | "quantum_kernel_circuit"
            | "quantum_kernel_estimation_circuit"
            | "boson_sampling_circuit"
            | "braiding_circuit"
            | "mbqc_circuit"
            | "measurement_based_circuit"
            | "cluster_state_circuit" => {
                let template = self.build_circuit_template(func_name.as_str(), &arg_vals)?;
                Ok(Self::circuit_template_to_value(&template))
            }

            // ── Built-in circuits ──
            "qft" => {
                if let Some(eng) = &mut self.engine {
                    eng.qft();
                }
                Ok(Value::None)
            }

            "bell_state" => {
                self.engine = Some(QuantumEngine::new(2));
                if let Some(eng) = &mut self.engine {
                    eng.bell();
                }
                Ok(Value::QuantumRegister { n_qubits: 2 })
            }

            "ghz_state" => {
                let n = args
                    .iter()
                    .find(|a| a.name.as_deref() == Some("n_qubits"))
                    .and_then(|a| {
                        if let Expr::IntLit(v, _) = &a.value {
                            Some(*v as usize)
                        } else {
                            None
                        }
                    })
                    .unwrap_or(arg_vals.get(0).and_then(|v| v.as_int().ok()).unwrap_or(2) as usize);
                self.engine = Some(QuantumEngine::new(n));
                if let Some(eng) = &mut self.engine {
                    eng.ghz();
                }
                Ok(Value::QuantumRegister { n_qubits: n })
            }

            // ── Math builtins ──
            "sqrt" => Ok(Value::Float(arg_vals[0].as_float()?.sqrt())),
            "abs" => Ok(Value::Float(arg_vals[0].as_float()?.abs())),
            "sin" => Ok(Value::Float(arg_vals[0].as_float()?.sin())),
            "cos" => Ok(Value::Float(arg_vals[0].as_float()?.cos())),
            "tan" => Ok(Value::Float(arg_vals[0].as_float()?.tan())),
            "log" => Ok(Value::Float(arg_vals[0].as_float()?.ln())),
            "log2" => Ok(Value::Float(arg_vals[0].as_float()?.log2())),
            "log10" => Ok(Value::Float(arg_vals[0].as_float()?.log10())),
            "exp" => Ok(Value::Float(arg_vals[0].as_float()?.exp())),
            "floor" => Ok(Value::Int(arg_vals[0].as_float()?.floor() as i64)),
            "ceil" => Ok(Value::Int(arg_vals[0].as_float()?.ceil() as i64)),
            "round" => {
                let v = arg_vals[0].as_float()?;
                let decimals = arg_vals.get(1).and_then(|v| v.as_int().ok()).unwrap_or(0);
                let factor = 10f64.powi(decimals as i32);
                Ok(Value::Float((v * factor).round() / factor))
            }
            "pow" => Ok(Value::Float(
                arg_vals[0].as_float()?.powf(arg_vals[1].as_float()?),
            )),

            // ── Collection builtins ──
            "len" => match &arg_vals[0] {
                Value::List(v) => Ok(Value::Int(v.len() as i64)),
                Value::String(s) => Ok(Value::Int(s.len() as i64)),
                Value::Dict(v) => Ok(Value::Int(v.len() as i64)),
                _ => Err(InterpError::type_error("Cannot get length")),
            },
            "range" => {
                let (start, end, step) = match arg_vals.len() {
                    1 => (0, arg_vals[0].as_int()?, 1),
                    2 => (arg_vals[0].as_int()?, arg_vals[1].as_int()?, 1),
                    3 => (
                        arg_vals[0].as_int()?,
                        arg_vals[1].as_int()?,
                        arg_vals[2].as_int()?,
                    ),
                    _ => return Err(InterpError::type_error("range takes 1-3 arguments")),
                };
                let mut items = Vec::new();
                let mut i = start;
                while (step > 0 && i < end) || (step < 0 && i > end) {
                    items.push(Value::Int(i));
                    i += step;
                }
                Ok(Value::List(items))
            }
            "sum" => {
                if let Value::List(items) = &arg_vals[0] {
                    let total: f64 = items.iter().map(|v| v.as_float().unwrap_or(0.0)).sum();
                    Ok(Value::Float(total))
                } else {
                    Err(InterpError::type_error("sum requires a list"))
                }
            }
            "mean" => {
                if let Value::List(items) = &arg_vals[0] {
                    let n = items.len() as f64;
                    let total: f64 = items.iter().map(|v| v.as_float().unwrap_or(0.0)).sum();
                    Ok(Value::Float(total / n))
                } else {
                    Err(InterpError::type_error("mean requires a list"))
                }
            }
            "max" => {
                if let Value::List(items) = &arg_vals[0] {
                    let m = items
                        .iter()
                        .map(|v| v.as_float().unwrap_or(f64::NEG_INFINITY))
                        .fold(f64::NEG_INFINITY, f64::max);
                    Ok(Value::Float(m))
                } else {
                    Err(InterpError::type_error("max requires a list"))
                }
            }
            "min" => {
                if let Value::List(items) = &arg_vals[0] {
                    let m = items
                        .iter()
                        .map(|v| v.as_float().unwrap_or(f64::INFINITY))
                        .fold(f64::INFINITY, f64::min);
                    Ok(Value::Float(m))
                } else {
                    Err(InterpError::type_error("min requires a list"))
                }
            }
            "sort" => {
                if let Value::List(mut items) = arg_vals[0].clone() {
                    items.sort_by(|a, b| {
                        a.as_float()
                            .unwrap_or(0.0)
                            .partial_cmp(&b.as_float().unwrap_or(0.0))
                            .unwrap()
                    });
                    Ok(Value::List(items))
                } else {
                    Err(InterpError::type_error("sort requires a list"))
                }
            }

            "int" => Ok(Value::Int(arg_vals[0].as_int()?)),
            "float" => Ok(Value::Float(arg_vals[0].as_float()?)),
            "str" => Ok(Value::String(arg_vals[0].as_string())),
            "bool" => Ok(Value::Bool(arg_vals[0].as_bool())),
            "type" => Ok(Value::String(
                match &arg_vals[0] {
                    Value::Int(_) => "int",
                    Value::Float(_) => "float",
                    Value::String(_) => "string",
                    Value::Bool(_) => "bool",
                    Value::None => "none",
                    Value::List(_) => "list",
                    Value::Dict(_) => "dict",
                    _ => "object",
                }
                .into(),
            )),

            "enumerate" => {
                if let Value::List(items) = &arg_vals[0] {
                    Ok(Value::List(
                        items
                            .iter()
                            .enumerate()
                            .map(|(i, v)| Value::Tuple(vec![Value::Int(i as i64), v.clone()]))
                            .collect(),
                    ))
                } else {
                    Err(InterpError::type_error("enumerate requires a list"))
                }
            }

            "zip" => {
                if let (Value::List(a), Value::List(b)) = (&arg_vals[0], &arg_vals[1]) {
                    Ok(Value::List(
                        a.iter()
                            .zip(b.iter())
                            .map(|(x, y)| Value::Tuple(vec![x.clone(), y.clone()]))
                            .collect(),
                    ))
                } else {
                    Err(InterpError::type_error("zip requires two lists"))
                }
            }

            "range_step" => {
                let start = arg_vals[0].as_float()?;
                let end = arg_vals[1].as_float()?;
                let step = arg_vals[2].as_float()?;
                let mut items = Vec::new();
                let mut v = start;
                while v < end {
                    items.push(Value::Float(v));
                    v += step;
                }
                Ok(Value::List(items))
            }

            "top_k" => {
                if let (Value::MeasurementResult(r), Value::Int(k)) =
                    (&arg_vals[0], &arg_vals.get(1).unwrap_or(&Value::Int(5)))
                {
                    let top = r.top_k(*k as usize);
                    Ok(Value::List(
                        top.into_iter()
                            .map(|(bs, p)| Value::Tuple(vec![Value::String(bs), Value::Float(p)]))
                            .collect(),
                    ))
                } else {
                    Err(InterpError::type_error("top_k requires MeasurementResult"))
                }
            }

            "map" => {
                if let (Value::List(items), func) = (&arg_vals[1], &arg_vals[0]) {
                    let mut result = Vec::new();
                    for item in items {
                        result.push(self.call_function(func, &[item.clone()])?);
                    }
                    Ok(Value::List(result))
                } else {
                    Err(InterpError::type_error("map requires function and list"))
                }
            }

            "filter" => {
                if let (Value::List(items), func) = (&arg_vals[1], &arg_vals[0]) {
                    let mut result = Vec::new();
                    for item in items {
                        if self.call_function(func, &[item.clone()])?.as_bool() {
                            result.push(item.clone());
                        }
                    }
                    Ok(Value::List(result))
                } else {
                    Err(InterpError::type_error("filter requires function and list"))
                }
            }

            "reduce" => {
                if arg_vals.len() >= 2 {
                    if let (Value::List(items), func) = (&arg_vals[1], &arg_vals[0]) {
                        let init = arg_vals.get(2).cloned();
                        let mut acc = init.unwrap_or_else(|| items[0].clone());
                        let start = if arg_vals.len() > 2 { 0 } else { 1 };
                        for item in &items[start..] {
                            acc = self.call_function(func, &[acc, item.clone()])?;
                        }
                        Ok(acc)
                    } else {
                        Err(InterpError::type_error("reduce requires function and list"))
                    }
                } else {
                    Err(InterpError::type_error("reduce requires at least 2 args"))
                }
            }

            // ── I/O ──
            "read_csv" => Ok(Value::String(format!(
                "<DataFrame from {}>",
                arg_vals[0].as_string()
            ))),
            "write_csv" => Ok(Value::None),
            "read_json" => Ok(Value::Dict(vec![])),
            "write_json" => Ok(Value::None),
            "read_file" => Ok(Value::String(String::new())),
            "write_file" => Ok(Value::None),

            // ── Try to call user-defined function ──
            _ => {
                if let Some(func) = self.env.get(&func_name) {
                    self.call_function(&func, &arg_vals)
                } else {
                    // Unknown function — log warning and return None
                    eprintln!("Warning: Unknown function '{}' — returning None", func_name);
                    Ok(Value::None)
                }
            }
        }
    }

    fn make_backend_plan_from_args(&self, args: &[Value]) -> Result<BackendPlan, InterpError> {
        if args.len() >= 2 {
            let n = args[0].as_int()? as usize;
            let expected_nnz = args[1].as_int()? as usize;
            let profile = CircuitProfile::new(n).expected_nnz(expected_nnz);
            return Ok(BackendPlanner::plan(&profile, &PlannerConfig::default()));
        }
        self.make_backend_plan(args.get(0))
    }

    fn make_backend_plan(&self, n_arg: Option<&Value>) -> Result<BackendPlan, InterpError> {
        if n_arg.is_none() {
            if let Some(engine) = &self.engine {
                return Ok(BackendPlanner::enforce_requested(
                    engine.n_qubits(),
                    engine.engine_kind,
                    &PlannerConfig::default(),
                ));
            }
        }
        let n = self.resolve_qubit_count(n_arg)?;
        Ok(BackendPlanner::plan(
            &CircuitProfile::new(n),
            &PlannerConfig::default(),
        ))
    }

    fn resolve_qubit_count(&self, n_arg: Option<&Value>) -> Result<usize, InterpError> {
        if let Some(value) = n_arg {
            return Ok(value.as_int()? as usize);
        }
        self.engine
            .as_ref()
            .map(QuantumEngine::n_qubits)
            .ok_or_else(|| InterpError::type_error("Qubit count required when no engine is active"))
    }

    fn parse_distributed_runtime(value: &str) -> Result<DistributedRuntime, InterpError> {
        match value.to_ascii_lowercase().as_str() {
            "local" | "local_threads" | "threads" => Ok(DistributedRuntime::LocalThreads),
            "ray" => Ok(DistributedRuntime::Ray),
            "dask" => Ok(DistributedRuntime::Dask),
            "mpi" => Ok(DistributedRuntime::Mpi),
            _ => Err(InterpError::type_error(
                "distributed runtime must be local, ray, dask, or mpi",
            )),
        }
    }

    fn dict(items: Vec<(&str, Value)>) -> Value {
        Value::Dict(
            items
                .into_iter()
                .map(|(key, value)| (Value::String(key.to_string()), value))
                .collect(),
        )
    }

    fn string_list(items: Vec<String>) -> Value {
        Value::List(items.into_iter().map(Value::String).collect())
    }

    fn u128_value(value: Option<u128>) -> Value {
        match value {
            Some(v) if v <= i64::MAX as u128 => Value::Int(v as i64),
            Some(v) => Value::String(v.to_string()),
            None => Value::None,
        }
    }

    fn backend_plan_to_value(plan: &BackendPlan) -> Value {
        let shard = plan.shard_plan.as_ref().map(|s| {
            Self::dict(vec![
                ("n_qubits", Value::Int(s.n_qubits as i64)),
                ("local_qubits", Value::Int(s.local_qubits as i64)),
                ("shard_prefix_bits", Value::Int(s.shard_prefix_bits as i64)),
                ("num_shards", Self::u128_value(Some(s.num_shards))),
                ("bytes_per_shard", Self::u128_value(Some(s.bytes_per_shard))),
                ("total_state_bytes", Self::u128_value(s.total_state_bytes)),
                (
                    "worker_memory_limit_bytes",
                    Self::u128_value(Some(s.worker_memory_limit_bytes)),
                ),
                ("notes", Self::string_list(s.notes.clone())),
            ])
        });

        Self::dict(vec![
            (
                "selected_method",
                Value::String(format!("{:?}", plan.selected_method)),
            ),
            (
                "availability",
                Value::String(format!("{:?}", plan.availability)),
            ),
            (
                "runtime_engine",
                Value::String(format!("{:?}", plan.runtime_engine)),
            ),
            (
                "estimated_dense_state_bytes",
                Self::u128_value(plan.estimated_dense_state_bytes),
            ),
            (
                "fallback_chain",
                Self::string_list(
                    plan.fallback_chain
                        .iter()
                        .map(|method| format!("{:?}", method))
                        .collect(),
                ),
            ),
            ("reasons", Self::string_list(plan.reasons.clone())),
            ("warnings", Self::string_list(plan.warnings.clone())),
            ("shard_plan", shard.unwrap_or(Value::None)),
        ])
    }

    fn format_backend_plan(plan: &BackendPlan) -> String {
        let mut parts = vec![
            format!("method={:?}", plan.selected_method),
            format!("runtime={:?}", plan.runtime_engine),
            format!("availability={:?}", plan.availability),
        ];
        if let Some(bytes) = plan.estimated_dense_state_bytes {
            parts.push(format!("dense_bytes={}", bytes));
        }
        if let Some(shard) = &plan.shard_plan {
            parts.push(format!(
                "shards={} local_qubits={} prefix_bits={}",
                shard.num_shards, shard.local_qubits, shard.shard_prefix_bits
            ));
        }
        if !plan.warnings.is_empty() {
            parts.push(format!("warnings={}", plan.warnings.join(" | ")));
        }
        if !plan.reasons.is_empty() {
            parts.push(format!("reasons={}", plan.reasons.join(" | ")));
        }
        parts.join("; ")
    }

    fn integration_status_to_value(status: IntegrationStatus) -> Value {
        Self::dict(vec![
            ("kind", Value::String(format!("{:?}", status.kind))),
            ("available", Value::Bool(status.available)),
            ("command", Value::String(status.command)),
            ("detail", Value::String(status.detail)),
        ])
    }

    fn gpu_plan_to_value(plan: &GpuBackendPlan) -> Value {
        Self::dict(vec![
            (
                "selected_method",
                Value::String(format!("{:?}", plan.selected_method)),
            ),
            ("component", Value::String(format!("{:?}", plan.component))),
            (
                "availability",
                Value::String(format!("{:?}", plan.availability)),
            ),
            ("n_qubits", Value::Int(plan.n_qubits as i64)),
            (
                "estimated_dense_state_bytes",
                Self::u128_value(plan.estimated_dense_state_bytes),
            ),
            (
                "integration",
                Self::integration_status_to_value(plan.integration.clone()),
            ),
            ("warnings", Self::string_list(plan.warnings.clone())),
        ])
    }

    fn qec_status_to_value(status: &QecIntegrationStatus) -> Value {
        Self::dict(vec![
            ("production_ready", Value::Bool(status.production_ready)),
            (
                "stim",
                Self::integration_status_to_value(status.stim.clone()),
            ),
            (
                "pymatching",
                Self::integration_status_to_value(status.pymatching.clone()),
            ),
            ("notes", Self::string_list(status.notes.clone())),
        ])
    }

    fn stim_export_to_value(export: &StimExport) -> Value {
        Self::dict(vec![
            ("circuit", Value::String(export.circuit.clone())),
            (
                "unsupported_gates",
                Self::string_list(export.unsupported_gates.clone()),
            ),
            ("warnings", Self::string_list(export.warnings.clone())),
        ])
    }

    fn qasm3_import_to_value(imported: &Qasm3Import) -> Value {
        Self::dict(vec![
            ("n_qubits", Value::Int(imported.n_qubits as i64)),
            ("n_clbits", Value::Int(imported.n_clbits as i64)),
            ("n_gates", Value::Int(imported.gates.len() as i64)),
            (
                "n_measurements",
                Value::Int(imported.measurements.len() as i64),
            ),
            (
                "classical_controls",
                Self::string_list(imported.classical_controls.clone()),
            ),
            ("timing", Self::string_list(imported.timing.clone())),
            ("externs", Self::string_list(imported.externs.clone())),
            (
                "calibrations",
                Self::string_list(imported.calibrations.clone()),
            ),
            ("warnings", Self::string_list(imported.warnings.clone())),
        ])
    }

    fn advanced_capability_to_value(cap: AdvancedEngineCapability) -> Value {
        Self::dict(vec![
            ("kind", Value::String(format!("{:?}", cap.kind))),
            ("native_available", Value::Bool(cap.native_available)),
            ("external_available", Value::Bool(cap.external_available)),
            ("exact_by_default", Value::Bool(cap.exact_by_default)),
            (
                "max_native_qubits",
                cap.max_native_qubits
                    .map(|n| Value::Int(n as i64))
                    .unwrap_or(Value::None),
            ),
            (
                "integration",
                cap.integration.map(Value::String).unwrap_or(Value::None),
            ),
            ("notes", Self::string_list(cap.notes)),
        ])
    }

    fn conformance_plan_to_value(plan: &ConformancePlan) -> Value {
        let targets = plan
            .targets
            .iter()
            .map(|target| {
                Self::dict(vec![
                    ("name", Value::String(target.name.clone())),
                    ("runnable", Value::Bool(target.runnable)),
                    (
                        "integration",
                        Self::integration_status_to_value(target.integration.clone()),
                    ),
                    ("focus", Self::string_list(target.focus.clone())),
                ])
            })
            .collect();
        Self::dict(vec![
            ("targets", Value::List(targets)),
            ("notes", Self::string_list(plan.notes.clone())),
        ])
    }

    fn quantum_assessment_to_value(assessment: &QuantumApplicationAssessment) -> Value {
        Self::dict(vec![
            ("problem", Value::String(assessment.problem.clone())),
            ("kind", Value::String(format!("{:?}", assessment.kind))),
            ("n_qubits", Value::Int(assessment.n_qubits as i64)),
            (
                "can_run_100q_locally",
                Value::Bool(assessment.can_run_100q_locally),
            ),
            (
                "local_feasibility",
                Value::String(format!("{:?}", assessment.local_feasibility)),
            ),
            (
                "recommended_algorithm",
                Value::String(assessment.recommended_algorithm.clone()),
            ),
            (
                "recommended_backend",
                Value::String(assessment.recommended_backend.clone()),
            ),
            (
                "selected_method",
                Value::String(format!("{:?}", assessment.selected_method)),
            ),
            (
                "production_status",
                Value::String(assessment.production_status.clone()),
            ),
            ("sansqrit_ready", Value::Bool(assessment.sansqrit_ready)),
            (
                "shortcomings",
                Self::string_list(assessment.shortcomings.clone()),
            ),
            (
                "next_steps",
                Self::string_list(assessment.next_steps.clone()),
            ),
        ])
    }

    fn production_readiness_to_value(report: &ProductionReadinessReport) -> Value {
        Self::dict(vec![
            ("n_qubits", Value::Int(report.n_qubits as i64)),
            (
                "arbitrary_dense_local_possible",
                Value::Bool(report.arbitrary_dense_local_possible),
            ),
            (
                "local_success_modes",
                Self::string_list(report.local_success_modes.clone()),
            ),
            (
                "external_success_modes",
                Self::string_list(report.external_success_modes.clone()),
            ),
            ("blockers", Self::string_list(report.blockers.clone())),
            (
                "required_work",
                Self::string_list(report.required_work.clone()),
            ),
        ])
    }

    fn market_capability_to_value(cap: MarketCapability) -> Value {
        Self::dict(vec![
            ("area", Value::String(cap.area)),
            ("market_standard", Value::String(cap.market_standard)),
            ("sansqrit_function", Value::String(cap.sansqrit_function)),
            ("status", Value::String(cap.status)),
            ("missing_work", Self::string_list(cap.missing_work)),
        ])
    }

    fn quantum_workflow_to_value(workflow: &QuantumWorkflow) -> Value {
        let stages = workflow
            .stages
            .iter()
            .map(|stage| {
                Self::dict(vec![
                    ("name", Value::String(stage.name.clone())),
                    ("action", Value::String(stage.action.clone())),
                    ("dsl_function", Value::String(stage.dsl_function.clone())),
                ])
            })
            .collect();
        Self::dict(vec![
            ("problem", Value::String(workflow.problem.clone())),
            ("n_qubits", Value::Int(workflow.n_qubits as i64)),
            ("kind", Value::String(format!("{:?}", workflow.kind))),
            ("stages", Value::List(stages)),
            (
                "validation_checks",
                Self::string_list(workflow.validation_checks.clone()),
            ),
            (
                "recommended_syntax",
                Self::string_list(workflow.recommended_syntax.clone()),
            ),
        ])
    }

    fn ft_estimate_to_value(estimate: &FaultTolerantResourceEstimate) -> Value {
        Self::dict(vec![
            ("logical_qubits", Value::Int(estimate.logical_qubits as i64)),
            ("t_count", Self::u128_value(Some(estimate.t_count))),
            ("error_budget", Value::Float(estimate.error_budget)),
            (
                "code_distance_hint",
                Value::Int(estimate.code_distance_hint as i64),
            ),
            (
                "physical_qubits_lower_bound",
                Self::u128_value(Some(estimate.physical_qubits_lower_bound)),
            ),
            ("notes", Self::string_list(estimate.notes.clone())),
        ])
    }

    fn surface_code_plan_to_value(plan: &SurfaceCodePlan) -> Value {
        Self::dict(vec![
            ("logical_qubits", Value::Int(plan.logical_qubits as i64)),
            ("distance", Value::Int(plan.distance as i64)),
            ("rounds", Value::Int(plan.rounds as i64)),
            (
                "physical_error_rate",
                Value::Float(plan.physical_error_rate),
            ),
            (
                "data_qubits_per_patch",
                Value::Int(plan.data_qubits_per_patch as i64),
            ),
            (
                "physical_qubits_lower_bound",
                Self::u128_value(Some(plan.physical_qubits_lower_bound)),
            ),
            ("notes", Self::string_list(plan.notes.clone())),
        ])
    }

    fn error_mitigation_to_value(plan: &ErrorMitigationPlan) -> Value {
        Self::dict(vec![
            ("shots", Value::Int(plan.shots as i64)),
            ("noise_level", Value::String(plan.noise_level_label.clone())),
            ("methods", Self::string_list(plan.methods.clone())),
            ("validation", Self::string_list(plan.validation.clone())),
            ("warnings", Self::string_list(plan.warnings.clone())),
        ])
    }

    fn hardware_transpile_to_value(plan: &HardwareTranspilePlan) -> Value {
        Self::dict(vec![
            ("target", Value::String(plan.target.clone())),
            ("n_qubits", Value::Int(plan.n_qubits as i64)),
            ("basis_gates", Self::string_list(plan.basis_gates.clone())),
            ("connectivity", Value::String(plan.connectivity.clone())),
            ("passes", Self::string_list(plan.passes.clone())),
            ("warnings", Self::string_list(plan.warnings.clone())),
        ])
    }

    fn parse_provider_kind(value: &str) -> Result<ProviderKind, InterpError> {
        match value.to_ascii_lowercase().as_str() {
            "ibm" | "ibm_quantum" | "qiskit" => Ok(ProviderKind::Ibm),
            "aws" | "braket" | "aws_braket" => Ok(ProviderKind::AwsBraket),
            "azure" | "azure_quantum" => Ok(ProviderKind::AzureQuantum),
            "local" | "local_only" | "simulator" => Ok(ProviderKind::LocalOnly),
            _ => Err(InterpError::type_error(
                "provider must be ibm, aws/braket, azure, or local",
            )),
        }
    }

    fn provider_result_to_value(result: &ProviderJobResult) -> Value {
        Self::dict(vec![
            ("provider", Value::String(format!("{:?}", result.provider))),
            ("submitted", Value::Bool(result.submitted)),
            (
                "job_id",
                result
                    .job_id
                    .clone()
                    .map(Value::String)
                    .unwrap_or(Value::None),
            ),
            ("command", Value::String(result.command.clone())),
            ("stdout", Value::String(result.stdout.clone())),
            ("stderr", Value::String(result.stderr.clone())),
            ("warnings", Self::string_list(result.warnings.clone())),
        ])
    }

    fn gate_to_value(gate: &GateOp) -> Value {
        Self::dict(vec![
            ("kind", Value::String(gate.kind.name().to_string())),
            (
                "qubits",
                Value::List(gate.qubits.iter().map(|q| Value::Int(*q as i64)).collect()),
            ),
            (
                "params",
                Value::List(gate.params.iter().map(|p| Value::Float(*p)).collect()),
            ),
        ])
    }

    fn transpile_result_to_value(result: &TranspileResult) -> Value {
        Self::dict(vec![
            ("gate_count", Value::Int(result.gates.len() as i64)),
            (
                "gates",
                Value::List(result.gates.iter().map(Self::gate_to_value).collect()),
            ),
            ("passes", Self::string_list(result.passes.clone())),
            ("inserted_swaps", Value::Int(result.inserted_swaps as i64)),
            ("cancelled_gates", Value::Int(result.cancelled_gates as i64)),
            ("warnings", Self::string_list(result.warnings.clone())),
        ])
    }

    fn stabilizer_to_value(engine: &StabilizerEngine) -> Value {
        Self::dict(vec![
            ("n_qubits", Value::Int(engine.n_qubits as i64)),
            ("valid", Value::Bool(engine.is_valid_stabilizer_run())),
            ("generators", Self::string_list(engine.generator_strings())),
            (
                "unsupported_gates",
                Self::string_list(engine.unsupported_gates.clone()),
            ),
        ])
    }

    fn mps_to_value(engine: &MpsEngine) -> Value {
        Self::dict(vec![
            ("n_qubits", Value::Int(engine.n_qubits as i64)),
            ("max_bond_dim", Value::Int(engine.max_bond_dim as i64)),
            (
                "bond_dims",
                Value::List(
                    engine
                        .bond_dims
                        .iter()
                        .map(|d| Value::Int(*d as i64))
                        .collect(),
                ),
            ),
            (
                "max_observed_bond",
                Value::Int(engine.max_observed_bond() as i64),
            ),
            ("applied_gates", Value::Int(engine.applied_gates as i64)),
            ("warnings", Self::string_list(engine.warnings.clone())),
        ])
    }

    fn tensor_plan_to_value(plan: &TensorNetworkPlan) -> Value {
        Self::dict(vec![
            ("n_qubits", Value::Int(plan.n_qubits as i64)),
            ("tensor_count", Value::Int(plan.tensor_count as i64)),
            ("max_tensor_rank", Value::Int(plan.max_tensor_rank as i64)),
            (
                "estimated_contraction_width",
                Value::Int(plan.estimated_contraction_width as i64),
            ),
            ("executable_locally", Value::Bool(plan.executable_locally)),
            ("notes", Self::string_list(plan.notes.clone())),
        ])
    }

    fn histogram_from_value(value: &Value) -> Result<HashMap<String, usize>, InterpError> {
        match value {
            Value::MeasurementResult(result) => Ok(result.histogram.clone()),
            Value::Dict(pairs) => {
                let mut histogram = HashMap::new();
                for (key, value) in pairs {
                    let count = value.as_int()?;
                    if count < 0 {
                        return Err(InterpError::type_error(
                            "histogram counts must be non-negative",
                        ));
                    }
                    histogram.insert(key.as_string(), count as usize);
                }
                Ok(histogram)
            }
            _ => Err(InterpError::type_error(
                "expected MeasurementResult or histogram dict",
            )),
        }
    }

    fn float_list_from_value(value: &Value, label: &str) -> Result<Vec<f64>, InterpError> {
        match value {
            Value::List(items) => items.iter().map(Value::as_float).collect(),
            _ => Err(InterpError::type_error(&format!(
                "{} must be a list",
                label
            ))),
        }
    }

    fn u8_list_from_value(value: &Value) -> Result<Vec<u8>, InterpError> {
        match value {
            Value::List(items) => items
                .iter()
                .map(|value| {
                    let bit = value.as_int()?;
                    match bit {
                        0 | 1 => Ok(bit as u8),
                        _ => Err(InterpError::type_error(
                            "QEC bit lists may only contain 0 or 1",
                        )),
                    }
                })
                .collect(),
            _ => Err(InterpError::type_error("QEC bits must be a list")),
        }
    }

    fn mitigated_distribution_to_value(distribution: &MitigatedDistribution) -> Value {
        let probabilities = distribution
            .probabilities
            .iter()
            .map(|(bitstring, probability)| {
                Value::Tuple(vec![
                    Value::String(bitstring.clone()),
                    Value::Float(*probability),
                ])
            })
            .collect::<Vec<_>>();
        let probability_dict = Value::Dict(
            distribution
                .probabilities
                .iter()
                .map(|(bitstring, probability)| {
                    (Value::String(bitstring.clone()), Value::Float(*probability))
                })
                .collect(),
        );
        Self::dict(vec![
            ("probabilities", Value::List(probabilities)),
            ("probability_dict", probability_dict),
            ("warnings", Self::string_list(distribution.warnings.clone())),
        ])
    }

    fn repetition_decode_to_value(result: &RepetitionDecodeResult) -> Value {
        Self::dict(vec![
            ("logical_bit", Value::Int(result.logical_bit as i64)),
            (
                "corrections",
                Value::List(
                    result
                        .corrections
                        .iter()
                        .map(|q| Value::Int(*q as i64))
                        .collect(),
                ),
            ),
            ("syndrome_weight", Value::Int(result.syndrome_weight as i64)),
        ])
    }

    fn qec_pipeline_plan_to_value(plan: &QecPipelinePlan) -> Value {
        Self::dict(vec![
            ("code", Value::String(plan.code.clone())),
            ("distance", Value::Int(plan.distance as i64)),
            ("executable_native", Value::Bool(plan.executable_native)),
            (
                "external_decoder",
                Value::String(plan.external_decoder.clone()),
            ),
            ("steps", Self::string_list(plan.steps.clone())),
        ])
    }

    fn circuit_template_to_value(template: &CircuitTemplate) -> Value {
        let registers = template
            .registers
            .iter()
            .map(|register| {
                Self::dict(vec![
                    ("name", Value::String(register.name.clone())),
                    ("start", Value::Int(register.start as i64)),
                    ("len", Value::Int(register.len as i64)),
                ])
            })
            .collect();
        let circuit_info =
            CircuitInfo::from_engine_log(&template.name, template.n_qubits, template.gates.clone());
        let qasm3 = export_circuit(&circuit_info, ExportFormat::Qasm3);

        Self::dict(vec![
            ("name", Value::String(template.name.clone())),
            ("family", Value::String(template.family.clone())),
            ("n_qubits", Value::Int(template.n_qubits as i64)),
            ("gate_count", Value::Int(template.gate_count() as i64)),
            (
                "two_qubit_gate_count",
                Value::Int(template.two_qubit_gate_count() as i64),
            ),
            ("executable_native", Value::Bool(template.executable_native)),
            ("registers", Value::List(registers)),
            (
                "measurements",
                Value::List(
                    template
                        .measurements
                        .iter()
                        .map(|q| Value::Int(*q as i64))
                        .collect(),
                ),
            ),
            ("parameters", Self::string_list(template.parameters.clone())),
            ("notes", Self::string_list(template.notes.clone())),
            (
                "gates",
                Value::List(template.gates.iter().map(Self::gate_to_value).collect()),
            ),
            ("qasm3", Value::String(qasm3)),
        ])
    }

    fn build_circuit_template(
        &self,
        name: &str,
        args: &[Value],
    ) -> Result<CircuitTemplate, InterpError> {
        let key = name
            .trim()
            .to_ascii_lowercase()
            .replace(' ', "_")
            .replace('-', "_");
        let active_n = self.engine.as_ref().map(QuantumEngine::n_qubits);
        let default_n = active_n.unwrap_or(3).max(1);

        match key.as_str() {
            "bell" | "bell_circuit" | "bell_state" | "bell_state_circuit" => {
                Ok(bell_state_circuit())
            }
            "ghz" | "ghz_circuit" | "ghz_state" | "ghz_state_circuit" => Ok(ghz_state_circuit(
                Self::usize_arg(args, 0, default_n.max(3))?,
            )),
            "qft"
            | "qft_circuit"
            | "quantum_fourier_transform"
            | "quantum_fourier_transform_circuit" => {
                Ok(qft_circuit(Self::usize_arg(args, 0, default_n)?))
            }
            "qpe"
            | "qpe_circuit"
            | "quantum_phase_estimation"
            | "quantum_phase_estimation_circuit" => Ok(qpe_circuit(
                Self::usize_arg(args, 0, default_n)?,
                Self::f64_arg(args, 1, std::f64::consts::FRAC_PI_4)?,
            )),
            "amplitude_amplification" | "amplitude_amplification_circuit" => {
                let n = Self::usize_arg(args, 0, default_n)?;
                Ok(amplitude_amplification_circuit(
                    n,
                    Self::u64_arg(args, 1, 1)?,
                    Self::usize_arg(args, 2, 1)?,
                ))
            }
            "grover" | "grover_circuit" | "grover_search" | "grover_search_circuit" => {
                let n = Self::usize_arg(args, 0, default_n)?;
                Ok(grover_circuit(
                    n,
                    Self::u64_arg(args, 1, 1)?,
                    Self::usize_arg(args, 2, 1)?,
                ))
            }
            "vqe" | "vqe_circuit" | "vqe_ansatz" | "vqe_ansatz_circuit" => Ok(vqe_ansatz_circuit(
                Self::usize_arg(args, 0, default_n.max(4))?,
                Self::usize_arg(args, 1, 2)?,
            )),
            "qaoa" | "qaoa_circuit" | "qaoa_maxcut" | "qaoa_maxcut_circuit" => {
                let n = Self::usize_arg(args, 0, default_n.max(4))?;
                let edges = Self::edge_list_arg(args.get(1), n)?;
                Ok(qaoa_circuit(n, &edges, Self::usize_arg(args, 2, 1)?))
            }
            "bernstein_vazirani" | "bernstein_vazirani_circuit" | "bv" | "bv_circuit" => Ok(
                bernstein_vazirani_circuit(&Self::bit_secret_arg(args.get(0))?),
            ),
            "deutsch_jozsa" | "deutsch_jozsa_circuit" => Ok(deutsch_jozsa_circuit(
                Self::usize_arg(args, 0, default_n)?,
                &Self::string_arg(args, 1, "balanced")?,
            )),
            "teleportation"
            | "teleportation_circuit"
            | "quantum_teleportation"
            | "quantum_teleportation_circuit" => Ok(teleportation_circuit()),
            "superdense" | "superdense_coding" | "superdense_coding_circuit" => Ok(
                superdense_coding_circuit(Self::bit_arg(args, 0, 0)?, Self::bit_arg(args, 1, 0)?),
            ),
            "qec"
            | "qec_circuit"
            | "quantum_error_correction"
            | "quantum_error_correction_circuit" => Ok(qec_circuit(
                &Self::string_arg(args, 0, "bit_flip")?,
                Self::usize_arg(args, 1, 3)?,
            )),
            "bit_flip_code" | "bit_flip_code_circuit" => Ok(bit_flip_code_circuit()),
            "phase_flip_code" | "phase_flip_code_circuit" => Ok(phase_flip_code_circuit()),
            "surface_code" | "surface_code_circuit" => Ok(surface_code_circuit(
                Self::usize_arg(args, 0, 3)?,
                Self::usize_arg(args, 1, 1)?,
            )),
            "steane_code" | "steane_code_circuit" => Ok(steane_code_circuit()),
            "shor_code" | "shor_code_circuit" | "shor_9qubit_code" | "shor_9qubit_code_circuit" => {
                Ok(shor_9qubit_code_circuit())
            }
            "shor_factoring" | "shor_factoring_circuit" | "shor" | "shor_circuit" => {
                Ok(shor_factoring_circuit(Self::u64_arg(args, 0, 15)?))
            }
            "hhl" | "hhl_circuit" | "harrow_hassidim_lloyd" | "harrow_hassidim_lloyd_circuit" => {
                Ok(hhl_circuit())
            }
            "swap_test" | "swap_test_circuit" => {
                Ok(swap_test_circuit(Self::usize_arg(args, 0, 1)?))
            }
            "hardware_efficient_ansatz" | "hardware_efficient_ansatz_circuit" => {
                Ok(hardware_efficient_ansatz_circuit(
                    Self::usize_arg(args, 0, default_n.max(4))?,
                    Self::usize_arg(args, 1, 2)?,
                ))
            }
            "vqc"
            | "vqc_circuit"
            | "variational_quantum_classifier"
            | "variational_quantum_classifier_circuit" => Ok(vqc_circuit(
                Self::usize_arg(args, 0, default_n.max(2))?,
                Self::usize_arg(args, 1, 2)?,
            )),
            "qnn" | "qnn_circuit" | "quantum_neural_network" | "quantum_neural_network_circuit" => {
                Ok(qnn_circuit(
                    Self::usize_arg(args, 0, default_n.max(2))?,
                    Self::usize_arg(args, 1, 2)?,
                ))
            }
            "data_reuploading" | "data_reuploading_circuit" => Ok(data_reuploading_circuit(
                Self::usize_arg(args, 0, default_n.max(2))?,
                Self::usize_arg(args, 1, 2)?,
            )),
            "quantum_kernel"
            | "quantum_kernel_circuit"
            | "quantum_kernel_estimation"
            | "quantum_kernel_estimation_circuit" => Ok(quantum_kernel_estimation_circuit(
                Self::usize_arg(args, 0, default_n.max(2))?,
            )),
            "quantum_walk" | "quantum_walk_circuit" => Ok(quantum_walk_circuit(
                &Self::string_arg(args, 0, "dtqw")?,
                Self::usize_arg(args, 1, 4)?,
                Self::usize_arg(args, 2, 2)?,
            )),
            "dtqw"
            | "dtqw_circuit"
            | "discrete_time_quantum_walk"
            | "discrete_time_quantum_walk_circuit" => Ok(dtqw_circuit(
                Self::usize_arg(args, 0, 4)?,
                Self::usize_arg(args, 1, 2)?,
            )),
            "ctqw"
            | "ctqw_circuit"
            | "continuous_time_quantum_walk"
            | "continuous_time_quantum_walk_circuit" => Ok(ctqw_circuit(
                Self::usize_arg(args, 0, 4)?,
                Self::usize_arg(args, 1, 2)?,
            )),
            "szegedy_walk" | "szegedy_walk_circuit" => Ok(szegedy_walk_circuit(
                Self::usize_arg(args, 0, 4)?,
                Self::usize_arg(args, 1, 2)?,
            )),
            "element_distinctness" | "element_distinctness_circuit" => {
                Ok(element_distinctness_circuit(Self::usize_arg(args, 0, 4)?))
            }
            "triangle_finding" | "triangle_finding_circuit" => {
                Ok(triangle_finding_circuit(Self::usize_arg(args, 0, 4)?))
            }
            "quantum_counting" | "quantum_counting_circuit" => Ok(quantum_counting_circuit(
                Self::usize_arg(args, 0, 3)?,
                Self::usize_arg(args, 1, 3)?,
            )),
            "block_encoding" | "block_encoding_circuit" => {
                Ok(block_encoding_circuit(Self::usize_arg(args, 0, 2)?))
            }
            "qsp"
            | "qsp_circuit"
            | "quantum_signal_processing"
            | "quantum_signal_processing_circuit" => {
                let phases = Self::phase_list_arg(args.get(1))?;
                Ok(qsp_circuit(Self::usize_arg(args, 0, 2)?, &phases))
            }
            "qsvt"
            | "qsvt_circuit"
            | "quantum_singular_value_transformation"
            | "quantum_singular_value_transformation_circuit" => {
                let phases = Self::phase_list_arg(args.get(1))?;
                Ok(qsvt_circuit(Self::usize_arg(args, 0, 2)?, &phases))
            }
            "boson_sampling" | "boson_sampling_circuit" => Ok(boson_sampling_circuit(
                Self::usize_arg(args, 0, 4)?,
                Self::usize_arg(args, 1, 2)?,
            )),
            "braiding"
            | "braiding_circuit"
            | "topological_braiding"
            | "topological_braiding_circuit" => Ok(braiding_circuit(
                Self::usize_arg(args, 0, 4)?,
                Self::usize_arg(args, 1, 3)?,
            )),
            "mbqc"
            | "mbqc_circuit"
            | "measurement_based"
            | "measurement_based_circuit"
            | "cluster_state"
            | "cluster_state_circuit" => Ok(mbqc_cluster_circuit(
                Self::usize_arg(args, 0, 2)?,
                Self::usize_arg(args, 1, 3)?,
            )),
            _ => Err(InterpError::type_error(&format!(
                "Unknown circuit template '{}'",
                name
            ))),
        }
    }

    fn usize_arg(args: &[Value], index: usize, default: usize) -> Result<usize, InterpError> {
        let Some(value) = args.get(index) else {
            return Ok(default);
        };
        let raw = value.as_int()?;
        if raw < 0 {
            Err(InterpError::type_error(
                "circuit integer arguments must be non-negative",
            ))
        } else {
            Ok(raw as usize)
        }
    }

    fn u64_arg(args: &[Value], index: usize, default: u64) -> Result<u64, InterpError> {
        let Some(value) = args.get(index) else {
            return Ok(default);
        };
        let raw = value.as_int()?;
        if raw < 0 {
            Err(InterpError::type_error(
                "circuit integer arguments must be non-negative",
            ))
        } else {
            Ok(raw as u64)
        }
    }

    fn f64_arg(args: &[Value], index: usize, default: f64) -> Result<f64, InterpError> {
        args.get(index)
            .map(Value::as_float)
            .transpose()
            .map(|value| value.unwrap_or(default))
    }

    fn string_arg(args: &[Value], index: usize, default: &str) -> Result<String, InterpError> {
        Ok(args
            .get(index)
            .map(Value::as_string)
            .unwrap_or_else(|| default.to_string()))
    }

    fn bit_arg(args: &[Value], index: usize, default: u8) -> Result<u8, InterpError> {
        let raw = args
            .get(index)
            .map(Value::as_int)
            .transpose()?
            .unwrap_or(default as i64);
        match raw {
            0 | 1 => Ok(raw as u8),
            _ => Err(InterpError::type_error("bit arguments must be 0 or 1")),
        }
    }

    fn bit_secret_arg(value: Option<&Value>) -> Result<Vec<u8>, InterpError> {
        match value {
            Some(Value::List(_)) => Self::u8_list_from_value(value.unwrap()),
            Some(Value::String(bits)) => {
                let parsed = bits
                    .chars()
                    .map(|ch| match ch {
                        '0' => Ok(0),
                        '1' => Ok(1),
                        _ => Err(InterpError::type_error(
                            "Bernstein-Vazirani secret strings may only contain 0 or 1",
                        )),
                    })
                    .collect::<Result<Vec<_>, _>>()?;
                if parsed.is_empty() {
                    Err(InterpError::type_error(
                        "Bernstein-Vazirani secret cannot be empty",
                    ))
                } else {
                    Ok(parsed)
                }
            }
            Some(Value::Int(width)) if *width > 0 => Ok((0..*width)
                .map(|i| if i % 2 == 0 { 1 } else { 0 })
                .collect()),
            Some(_) => Err(InterpError::type_error(
                "Bernstein-Vazirani secret must be a bit list, bit string, or positive width",
            )),
            None => Ok(vec![1, 0, 1]),
        }
    }

    fn edge_list_arg(
        value: Option<&Value>,
        n_qubits: usize,
    ) -> Result<Vec<(usize, usize)>, InterpError> {
        let default_edges = || {
            if n_qubits > 1 {
                (0..(n_qubits - 1)).map(|q| (q, q + 1)).collect()
            } else {
                Vec::new()
            }
        };

        let Some(value) = value else {
            return Ok(default_edges());
        };

        match value {
            Value::List(items) if items.is_empty() => Ok(default_edges()),
            Value::List(items) => items.iter().map(Self::edge_pair_from_value).collect(),
            _ => Err(InterpError::type_error(
                "QAOA edges must be a list of [u, v] pairs",
            )),
        }
    }

    fn edge_pair_from_value(value: &Value) -> Result<(usize, usize), InterpError> {
        let items = match value {
            Value::List(items) | Value::Tuple(items) => items,
            _ => {
                return Err(InterpError::type_error(
                    "QAOA edge entries must be [u, v] pairs",
                ))
            }
        };
        if items.len() != 2 {
            return Err(InterpError::type_error(
                "QAOA edge entries must contain exactly two vertices",
            ));
        }
        let a = items[0].as_int()?;
        let b = items[1].as_int()?;
        if a < 0 || b < 0 {
            Err(InterpError::type_error(
                "QAOA edge vertices must be non-negative",
            ))
        } else {
            Ok((a as usize, b as usize))
        }
    }

    fn phase_list_arg(value: Option<&Value>) -> Result<Vec<f64>, InterpError> {
        match value {
            Some(value) => Self::float_list_from_value(value, "phase list"),
            None => Ok(vec![
                0.0,
                std::f64::consts::FRAC_PI_4,
                std::f64::consts::FRAC_PI_2,
            ]),
        }
    }

    fn eval_method_call(
        &mut self,
        obj: &Value,
        method: &str,
        args: &[CallArg],
    ) -> Result<Value, InterpError> {
        let arg_vals: Result<Vec<Value>, _> =
            args.iter().map(|a| self.eval_expr(&a.value)).collect();
        let arg_vals = arg_vals?;

        match (obj, method) {
            (Value::String(s), "len") => Ok(Value::Int(s.len() as i64)),
            (Value::String(s), "upper") => Ok(Value::String(s.to_uppercase())),
            (Value::String(s), "lower") => Ok(Value::String(s.to_lowercase())),
            (Value::String(s), "contains") => {
                let sub = arg_vals[0].as_string();
                Ok(Value::Bool(s.contains(&sub)))
            }
            (Value::String(s), "replace") => {
                let from = arg_vals[0].as_string();
                let to = arg_vals[1].as_string();
                Ok(Value::String(s.replace(&from, &to)))
            }
            (Value::String(s), "split") => {
                let sep = arg_vals[0].as_string();
                Ok(Value::List(
                    s.split(&sep)
                        .map(|p| Value::String(p.to_string()))
                        .collect(),
                ))
            }
            (Value::List(items), "append") => {
                let mut new_items = items.clone();
                new_items.push(arg_vals[0].clone());
                Ok(Value::List(new_items))
            }
            (Value::List(items), "pop") => {
                let mut new_items = items.clone();
                let val = new_items.pop().unwrap_or(Value::None);
                Ok(val)
            }
            _ => {
                eprintln!(
                    "Warning: Unknown method '{}.{}' — returning None",
                    obj, method
                );
                Ok(Value::None)
            }
        }
    }

    fn call_function(&mut self, func: &Value, args: &[Value]) -> Result<Value, InterpError> {
        match func {
            Value::Function { params, body, .. } => {
                let mut child_env = Env::child(&self.env);
                for (i, param) in params.iter().enumerate() {
                    let val = args
                        .get(i)
                        .cloned()
                        .or_else(|| param.default.as_ref().and_then(|d| self.eval_expr(d).ok()))
                        .unwrap_or(Value::None);
                    child_env.set(param.name.clone(), val);
                }
                let saved_env = std::mem::replace(&mut self.env, child_env);
                let result = self.exec_block(body);
                self.env = saved_env;
                match result? {
                    ControlFlow::Return(val) => Ok(val),
                    _ => Ok(Value::None),
                }
            }
            _ => Err(InterpError::type_error("Not callable")),
        }
    }

    fn extract_qubit(&self, val: &Value) -> Result<usize, InterpError> {
        match val {
            Value::Int(i) => Ok(*i as usize),
            _ => Err(InterpError::type_error("Expected qubit index")),
        }
    }

    // ─── Binary Operations ────────────────────────────────────────

    fn eval_fstring(&mut self, template: &str) -> Result<String, InterpError> {
        let chars: Vec<char> = template.chars().collect();
        let mut result = String::new();
        let mut i = 0;

        while i < chars.len() {
            match chars[i] {
                '{' if chars.get(i + 1) == Some(&'{') => {
                    result.push('{');
                    i += 2;
                }
                '}' if chars.get(i + 1) == Some(&'}') => {
                    result.push('}');
                    i += 2;
                }
                '{' => {
                    let start = i + 1;
                    let mut end = start;
                    while end < chars.len() && chars[end] != '}' {
                        end += 1;
                    }
                    if end == chars.len() {
                        return Err(InterpError::runtime_error(
                            "Unterminated f-string expression",
                        ));
                    }

                    let inner: String = chars[start..end].iter().collect();
                    let (expr_src, fmt_spec) = Self::split_fstring_field(&inner);
                    let expr_src = expr_src.trim();
                    if expr_src.is_empty() {
                        return Err(InterpError::runtime_error("Empty f-string expression"));
                    }

                    let value = self.eval_inline_expr(expr_src)?;
                    result.push_str(&Self::format_value(&value, fmt_spec));
                    i = end + 1;
                }
                '}' => return Err(InterpError::runtime_error("Unmatched '}' in f-string")),
                ch => {
                    result.push(ch);
                    i += 1;
                }
            }
        }

        Ok(result)
    }

    fn split_fstring_field(field: &str) -> (&str, Option<&str>) {
        let mut depth = 0usize;
        let mut quote = None;
        let mut escaped = false;

        for (idx, ch) in field.char_indices() {
            if let Some(q) = quote {
                if escaped {
                    escaped = false;
                } else if ch == '\\' {
                    escaped = true;
                } else if ch == q {
                    quote = None;
                }
                continue;
            }

            match ch {
                '"' | '\'' => quote = Some(ch),
                '(' | '[' | '{' => depth += 1,
                ')' | ']' | '}' => depth = depth.saturating_sub(1),
                ':' if depth == 0 => return (&field[..idx], Some(field[idx + 1..].trim())),
                _ => {}
            }
        }

        (field, None)
    }

    fn eval_inline_expr(&mut self, source: &str) -> Result<Value, InterpError> {
        let mut lexer = Lexer::new(source);
        let tokens = lexer.tokenize().map_err(|e| {
            InterpError::runtime_error(&format!("Invalid f-string expression '{}': {}", source, e))
        })?;
        let mut parser = Parser::new(tokens);
        let expr = parser.parse_expression().map_err(|e| {
            InterpError::runtime_error(&format!("Invalid f-string expression '{}': {}", source, e))
        })?;
        self.eval_expr(&expr)
    }

    fn format_value(value: &Value, fmt_spec: Option<&str>) -> String {
        let Some(spec) = fmt_spec.map(str::trim).filter(|s| !s.is_empty()) else {
            return value.as_string();
        };

        let number = match value {
            Value::Float(v) => Some(*v),
            Value::Int(v) => Some(*v as f64),
            _ => None,
        };

        if let Some(number) = number {
            let spec = spec.strip_suffix('f').unwrap_or(spec);
            if let Some(precision) = spec.strip_prefix('.').and_then(|s| s.parse::<usize>().ok()) {
                return format!("{number:.precision$}");
            }
        }

        value.as_string()
    }

    fn checked_shift_count(count: i64) -> Result<u32, InterpError> {
        if count < 0 {
            Err(InterpError::type_error("Shift count cannot be negative"))
        } else {
            u32::try_from(count).map_err(|_| InterpError::type_error("Shift count too large"))
        }
    }

    fn binary_op(&self, op: BinOp, left: &Value, right: &Value) -> Result<Value, InterpError> {
        match (left, right) {
            (Value::Int(a), Value::Int(b)) => match op {
                BinOp::Add => Ok(Value::Int(a + b)),
                BinOp::Sub => Ok(Value::Int(a - b)),
                BinOp::Mul => Ok(Value::Int(a * b)),
                BinOp::Div => Ok(Value::Float(*a as f64 / *b as f64)),
                BinOp::IntDiv => Ok(Value::Int(a / b)),
                BinOp::Mod => Ok(Value::Int(a % b)),
                BinOp::Pow => Ok(Value::Int(a.pow(*b as u32))),
                BinOp::BitAnd => Ok(Value::Int(a & b)),
                BinOp::BitOr => Ok(Value::Int(a | b)),
                BinOp::BitXor => Ok(Value::Int(a ^ b)),
                BinOp::ShiftLeft => {
                    let shift = Self::checked_shift_count(*b)?;
                    a.checked_shl(shift)
                        .map(Value::Int)
                        .ok_or_else(|| InterpError::type_error("Shift count too large"))
                }
                BinOp::ShiftRight => {
                    let shift = Self::checked_shift_count(*b)?;
                    a.checked_shr(shift)
                        .map(Value::Int)
                        .ok_or_else(|| InterpError::type_error("Shift count too large"))
                }
                BinOp::Eq => Ok(Value::Bool(a == b)),
                BinOp::NotEq => Ok(Value::Bool(a != b)),
                BinOp::Lt => Ok(Value::Bool(a < b)),
                BinOp::Gt => Ok(Value::Bool(a > b)),
                BinOp::LtEq => Ok(Value::Bool(a <= b)),
                BinOp::GtEq => Ok(Value::Bool(a >= b)),
                _ => Err(InterpError::type_error("Unsupported operation")),
            },
            (Value::Float(_), Value::Float(_))
            | (Value::Float(_), Value::Int(_))
            | (Value::Int(_), Value::Float(_)) => {
                let a = left.as_float()?;
                let b = right.as_float()?;
                match op {
                    BinOp::Add => Ok(Value::Float(a + b)),
                    BinOp::Sub => Ok(Value::Float(a - b)),
                    BinOp::Mul => Ok(Value::Float(a * b)),
                    BinOp::Div => Ok(Value::Float(a / b)),
                    BinOp::Pow => Ok(Value::Float(a.powf(b))),
                    BinOp::Eq => Ok(Value::Bool((a - b).abs() < 1e-15)),
                    BinOp::NotEq => Ok(Value::Bool((a - b).abs() >= 1e-15)),
                    BinOp::Lt => Ok(Value::Bool(a < b)),
                    BinOp::Gt => Ok(Value::Bool(a > b)),
                    BinOp::LtEq => Ok(Value::Bool(a <= b)),
                    BinOp::GtEq => Ok(Value::Bool(a >= b)),
                    _ => Err(InterpError::type_error("Unsupported float operation")),
                }
            }
            (Value::String(a), Value::String(b)) => match op {
                BinOp::Add => Ok(Value::String(format!("{}{}", a, b))),
                BinOp::Eq => Ok(Value::Bool(a == b)),
                BinOp::NotEq => Ok(Value::Bool(a != b)),
                _ => Err(InterpError::type_error("Unsupported string operation")),
            },
            (Value::Bool(a), Value::Bool(b)) => match op {
                BinOp::And => Ok(Value::Bool(*a && *b)),
                BinOp::Or => Ok(Value::Bool(*a || *b)),
                BinOp::Eq => Ok(Value::Bool(a == b)),
                BinOp::NotEq => Ok(Value::Bool(a != b)),
                _ => Err(InterpError::type_error("Unsupported bool operation")),
            },
            _ => Err(InterpError::type_error(&format!(
                "Cannot apply {:?} to {:?} and {:?}",
                op, left, right
            ))),
        }
    }
}

/// Interpreter errors.
#[derive(Debug)]
pub struct InterpError {
    pub kind: ErrorKind,
    pub msg: String,
}

#[derive(Debug)]
pub enum ErrorKind {
    TypeError,
    NameError,
    IndexError,
    #[allow(dead_code)]
    ValueError,
    RuntimeError,
}

impl InterpError {
    fn type_error(msg: &str) -> Self {
        InterpError {
            kind: ErrorKind::TypeError,
            msg: msg.into(),
        }
    }
    fn name_error(msg: &str) -> Self {
        InterpError {
            kind: ErrorKind::NameError,
            msg: msg.into(),
        }
    }
    fn index_error(msg: &str) -> Self {
        InterpError {
            kind: ErrorKind::IndexError,
            msg: msg.into(),
        }
    }
    fn runtime_error(msg: &str) -> Self {
        InterpError {
            kind: ErrorKind::RuntimeError,
            msg: msg.into(),
        }
    }
}

impl fmt::Display for InterpError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:?}: {}", self.kind, self.msg)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(source: &str) -> Interpreter {
        let mut lexer = Lexer::new(source);
        let tokens = lexer.tokenize().unwrap();
        let mut parser = Parser::new(tokens);
        let program = parser.parse_program().unwrap();
        let mut interpreter = Interpreter::new();
        interpreter.run(&program).unwrap();
        interpreter
    }

    #[test]
    fn test_bitwise_shift_runtime() {
        let interpreter = run("let target = 13\nlet i = 2\nprint((target >> i) & 1)");
        assert_eq!(interpreter.get_output(), &["1"]);
    }

    #[test]
    fn test_fstring_expressions_and_float_formatting() {
        let interpreter =
            run("let energy = -0.87758256189\nprint(f\"Energy: {energy:.6f}; nnz={1 + 2}\")");
        assert_eq!(interpreter.get_output(), &["Energy: -0.877583; nnz=3"]);
    }

    #[test]
    fn test_backend_plan_builtin_for_120_qubits() {
        let interpreter = run(
            "let p = backend_plan(120)\nprint(p[\"runtime_engine\"])\nprint(len(p[\"warnings\"]) > 0)",
        );
        assert_eq!(interpreter.get_output(), &["Chunked", "true"]);
    }

    #[test]
    fn test_qasm3_import_builtin() {
        let interpreter = run(
            "let qasm = \"OPENQASM 3.0;\\nqubit[2] q;\\nbit[2] c;\\nh q[0];\\ncx q[0], q[1];\\nc[0] = measure q[0];\"\nlet imported = qasm3_import(qasm)\nprint(imported[\"n_qubits\"])\nprint(imported[\"n_gates\"])\nprint(imported[\"n_measurements\"])",
        );
        assert_eq!(interpreter.get_output(), &["2", "2", "1"]);
    }

    #[test]
    fn test_stim_export_builtin() {
        let interpreter = run(
            "simulate {\nlet q = quantum_register(2)\nH(q[0])\nCNOT(q[0], q[1])\nlet s = stim_export()\nprint(len(s[\"unsupported_gates\"]))\n}",
        );
        assert_eq!(interpreter.get_output(), &["0"]);
    }

    #[test]
    fn test_dsl_function_wrappers_for_backend_tools() {
        let interpreter = run(
            "fn choose_backend(n) {\nreturn plan_backend(n)\n}\nfn plan_ray_backend(n) {\nreturn ray_plan(n)\n}\nfn load_qasm3(src) {\nreturn import_qasm3(src)\n}\nlet p = choose_backend(120)\nlet r = plan_ray_backend(120)\nlet q = load_qasm3(\"OPENQASM 3.0;\\nqubit[1] q;\\nh q[0];\")\nprint(p[\"runtime_engine\"])\nprint(r[\"runtime\"])\nprint(q[\"n_gates\"])",
        );
        assert_eq!(interpreter.get_output(), &["Chunked", "Ray", "1"]);
    }

    #[test]
    fn test_quantum_application_assessment_builtin() {
        let interpreter = run(
            "let a = assess_quantum_problem(\"chemistry hamiltonian\", 120)\nlet r = production_readiness(120)\nprint(a[\"kind\"])\nprint(a[\"can_run_100q_locally\"])\nprint(r[\"arbitrary_dense_local_possible\"])",
        );
        assert_eq!(interpreter.get_output(), &["Chemistry", "false", "false"]);
    }

    #[test]
    fn test_sparse_120_qubit_plan_and_execution() {
        let interpreter = run(
            "let p = sparse_backend_plan(120, 2)\nprint(p[\"runtime_engine\"])\nsimulate(engine=\"sparse\") {\nlet q = quantum_register(120)\nH(q[0])\nCNOT(q[0], q[119])\nprint(engine_nnz())\nprint(explain_engine())\n}",
        );
        assert_eq!(interpreter.get_output()[0], "Sparse");
        assert_eq!(interpreter.get_output()[1], "2");
        assert!(interpreter.get_output()[2].contains("SparseStateVector"));
    }

    #[test]
    fn test_professional_workflow_builtins() {
        let interpreter = run(
            "let caps = market_standard_review()\nlet wf = quantum_workflow(\"rsa cryptanalysis\", 2048)\nlet ft = ft_resource_estimate(100, 1000000, 0.001)\nlet sc = surface_code_plan(10, 9, 9, 0.001)\nlet mit = error_mitigation_plan(\"high\", 512)\nlet hw = hardware_transpile_plan(\"ibm\", 127)\nlet h = hamiltonian([pauli_term(\"ZZ\", -1.0, [0, 1])])\nlet q = qubo_model(10, 20)\nlet o = oracle_model(\"marked_search\", 20, 1000)\nprint(len(caps) > 0)\nprint(wf[\"kind\"])\nprint(ft[\"code_distance_hint\"] > 0)\nprint(sc[\"distance\"])\nprint(len(mit[\"warnings\"]) > 0)\nprint(hw[\"connectivity\"])\nprint(h[\"term_count\"])\nprint(q[\"n_vars\"])\nprint(o[\"name\"])",
        );
        assert_eq!(
            interpreter.get_output(),
            &[
                "true",
                "Cryptanalysis",
                "true",
                "9",
                "true",
                "heavy-hex / target coupling map",
                "1",
                "10",
                "marked_search",
            ]
        );
    }

    #[test]
    fn test_production_execution_builtins() {
        let interpreter = run(
            "simulate {\nlet q = quantum_register(4)\nH(q[0])\nH(q[0])\nCNOT(q[0], q[3])\nlet tr = native_transpile(\"line\")\nlet st = stabilizer_run()\nlet mps = mps_run(8)\nlet tn = tensor_network_plan()\nlet job = submit_provider_job(\"aws\", \"arn:aws:braket:::device/quantum-simulator/amazon/sv1\", 64, true)\nprint(tr[\"inserted_swaps\"] > 0)\nprint(tr[\"cancelled_gates\"] > 1)\nprint(st[\"valid\"])\nprint(mps[\"n_qubits\"])\nprint(tn[\"executable_locally\"])\nprint(job[\"submitted\"])\nprint(len(job[\"warnings\"]) > 0)\n}\nlet mit = mitigate_readout({\"0\": 90, \"1\": 10}, 0.9, 0.1, 0.1, 0.9)\nlet z = zne([1.0, 3.0], [0.8, 0.6])\nlet dec = qec_decode_repetition([1, 1, 0, 1, 0])\nlet pipe = qec_pipeline(\"repetition\", 5)\nprint(mit[\"probability_dict\"][\"0\"] > 0.9)\nprint(z > 0.89)\nprint(dec[\"logical_bit\"])\nprint(pipe[\"executable_native\"])",
        );
        assert_eq!(
            interpreter.get_output(),
            &["true", "true", "true", "4", "true", "false", "true", "true", "true", "1", "true",]
        );
    }

    #[test]
    fn test_circuit_template_builtins() {
        let interpreter = run(
            "let c = circuit_catalog()\nlet bell = bell_circuit()\nlet ghz = ghz_circuit(5)\nlet qpe = qpe_circuit(3, 0.25)\nlet qaoa = qaoa_circuit(4, [[0, 1], [1, 2]], 2)\nlet bv = bernstein_vazirani_circuit([1, 0, 1])\nlet surf = surface_code_circuit(3, 1)\nlet qsvt = qsvt_circuit(2, [0.0, 0.5])\nlet qnn = qnn_circuit(3, 2)\nprint(len(c) > 20)\nprint(bell[\"gate_count\"])\nprint(ghz[\"n_qubits\"])\nprint(qpe[\"family\"])\nprint(qaoa[\"family\"])\nprint(bv[\"n_qubits\"])\nprint(surf[\"family\"])\nprint(qsvt[\"name\"])\nprint(qnn[\"family\"])",
        );
        assert_eq!(
            interpreter.get_output(),
            &[
                "true",
                "2",
                "5",
                "subroutine",
                "variational",
                "4",
                "fault_tolerant",
                "quantum_singular_value_transformation",
                "machine_learning",
            ]
        );
    }

    #[test]
    fn test_apply_circuit_builtin() {
        let interpreter =
            run("let t = apply_circuit(\"bell\")\nprint(t[\"name\"])\nprint(engine_nnz())");
        assert_eq!(interpreter.get_output(), &["bell_state", "2"]);
    }
}
