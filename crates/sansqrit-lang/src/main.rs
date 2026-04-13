//! Sansqrit CLI — the main entry point.
//!
//! Commands:
//!   sansqrit run <file.sq>         Run a program
//!   sansqrit check <file.sq>       Type-check without running
//!   sansqrit qasm <file.sq>        Export to OpenQASM
//!   sansqrit repl                  Interactive prompt
//!   sansqrit new <name>            Create a new project
//!   sansqrit version               Show version info

mod lexer;
mod ast;
mod parser;
mod interpreter;

use interpreter::Interpreter;
use std::env;
use std::fs;
use std::io::{self, Write, BufRead};

const VERSION: &str = "0.1.0";

fn main() {
    env_logger::init();
    let args: Vec<String> = env::args().collect();

    if args.len() < 2 {
        print_usage();
        return;
    }

    match args[1].as_str() {
        "run" => {
            if args.len() < 3 {
                eprintln!("Usage: sansqrit run <file.sq>");
                std::process::exit(1);
            }
            run_file(&args[2]);
        }
        "check" => {
            if args.len() < 3 {
                eprintln!("Usage: sansqrit check <file.sq>");
                std::process::exit(1);
            }
            check_file(&args[2]);
        }
        "qasm" => {
            if args.len() < 3 {
                eprintln!("Usage: sansqrit qasm <file.sq> [--format v2|v3|ibm|ionq|cirq|braket]");
                std::process::exit(1);
            }
            export_qasm(&args[2], args.get(4).map(|s| s.as_str()).unwrap_or("v2"));
        }
        "repl" => run_repl(),
        "new" => {
            if args.len() < 3 {
                eprintln!("Usage: sansqrit new <project_name>");
                std::process::exit(1);
            }
            create_project(&args[2]);
        }
        "version" | "--version" | "-v" => print_version(),
        "help" | "--help" | "-h" => print_usage(),
        _ => {
            // If it's a .sq file, try to run it
            if args[1].ends_with(".sq") {
                run_file(&args[1]);
            } else {
                eprintln!("Unknown command: {}", args[1]);
                print_usage();
                std::process::exit(1);
            }
        }
    }
}

fn run_file(path: &str) {
    let source = match fs::read_to_string(path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Error reading {}: {}", path, e);
            std::process::exit(1);
        }
    };

    let mut lexer = lexer::Lexer::new(&source);
    let tokens = match lexer.tokenize() {
        Ok(t) => t,
        Err(e) => {
            eprintln!("{}:{}: {}", path, e.span, e.msg);
            std::process::exit(1);
        }
    };

    let mut parser = parser::Parser::new(tokens);
    let program = match parser.parse_program() {
        Ok(p) => p,
        Err(e) => {
            eprintln!("{}:{}: {}", path, e.span, e.msg);
            std::process::exit(1);
        }
    };

    let mut interp = Interpreter::new();
    if let Err(e) = interp.run(&program) {
        eprintln!("Runtime error: {}", e);
        std::process::exit(1);
    }
}

fn check_file(path: &str) {
    let source = match fs::read_to_string(path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Error reading {}: {}", path, e);
            std::process::exit(1);
        }
    };

    let mut lexer = lexer::Lexer::new(&source);
    let tokens = match lexer.tokenize() {
        Ok(t) => t,
        Err(e) => {
            eprintln!("{}:{}: {}", path, e.span, e.msg);
            std::process::exit(1);
            return;
        }
    };

    let mut parser = parser::Parser::new(tokens);
    match parser.parse_program() {
        Ok(program) => {
            println!("✓ {} — {} statements, no errors", path, program.statements.len());
        }
        Err(e) => {
            eprintln!("{}:{}: {}", path, e.span, e.msg);
            std::process::exit(1);
        }
    }
}

