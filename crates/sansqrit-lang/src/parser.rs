//! Parser for the Sansqrit DSL.
//!
//! Transforms a stream of tokens into an AST.
//! Uses recursive descent parsing with operator precedence climbing.

use crate::ast::*;
use crate::lexer::*;

pub struct Parser {
    tokens: Vec<Token>,
    pos: usize,
}

impl Parser {
    pub fn new(tokens: Vec<Token>) -> Self {
        Parser { tokens, pos: 0 }
    }

    pub fn parse_program(&mut self) -> Result<Program, ParseError> {
        let mut statements = Vec::new();
        self.skip_newlines();
        while !self.at_end() {
            let stmt = self.parse_statement()?;
            statements.push(stmt);
            self.skip_newlines();
        }
        Ok(Program { statements })
    }

    // ─── Helpers ──────────────────────────────────────────────────

    fn peek(&self) -> &TokenKind {
        self.tokens.get(self.pos).map(|t| &t.kind).unwrap_or(&TokenKind::Eof)
    }

    fn span(&self) -> Span {
        self.tokens.get(self.pos).map(|t| t.span).unwrap_or(Span { line: 0, col: 0, offset: 0 })
    }

    fn advance(&mut self) -> &Token {
        let tok = &self.tokens[self.pos];
        if self.pos < self.tokens.len() - 1 { self.pos += 1; }
        tok
    }

    fn at_end(&self) -> bool {
        matches!(self.peek(), TokenKind::Eof)
    }

    fn expect(&mut self, kind: &TokenKind) -> Result<&Token, ParseError> {
        if std::mem::discriminant(self.peek()) == std::mem::discriminant(kind) {
            Ok(self.advance())
        } else {
            Err(ParseError {
                msg: format!("Expected {:?}, got {:?}", kind, self.peek()),
                span: self.span(),
            })
        }
    }

    fn skip_newlines(&mut self) {
        while matches!(self.peek(), TokenKind::Newline | TokenKind::Semicolon) {
            self.advance();
        }
    }

    fn check(&self, kind: &TokenKind) -> bool {
        std::mem::discriminant(self.peek()) == std::mem::discriminant(kind)
    }

    fn match_token(&mut self, kind: &TokenKind) -> bool {
        if self.check(kind) {
            self.advance();
            true
        } else {
            false
        }
    }

    // ─── Statement Parsing ────────────────────────────────────────

    fn parse_statement(&mut self) -> Result<Stmt, ParseError> {
        self.skip_newlines();
        let span = self.span();

        match self.peek().clone() {
            TokenKind::Let | TokenKind::Const => self.parse_let_decl(),
            TokenKind::Fn => self.parse_fn_decl(vec![]),
            TokenKind::Class => self.parse_class_decl(),
            TokenKind::Struct => self.parse_struct_decl(),
            TokenKind::Import => self.parse_import(),
            TokenKind::If => self.parse_if(),
            TokenKind::For => self.parse_for(),
            TokenKind::While => self.parse_while(),
            TokenKind::Loop => self.parse_loop(),
            TokenKind::Return => self.parse_return(),
            TokenKind::Break => { self.advance(); Ok(Stmt::Break { span }) },
            TokenKind::Continue => { self.advance(); Ok(Stmt::Continue { span }) },
            TokenKind::Match => self.parse_match(),
            TokenKind::Simulate => self.parse_simulate(),
            TokenKind::Quantum => self.parse_quantum_block(),
            TokenKind::Classical => self.parse_classical_block(),
            TokenKind::Circuit => self.parse_circuit_decl(),
            TokenKind::Molecule => self.parse_molecule_decl(),
            TokenKind::Try => self.parse_try_catch(),
            TokenKind::Raise => self.parse_raise(),
            TokenKind::At => self.parse_decorator(),
            TokenKind::Yield => self.parse_yield(),
            _ => self.parse_expr_or_assign(),
        }
    }

