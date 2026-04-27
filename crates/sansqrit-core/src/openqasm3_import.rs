//! OpenQASM 3 importer.
//!
//! This importer executes the gate subset Sansqrit can currently simulate and
//! preserves richer OpenQASM 3 constructs as structured metadata instead of
//! dropping them. That includes classical control, timing/delay, externs, and
//! calibration blocks.

use crate::gates::{GateKind, GateOp};
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::fmt;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Qasm3Import {
    pub n_qubits: usize,
    pub n_clbits: usize,
    pub gates: Vec<GateOp>,
    pub measurements: Vec<Qasm3Measurement>,
    pub classical_controls: Vec<String>,
    pub timing: Vec<String>,
    pub externs: Vec<String>,
    pub calibrations: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Qasm3Measurement {
    pub qubit: usize,
    pub clbit: Option<usize>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Qasm3ImportError {
    pub line: usize,
    pub message: String,
}

impl fmt::Display for Qasm3ImportError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "OpenQASM 3 import error at line {}: {}",
            self.line, self.message
        )
    }
}

impl Error for Qasm3ImportError {}

pub fn import_qasm3(source: &str) -> Result<Qasm3Import, Qasm3ImportError> {
    let mut import = Qasm3Import {
        n_qubits: 0,
        n_clbits: 0,
        gates: Vec::new(),
        measurements: Vec::new(),
        classical_controls: Vec::new(),
        timing: Vec::new(),
        externs: Vec::new(),
        calibrations: Vec::new(),
        warnings: Vec::new(),
    };

    let mut in_calibration = false;
    let mut calibration_depth = 0i32;
    let mut calibration = String::new();

    for (idx, raw_line) in source.lines().enumerate() {
        let line_no = idx + 1;
        let line = strip_comment(raw_line).trim().to_string();
        if line.is_empty() {
            continue;
        }

        if in_calibration {
            calibration.push_str(raw_line);
            calibration.push('\n');
            calibration_depth += raw_line.matches('{').count() as i32;
            calibration_depth -= raw_line.matches('}').count() as i32;
            if calibration_depth <= 0 {
                import.calibrations.push(calibration.clone());
                calibration.clear();
                in_calibration = false;
            }
            continue;
        }

        if line.starts_with("OPENQASM") || line.starts_with("include ") {
            continue;
        }
        if line.starts_with("cal ")
            || line.starts_with("cal{")
            || line.starts_with("cal {")
            || line.starts_with("defcal ")
        {
            in_calibration = true;
            calibration_depth =
                raw_line.matches('{').count() as i32 - raw_line.matches('}').count() as i32;
            calibration.push_str(raw_line);
            calibration.push('\n');
            if calibration_depth <= 0 {
                import.calibrations.push(calibration.clone());
                calibration.clear();
                in_calibration = false;
            }
            continue;
        }
        if line.starts_with("extern ") {
            import.externs.push(trim_semicolon(&line).to_string());
            continue;
        }
        if line.starts_with("qubit") {
            import.n_qubits = import
                .n_qubits
                .max(parse_register_size(&line, "qubit", line_no)?);
            continue;
        }
        if line.starts_with("bit") || line.starts_with("creg") {
            let keyword = if line.starts_with("bit") {
                "bit"
            } else {
                "creg"
            };
            import.n_clbits = import
                .n_clbits
                .max(parse_register_size(&line, keyword, line_no)?);
            continue;
        }
        if line.starts_with("delay") || line.starts_with("barrier") || line.starts_with("box ") {
            import.timing.push(trim_semicolon(&line).to_string());
            continue;
        }
        if line.starts_with("if ") || line.starts_with("if(") {
            import
                .classical_controls
                .push(trim_semicolon(&line).to_string());
            if let Some(gate) = parse_controlled_gate(&line, line_no)? {
                import.gates.push(gate);
                import
                    .warnings
                    .push("Classical condition was preserved as metadata; imported gate is unconditional.".to_string());
            }
            continue;
        }
        if line.contains("measure") {
            if let Some(measurement) = parse_measurement(&line, line_no)? {
                import.measurements.push(measurement);
            } else {
                import.warnings.push(format!(
                    "Line {} measurement form was preserved but not lowered.",
                    line_no
                ));
            }
            continue;
        }

        match parse_gate(&line, line_no)? {
            Some(gate) => import.gates.push(gate),
            None => import.warnings.push(format!(
                "Line {} was preserved as unsupported OpenQASM 3: {}",
                line_no, line
            )),
        }
    }

    Ok(import)
}

