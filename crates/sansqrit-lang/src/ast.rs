//! Abstract Syntax Tree (AST) for the Sansqrit DSL.

use crate::lexer::Span;

/// Top-level program.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct Program {
    pub statements: Vec<Stmt>,
}

/// Statements.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub enum Stmt {
    /// Variable declaration: `let x = expr` or `const X = expr`
    LetDecl { name: String, mutable: bool, type_ann: Option<String>, value: Option<Expr>, span: Span },

    /// Assignment: `x = expr` or `x += expr`
    Assign { target: Expr, op: AssignOp, value: Expr, span: Span },

    /// Expression statement (function call, etc.)
    ExprStmt { expr: Expr, span: Span },

    /// Function definition
    FnDecl {
        name: String,
        params: Vec<Param>,
        return_type: Option<String>,
        body: Vec<Stmt>,
        decorators: Vec<String>,
        span: Span,
    },

    /// Class definition
    ClassDecl {
        name: String,
        parent: Option<String>,
        fields: Vec<Field>,
        methods: Vec<Stmt>, // FnDecl statements
        span: Span,
    },

    /// Struct definition
    StructDecl {
        name: String,
        fields: Vec<Field>,
        methods: Vec<Stmt>,
        span: Span,
    },

    /// Import statement: `import chemistry` or `import biology.alignment as align`
    Import { module: Vec<String>, alias: Option<String>, span: Span },

    /// If/else
    If {
        condition: Expr,
        then_body: Vec<Stmt>,
        elifs: Vec<(Expr, Vec<Stmt>)>,
        else_body: Option<Vec<Stmt>>,
        span: Span,
    },

    /// For loop
    For { var: String, iter: Expr, body: Vec<Stmt>, span: Span },

    /// While loop
    While { condition: Expr, body: Vec<Stmt>, span: Span },

    /// Loop (infinite)
    Loop { body: Vec<Stmt>, span: Span },

    /// Break
    Break { span: Span },

    /// Continue
    Continue { span: Span },

    /// Return
    Return { value: Option<Expr>, span: Span },

    /// Yield
    Yield { value: Expr, span: Span },

    /// Match
    Match { expr: Expr, arms: Vec<MatchArm>, span: Span },

    /// Simulate block
    Simulate { engine: Option<String>, body: Vec<Stmt>, span: Span },

    /// Quantum block (real hardware)
    QuantumBlock { body: Vec<Stmt>, span: Span },

    /// Classical block
    ClassicalBlock { body: Vec<Stmt>, span: Span },

    /// Circuit definition
    CircuitDecl { name: String, body: Vec<Stmt>, span: Span },

    /// Molecule definition
    MoleculeDecl { name: String, fields: Vec<(String, Expr)>, span: Span },

    /// Try/catch/finally
    TryCatch {
        try_body: Vec<Stmt>,
        catches: Vec<CatchClause>,
        finally_body: Option<Vec<Stmt>>,
        span: Span,
    },

    /// Raise exception
    Raise { expr: Expr, span: Span },

    /// Decorator
    Decorator { name: String, args: Vec<Expr>, span: Span },
}