    fn parse_let_decl(&mut self) -> Result<Stmt, ParseError> {
        let span = self.span();
        let mutable = matches!(self.peek(), TokenKind::Let);
        self.advance(); // skip let/const

        let name = self.parse_ident_name()?;
        let type_ann = if self.match_token(&TokenKind::Colon) {
            Some(self.parse_ident_name()?)
        } else { None };

        let value = if self.match_token(&TokenKind::Assign) {
            Some(self.parse_expr()?)
        } else { None };

        Ok(Stmt::LetDecl { name, mutable, type_ann, value, span })
    }

    fn parse_fn_decl(&mut self, decorators: Vec<String>) -> Result<Stmt, ParseError> {
        let span = self.span();
        self.advance(); // skip 'fn'
        let name = self.parse_ident_name()?;
        self.expect(&TokenKind::LParen)?;
        let params = self.parse_params()?;
        self.expect(&TokenKind::RParen)?;

        let return_type = if self.match_token(&TokenKind::Arrow) {
            Some(self.parse_type_name()?)
        } else { None };

        self.expect(&TokenKind::LBrace)?;
        let body = self.parse_block()?;
        self.expect(&TokenKind::RBrace)?;

        Ok(Stmt::FnDecl { name, params, return_type, body, decorators, span })
    }

    fn parse_params(&mut self) -> Result<Vec<Param>, ParseError> {
        let mut params = Vec::new();
        while !self.check(&TokenKind::RParen) && !self.at_end() {
            let name = self.parse_ident_name()?;
            let type_ann = if self.match_token(&TokenKind::Colon) {
                Some(self.parse_ident_name()?)
            } else { None };
            let default = if self.match_token(&TokenKind::Assign) {
                Some(self.parse_expr()?)
            } else { None };
            params.push(Param { name, type_ann, default });
            if !self.match_token(&TokenKind::Comma) { break; }
        }
        Ok(params)
    }

    fn parse_class_decl(&mut self) -> Result<Stmt, ParseError> {
        let span = self.span();
        self.advance(); // skip 'class'
        let name = self.parse_ident_name()?;
        let parent = if self.match_token(&TokenKind::Extends) {
            Some(self.parse_ident_name()?)
        } else { None };

        self.expect(&TokenKind::LBrace)?;
        self.skip_newlines();
        let mut fields = Vec::new();
        let mut methods = Vec::new();

        while !self.check(&TokenKind::RBrace) && !self.at_end() {
            self.skip_newlines();
            if self.check(&TokenKind::Fn) {
                methods.push(self.parse_fn_decl(vec![])?);
            } else if matches!(self.peek(), TokenKind::Ident(_)) {
                let fname = self.parse_ident_name()?;
                let type_ann = if self.match_token(&TokenKind::Colon) {
                    Some(self.parse_ident_name()?)
                } else { None };
                let default = if self.match_token(&TokenKind::Assign) {
                    Some(self.parse_expr()?)
                } else { None };
                fields.push(Field { name: fname, type_ann, default });
                self.match_token(&TokenKind::Comma);
            } else {
                break;
            }
            self.skip_newlines();
        }
        self.expect(&TokenKind::RBrace)?;
        Ok(Stmt::ClassDecl { name, parent, fields, methods, span })
    }

    fn parse_struct_decl(&mut self) -> Result<Stmt, ParseError> {
        let span = self.span();
        self.advance(); // skip 'struct'
        let name = self.parse_ident_name()?;
        self.expect(&TokenKind::LBrace)?;
        self.skip_newlines();
        let mut fields = Vec::new();
        let mut methods = Vec::new();

        while !self.check(&TokenKind::RBrace) && !self.at_end() {
            self.skip_newlines();
            if self.check(&TokenKind::Fn) {
                methods.push(self.parse_fn_decl(vec![])?);
            } else if matches!(self.peek(), TokenKind::Ident(_)) {
                let fname = self.parse_ident_name()?;
                self.expect(&TokenKind::Colon)?;
                let type_ann = Some(self.parse_ident_name()?);
                let default = if self.match_token(&TokenKind::Assign) {
                    Some(self.parse_expr()?)
                } else { None };
                fields.push(Field { name: fname, type_ann, default });
                self.match_token(&TokenKind::Comma);
            } else { break; }
            self.skip_newlines();
        }
        self.expect(&TokenKind::RBrace)?;
        Ok(Stmt::StructDecl { name, fields, methods, span })
    }