fn parse_controlled_gate(line: &str, line_no: usize) -> Result<Option<GateOp>, Qasm3ImportError> {
    let Some(close) = line.find(')') else {
        return Ok(None);
    };
    parse_gate(line[close + 1..].trim(), line_no)
}

fn parse_gate(line: &str, line_no: usize) -> Result<Option<GateOp>, Qasm3ImportError> {
    let line = trim_semicolon(line).trim();
    let (head, rest) = split_head(line);
    if head.is_empty() {
        return Ok(None);
    }

    let (name, params) = parse_gate_head(head, line_no)?;
    let qubits = parse_qubit_list(rest, line_no)?;
    let gate = match name.to_ascii_lowercase().as_str() {
        "i" | "id" => single(GateKind::I, &qubits),
        "h" => single(GateKind::H, &qubits),
        "x" => single(GateKind::X, &qubits),
        "y" => single(GateKind::Y, &qubits),
        "z" => single(GateKind::Z, &qubits),
        "s" => single(GateKind::S, &qubits),
        "sdg" | "sinv" => single(GateKind::Sdg, &qubits),
        "t" => single(GateKind::T, &qubits),
        "tdg" | "tinv" => single(GateKind::Tdg, &qubits),
        "sx" => single(GateKind::SX, &qubits),
        "rx" => single_param(GateKind::Rx, &qubits, &params),
        "ry" => single_param(GateKind::Ry, &qubits, &params),
        "rz" => single_param(GateKind::Rz, &qubits, &params),
        "p" | "phase" => single_param(GateKind::Phase, &qubits, &params),
        "cx" | "cnot" => two(GateKind::CNOT, &qubits),
        "cz" => two(GateKind::CZ, &qubits),
        "cy" => two(GateKind::CY, &qubits),
        "swap" => two(GateKind::SWAP, &qubits),
        "cp" => two_param(GateKind::CP, &qubits, &params),
        "crz" => two_param(GateKind::CRz, &qubits, &params),
        "rzz" => two_param(GateKind::RZZ, &qubits, &params),
        "ccx" => three(GateKind::Toffoli, &qubits),
        "cswap" => three(GateKind::Fredkin, &qubits),
        _ => return Ok(None),
    };

    gate.map(Some).ok_or_else(|| Qasm3ImportError {
        line: line_no,
        message: format!("Wrong arity or missing parameter for gate '{}'.", name),
    })
}

fn parse_measurement(
    line: &str,
    line_no: usize,
) -> Result<Option<Qasm3Measurement>, Qasm3ImportError> {
    let line = trim_semicolon(line);
    if let Some((left, right)) = line.split_once('=') {
        let clbit = parse_single_index(left.trim()).ok();
        let qubit = right
            .trim()
            .strip_prefix("measure")
            .ok_or_else(|| Qasm3ImportError {
                line: line_no,
                message: "Expected measurement after '='.".to_string(),
            })?
            .trim();
        return Ok(Some(Qasm3Measurement {
            qubit: parse_single_index(qubit).map_err(|message| Qasm3ImportError {
                line: line_no,
                message,
            })?,
            clbit,
        }));
    }
    if let Some((left, right)) = line.split_once("->") {
        return Ok(Some(Qasm3Measurement {
            qubit: parse_single_index(left.trim().trim_start_matches("measure").trim()).map_err(
                |message| Qasm3ImportError {
                    line: line_no,
                    message,
                },
            )?,
            clbit: parse_single_index(right.trim()).ok(),
        }));
    }
    Ok(None)
}

fn parse_register_size(
    line: &str,
    keyword: &str,
    line_no: usize,
) -> Result<usize, Qasm3ImportError> {
    let rest = trim_semicolon(line)
        .trim()
        .strip_prefix(keyword)
        .unwrap_or("")
        .trim();
    if let Some(start) = rest.find('[') {
        let end = rest[start + 1..]
            .find(']')
            .ok_or_else(|| Qasm3ImportError {
                line: line_no,
                message: "Unclosed register size.".to_string(),
            })?
            + start
            + 1;
        rest[start + 1..end]
            .trim()
            .parse::<usize>()
            .map_err(|_| Qasm3ImportError {
                line: line_no,
                message: "Invalid register size.".to_string(),
            })
    } else {
        Ok(1)
    }
}

fn split_head(line: &str) -> (&str, &str) {
    let mut split = line.splitn(2, char::is_whitespace);
    (split.next().unwrap_or(""), split.next().unwrap_or(""))
}

