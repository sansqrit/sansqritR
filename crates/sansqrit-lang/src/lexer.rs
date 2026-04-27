//! Lexer for the Sansqrit DSL.
//!
//! Tokenizes `.sq` source files into a stream of tokens.
//! Supports Python-like syntax with quantum extensions.

use std::fmt;

/// Source location for error reporting.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Span {
    pub line: usize,
    pub col: usize,
    pub offset: usize,
}

impl fmt::Display for Span {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "line {}, col {}", self.line, self.col)
    }
}

/// Token types in the Sansqrit language.
#[derive(Debug, Clone, PartialEq)]
pub enum TokenKind {
    // Literals
    IntLit(i64),
    FloatLit(f64),
    StringLit(String),
    FStringLit(String),
    BoolLit(bool),
    NoneLit,

    // Identifiers and keywords
    Ident(String),

    // Keywords
    Let,
    Const,
    Fn,
    Return,
    If,
    Else,
    For,
    While,
    Loop,
    In,
    Break,
    Continue,
    Match,
    Class,
    Extends,
    Import,
    As,
    Simulate,
    Quantum,
    Classical,
    Circuit,
    Molecule,
    Struct,
    Try,
    Catch,
    Finally,
    Raise,
    And,
    Or,
    Not,
    Yield,

    // Operators
    Plus,
    Minus,
    Star,
    Slash,
    DoubleSlash,
    Percent,
    DoubleStar,
    Eq,
    NotEq,
    Lt,
    Gt,
    LtEq,
    GtEq,
    Assign,
    PlusAssign,
    MinusAssign,
    StarAssign,
    SlashAssign,
    Ampersand,
    Pipe,
    Caret,
    ShiftLeft,
    ShiftRight,
    Arrow,    // ->
    FatArrow, // =>
    Pipeline, // |>
    Dot,
    DotDot,
    ColonColon,

    // Delimiters
    LParen,
    RParen,
    LBracket,
    RBracket,
    LBrace,
    RBrace,
    Comma,
    Colon,
    Semicolon,
    At,

    // Special
    Newline,
    Eof,
}

impl fmt::Display for TokenKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TokenKind::IntLit(v) => write!(f, "{}", v),
            TokenKind::FloatLit(v) => write!(f, "{}", v),
            TokenKind::StringLit(s) => write!(f, "\"{}\"", s),
            TokenKind::Ident(s) => write!(f, "{}", s),
            _ => write!(f, "{:?}", self),
        }
    }
}

#[derive(Debug, Clone)]
pub struct Token {
    pub kind: TokenKind,
    pub span: Span,
}

/// The Sansqrit lexer.
pub struct Lexer {
    source: Vec<char>,
    pos: usize,
    line: usize,
    col: usize,
}

impl Lexer {
    pub fn new(source: &str) -> Self {
        Lexer {
            source: source.chars().collect(),
            pos: 0,
            line: 1,
            col: 1,
        }
    }

    /// Tokenize the entire source.
    pub fn tokenize(&mut self) -> Result<Vec<Token>, LexError> {
        let mut tokens = Vec::new();
        loop {
            let tok = self.next_token()?;
            let is_eof = tok.kind == TokenKind::Eof;
            tokens.push(tok);
            if is_eof {
                break;
            }
        }
        Ok(tokens)
    }

    fn span(&self) -> Span {
        Span {
            line: self.line,
            col: self.col,
            offset: self.pos,
        }
    }

    fn peek(&self) -> Option<char> {
        self.source.get(self.pos).copied()
    }

    fn peek_ahead(&self, n: usize) -> Option<char> {
        self.source.get(self.pos + n).copied()
    }

    fn advance(&mut self) -> Option<char> {
        let ch = self.source.get(self.pos).copied()?;
        self.pos += 1;
        if ch == '\n' {
            self.line += 1;
            self.col = 1;
        } else {
            self.col += 1;
        }
        Some(ch)
    }