    fn parse_import(&mut self) -> Result<Stmt, ParseError> {
        let span = self.span();
        self.advance(); // skip 'import'
        let mut module = vec![self.parse_ident_name()?];
        while self.match_token(&TokenKind::Dot) {
            module.push(self.parse_ident_name()?);
        }
        let alias = if self.match_token(&TokenKind::As) {
            Some(self.parse_ident_name()?)
        } else { None };
        Ok(Stmt::Import { module, alias, span })
    }

    fn parse_if(&mut self) -> Result<Stmt, ParseError> {
        let span = self.span();
        self.advance(); // skip 'if'
        let condition = self.parse_expr()?;
        self.expect(&TokenKind::LBrace)?;
        let then_body = self.parse_block()?;
        self.expect(&TokenKind::RBrace)?;

        let mut elifs = Vec::new();
        let mut else_body = None;

        self.skip_newlines();
        while self.match_token(&TokenKind::Else) {
            self.skip_newlines();
            if self.match_token(&TokenKind::If) {
                let cond = self.parse_expr()?;
                self.expect(&TokenKind::LBrace)?;
                let body = self.parse_block()?;
                self.expect(&TokenKind::RBrace)?;
                elifs.push((cond, body));
                self.skip_newlines();
            } else {
                self.expect(&TokenKind::LBrace)?;
                else_body = Some(self.parse_block()?);
                self.expect(&TokenKind::RBrace)?;
                break;
            }
        }

        Ok(Stmt::If { condition, then_body, elifs, else_body, span })
    }

    fn parse_for(&mut self) -> Result<Stmt, ParseError> {
        let span = self.span();
        self.advance(); // skip 'for'
        let var = self.parse_ident_name()?;
        self.expect(&TokenKind::In)?;
        let iter = self.parse_expr()?;
        self.expect(&TokenKind::LBrace)?;
        let body = self.parse_block()?;
        self.expect(&TokenKind::RBrace)?;
        Ok(Stmt::For { var, iter, body, span })
    }

    fn parse_while(&mut self) -> Result<Stmt, ParseError> {
        let span = self.span();
        self.advance(); // skip 'while'
        let condition = self.parse_expr()?;
        self.expect(&TokenKind::LBrace)?;
        let body = self.parse_block()?;
        self.expect(&TokenKind::RBrace)?;
        Ok(Stmt::While { condition, body, span })
    }

    fn parse_loop(&mut self) -> Result<Stmt, ParseError> {
        let span = self.span();
        self.advance();
        self.expect(&TokenKind::LBrace)?;
        let body = self.parse_block()?;
        self.expect(&TokenKind::RBrace)?;
        Ok(Stmt::Loop { body, span })
    }

    fn parse_return(&mut self) -> Result<Stmt, ParseError> {
        let span = self.span();
        self.advance();
        let value = if !self.check(&TokenKind::Newline) && !self.check(&TokenKind::RBrace) && !self.at_end() {
            Some(self.parse_expr()?)
        } else { None };
        Ok(Stmt::Return { value, span })
    }

    fn parse_yield(&mut self) -> Result<Stmt, ParseError> {
        let span = self.span();
        self.advance();
        let value = self.parse_expr()?;
        Ok(Stmt::Yield { value, span })
    }

    fn parse_match(&mut self) -> Result<Stmt, ParseError> {
        let span = self.span();
        self.advance(); // skip 'match'
        let expr = self.parse_expr()?;
        self.expect(&TokenKind::LBrace)?;
        self.skip_newlines();

        let mut arms = Vec::new();
        while !self.check(&TokenKind::RBrace) && !self.at_end() {
            self.skip_newlines();
            let pattern = self.parse_pattern()?;
            self.expect(&TokenKind::FatArrow)?;
            let stmt = self.parse_statement()?;
            self.match_token(&TokenKind::Comma);
            arms.push(MatchArm { pattern, body: vec![stmt] });
            self.skip_newlines();
        }
        self.expect(&TokenKind::RBrace)?;
        Ok(Stmt::Match { expr, arms, span })
    }

