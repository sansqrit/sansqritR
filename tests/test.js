/**
 * tests/test.js
 * ─────────────
 * Full test suite for the Sanskrit engine and DSL.
 * Run: node tests/test.js
 */

import { QuantumRegister, QAlgorithms } from '../src/engine/quantum.js';
import { SanskritInterpreter } from '../src/dsl/interpreter.js';

let P=0, F=0;
const ok   = (n)     => { console.log(`  ✓ ${n}`); P++; };
const fail = (n,msg) => { console.error(`  ✗ ${n}: ${msg}`); F++; };

async function test(name, fn) {
  try { const r=await fn(); if(r===false)fail(name,'returned false'); else ok(name); }
  catch(e){ fail(name, e.message.slice(0,100)); }
}

// ═════════════════════════════════════════════════════════════
console.log('═══ Engine Tests ═══');
// ═════════════════════════════════════════════════════════════

await test('Bell state — state vector', async()=>{
  const q=new QuantumRegister('q',2); q.H(0); q.CNOT(0,1);
  const sv=q.statevector();
  if(sv.length!==2) throw new Error(`got ${sv.length} states, expected 2`);
  if(Math.abs(sv[0].prob-0.5)>0.001) throw new Error(`prob=${sv[0].prob}`);
});

await test('Bell state — histogram', async()=>{
  const q=new QuantumRegister('q',2); q.H(0); q.CNOT(0,1);
  const h=q.measureAll(400).histogram;
  if(!Object.keys(h).every(k=>k==='00'||k==='11')) throw new Error(JSON.stringify(h));
  if((h['00']||0)+(h['11']||0)!==400) throw new Error('count mismatch');
});

await test('GHZ 5-qubit', async()=>{
  const q=QAlgorithms.ghz(5); const h=q.measureAll(100).histogram;
  if(!Object.keys(h).every(k=>k==='00000'||k==='11111')) throw new Error(JSON.stringify(h));
});

await test('Ry gate — 50/50 split', async()=>{
  const q=new QuantumRegister('q',1); q.Ry(0,Math.PI/2);
  const h=q.measureAll(400).histogram;
  const p0=(h['0']||0)/400;
  if(Math.abs(p0-0.5)>0.12) throw new Error(`P(0)=${p0.toFixed(3)}, expected ~0.5`);
});

await test('Y gate — complex phase', async()=>{
  const q=new QuantumRegister('q',1); q.Y(0); // Y|0⟩ = i|1⟩ → P(1)=1
  const h=q.measureAll(10).histogram;
  if(!h['1']) throw new Error('Y gate wrong: '+JSON.stringify(h));
});

await test('T gate — complex phase no crash', async()=>{
  const q=new QuantumRegister('q',1); q.H(0); q.T(0); q.H(0);
  const sv=q.statevector(); if(!sv.length) throw new Error('empty SV');
});

await test('Toffoli — intra-shard', async()=>{
  const q=new QuantumRegister('q',4); q.X(0); q.X(1); q.Toffoli(0,1,3);
  if(q.measureQubit(3)!==1) throw new Error('expected 1');
});

await test('Toffoli — cross-shard', async()=>{
  const q=new QuantumRegister('q',12); q.X(0); q.X(1); q.Toffoli(0,1,11);
  if(q.measureQubit(11)!==1) throw new Error('expected 1');
});

await test('Cross-shard CNOT — correlation', async()=>{
  const q=new QuantumRegister('q',12); q.H(9); q.CNOT(9,10);
  const h=q.measureAll(200).histogram;
  if(!Object.keys(h).every(k=>k[9]===k[10])) throw new Error('qubits 9,10 not correlated');
});

await test('QFT 4q — dense output', async()=>{
  const q=new QuantumRegister('q',4); q.X(0); q.qft(4);
  const sv=q.statevector(); if(sv.length<4) throw new Error(`only ${sv.length} states`);
});

await test('expectation_z — |+⟩ state', async()=>{
  const q=new QuantumRegister('q',1); q.H(0);
  const ev=q.expectation_z(0); if(Math.abs(ev)>0.1) throw new Error(`ev=${ev.toFixed(4)}`);
});

await test('Grover 4q — finds target 7', async()=>{
  const r=QAlgorithms.grover(4,[7],600);
  if(!r.histogram['0111']) throw new Error('target 0111 not found');
});

await test('Multi-shot probabilities', async()=>{
  const q=new QuantumRegister('q',1); q.H(0);
  const probs=q.probabilities();
  if(Math.abs((probs['0']||0)-0.5)>0.001) throw new Error(JSON.stringify(probs));
});