    fn skip_whitespace(&mut self) {
        while let Some(ch) = self.peek() {
            if ch == ' ' || ch == '\t' || ch == '\r' {
                self.advance();
            } else {
                break;
            }
        }
    }

    fn skip_comment(&mut self) {
        if self.peek() == Some('#') {
            while let Some(ch) = self.peek() {
                if ch == '\n' {
                    break;
                }
                self.advance();
            }
        }
        // Multi-line comment
        if self.peek() == Some('/') && self.peek_ahead(1) == Some('*') {
            self.advance();
            self.advance();
            loop {
                match self.advance() {
                    Some('*') if self.peek() == Some('/') => {
                        self.advance();
                        break;
                    }
                    None => break,
                    _ => {}
                }
            }
        }
    }

    fn next_token(&mut self) -> Result<Token, LexError> {
        loop {
            self.skip_whitespace();
            if self.peek() == Some('#')
                || (self.peek() == Some('/') && self.peek_ahead(1) == Some('*'))
            {
                self.skip_comment();
                continue;
            }
            break;
        }

        let span = self.span();

        let ch = match self.peek() {
            Some(ch) => ch,
            None => {
                return Ok(Token {
                    kind: TokenKind::Eof,
                    span,
                })
            }
        };

        // Newline
        if ch == '\n' {
            self.advance();
            return Ok(Token {
                kind: TokenKind::Newline,
                span,
            });
        }

        // String literals
        if ch == '"' || (ch == 'f' && self.peek_ahead(1) == Some('"')) {
            return self.lex_string(span);
        }

        // Doc comments (///)
        if ch == '/' && self.peek_ahead(1) == Some('/') && self.peek_ahead(2) == Some('/') {
            while let Some(c) = self.peek() {
                if c == '\n' {
                    break;
                }
                self.advance();
            }
            return self.next_token();
        }

        // Numbers
        if ch.is_ascii_digit()
            || (ch == '-' && self.peek_ahead(1).map_or(false, |c| c.is_ascii_digit()))
        {
            return self.lex_number(span);
        }

        // Identifiers and keywords
        if ch.is_alphabetic() || ch == '_' {
            return self.lex_ident(span);
        }

        // Operators and delimiters
        self.advance();
        let kind = match ch {
            '+' => {
                if self.peek() == Some('=') {
                    self.advance();
                    TokenKind::PlusAssign
                } else {
                    TokenKind::Plus
                }
            }
            '-' => {
                if self.peek() == Some('>') {
                    self.advance();
                    TokenKind::Arrow
                } else if self.peek() == Some('=') {
                    self.advance();
                    TokenKind::MinusAssign
                } else {
                    TokenKind::Minus
                }
            }
            '*' => {
                if self.peek() == Some('*') {
                    self.advance();
                    TokenKind::DoubleStar
                } else if self.peek() == Some('=') {
                    self.advance();
                    TokenKind::StarAssign
                } else {
                    TokenKind::Star
                }
            }
            '/' => {
                if self.peek() == Some('/') {
                    self.advance();
                    TokenKind::DoubleSlash
                } else if self.peek() == Some('=') {
                    self.advance();
                    TokenKind::SlashAssign
                } else {
                    TokenKind::Slash
                }
            }
            '%' => TokenKind::Percent,
            '=' => {
                if self.peek() == Some('=') {
                    self.advance();
                    TokenKind::Eq
                } else if self.peek() == Some('>') {
                    self.advance();
                    TokenKind::FatArrow
                } else {
                    TokenKind::Assign
                }
            }
            '!' => {
                if self.peek() == Some('=') {
                    self.advance();
                    TokenKind::NotEq
                } else {
                    return Err(LexError {
                        msg: "Unexpected '!'".into(),
                        span,
                    });
                }
            }
            '<' => {
                if self.peek() == Some('=') {
                    self.advance();
                    TokenKind::LtEq
                } else if self.peek() == Some('<') {
                    self.advance();
                    TokenKind::ShiftLeft
                } else {
                    TokenKind::Lt
                }
            }
            '>' => {
                if self.peek() == Some('=') {
                    self.advance();
                    TokenKind::GtEq
                } else if self.peek() == Some('>') {
                    self.advance();
                    TokenKind::ShiftRight
                } else {
                    TokenKind::Gt
                }
            }
            '&' => TokenKind::Ampersand,
            '|' => {
                if self.peek() == Some('>') {
                    self.advance();
                    TokenKind::Pipeline
                } else {
                    TokenKind::Pipe
                }
            }
            '^' => TokenKind::Caret,
            '(' => TokenKind::LParen,
            ')' => TokenKind::RParen,
            '[' => TokenKind::LBracket,
            ']' => TokenKind::RBracket,
            '{' => TokenKind::LBrace,
            '}' => TokenKind::RBrace,
            ',' => TokenKind::Comma,
            ':' => {
                if self.peek() == Some(':') {
                    self.advance();
                    TokenKind::ColonColon
                } else {
                    TokenKind::Colon
                }
            }
            ';' => TokenKind::Semicolon,
            '.' => {
                if self.peek() == Some('.') {
                    self.advance();
                    TokenKind::DotDot
                } else {
                    TokenKind::Dot
                }
            }
            '@' => TokenKind::At,
            _ => {
                return Err(LexError {
                    msg: format!("Unexpected character: '{}'", ch),
                    span,
                })
            }
        };

        Ok(Token { kind, span })
    }