    fn parse_pattern(&mut self) -> Result<Pattern, ParseError> {
        match self.peek().clone() {
            TokenKind::Ident(ref s) if s == "_" => {
                self.advance();
                Ok(Pattern::Wildcard)
            }
            TokenKind::Ident(_) => {
                let name = self.parse_ident_name()?;
                Ok(Pattern::Ident(name))
            }
            _ => {
                let expr = self.parse_expr()?;
                Ok(Pattern::Literal(expr))
            }
        }
    }

    fn parse_simulate(&mut self) -> Result<Stmt, ParseError> {
        let span = self.span();
        self.advance(); // skip 'simulate'

        let engine = if self.match_token(&TokenKind::LParen) {
            // simulate(engine="chunked")
            let mut eng = None;
            while !self.check(&TokenKind::RParen) {
                let _key = self.parse_ident_name()?;
                self.expect(&TokenKind::Assign)?;
                if let TokenKind::StringLit(s) = self.peek().clone() {
                    eng = Some(s);
                    self.advance();
                }
                self.match_token(&TokenKind::Comma);
            }
            self.expect(&TokenKind::RParen)?;
            eng
        } else { None };

        self.expect(&TokenKind::LBrace)?;
        let body = self.parse_block()?;
        self.expect(&TokenKind::RBrace)?;
        Ok(Stmt::Simulate { engine, body, span })
    }

    fn parse_quantum_block(&mut self) -> Result<Stmt, ParseError> {
        let span = self.span();
        self.advance();
        self.expect(&TokenKind::LBrace)?;
        let body = self.parse_block()?;
        self.expect(&TokenKind::RBrace)?;
        Ok(Stmt::QuantumBlock { body, span })
    }

    fn parse_classical_block(&mut self) -> Result<Stmt, ParseError> {
        let span = self.span();
        self.advance();
        self.expect(&TokenKind::LBrace)?;
        let body = self.parse_block()?;
        self.expect(&TokenKind::RBrace)?;
        Ok(Stmt::ClassicalBlock { body, span })
    }

    fn parse_circuit_decl(&mut self) -> Result<Stmt, ParseError> {
        let span = self.span();
        self.advance();
        let name = self.parse_ident_name()?;
        self.expect(&TokenKind::LBrace)?;
        let body = self.parse_block()?;
        self.expect(&TokenKind::RBrace)?;
        Ok(Stmt::CircuitDecl { name, body, span })
    }

    fn parse_molecule_decl(&mut self) -> Result<Stmt, ParseError> {
        let span = self.span();
        self.advance();
        let name = self.parse_ident_name()?;
        self.expect(&TokenKind::LBrace)?;
        self.skip_newlines();
        let mut fields = Vec::new();
        while !self.check(&TokenKind::RBrace) && !self.at_end() {
            self.skip_newlines();
            let key = self.parse_ident_name()?;
            self.expect(&TokenKind::Colon)?;
            let val = self.parse_expr()?;
            fields.push((key, val));
            self.match_token(&TokenKind::Comma);
            self.skip_newlines();
        }
        self.expect(&TokenKind::RBrace)?;
        Ok(Stmt::MoleculeDecl { name, fields, span })
    }

