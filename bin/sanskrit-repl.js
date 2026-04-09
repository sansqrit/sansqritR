#!/usr/bin/env node
/**
 * bin/sanskrit-repl.js — Sanskrit DSL Interactive REPL
 *
 * Usage:
 *   node bin/sanskrit-repl.js              # interactive mode
 *   node bin/sanskrit-repl.js file.sq      # run a .sq file
 *   node bin/sanskrit-repl.js -e "code"    # eval inline code
 *   SANSKRIT_NO_COLOR=1 node bin/sanskrit-repl.js  # disable colours
 *
 * REPL commands:
 *   .help       show this help
 *   .clear      reset interpreter state
 *   .history    show command history
 *   .load file  load and run a .sq file
 *   .save file  save session history to file
 *   .blocks     list all available DSL blocks
 *   .quit / .exit
 */

import readline  from 'readline';
import fs        from 'fs';
import path      from 'path';
import { fileURLToPath } from 'url';

import { SanskritInterpreter } from '../src/dsl/interpreter.js';
import { buildStdlib }         from '../src/dsl/stdlib.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Colour helpers ────────────────────────────────────────────────
const NO_COLOR = process.env.SANSKRIT_NO_COLOR || !process.stdout.isTTY;
const C = {
  reset:  NO_COLOR ? '' : '\x1b[0m',
  bold:   NO_COLOR ? '' : '\x1b[1m',
  dim:    NO_COLOR ? '' : '\x1b[2m',
  cyan:   NO_COLOR ? '' : '\x1b[36m',
  green:  NO_COLOR ? '' : '\x1b[32m',
  yellow: NO_COLOR ? '' : '\x1b[33m',
  red:    NO_COLOR ? '' : '\x1b[31m',
  blue:   NO_COLOR ? '' : '\x1b[34m',
  magenta:NO_COLOR ? '' : '\x1b[35m',
  gray:   NO_COLOR ? '' : '\x1b[90m',
};
const paint = (color, s) => `${C[color]}${s}${C.reset}`;

// ── Banner ────────────────────────────────────────────────────────
function printBanner() {
  if (NO_COLOR) {
    console.log('Sanskrit DSL REPL v3.0');
    console.log('Type .help for commands, .quit to exit');
    return;
  }
  console.log('');
  console.log(paint('cyan', paint('bold', '  ╔══════════════════════════════════════╗')));
  console.log(paint('cyan', paint('bold', '  ║     Sanskrit DSL REPL  v3.0          ║')));
  console.log(paint('cyan', paint('bold', '  ╚══════════════════════════════════════╝')));
  console.log('');
  console.log(paint('gray',  '  Quantum + Classical + Scientific DSL'));
  console.log(paint('gray',  '  Type .help for commands | .quit to exit'));
  console.log('');
}

// ── Interpreter factory ───────────────────────────────────────────
function makeInterpreter() {
  const interp = new SanskritInterpreter({
    output: text => {
      process.stdout.write(paint('green', '  ') + text + '\n');
    },
    onGate: d => {
      process.stdout.write(
        paint('magenta', '  ⟨gate⟩ ') +
        paint('bold', d.gate) +
        paint('gray', '(' + (d.args||[]).join(', ') + ')') + '\n'
      );
    },
    onMeasure: d => {
      const r = d.result || d;
      process.stdout.write(
        paint('yellow', '  ⟨measure⟩ ') +
        paint('bold', JSON.stringify(r).slice(0, 80)) + '\n'
      );
    },
    onState: d => {
      if (d.type === 'register') {
        process.stdout.write(
          paint('blue', `  ⟨register⟩ "${d.name}" ${d.nQ} qubits\n`)
        );
      }
    },
    onLog: e => {
      // Only show non-trivial logs in REPL
      const text = String(e.text || e.m || '');
      if (text.startsWith('LET ') || text.startsWith('DEF ') ||
          text.startsWith('STRUCT ') || text.startsWith('ENUM ') ||
          text.startsWith('IMPORT ') || text.startsWith('GLOBAL ') ||
          text.startsWith('REGISTER') || text.startsWith('GATE:') ||
          text.startsWith('MEASURE') || text.startsWith('CIRCUIT') ||
          text.startsWith('MOLECULE')) {
        process.stdout.write(paint('gray', `  ${text}\n`));
      }
    },
  });
  buildStdlib(interp);
  return interp;
}

// ── REPL state ────────────────────────────────────────────────────
let interp      = makeInterpreter();
let history     = [];
let buffer      = '';       // multi-line buffer
let lineCount   = 0;

// ── Detect multi-line (block open without close) ──────────────────
function isIncomplete(code) {
  // Count unmatched colons/braces at end — simple heuristic
  const lines = code.trimEnd().split('\n');
  const last  = lines[lines.length - 1].trimEnd();
  if (last.endsWith(':') || last.endsWith('{')) return true;
  // Check brace balance
  let depth = 0;
  for (const ch of code) { if (ch==='{') depth++; else if (ch==='}') depth--; }
  return depth > 0;
}

// ── Execute code ──────────────────────────────────────────────────
async function execute(code) {
  const t0 = Date.now();
  try {
    await interp.run(code);
    const ms = Date.now() - t0;
    if (ms > 10) {
      process.stdout.write(paint('gray', `  ⏱ ${ms}ms\n`));
    }
    return true;
  } catch (e) {
    const msg = e.message || String(e);
    process.stdout.write(paint('red', '  ✗ ') + paint('bold', msg) + '\n');
    return false;
  }
}