    fn lex_string(&mut self, span: Span) -> Result<Token, LexError> {
        let is_fstring = self.peek() == Some('f');
        if is_fstring {
            self.advance();
        }
        self.advance(); // skip opening quote

        let mut s = String::new();
        loop {
            match self.advance() {
                Some('"') => break,
                Some('\\') => match self.advance() {
                    Some('n') => s.push('\n'),
                    Some('t') => s.push('\t'),
                    Some('\\') => s.push('\\'),
                    Some('"') => s.push('"'),
                    Some(c) => {
                        s.push('\\');
                        s.push(c);
                    }
                    None => {
                        return Err(LexError {
                            msg: "Unterminated escape".into(),
                            span,
                        })
                    }
                },
                Some(c) => s.push(c),
                None => {
                    return Err(LexError {
                        msg: "Unterminated string".into(),
                        span,
                    })
                }
            }
        }

        let kind = if is_fstring {
            TokenKind::FStringLit(s)
        } else {
            TokenKind::StringLit(s)
        };
        Ok(Token { kind, span })
    }

    fn lex_number(&mut self, span: Span) -> Result<Token, LexError> {
        let mut s = String::new();
        let mut is_float = false;

        // Optional negative sign
        if self.peek() == Some('-') {
            s.push('-');
            self.advance();
        }

        while let Some(ch) = self.peek() {
            if ch.is_ascii_digit() {
                s.push(ch);
                self.advance();
            } else if ch == '.'
                && !is_float
                && self.peek_ahead(1).map_or(false, |c| c.is_ascii_digit())
            {
                is_float = true;
                s.push('.');
                self.advance();
            } else if (ch == 'e' || ch == 'E') && !s.is_empty() {
                is_float = true;
                s.push(ch);
                self.advance();
                if self.peek() == Some('-') || self.peek() == Some('+') {
                    s.push(self.advance().unwrap());
                }
            } else {
                break;
            }
        }

        if is_float {
            let val: f64 = s.parse().map_err(|_| LexError {
                msg: format!("Invalid float: {}", s),
                span,
            })?;
            Ok(Token {
                kind: TokenKind::FloatLit(val),
                span,
            })
        } else {
            let val: i64 = s.parse().map_err(|_| LexError {
                msg: format!("Invalid integer: {}", s),
                span,
            })?;
            Ok(Token {
                kind: TokenKind::IntLit(val),
                span,
            })
        }
    }