    fn parse_try_catch(&mut self) -> Result<Stmt, ParseError> {
        let span = self.span();
        self.advance(); // skip 'try'
        self.expect(&TokenKind::LBrace)?;
        let try_body = self.parse_block()?;
        self.expect(&TokenKind::RBrace)?;

        let mut catches = Vec::new();
        self.skip_newlines();
        while self.match_token(&TokenKind::Catch) {
            let exception_type = if matches!(self.peek(), TokenKind::Ident(_)) {
                let name = self.parse_ident_name()?;
                if name == "_" { None } else { Some(name) }
            } else { None };
            let var_name = if self.match_token(&TokenKind::As) {
                Some(self.parse_ident_name()?)
            } else { None };
            self.expect(&TokenKind::LBrace)?;
            let body = self.parse_block()?;
            self.expect(&TokenKind::RBrace)?;
            catches.push(CatchClause { exception_type, var_name, body });
            self.skip_newlines();
        }

        let finally_body = if self.match_token(&TokenKind::Finally) {
            self.expect(&TokenKind::LBrace)?;
            let body = self.parse_block()?;
            self.expect(&TokenKind::RBrace)?;
            Some(body)
        } else { None };

        Ok(Stmt::TryCatch { try_body, catches, finally_body, span })
    }

    fn parse_raise(&mut self) -> Result<Stmt, ParseError> {
        let span = self.span();
        self.advance();
        let expr = self.parse_expr()?;
        Ok(Stmt::Raise { expr, span })
    }

    fn parse_decorator(&mut self) -> Result<Stmt, ParseError> {
        let span = self.span();
        self.advance(); // skip '@'
        let name = self.parse_ident_name()?;
        let mut args = Vec::new();
        if self.match_token(&TokenKind::LParen) {
            while !self.check(&TokenKind::RParen) {
                args.push(self.parse_expr()?);
                self.match_token(&TokenKind::Comma);
            }
            self.expect(&TokenKind::RParen)?;
        }
        self.skip_newlines();
        // The next statement is the decorated function
        if self.check(&TokenKind::Fn) {
            self.parse_fn_decl(vec![name])
        } else {
            Ok(Stmt::Decorator { name, args, span })
        }
    }

    fn parse_expr_or_assign(&mut self) -> Result<Stmt, ParseError> {
        let span = self.span();
        let expr = self.parse_expr()?;

        let op = match self.peek() {
            TokenKind::Assign => { self.advance(); Some(AssignOp::Assign) },
            TokenKind::PlusAssign => { self.advance(); Some(AssignOp::AddAssign) },
            TokenKind::MinusAssign => { self.advance(); Some(AssignOp::SubAssign) },
            TokenKind::StarAssign => { self.advance(); Some(AssignOp::MulAssign) },
            TokenKind::SlashAssign => { self.advance(); Some(AssignOp::DivAssign) },
            _ => None,
        };

        if let Some(op) = op {
            let value = self.parse_expr()?;
            Ok(Stmt::Assign { target: expr, op, value, span })
        } else {
            Ok(Stmt::ExprStmt { expr, span })
        }
    }

    fn parse_block(&mut self) -> Result<Vec<Stmt>, ParseError> {
        let mut stmts = Vec::new();
        self.skip_newlines();
        while !self.check(&TokenKind::RBrace) && !self.at_end() {
            stmts.push(self.parse_statement()?);
            self.skip_newlines();
        }
        Ok(stmts)
    }

    // ─── Expression Parsing (Precedence Climbing) ─────────────────

    fn parse_expr(&mut self) -> Result<Expr, ParseError> {
        self.parse_pipeline()
    }

    fn parse_pipeline(&mut self) -> Result<Expr, ParseError> {
        let mut left = self.parse_or()?;
        while self.match_token(&TokenKind::Pipeline) {
            let span = self.span();
            let right = self.parse_or()?;
            left = Expr::Pipeline { left: Box::new(left), right: Box::new(right), span };
        }
        Ok(left)
    }

    fn parse_or(&mut self) -> Result<Expr, ParseError> {
        let mut left = self.parse_and()?;
        while self.match_token(&TokenKind::Or) {
            let span = self.span();
            let right = self.parse_and()?;
            left = Expr::BinOp { left: Box::new(left), op: BinOp::Or, right: Box::new(right), span };
        }
        Ok(left)
    }

    fn parse_and(&mut self) -> Result<Expr, ParseError> {
        let mut left = self.parse_not()?;
        while self.match_token(&TokenKind::And) {
            let span = self.span();
            let right = self.parse_not()?;
            left = Expr::BinOp { left: Box::new(left), op: BinOp::And, right: Box::new(right), span };
        }
        Ok(left)
    }