fn parse_gate_head(head: &str, line_no: usize) -> Result<(String, Vec<f64>), Qasm3ImportError> {
    if let Some(start) = head.find('(') {
        let end = head.rfind(')').ok_or_else(|| Qasm3ImportError {
            line: line_no,
            message: "Unclosed gate parameter list.".to_string(),
        })?;
        let name = head[..start].to_string();
        let params = head[start + 1..end]
            .split(',')
            .filter(|s| !s.trim().is_empty())
            .map(parse_angle)
            .collect::<Result<Vec<_>, _>>()
            .map_err(|message| Qasm3ImportError {
                line: line_no,
                message,
            })?;
        Ok((name, params))
    } else {
        Ok((head.to_string(), vec![]))
    }
}

fn parse_angle(raw: &str) -> Result<f64, String> {
    let s = raw.trim();
    match s {
        "pi" => Ok(std::f64::consts::PI),
        "-pi" => Ok(-std::f64::consts::PI),
        _ if s.contains("pi/") => {
            let sign = if s.starts_with('-') { -1.0 } else { 1.0 };
            let denom = s
                .trim_start_matches('-')
                .trim_start_matches("pi/")
                .parse::<f64>()
                .map_err(|_| format!("Invalid angle '{}'.", s))?;
            Ok(sign * std::f64::consts::PI / denom)
        }
        _ => s
            .parse::<f64>()
            .map_err(|_| format!("Invalid numeric angle '{}'.", s)),
    }
}

fn parse_qubit_list(rest: &str, line_no: usize) -> Result<Vec<usize>, Qasm3ImportError> {
    rest.split(',')
        .filter(|s| !s.trim().is_empty())
        .map(|part| {
            parse_single_index(part.trim()).map_err(|message| Qasm3ImportError {
                line: line_no,
                message,
            })
        })
        .collect()
}

fn parse_single_index(raw: &str) -> Result<usize, String> {
    let raw = trim_semicolon(raw).trim();
    let start = raw
        .find('[')
        .ok_or_else(|| format!("Expected indexed register reference, got '{}'.", raw))?;
    let end = raw[start + 1..]
        .find(']')
        .ok_or_else(|| format!("Unclosed index in '{}'.", raw))?
        + start
        + 1;
    raw[start + 1..end]
        .trim()
        .parse::<usize>()
        .map_err(|_| format!("Invalid register index in '{}'.", raw))
}

fn single(kind: GateKind, qubits: &[usize]) -> Option<GateOp> {
    (qubits.len() == 1).then(|| GateOp::single(kind, qubits[0]))
}

fn single_param(kind: GateKind, qubits: &[usize], params: &[f64]) -> Option<GateOp> {
    (qubits.len() == 1 && params.len() == 1)
        .then(|| GateOp::single_param(kind, qubits[0], params[0]))
}

fn two(kind: GateKind, qubits: &[usize]) -> Option<GateOp> {
    (qubits.len() == 2).then(|| GateOp::two(kind, qubits[0], qubits[1]))
}

fn two_param(kind: GateKind, qubits: &[usize], params: &[f64]) -> Option<GateOp> {
    (qubits.len() == 2 && params.len() == 1)
        .then(|| GateOp::two_param(kind, qubits[0], qubits[1], params[0]))
}

fn three(kind: GateKind, qubits: &[usize]) -> Option<GateOp> {
    (qubits.len() == 3).then(|| GateOp::three(kind, qubits[0], qubits[1], qubits[2]))
}

fn strip_comment(line: &str) -> &str {
    line.split_once("//").map(|(left, _)| left).unwrap_or(line)
}

fn trim_semicolon(line: &str) -> &str {
    line.trim().trim_end_matches(';').trim()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_imports_gates_measurement_and_metadata() {
        let qasm = r#"
            OPENQASM 3.0;
            include "stdgates.inc";
            extern get_angle() -> float[64];
            qubit[2] q;
            bit[2] c;
            h q[0];
            cx q[0], q[1];
            delay[10ns] q[0];
            if (c[0]) x q[1];
            c[0] = measure q[0];
            cal { frame f; }
        "#;

        let imported = import_qasm3(qasm).unwrap();
        assert_eq!(imported.n_qubits, 2);
        assert_eq!(imported.n_clbits, 2);
        assert_eq!(imported.gates.len(), 3);
        assert_eq!(imported.measurements[0].qubit, 0);
        assert_eq!(imported.externs.len(), 1);
        assert_eq!(imported.timing.len(), 1);
        assert_eq!(imported.calibrations.len(), 1);
        assert_eq!(imported.classical_controls.len(), 1);
    }
}