/// Expressions.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub enum Expr {
    /// Integer literal
    IntLit(i64, Span),
    /// Float literal
    FloatLit(f64, Span),
    /// String literal
    StringLit(String, Span),
    /// F-string literal
    FStringLit(String, Span),
    /// Boolean literal
    BoolLit(bool, Span),
    /// None literal
    NoneLit(Span),

    /// Identifier (variable name)
    Ident(String, Span),

    /// Binary operation: a + b, a * b, etc.
    BinOp { left: Box<Expr>, op: BinOp, right: Box<Expr>, span: Span },

    /// Unary operation: -x, not x
    UnaryOp { op: UnaryOp, operand: Box<Expr>, span: Span },

    /// Function call: f(args)
    Call { callee: Box<Expr>, args: Vec<CallArg>, span: Span },

    /// Method call: obj.method(args)
    MethodCall { object: Box<Expr>, method: String, args: Vec<CallArg>, span: Span },

    /// Field access: obj.field
    FieldAccess { object: Box<Expr>, field: String, span: Span },

    /// Index access: arr[idx]
    Index { object: Box<Expr>, index: Box<Expr>, span: Span },

    /// Slice: arr[start..end]
    Slice { object: Box<Expr>, start: Option<Box<Expr>>, end: Option<Box<Expr>>, step: Option<Box<Expr>>, span: Span },

    /// List literal: [1, 2, 3]
    ListLit(Vec<Expr>, Span),

    /// Dict literal: {"a": 1, "b": 2}
    DictLit(Vec<(Expr, Expr)>, Span),

    /// Set literal: {1, 2, 3}
    SetLit(Vec<Expr>, Span),

    /// Tuple literal: (a, b)
    TupleLit(Vec<Expr>, Span),

    /// Lambda: fn(x) => x * x
    Lambda { params: Vec<Param>, body: Box<Expr>, span: Span },

    /// List comprehension: [x*x for x in range(10)]
    ListComp { expr: Box<Expr>, var: String, iter: Box<Expr>, filter: Option<Box<Expr>>, span: Span },

    /// Dict comprehension: {k:v for (k,v) in items}
    DictComp { key: Box<Expr>, value: Box<Expr>, var: String, iter: Box<Expr>, filter: Option<Box<Expr>>, span: Span },

    /// Pipeline: x |> f |> g
    Pipeline { left: Box<Expr>, right: Box<Expr>, span: Span },

    /// Conditional expression: x if cond else y
    Ternary { condition: Box<Expr>, then_expr: Box<Expr>, else_expr: Box<Expr>, span: Span },

    /// Scope resolution: Module::method
    ScopeResolution { path: Vec<String>, span: Span },

    /// Struct instantiation: Atom { symbol: "H", number: 1 }
    StructInit { name: String, fields: Vec<(String, Expr)>, span: Span },
}

/// Binary operators.
#[derive(Debug, Clone, Copy, PartialEq)]
#[allow(dead_code)]
pub enum BinOp {
    Add, Sub, Mul, Div, IntDiv, Mod, Pow,
    Eq, NotEq, Lt, Gt, LtEq, GtEq,
    And, Or,
    BitAnd, BitOr, BitXor, ShiftLeft, ShiftRight,
    In, NotIn,
}

/// Unary operators.
#[derive(Debug, Clone, Copy, PartialEq)]
#[allow(dead_code)]
pub enum UnaryOp {
    Neg, Not, BitNot,
}

/// Assignment operators.
#[derive(Debug, Clone, Copy, PartialEq)]
#[allow(dead_code)]
pub enum AssignOp {
    Assign, AddAssign, SubAssign, MulAssign, DivAssign,
}

/// Function parameter.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct Param {
    pub name: String,
    pub type_ann: Option<String>,
    pub default: Option<Expr>,
}

/// Call argument (positional or named).
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct CallArg {
    pub name: Option<String>,
    pub value: Expr,
}

/// Struct/class field.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct Field {
    pub name: String,
    pub type_ann: Option<String>,
    pub default: Option<Expr>,
}

/// Match arm.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct MatchArm {
    pub pattern: Pattern,
    pub body: Vec<Stmt>,
}

/// Match pattern.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub enum Pattern {
    Literal(Expr),
    Ident(String),
    Wildcard,
    Or(Vec<Pattern>),
    Range(Expr, Expr),
    Constructor(String, Vec<Pattern>),
}

/// Catch clause in try/catch.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct CatchClause {
    pub exception_type: Option<String>,
    pub var_name: Option<String>,
    pub body: Vec<Stmt>,
}

impl Expr {
    pub fn span(&self) -> Span {
        match self {
            Expr::IntLit(_, s) | Expr::FloatLit(_, s) | Expr::StringLit(_, s) |
            Expr::FStringLit(_, s) | Expr::BoolLit(_, s) | Expr::NoneLit(s) |
            Expr::Ident(_, s) => *s,
            Expr::BinOp { span, .. } | Expr::UnaryOp { span, .. } |
            Expr::Call { span, .. } | Expr::MethodCall { span, .. } |
            Expr::FieldAccess { span, .. } | Expr::Index { span, .. } |
            Expr::Slice { span, .. } | Expr::ListLit(_, span) |
            Expr::DictLit(_, span) | Expr::SetLit(_, span) |
            Expr::TupleLit(_, span) | Expr::Lambda { span, .. } |
            Expr::ListComp { span, .. } | Expr::DictComp { span, .. } |
            Expr::Pipeline { span, .. } | Expr::Ternary { span, .. } |
            Expr::ScopeResolution { span, .. } | Expr::StructInit { span, .. } => *span,
        }
    }
}