    fn parse_not(&mut self) -> Result<Expr, ParseError> {
        if self.match_token(&TokenKind::Not) {
            let span = self.span();
            let operand = self.parse_comparison()?;
            Ok(Expr::UnaryOp { op: UnaryOp::Not, operand: Box::new(operand), span })
        } else {
            self.parse_comparison()
        }
    }

    fn parse_comparison(&mut self) -> Result<Expr, ParseError> {
        let mut left = self.parse_addition()?;
        loop {
            let (op, matched) = match self.peek() {
                TokenKind::Eq => (BinOp::Eq, true),
                TokenKind::NotEq => (BinOp::NotEq, true),
                TokenKind::Lt => (BinOp::Lt, true),
                TokenKind::Gt => (BinOp::Gt, true),
                TokenKind::LtEq => (BinOp::LtEq, true),
                TokenKind::GtEq => (BinOp::GtEq, true),
                TokenKind::In => (BinOp::In, true),
                _ => (BinOp::Eq, false),
            };
            if !matched { break; }
            self.advance();
            let span = self.span();
            let right = self.parse_addition()?;
            left = Expr::BinOp { left: Box::new(left), op, right: Box::new(right), span };
        }
        Ok(left)
    }

    fn parse_addition(&mut self) -> Result<Expr, ParseError> {
        let mut left = self.parse_multiplication()?;
        loop {
            let (op, matched) = match self.peek() {
                TokenKind::Plus => (BinOp::Add, true),
                TokenKind::Minus => (BinOp::Sub, true),
                _ => (BinOp::Add, false),
            };
            if !matched { break; }
            self.advance();
            let span = self.span();
            let right = self.parse_multiplication()?;
            left = Expr::BinOp { left: Box::new(left), op, right: Box::new(right), span };
        }
        Ok(left)
    }

    fn parse_multiplication(&mut self) -> Result<Expr, ParseError> {
        let mut left = self.parse_power()?;
        loop {
            let (op, matched) = match self.peek() {
                TokenKind::Star => (BinOp::Mul, true),
                TokenKind::Slash => (BinOp::Div, true),
                TokenKind::DoubleSlash => (BinOp::IntDiv, true),
                TokenKind::Percent => (BinOp::Mod, true),
                _ => (BinOp::Mul, false),
            };
            if !matched { break; }
            self.advance();
            let span = self.span();
            let right = self.parse_power()?;
            left = Expr::BinOp { left: Box::new(left), op, right: Box::new(right), span };
        }
        Ok(left)
    }

    fn parse_power(&mut self) -> Result<Expr, ParseError> {
        let left = self.parse_unary()?;
        if self.match_token(&TokenKind::DoubleStar) {
            let span = self.span();
            let right = self.parse_unary()?;
            Ok(Expr::BinOp { left: Box::new(left), op: BinOp::Pow, right: Box::new(right), span })
        } else {
            Ok(left)
        }
    }

    fn parse_unary(&mut self) -> Result<Expr, ParseError> {
        if self.match_token(&TokenKind::Minus) {
            let span = self.span();
            let operand = self.parse_postfix()?;
            Ok(Expr::UnaryOp { op: UnaryOp::Neg, operand: Box::new(operand), span })
        } else {
            self.parse_postfix()
        }
    }