    fn lex_ident(&mut self, span: Span) -> Result<Token, LexError> {
        let mut s = String::new();
        while let Some(ch) = self.peek() {
            if ch.is_alphanumeric() || ch == '_' {
                s.push(ch);
                self.advance();
            } else {
                break;
            }
        }

        let kind = match s.as_str() {
            "let" => TokenKind::Let,
            "const" => TokenKind::Const,
            "fn" => TokenKind::Fn,
            "return" => TokenKind::Return,
            "if" => TokenKind::If,
            "else" => TokenKind::Else,
            "for" => TokenKind::For,
            "while" => TokenKind::While,
            "loop" => TokenKind::Loop,
            "in" => TokenKind::In,
            "break" => TokenKind::Break,
            "continue" => TokenKind::Continue,
            "match" => TokenKind::Match,
            "class" => TokenKind::Class,
            "extends" => TokenKind::Extends,
            "import" => TokenKind::Import,
            "as" => TokenKind::As,
            "simulate" => TokenKind::Simulate,
            "quantum" => TokenKind::Quantum,
            "classical" => TokenKind::Classical,
            "circuit" => TokenKind::Circuit,
            "molecule" => TokenKind::Molecule,
            "struct" => TokenKind::Struct,
            "try" => TokenKind::Try,
            "catch" => TokenKind::Catch,
            "finally" => TokenKind::Finally,
            "raise" => TokenKind::Raise,
            "and" => TokenKind::And,
            "or" => TokenKind::Or,
            "not" => TokenKind::Not,
            "yield" => TokenKind::Yield,
            "true" => TokenKind::BoolLit(true),
            "false" => TokenKind::BoolLit(false),
            "None" => TokenKind::NoneLit,
            "PI" | "E" | "PLANCK" | "BOLTZMANN" | "AVOGADRO" => TokenKind::Ident(s),
            _ => TokenKind::Ident(s),
        };

        Ok(Token { kind, span })
    }
}

#[derive(Debug)]
pub struct LexError {
    pub msg: String,
    pub span: Span,
}

impl fmt::Display for LexError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Lex error at {}: {}", self.span, self.msg)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_tokens() {
        let mut lexer = Lexer::new("let x = 42");
        let tokens = lexer.tokenize().unwrap();
        assert!(matches!(tokens[0].kind, TokenKind::Let));
        assert!(matches!(&tokens[1].kind, TokenKind::Ident(s) if s == "x"));
        assert!(matches!(tokens[2].kind, TokenKind::Assign));
        assert!(matches!(tokens[3].kind, TokenKind::IntLit(42)));
    }

    #[test]
    fn test_quantum_keywords() {
        let mut lexer = Lexer::new("simulate { H(q[0]) }");
        let tokens = lexer.tokenize().unwrap();
        assert!(matches!(tokens[0].kind, TokenKind::Simulate));
    }

    #[test]
    fn test_fstring() {
        let mut lexer = Lexer::new("f\"Energy: {e:.6f}\"");
        let tokens = lexer.tokenize().unwrap();
        assert!(matches!(&tokens[0].kind, TokenKind::FStringLit(s) if s.contains("Energy")));
    }

    #[test]
    fn test_pipeline_operator() {
        let mut lexer = Lexer::new("x |> f |> g");
        let tokens = lexer.tokenize().unwrap();
        assert!(matches!(tokens[1].kind, TokenKind::Pipeline));
    }

    #[test]
    fn test_scientific_notation() {
        let mut lexer = Lexer::new("6.022e23");
        let tokens = lexer.tokenize().unwrap();
        assert!(matches!(tokens[0].kind, TokenKind::FloatLit(v) if (v - 6.022e23).abs() < 1e18));
    }
}
