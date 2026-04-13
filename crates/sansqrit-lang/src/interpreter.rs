//! Tree-walking interpreter for the Sansqrit DSL.
//!
//! Executes AST nodes directly, managing:
//! - Classical variables and functions
//! - Quantum engine lifecycle (simulate/quantum blocks)
//! - Built-in functions (gates, measurement, math, I/O)
//! - Science package dispatch

use crate::ast::*;
use crate::lexer::Span;
use sansqrit_core::{QuantumEngine, EngineKind, GateKind, GateOp, ExportFormat, CircuitInfo};
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
    Set(Vec<Value>),
    Tuple(Vec<Value>),
    Function { name: String, params: Vec<Param>, body: Vec<Stmt> },
    Lambda { params: Vec<Param>, body: Box<Expr> },
    QuantumRegister { n_qubits: usize },
    MeasurementResult(sansqrit_core::MeasurementResult),
    Object { class: String, fields: HashMap<String, Value> },
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
                let strs: Vec<String> = pairs.iter().map(|(k, v)| format!("{}: {}", k, v)).collect();
                write!(f, "{{{}}}", strs.join(", "))
            }
            Value::Tuple(items) => {
                let strs: Vec<String> = items.iter().map(|v| format!("{}", v)).collect();
                write!(f, "({})", strs.join(", "))
            }
            Value::QuantumRegister { n_qubits } => write!(f, "QuantumRegister({})", n_qubits),
            Value::MeasurementResult(r) => write!(f, "{:?}", r.histogram),
            Value::Object { class, .. } => write!(f, "<{} object>", class),
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
    fn new() -> Self { Env { vars: HashMap::new(), parent: None } }

    fn child(parent: &Env) -> Self {
        Env { vars: HashMap::new(), parent: Some(Box::new(parent.clone())) }
    }

    fn get(&self, name: &str) -> Option<Value> {
        self.vars.get(name).cloned()
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

        Interpreter { env, engine: None, output: Vec::new() }
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

            Stmt::Assign { target, op, value, .. } => {
                let val = self.eval_expr(value)?;
                match target {
                    Expr::Ident(name, _) => {
                        let final_val = match op {
                            AssignOp::Assign => val,
                            AssignOp::AddAssign => self.binary_op(BinOp::Add, &self.env.get(name).unwrap_or(Value::Int(0)), &val)?,
                            AssignOp::SubAssign => self.binary_op(BinOp::Sub, &self.env.get(name).unwrap_or(Value::Int(0)), &val)?,
                            AssignOp::MulAssign => self.binary_op(BinOp::Mul, &self.env.get(name).unwrap_or(Value::Int(1)), &val)?,
                            AssignOp::DivAssign => self.binary_op(BinOp::Div, &self.env.get(name).unwrap_or(Value::Int(1)), &val)?,
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

            Stmt::FnDecl { name, params, body, .. } => {
                self.env.set(name.clone(), Value::Function {
                    name: name.clone(),
                    params: params.clone(),
                    body: body.clone(),
                });
                Ok(ControlFlow::None)
            }

            Stmt::Import { module, alias, .. } => {
                let mod_name = alias.as_ref().unwrap_or(&module[0]).clone();
                self.env.set(mod_name, Value::Object {
                    class: module.join("."),
                    fields: HashMap::new(),
                });
                Ok(ControlFlow::None)
            }

            Stmt::If { condition, then_body, elifs, else_body, .. } => {
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

            Stmt::For { var, iter, body, .. } => {
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

            Stmt::While { condition, body, .. } => {
                loop {
                    if !self.eval_expr(condition)?.as_bool() { break; }
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

            Stmt::Simulate { engine: eng_name, body, .. } => {
                // Create engine — default 0 qubits, will be set by quantum_register()
                let kind = match eng_name.as_deref() {
                    Some("chunked") => EngineKind::Chunked,
                    Some("sparse") => EngineKind::Sparse,
                    Some("dense") => EngineKind::Dense,
                    _ => EngineKind::Auto,
                };
                // Engine will be created when quantum_register is called
                self.env.set("__engine_kind__".into(), Value::String(format!("{:?}", kind)));
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

            Expr::FStringLit(template, _) => {
                // Simple f-string interpolation
                let mut result = template.clone();
                // Replace {var} with values
                let re = regex::Regex::new(r"\{(\w+)(?::([^}]*))?\}").unwrap();
                let env = &self.env;
                result = re.replace_all(&result, |caps: &regex::Captures| {
                    let var_name = &caps[1];
                    let _fmt = caps.get(2).map(|m| m.as_str());
                    match env.get(var_name) {
                        Some(val) => val.as_string(),
                        None => format!("{{{}}}", var_name),
                    }
                }).to_string();
                Ok(Value::String(result))
            }

            Expr::Ident(name, _) => {
                self.env.get(name)
                    .ok_or_else(|| InterpError::name_error(&format!("Undefined: {}", name)))
            }

            Expr::BinOp { left, op, right, .. } => {
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

            Expr::Call { callee, args, .. } => {
                self.eval_call(callee, args)
            }

            Expr::MethodCall { object, method, args, .. } => {
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
                        items.get(i).cloned().ok_or_else(|| InterpError::index_error("Index out of bounds"))
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

            Expr::ListComp { expr: body, var, iter, filter, .. } => {
                let iter_val = self.eval_expr(iter)?;
                let items = match iter_val {
                    Value::List(items) => items,
                    _ => return Err(InterpError::type_error("List comprehension requires iterable")),
                };
                let mut result = Vec::new();
                for item in items {
                    self.env.set(var.clone(), item);
                    if let Some(f) = filter {
                        if !self.eval_expr(f)?.as_bool() { continue; }
                    }
                    result.push(self.eval_expr(body)?);
                }
                Ok(Value::List(result))
            }

            Expr::Pipeline { left, right, .. } => {
                let arg = self.eval_expr(left)?;
                // right should be a function — call it with arg
                match right.as_ref() {
                    Expr::Ident(name, span) => {
                        let call_args = vec![CallArg { name: None, value: Expr::IntLit(0, *span) }];
                        // Store arg temporarily
                        let saved = self.env.get("__pipe_arg__");
                        self.env.set("__pipe_arg__".into(), arg.clone());
                        let func = self.env.get(name)
                            .ok_or_else(|| InterpError::name_error(&format!("Undefined: {}", name)))?;
                        self.env.set("__pipe_arg__".into(), saved.unwrap_or(Value::None));
                        // Call function with arg
                        self.call_function(&func, &[arg])
                    }
                    _ => Err(InterpError::type_error("Pipeline target must be a function")),
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
                let arg_vals: Result<Vec<Value>, _> = args.iter().map(|a| self.eval_expr(&a.value)).collect();
                return self.call_function(&func, &arg_vals?);
            }
        };

        let arg_vals: Result<Vec<Value>, _> = args.iter().map(|a| self.eval_expr(&a.value)).collect();
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
                let kind = self.env.get("__engine_kind__")
                    .and_then(|v| match v { Value::String(s) => Some(s), _ => None })
                    .unwrap_or_else(|| "Auto".into());
                let engine_kind = match kind.as_str() {
                    "Chunked" => EngineKind::Chunked,
                    "Sparse" => EngineKind::Sparse,
                    "Dense" => EngineKind::Dense,
                    _ => EngineKind::Auto,
                };
                self.engine = Some(QuantumEngine::with_engine(n, engine_kind));
                self.env.set("q".into(), Value::QuantumRegister { n_qubits: n });
                Ok(Value::QuantumRegister { n_qubits: n })
            }

            // ── Quantum Gates ──
            "H" | "X" | "Y" | "Z" | "S" | "Sdg" | "T" | "Tdg" | "SX" | "I" => {
                let qubit = self.extract_qubit(&arg_vals[0])?;
                let gate = match func_name.as_str() {
                    "H" => GateKind::H, "X" => GateKind::X, "Y" => GateKind::Y,
                    "Z" => GateKind::Z, "S" => GateKind::S, "Sdg" => GateKind::Sdg,
                    "T" => GateKind::T, "Tdg" => GateKind::Tdg, "SX" => GateKind::SX,
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
                    "Rx" => GateKind::Rx, "Ry" => GateKind::Ry,
                    "Rz" => GateKind::Rz, "Phase" => GateKind::Phase,
                    _ => unreachable!(),
                };
                if let Some(eng) = &mut self.engine {
                    eng.apply(GateOp::single_param(gate, qubit, theta));
                }
                Ok(Value::None)
            }

            "U3" => {
                let q = self.extract_qubit(&arg_vals[0])?;
                let (t, p, l) = (arg_vals[1].as_float()?, arg_vals[2].as_float()?, arg_vals[3].as_float()?);
                if let Some(eng) = &mut self.engine { eng.u3(q, t, p, l); }
                Ok(Value::None)
            }

            "CNOT" | "CZ" | "CY" | "SWAP" | "iSWAP" => {
                let q0 = self.extract_qubit(&arg_vals[0])?;
                let q1 = self.extract_qubit(&arg_vals[1])?;
                let gate = match func_name.as_str() {
                    "CNOT" => GateKind::CNOT, "CZ" => GateKind::CZ, "CY" => GateKind::CY,
                    "SWAP" => GateKind::SWAP, "iSWAP" => GateKind::ISWAP,
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
                    "CRz" => GateKind::CRz, "CP" => GateKind::CP, "RZZ" => GateKind::RZZ,
                    _ => unreachable!(),
                };
                if let Some(eng) = &mut self.engine {
                    eng.apply(GateOp::two_param(gate, q0, q1, theta));
                }
                Ok(Value::None)
            }

            "Toffoli" | "CCX" => {
                let (q0, q1, q2) = (self.extract_qubit(&arg_vals[0])?, self.extract_qubit(&arg_vals[1])?, self.extract_qubit(&arg_vals[2])?);
                if let Some(eng) = &mut self.engine { eng.toffoli(q0, q1, q2); }
                Ok(Value::None)
            }

            "Fredkin" | "CSWAP" => {
                let (q0, q1, q2) = (self.extract_qubit(&arg_vals[0])?, self.extract_qubit(&arg_vals[1])?, self.extract_qubit(&arg_vals[2])?);
                if let Some(eng) = &mut self.engine { eng.fredkin(q0, q1, q2); }
                Ok(Value::None)
            }

            "H_all" | "Rx_all" | "Ry_all" => {
                if let Some(eng) = &mut self.engine {
                    match func_name.as_str() {
                        "H_all" => eng.h_all(),
                        "Rx_all" => { let t = arg_vals.get(1).and_then(|v| v.as_float().ok()).unwrap_or(0.0); eng.rx_all(t); }
                        "Ry_all" => { let t = arg_vals.get(1).and_then(|v| v.as_float().ok()).unwrap_or(0.0); eng.ry_all(t); }
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
                } else { Ok(Value::Int(0)) }
            }

            "measure_all" => {
                let shots = args.iter()
                    .find(|a| a.name.as_deref() == Some("shots"))
                    .and_then(|a| if let Expr::IntLit(v, _) = &a.value { Some(*v as usize) } else { None })
                    .unwrap_or(1);

                if shots > 1 {
                    if let Some(eng) = &self.engine {
                        Ok(Value::MeasurementResult(eng.measure_all(shots)))
                    } else { Ok(Value::None) }
                } else {
                    if let Some(eng) = &mut self.engine {
                        let bits = eng.measure_all_once();
                        Ok(Value::List(bits.into_iter().map(|b| Value::Int(b as i64)).collect()))
                    } else { Ok(Value::None) }
                }
            }

            // ── State queries ──
            "probabilities" => {
                if let Some(eng) = &self.engine {
                    let probs = eng.probabilities();
                    Ok(Value::List(probs.into_iter().map(|(bs, p)| {
                        Value::Tuple(vec![Value::String(bs), Value::Float(p)])
                    }).collect()))
                } else { Ok(Value::List(vec![])) }
            }

            "expectation_z" => {
                let q = self.extract_qubit(&arg_vals[0])?;
                if let Some(eng) = &self.engine {
                    Ok(Value::Float(eng.expectation_z(q)))
                } else { Ok(Value::Float(0.0)) }
            }

            "expectation_zz" => {
                let q0 = self.extract_qubit(&arg_vals[0])?;
                let q1 = self.extract_qubit(&arg_vals[1])?;
                if let Some(eng) = &self.engine {
                    Ok(Value::Float(eng.expectation_zz(q0, q1)))
                } else { Ok(Value::Float(0.0)) }
            }

            "engine_nnz" => {
                if let Some(eng) = &self.engine {
                    Ok(Value::Int(eng.nnz() as i64))
                } else { Ok(Value::Int(0)) }
            }

            // ── Built-in circuits ──
            "qft" => {
                if let Some(eng) = &mut self.engine { eng.qft(); }
                Ok(Value::None)
            }

            "bell_state" => {
                self.engine = Some(QuantumEngine::new(2));
                if let Some(eng) = &mut self.engine { eng.bell(); }
                Ok(Value::QuantumRegister { n_qubits: 2 })
            }

            "ghz_state" => {
                let n = args.iter()
                    .find(|a| a.name.as_deref() == Some("n_qubits"))
                    .and_then(|a| if let Expr::IntLit(v, _) = &a.value { Some(*v as usize) } else { None })
                    .unwrap_or(arg_vals.get(0).and_then(|v| v.as_int().ok()).unwrap_or(2) as usize);
                self.engine = Some(QuantumEngine::new(n));
                if let Some(eng) = &mut self.engine { eng.ghz(); }
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
            "pow" => Ok(Value::Float(arg_vals[0].as_float()?.powf(arg_vals[1].as_float()?))),

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
                    3 => (arg_vals[0].as_int()?, arg_vals[1].as_int()?, arg_vals[2].as_int()?),
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
                } else { Err(InterpError::type_error("sum requires a list")) }
            }
            "mean" => {
                if let Value::List(items) = &arg_vals[0] {
                    let n = items.len() as f64;
                    let total: f64 = items.iter().map(|v| v.as_float().unwrap_or(0.0)).sum();
                    Ok(Value::Float(total / n))
                } else { Err(InterpError::type_error("mean requires a list")) }
            }
            "max" => {
                if let Value::List(items) = &arg_vals[0] {
                    let m = items.iter().map(|v| v.as_float().unwrap_or(f64::NEG_INFINITY))
                        .fold(f64::NEG_INFINITY, f64::max);
                    Ok(Value::Float(m))
                } else { Err(InterpError::type_error("max requires a list")) }
            }
            "min" => {
                if let Value::List(items) = &arg_vals[0] {
                    let m = items.iter().map(|v| v.as_float().unwrap_or(f64::INFINITY))
                        .fold(f64::INFINITY, f64::min);
                    Ok(Value::Float(m))
                } else { Err(InterpError::type_error("min requires a list")) }
            }
            "sort" => {
                if let Value::List(mut items) = arg_vals[0].clone() {
                    items.sort_by(|a, b| a.as_float().unwrap_or(0.0).partial_cmp(&b.as_float().unwrap_or(0.0)).unwrap());
                    Ok(Value::List(items))
                } else { Err(InterpError::type_error("sort requires a list")) }
            }

            "int" => Ok(Value::Int(arg_vals[0].as_int()?)),
            "float" => Ok(Value::Float(arg_vals[0].as_float()?)),
            "str" => Ok(Value::String(arg_vals[0].as_string())),
            "bool" => Ok(Value::Bool(arg_vals[0].as_bool())),
            "type" => Ok(Value::String(match &arg_vals[0] {
                Value::Int(_) => "int", Value::Float(_) => "float",
                Value::String(_) => "string", Value::Bool(_) => "bool",
                Value::None => "none", Value::List(_) => "list",
                Value::Dict(_) => "dict", _ => "object",
            }.into())),

            "enumerate" => {
                if let Value::List(items) = &arg_vals[0] {
                    Ok(Value::List(items.iter().enumerate()
                        .map(|(i, v)| Value::Tuple(vec![Value::Int(i as i64), v.clone()]))
                        .collect()))
                } else { Err(InterpError::type_error("enumerate requires a list")) }
            }

            "zip" => {
                if let (Value::List(a), Value::List(b)) = (&arg_vals[0], &arg_vals[1]) {
                    Ok(Value::List(a.iter().zip(b.iter())
                        .map(|(x, y)| Value::Tuple(vec![x.clone(), y.clone()]))
                        .collect()))
                } else { Err(InterpError::type_error("zip requires two lists")) }
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
                if let (Value::MeasurementResult(r), Value::Int(k)) = (&arg_vals[0], &arg_vals.get(1).unwrap_or(&Value::Int(5))) {
                    let top = r.top_k(*k as usize);
                    Ok(Value::List(top.into_iter()
                        .map(|(bs, p)| Value::Tuple(vec![Value::String(bs), Value::Float(p)]))
                        .collect()))
                } else { Err(InterpError::type_error("top_k requires MeasurementResult")) }
            }

            "map" => {
                if let (Value::List(items), func) = (&arg_vals[1], &arg_vals[0]) {
                    let mut result = Vec::new();
                    for item in items {
                        result.push(self.call_function(func, &[item.clone()])?);
                    }
                    Ok(Value::List(result))
                } else { Err(InterpError::type_error("map requires function and list")) }
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
                } else { Err(InterpError::type_error("filter requires function and list")) }
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
                    } else { Err(InterpError::type_error("reduce requires function and list")) }
                } else { Err(InterpError::type_error("reduce requires at least 2 args")) }
            }

            // ── I/O ──
            "read_csv" => Ok(Value::String(format!("<DataFrame from {}>", arg_vals[0].as_string()))),
            "write_csv" => { Ok(Value::None) }
            "read_json" => Ok(Value::Dict(vec![])),
            "write_json" => { Ok(Value::None) }
            "read_file" => Ok(Value::String(String::new())),
            "write_file" => { Ok(Value::None) }

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

    fn eval_method_call(&mut self, obj: &Value, method: &str, args: &[CallArg]) -> Result<Value, InterpError> {
        let arg_vals: Result<Vec<Value>, _> = args.iter().map(|a| self.eval_expr(&a.value)).collect();
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
                Ok(Value::List(s.split(&sep).map(|p| Value::String(p.to_string())).collect()))
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
                eprintln!("Warning: Unknown method '{}.{}' — returning None", obj, method);
                Ok(Value::None)
            }
        }
    }

    fn call_function(&mut self, func: &Value, args: &[Value]) -> Result<Value, InterpError> {
        match func {
            Value::Function { params, body, .. } => {
                let mut child_env = Env::child(&self.env);
                for (i, param) in params.iter().enumerate() {
                    let val = args.get(i).cloned()
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
                BinOp::Eq => Ok(Value::Bool(a == b)),
                BinOp::NotEq => Ok(Value::Bool(a != b)),
                BinOp::Lt => Ok(Value::Bool(a < b)),
                BinOp::Gt => Ok(Value::Bool(a > b)),
                BinOp::LtEq => Ok(Value::Bool(a <= b)),
                BinOp::GtEq => Ok(Value::Bool(a >= b)),
                _ => Err(InterpError::type_error("Unsupported operation")),
            },
            (Value::Float(a), Value::Float(b)) | (Value::Float(a), Value::Int(_)) | (Value::Int(_), Value::Float(b)) => {
                let a = left.as_float()?;
                let b = right.as_float()?;
                match op {
                    BinOp::Add => Ok(Value::Float(a + b)),
                    BinOp::Sub => Ok(Value::Float(a - b)),
                    BinOp::Mul => Ok(Value::Float(a * b)),
                    BinOp::Div => Ok(Value::Float(a / b)),
                    BinOp::Pow => Ok(Value::Float(a.powf(b))),
                    BinOp::Eq => Ok(Value::Bool((a - b).abs() < 1e-15)),
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
                _ => Err(InterpError::type_error("Unsupported bool operation")),
            },
            _ => Err(InterpError::type_error(&format!("Cannot apply {:?} to {:?} and {:?}", op, left, right))),
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
    TypeError, NameError, IndexError, ValueError, RuntimeError,
}

impl InterpError {
    fn type_error(msg: &str) -> Self { InterpError { kind: ErrorKind::TypeError, msg: msg.into() } }
    fn name_error(msg: &str) -> Self { InterpError { kind: ErrorKind::NameError, msg: msg.into() } }
    fn index_error(msg: &str) -> Self { InterpError { kind: ErrorKind::IndexError, msg: msg.into() } }
}

impl fmt::Display for InterpError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:?}: {}", self.kind, self.msg)
    }
}