    fn parse_postfix(&mut self) -> Result<Expr, ParseError> {
        let mut expr = self.parse_primary()?;
        loop {
            match self.peek() {
                TokenKind::LParen => {
                    self.advance();
                    let args = self.parse_call_args()?;
                    let span = self.span();
                    self.expect(&TokenKind::RParen)?;
                    expr = Expr::Call { callee: Box::new(expr), args, span };
                }
                TokenKind::LBracket => {
                    self.advance();
                    let span = self.span();
                    let index = self.parse_expr()?;
                    self.expect(&TokenKind::RBracket)?;
                    expr = Expr::Index { object: Box::new(expr), index: Box::new(index), span };
                }
                TokenKind::Dot => {
                    self.advance();
                    let span = self.span();
                    let field = self.parse_ident_name()?;
                    if self.check(&TokenKind::LParen) {
                        self.advance();
                        let args = self.parse_call_args()?;
                        self.expect(&TokenKind::RParen)?;
                        expr = Expr::MethodCall { object: Box::new(expr), method: field, args, span };
                    } else {
                        expr = Expr::FieldAccess { object: Box::new(expr), field, span };
                    }
                }
                TokenKind::ColonColon => {
                    self.advance();
                    let span = self.span();
                    let method = self.parse_ident_name()?;
                    if let Expr::Ident(base, _) = &expr {
                        expr = Expr::ScopeResolution { path: vec![base.clone(), method], span };
                    }
                }
                _ => break,
            }
        }
        Ok(expr)
    }

    fn parse_call_args(&mut self) -> Result<Vec<CallArg>, ParseError> {
        let mut args = Vec::new();
        while !self.check(&TokenKind::RParen) && !self.at_end() {
            // Check for named arg: name=value
            if let TokenKind::Ident(name) = self.peek().clone() {
                let saved = self.pos;
                self.advance();
                if self.match_token(&TokenKind::Assign) {
                    let value = self.parse_expr()?;
                    args.push(CallArg { name: Some(name), value });
                    if !self.match_token(&TokenKind::Comma) { break; }
                    continue;
                }
                self.pos = saved;
            }
            let value = self.parse_expr()?;
            args.push(CallArg { name: None, value });
            if !self.match_token(&TokenKind::Comma) { break; }
        }
        Ok(args)
    }

    fn parse_primary(&mut self) -> Result<Expr, ParseError> {
        let span = self.span();
        match self.peek().clone() {
            TokenKind::IntLit(v) => { self.advance(); Ok(Expr::IntLit(v, span)) }
            TokenKind::FloatLit(v) => { self.advance(); Ok(Expr::FloatLit(v, span)) }
            TokenKind::StringLit(s) => { self.advance(); Ok(Expr::StringLit(s, span)) }
            TokenKind::FStringLit(s) => { self.advance(); Ok(Expr::FStringLit(s, span)) }
            TokenKind::BoolLit(v) => { self.advance(); Ok(Expr::BoolLit(v, span)) }
            TokenKind::NoneLit => { self.advance(); Ok(Expr::NoneLit(span)) }
            TokenKind::Ident(name) => {
                self.advance();
                Ok(Expr::Ident(name, span))
            }
            TokenKind::LParen => {
                self.advance();
                let expr = self.parse_expr()?;
                if self.match_token(&TokenKind::Comma) {
                    // Tuple
                    let mut elements = vec![expr];
                    while !self.check(&TokenKind::RParen) {
                        elements.push(self.parse_expr()?);
                        if !self.match_token(&TokenKind::Comma) { break; }
                    }
                    self.expect(&TokenKind::RParen)?;
                    Ok(Expr::TupleLit(elements, span))
                } else {
                    self.expect(&TokenKind::RParen)?;
                    Ok(expr)
                }
            }
            TokenKind::LBracket => {
                self.advance();
                let mut elements = Vec::new();
                while !self.check(&TokenKind::RBracket) && !self.at_end() {
                    elements.push(self.parse_expr()?);
                    // Check for list comprehension
                    if self.match_token(&TokenKind::For) {
                        let var = self.parse_ident_name()?;
                        self.expect(&TokenKind::In)?;
                        let iter = self.parse_expr()?;
                        let filter = if self.match_token(&TokenKind::If) {
                            Some(Box::new(self.parse_expr()?))
                        } else { None };
                        self.expect(&TokenKind::RBracket)?;
                        return Ok(Expr::ListComp {
                            expr: Box::new(elements.pop().unwrap()),
                            var, iter: Box::new(iter), filter, span
                        });
                    }
                    if !self.match_token(&TokenKind::Comma) { break; }
                }
                self.expect(&TokenKind::RBracket)?;
                Ok(Expr::ListLit(elements, span))
            }
            TokenKind::LBrace => {
                self.advance();
                if self.check(&TokenKind::RBrace) {
                    self.advance();
                    return Ok(Expr::DictLit(vec![], span));
                }
                let first = self.parse_expr()?;
                if self.match_token(&TokenKind::Colon) {
                    // Dict literal
                    let val = self.parse_expr()?;
                    let mut pairs = vec![(first, val)];
                    while self.match_token(&TokenKind::Comma) {
                        if self.check(&TokenKind::RBrace) { break; }
                        let k = self.parse_expr()?;
                        self.expect(&TokenKind::Colon)?;
                        let v = self.parse_expr()?;
                        pairs.push((k, v));
                    }
                    self.expect(&TokenKind::RBrace)?;
                    Ok(Expr::DictLit(pairs, span))
                } else {
                    // Set literal
                    let mut elements = vec![first];
                    while self.match_token(&TokenKind::Comma) {
                        if self.check(&TokenKind::RBrace) { break; }
                        elements.push(self.parse_expr()?);
                    }
                    self.expect(&TokenKind::RBrace)?;
                    Ok(Expr::SetLit(elements, span))
                }
            }
            TokenKind::Fn => {
                // Lambda: fn(x) => x * x
                self.advance();
                self.expect(&TokenKind::LParen)?;
                let params = self.parse_params()?;
                self.expect(&TokenKind::RParen)?;
                self.expect(&TokenKind::FatArrow)?;
                let body = self.parse_expr()?;
                Ok(Expr::Lambda { params, body: Box::new(body), span })
            }
            _ => Err(ParseError {
                msg: format!("Unexpected token: {:?}", self.peek()),
                span: self.span(),
            }),
        }
    }