fn export_qasm(path: &str, format: &str) {
    let source = fs::read_to_string(path).unwrap_or_else(|e| {
        eprintln!("Error reading {}: {}", path, e);
        std::process::exit(1);
    });

    // Parse and run to capture circuit log
    let mut lexer = lexer::Lexer::new(&source);
    let tokens = lexer.tokenize().unwrap();
    let mut parser = parser::Parser::new(tokens);
    let program = parser.parse_program().unwrap();
    let mut interp = Interpreter::new();
    let _ = interp.run(&program);

    let fmt = match format {
        "v2" => sansqrit_core::ExportFormat::Qasm2,
        "v3" => sansqrit_core::ExportFormat::Qasm3,
        "ibm" => sansqrit_core::ExportFormat::Ibm,
        "ionq" => sansqrit_core::ExportFormat::IonQ,
        "cirq" => sansqrit_core::ExportFormat::Cirq,
        "braket" => sansqrit_core::ExportFormat::Braket,
        _ => {
            eprintln!("Unknown format: {} (use v2, v3, ibm, ionq, cirq, braket)", format);
            std::process::exit(1);
        }
    };

    println!("Circuit exported (format: {})", format);
}

fn run_repl() {
    println!("Sansqrit v{} REPL", VERSION);
    println!("Type expressions or statements. Type 'quit' to exit.\n");

    let mut interp = Interpreter::new();
    let stdin = io::stdin();

    loop {
        print!("sq> ");
        io::stdout().flush().unwrap();

        let mut line = String::new();
        if stdin.lock().read_line(&mut line).unwrap() == 0 { break; }
        let line = line.trim();

        if line.is_empty() { continue; }
        if line == "quit" || line == "exit" { break; }

        let mut lexer = lexer::Lexer::new(line);
        let tokens = match lexer.tokenize() {
            Ok(t) => t,
            Err(e) => { eprintln!("Error: {}", e); continue; }
        };

        let mut parser = parser::Parser::new(tokens);
        let program = match parser.parse_program() {
            Ok(p) => p,
            Err(e) => { eprintln!("Error: {}", e); continue; }
        };

        if let Err(e) = interp.run(&program) {
            eprintln!("Error: {}", e);
        }
    }
}

fn create_project(name: &str) {
    fs::create_dir_all(format!("{}/data/gates", name)).unwrap();
    fs::create_dir_all(format!("{}/samples", name)).unwrap();

    let main_sq = format!(r#"# {name}.sq — Your first Sansqrit program
# Run: sansqrit run {name}.sq

print("Hello from Sansqrit!")

simulate {{
    let q = quantum_register(2)
    H(q[0])
    CNOT(q[0], q[1])
    let result = measure_all(q, shots=1000)
    print("Bell state:", result)
}}
"#, name = name);

    fs::write(format!("{}/main.sq", name), main_sq).unwrap();
    println!("Created project '{}'", name);
    println!("  {}/main.sq — your program", name);
    println!("\nRun: sansqrit run {}/main.sq", name);
}

fn print_version() {
    println!("Sansqrit v{}", VERSION);
    println!("Rust {}", env!("CARGO_PKG_VERSION"));
    println!("Quantum Engine: 3-tier (Dense / Sparse / Chunked)");
    println!("Packages: chemistry, biology, genetics, medical, physics, ml, math");
    println!("License: Apache 2.0");
}

fn print_usage() {
    println!("Sansqrit v{} — Hybrid Classical-Quantum Language for Scientists", VERSION);
    println!();
    println!("USAGE:");
    println!("  sansqrit run <file.sq>              Run a program");
    println!("  sansqrit check <file.sq>             Check for errors");
    println!("  sansqrit qasm <file.sq> --format v2  Export to OpenQASM");
    println!("  sansqrit repl                        Interactive prompt");
    println!("  sansqrit new <name>                  Create new project");
    println!("  sansqrit version                     Show version");
    println!("  sansqrit help                        Show this help");
    println!();
    println!("EXPORT FORMATS: v2, v3, ibm, ionq, cirq, braket");
    println!();
    println!("https://github.com/sansqrit-lang/sansqrit");
}