// ── REPL commands ─────────────────────────────────────────────────
const COMMANDS = {
  '.help': () => {
    console.log('');
    const cmds = [
      ['.help',        'show this help'],
      ['.clear',       'reset interpreter (clear all variables)'],
      ['.history',     'show command history'],
      ['.load <file>', 'load and run a .sq file'],
      ['.save <file>', 'save session history to file'],
      ['.blocks',      'list available DSL block categories'],
      ['.quit / .exit','exit the REPL'],
    ];
    for (const [cmd, desc] of cmds) {
      console.log('  ' + paint('cyan', cmd.padEnd(20)) + paint('gray', desc));
    }
    console.log('');
    console.log(paint('gray', '  Multi-line: end line with : or { to continue'));
    console.log(paint('gray', '  Empty line:  execute buffered multi-line block'));
    console.log('');
  },

  '.clear': () => {
    interp = makeInterpreter();
    buffer = '';
    console.log(paint('yellow', '  Interpreter reset ✓'));
  },

  '.history': () => {
    if (!history.length) { console.log(paint('gray', '  No history yet')); return; }
    history.forEach((h, i) => {
      console.log(paint('gray', `  ${String(i+1).padStart(3)}  `) + h.split('\n')[0]);
    });
  },

  '.blocks': () => {
    try {
      // Try to load block registry
      const regPath = path.join(__dirname, '../src/blocks/registry.js');
      if (fs.existsSync(regPath)) {
        import(regPath).then(({ CATEGORIES }) => {
          console.log('');
          for (const [cat, info] of Object.entries(CATEGORIES||{})) {
            console.log('  ' + paint('cyan', cat.padEnd(20)) + paint('gray', info?.description || ''));
          }
          console.log('');
        }).catch(() => console.log(paint('gray', '  Block registry not loaded')));
      } else {
        console.log(paint('gray', '  Block registry not found'));
      }
    } catch { console.log(paint('gray', '  Block registry unavailable')); }
  },
};

async function handleCommand(line) {
  const parts = line.trim().split(/\s+/);
  const cmd   = parts[0];
  const arg   = parts.slice(1).join(' ');

  if (cmd === '.quit' || cmd === '.exit') {
    console.log(paint('cyan', '\n  Goodbye! 🙏\n'));
    process.exit(0);
  }

  if (cmd === '.load') {
    if (!arg) { console.log(paint('red', '  Usage: .load <file.sq>')); return; }
    const fp = path.resolve(arg);
    if (!fs.existsSync(fp)) { console.log(paint('red', `  File not found: ${fp}`)); return; }
    const code = fs.readFileSync(fp, 'utf8');
    console.log(paint('gray', `  Loading ${fp}...`));
    await execute(code);
    return;
  }

  if (cmd === '.save') {
    if (!arg) { console.log(paint('red', '  Usage: .save <file.sq>')); return; }
    const fp = path.resolve(arg);
    fs.writeFileSync(fp, history.join('\n') + '\n', 'utf8');
    console.log(paint('green', `  Saved ${history.length} lines to ${fp}`));
    return;
  }

  if (COMMANDS[cmd]) { COMMANDS[cmd](); return; }

  console.log(paint('red', `  Unknown command: ${cmd}`) + paint('gray', ' (try .help)'));
}

// ── Prompt ────────────────────────────────────────────────────────
function getPrompt() {
  if (buffer) return paint('yellow', '  ... ');
  return paint('cyan', paint('bold', '   sanskrit> '));
}

// ── Main entry ────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);

  // Run file: node bin/sanskrit-repl.js file.sq
  if (args.length && !args[0].startsWith('-')) {
    const fp = path.resolve(args[0]);
    if (!fs.existsSync(fp)) {
      console.error(`File not found: ${fp}`);
      process.exit(1);
    }
    const code = fs.readFileSync(fp, 'utf8');
    const ok = await execute(code);
    process.exit(ok ? 0 : 1);
  }

  // Eval inline: node bin/sanskrit-repl.js -e "code"
  if (args[0] === '-e' && args[1]) {
    const ok = await execute(args[1]);
    process.exit(ok ? 0 : 1);
  }

  // Interactive REPL
  printBanner();

  const rl = readline.createInterface({
    input:     process.stdin,
    output:    process.stdout,
    terminal:  true,
    historySize: 200,
    prompt:    getPrompt(),
  });

  rl.setPrompt(getPrompt());
  rl.prompt();

  rl.on('line', async line => {
    lineCount++;

    // REPL command
    if (line.trimStart().startsWith('.')) {
      await handleCommand(line.trim());
      rl.setPrompt(getPrompt());
      rl.prompt();
      return;
    }

    // Empty line — flush multi-line buffer
    if (!line.trim() && buffer) {
      const code = buffer;
      history.push(code);
      buffer = '';
      await execute(code);
      rl.setPrompt(getPrompt());
      rl.prompt();
      return;
    }

    // Skip blank lines when not in buffer
    if (!line.trim() && !buffer) {
      rl.prompt();
      return;
    }

    // Accumulate multi-line
    buffer = buffer ? buffer + '\n' + line : line;

    if (isIncomplete(buffer)) {
      // Continue multi-line input
      rl.setPrompt(getPrompt());
      rl.prompt();
      return;
    }

    // Execute
    const code = buffer;
    history.push(code);
    buffer = '';

    await execute(code);

    rl.setPrompt(getPrompt());
    rl.prompt();
  });

  rl.on('close', () => {
    console.log(paint('cyan', '\n  Goodbye! 🙏\n'));
    process.exit(0);
  });

  // Ctrl+C clears buffer or exits
  rl.on('SIGINT', () => {
    if (buffer) {
      buffer = '';
      process.stdout.write(paint('yellow', '^C (buffer cleared)\n'));
    } else {
      console.log(paint('cyan', '\n  Goodbye! 🙏\n'));
      process.exit(0);
    }
    rl.setPrompt(getPrompt());
    rl.prompt();
  });
}

main().catch(e => { console.error(e); process.exit(1); });