    fn parse_ident_name(&mut self) -> Result<String, ParseError> {
        match self.peek().clone() {
            TokenKind::Ident(name) => { self.advance(); Ok(name) }
            _ => Err(ParseError {
                msg: format!("Expected identifier, got {:?}", self.peek()),
                span: self.span(),
            }),
        }
    }

    fn parse_type_name(&mut self) -> Result<String, ParseError> {
        let mut name = self.parse_ident_name()?;
        // Handle generic types like list, (float, float)
        if self.check(&TokenKind::LParen) {
            self.advance();
            let mut parts = vec![name.clone()];
            parts.push("(".into());
            while !self.check(&TokenKind::RParen) {
                parts.push(self.parse_ident_name()?);
                if self.match_token(&TokenKind::Comma) {
                    parts.push(",".into());
                }
            }
            self.expect(&TokenKind::RParen)?;
            parts.push(")".into());
            name = parts.join("");
        }
        Ok(name)
    }
}

#[derive(Debug)]
pub struct ParseError {
    pub msg: String,
    pub span: Span,
}

impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Parse error at {}: {}", self.span, self.msg)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(source: &str) -> Result<Program, ParseError> {
        let mut lexer = Lexer::new(source);
        let tokens = lexer.tokenize().unwrap();
        let mut parser = Parser::new(tokens);
        parser.parse_program()
    }

    #[test]
    fn test_let_declaration() {
        let prog = parse("let x = 42").unwrap();
        assert_eq!(prog.statements.len(), 1);
    }

    #[test]
    fn test_function_declaration() {
        let prog = parse("fn greet(name: string) -> string { return f\"Hello\" }").unwrap();
        assert_eq!(prog.statements.len(), 1);
    }

    #[test]
    fn test_simulate_block() {
        let prog = parse("simulate { let q = quantum_register(2) }").unwrap();
        assert_eq!(prog.statements.len(), 1);
    }

    #[test]
    fn test_import() {
        let prog = parse("import chemistry").unwrap();
        assert!(matches!(&prog.statements[0], Stmt::Import { module, .. } if module[0] == "chemistry"));
    }

    #[test]
    fn test_for_loop() {
        let prog = parse("for i in range(10) { print(i) }").unwrap();
        assert_eq!(prog.statements.len(), 1);
    }
}