// ═════════════════════════════════════════════════════════════
console.log('\n═══ DSL Tests ═══');
// ═════════════════════════════════════════════════════════════

const logs=[];
const I=new SanskritInterpreter({output:m=>logs.push(m)});

async function dsl(name, code, expected) {
  logs.length=0; I._env=[{}]; I.registers={};
  try {
    await I.run(code);
    const pass = expected===null ? true :
                 Array.isArray(expected) ? expected.every(e=>logs.includes(e)) :
                 logs.includes(expected);
    if(pass) ok(name);
    else fail(name, `got:${JSON.stringify(logs).slice(0,100)} want:"${expected}"`);
  } catch(e){ fail(name, e.message.slice(0,100)); }
}

await dsl('assignment + arithmetic',   'x=5\ny=x*2\nprint(y)',              '10');
await dsl('f-string .4f',              'e=-1.137275\nprint(f"E:{e:.4f}")',   'E:-1.1373');
await dsl('f-string .2f',             'x=3.14159\nprint(f"pi={x:.2f}")',    'pi=3.14');
await dsl('f-string string var',       'n="World"\nprint(f"Hello {n}")',     'Hello World');
await dsl('if/elif/else',
  'x=7\nif x>10:\n    print("big")\nelif x>5:\n    print("mid")\nelse:\n    print("small")',
  'mid');
await dsl('for loop — Python indent',
  'total=0\nfor i in range(5):\n    total+=i\nprint(total)',                 '10');
await dsl('for loop — brace syntax',
  's=0\nfor i in range(1,5) { s+=i }\nprint(s)',                            '10');
await dsl('for loop — list',
  's=0\nfor x in [1,2,3,4]:\n    s+=x\nprint(s)',                           '10');
await dsl('while loop',
  'n=1\nwhile n<16:\n    n=n*2\nprint(n)',                                   '16');
await dsl('function def + call',
  'def double(x):\n    return x*2\nprint(double(7))',                        '14');
await dsl('function two args',
  'def add(a,b):\n    return a+b\nprint(add(3,4))',                          '7');
await dsl('recursion — factorial',
  'def fact(n):\n    if n<=1:\n        return 1\n    return n*fact(n-1)\nprint(fact(5))', '120');
await dsl('nested loops',
  's=0\nfor i in range(3):\n    for j in range(3):\n        s+=1\nprint(s)', '9');
await dsl('list append + sum',
  'items=[3,1,4,1,5]\nitems.append(9)\nprint(sum(items))',                   '23');
await dsl('dict subscript assignment',
  'd={"a":1,"b":2}\nd["c"]=3\nprint(len(d))',                               '3');
await dsl('string methods',
  'x="hello"\nprint(x.upper())',                                             'HELLO');
await dsl('break in loop',
  's=0\nfor i in range(10):\n    if i==5:\n        break\n    s+=i\nprint(s)', '10');
await dsl('continue in loop',
  's=0\nfor i in range(6):\n    if i==3:\n        continue\n    s+=i\nprint(s)', '12');
await dsl('quantum Bell circuit',
  'q=qubits(2)\nH(q[0])\nCNOT(q[0],q[1])\nmeasure_all(q,shots=100)\nprint("ok")', 'ok');
await dsl('quantum parameterised circuit',
  'q=qubits(4)\nfor i in range(4):\n    Ry(q[i],PI/4)\nfor i in range(3):\n    CNOT(q[i],q[i+1])\nprint("ok")', 'ok');
await dsl('VQE stub call',             'r=vqe("H2")\nprint("done")',          'done');
await dsl('math functions',            'print(round(sqrt(16)))',              '4');
await dsl('PI constant',               'print(abs(PI-3.14159)<0.001)',        'True');
await dsl('list from range',           'x=list(range(5))\nprint(sum(x))',    '10');
await dsl('simulate block',
  'simulate {\n    q=qubits(2)\n    H(q[0])\n    CNOT(q[0],q[1])\n    print("sim_ok")\n}', 'sim_ok');
await dsl('global variable',
  'global g = 0\ndef inc():\n    global g\n    g = g + 1\ninc()\ninc()\nprint(g)', null);

// ═════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(40)}`);
console.log(`RESULT: ${P} passed, ${F} failed`);
if (F>0) { console.error(`\n${F} test(s) FAILED`); process.exit(1); }
else console.log('All tests passed ✓');
