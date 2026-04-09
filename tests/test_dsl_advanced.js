/**
 * tests/test_dsl_advanced.js — Advanced DSL + stdlib tests
 * Run: node tests/test_dsl_advanced.js
 */
import { SanskritInterpreter } from '../src/dsl/interpreter.js';
import { buildStdlib }         from '../src/dsl/stdlib.js';

let passed=0, failed=0;

function assert(cond, msg) { if (!cond) throw new Error(msg||'Assertion failed'); }
function near(a, b, tol=1e-9) { if (Math.abs(a-b)>tol) throw new Error(`${a} not ≈ ${b} (tol=${tol})`); }

async function run(code) {
  const logs = [];
  const interp = new SanskritInterpreter({ onLog: (e) => logs.push(e.text||String(e)) });
  buildStdlib(interp);
  await interp.run(code);          // ← must await (run is async)
  const get = (k) => interp._get(k);
  return { interp, logs, get };
}

async function test(name, fn) {
  try { await fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (e) { console.error(`  ❌ ${name}\n     ${e.message}`); failed++; }
}

async function main() {

console.log('\n━━ Math ━━');
await test('abs sqrt pow', async()=>{ const{get}=await run(`let a=abs(-5)\nlet b=sqrt(16)\nlet c=pow(2,10)`); assert(get('a')===5); assert(get('b')===4); assert(get('c')===1024); });
await test('trig', async()=>{ const{get}=await run(`let s=sin(PI/2)\nlet c=cos(0)\nlet a=atan2(1,1)`); near(get('s'),1); near(get('c'),1); near(get('a'),Math.PI/4); });
await test('ln log2 log10', async()=>{ const{get}=await run(`let a=ln(E)\nlet b=log10(1000)\nlet c=log2(8)`); near(get('a'),1); near(get('b'),3); near(get('c'),3); });
await test('floor ceil round', async()=>{ const{get}=await run(`let a=floor(3.9)\nlet b=ceil(3.1)\nlet c=round(3.14159,2)`); assert(get('a')===3); assert(get('b')===4); near(get('c'),3.14,0.001); });
await test('gcd lcm', async()=>{ const{get}=await run(`let a=gcd(48,18)\nlet b=lcm(4,6)`); assert(get('a')===6); assert(get('b')===12); });
await test('factorial choose', async()=>{ const{get}=await run(`let a=factorial(5)\nlet b=choose(10,3)`); assert(get('a')===120); assert(get('b')===120); });
await test('is_prime', async()=>{ const{get}=await run(`let a=is_prime(7)\nlet b=is_prime(9)\nlet c=is_prime(97)`); assert(get('a')===true); assert(get('b')===false); assert(get('c')===true); });

console.log('\n━━ Statistics ━━');
await test('mean variance std', async()=>{
  const{get}=await run(`let d=[2,4,4,4,5,5,7,9]\nlet m=mean(d)\nlet v=variance(d)\nlet s=std(d)`);
  near(get('m'),5); near(get('v'),4); near(get('s'),2);
});
await test('median percentile', async()=>{
  const{get}=await run(`let d=[1,3,3,6,7,8,9]\nlet med=median(d)\nlet p90=percentile(d,90)`);
  assert(get('med')===6); assert(get('p90')>8);
});
await test('min max', async()=>{
  const{get}=await run(`let arr=[3,1,4,1,5,9,2,6]\nlet lo=min(arr)\nlet hi=max(arr)`);
  assert(get('lo')===1); assert(get('hi')===9);
});
await test('zscore mean≈0 std≈1', async()=>{
  const{get}=await run(`let d=[1.0,2.0,3.0,4.0,5.0]\nlet z=zscore(d)\nlet m=mean(z)\nlet s=std(z)`);
  near(get('m'),0); near(get('s'),1);
});
await test('softmax sums to 1', async()=>{
  const{get}=await run(`let p=softmax([1.0,2.0,3.0])\nlet s=sum(p)`);
  near(get('s'),1.0);
});
await test('correlation identical=1', async()=>{
  const{get}=await run(`let a=[1.0,2.0,3.0,4.0,5.0]\nlet r=correlation(a,a)`);
  near(get('r'),1.0);
});
await test('normalize 0..1', async()=>{
  const{get}=await run(`let n=normalize([10.0,20.0,30.0,40.0,50.0])`);
  const n=get('n'); near(n[0],0); near(n[4],1);
});

console.log('\n━━ Arrays ━━');
await test('range variants', async()=>{
  const{get}=await run(`let a=range(5)\nlet b=range(2,6)\nlet c=range(0,10,2)`);
  assert(JSON.stringify(get('a'))===JSON.stringify([0,1,2,3,4]));
  assert(JSON.stringify(get('b'))===JSON.stringify([2,3,4,5]));
  assert(JSON.stringify(get('c'))===JSON.stringify([0,2,4,6,8]));
});
await test('zip enumerate', async()=>{
  const{get}=await run(`let z=zip([1,2,3],["a","b","c"])\nlet e=enumerate(["x","y"])`);
  assert(JSON.stringify(get('z')[0])===JSON.stringify([1,'a']));
  assert(JSON.stringify(get('e')[0])===JSON.stringify([0,'x']));
});
await test('sort top_k', async()=>{
  const{get}=await run(`let s=sort([5,2,8,1,9,3])\nlet t=top_k([5,2,8,1,9,3],3)`);
  assert(JSON.stringify(get('s'))===JSON.stringify([1,2,3,5,8,9]));
  assert(JSON.stringify(get('t'))===JSON.stringify([9,8,5]));
});
await test('linspace', async()=>{
  const{get}=await run(`let ls=linspace(0,1,5)`);
  const ls=get('ls'); assert(ls.length===5); near(ls[0],0); near(ls[4],1); near(ls[2],0.5);
});
await test('dot matmul', async()=>{
  const{get}=await run(`let d=dot([1,2,3],[4,5,6])\nlet C=matmul([[1,0],[0,1]],[[3,4],[5,6]])`);
  assert(get('d')===32); const C=get('C'); assert(C[0][0]===3&&C[1][1]===6);
});
await test('cumsum', async()=>{
  const{get}=await run(`let cs=cumsum([1,2,3,4])`);
  assert(JSON.stringify(get('cs'))===JSON.stringify([1,3,6,10]));
});
await test('argmax argmin', async()=>{
  const{get}=await run(`let arr=[3,1,4,1,5,9,2,6]\nlet mx=argmax(arr)\nlet mn=argmin(arr)`);
  assert(get('mx')===5); assert(get('mn')===1);
});
await test('unique', async()=>{
  const{get}=await run(`let u=unique([1,2,2,3,3,3,4])`);
  assert(JSON.stringify(get('u'))===JSON.stringify([1,2,3,4]));
});

console.log('\n━━ Strings ━━');
await test('upper lower strip', async()=>{
  const{get}=await run(`let a=upper("hello")\nlet b=lower("WORLD")\nlet c=strip("  hi  ")`);
  assert(get('a')==='HELLO'); assert(get('b')==='world'); assert(get('c')==='hi');
});
await test('split join', async()=>{
  const{get}=await run(`let w=split("a,b,c",",")\nlet s=join(w,"-")`);
  assert(get('s')==='a-b-c');
});
await test('replace contains', async()=>{
  const{get}=await run(`let r=replace("hello world","world","Sanskrit")\nlet c=contains("quantum","ant")`);
  assert(get('r')==='hello Sanskrit'); assert(get('c')===true);
});
await test('zfill', async()=>{
  const{get}=await run(`let z=zfill(42,6)`);
  assert(get('z')==='000042');
});

console.log('\n━━ Quantum utils ━━');
await test('int_to_bits bits_to_int', async()=>{
  const{get}=await run(`let bits=int_to_bits(13,4)\nlet n=bits_to_int(bits)`);
  assert(JSON.stringify(get('bits'))===JSON.stringify([1,1,0,1])); assert(get('n')===13);
});
await test('hamming_weight parity', async()=>{
  const{get}=await run(`let hw=hamming_weight(7)\nlet p=parity(6)`);
  assert(get('hw')===3); assert(get('p')===0);
});
await test('n_qubits_for', async()=>{
  const{get}=await run(`let a=n_qubits_for(16)\nlet b=n_qubits_for(256)\nlet c=n_qubits_for(1000)`);
  assert(get('a')===4); assert(get('b')===8); assert(get('c')===10);
});
await test('state_label', async()=>{
  const{get}=await run(`let s=state_label(5,4)`);
  assert(get('s')==='|0101⟩');
});
await test('best_rational_approx', async()=>{
  const{get}=await run(`let f=best_rational_approx(0.25,100)`);
  const f=get('f'); assert(f.numerator===1&&f.denominator===4);
});

console.log('\n━━ Formatting ━━');
await test('fmt_sci fmt_fixed fmt_pct', async()=>{
  const{get}=await run(`let a=fmt_sci(0.000123,2)\nlet b=fmt_fixed(3.14159,3)\nlet c=fmt_pct(0.875,1)`);
  assert(get('a')==='1.23e-4'); assert(get('b')==='3.142'); assert(get('c')==='87.5%');
});

console.log('\n━━ DSL integration ━━');
await test('Fibonacci recursion', async()=>{
  const{get}=await run(
`def fib(n):
    if n <= 1:
        return n
    return fib(n-1) + fib(n-2)
let fibs = [fib(i) for i in range(10)]`);
  assert(JSON.stringify(get('fibs'))===JSON.stringify([0,1,1,2,3,5,8,13,21,34]));
});
await test('Newton-Raphson sqrt', async()=>{
  const{get}=await run(
`def my_sqrt(n):
    let x = 1.0
    for i in range(50):
        x = (x + n / x) / 2.0
    return x
let s2 = my_sqrt(2)
let s9 = my_sqrt(9)`);
  near(get('s2'),Math.SQRT2,1e-9); near(get('s9'),3,1e-9);
});
await test('statistics pipeline', async()=>{
  const{get}=await run(
`let data = [10.0, 20.0, 30.0, 40.0, 50.0]
let norm = normalize(data)
let zs   = zscore(data)
let r    = correlation(data, data)
let m    = mean(zs)
let s    = std(zs)`);
  const norm=get('norm'); near(norm[0],0); near(norm[4],1);
  near(get('r'),1.0); near(get('m'),0.0); near(get('s'),1.0);
});
await test('matmul transpose', async()=>{
  const{get}=await run(
`let A = [[2,3],[1,4]]
let B = [[5,6],[7,8]]
let C = matmul(A,B)
let D = transpose(A)`);
  const C=get('C'); assert(C[0][0]===31); assert(C[0][1]===36);
  const D=get('D'); assert(D[0][0]===2&&D[0][1]===1);
});
await test('quantum bit round-trip', async()=>{
  const{get}=await run(
`let original = 42
let bits = int_to_bits(original, 8)
let hw   = hamming_weight(original)
let back = bits_to_int(bits)
let lbl  = state_label(original, 8)`);
  assert(get('back')===42); assert(get('hw')===3); assert(get('lbl')==='|00101010⟩');
});
await test('dict helpers', async()=>{
  const{get}=await run(
`let d1 = {"a": 1, "b": 2}
let d2 = {"c": 3}
let m  = merge(d1, d2)
let ks = keys(m)
let vs = values(m)`);
  const ks=get('ks'); assert(ks.includes('a')&&ks.includes('b')&&ks.includes('c'));
  const vs=get('vs'); assert(vs.includes(1)&&vs.includes(2)&&vs.includes(3));
});
await test('Monte Carlo pi within 0.1', async()=>{
  const{get}=await run(
`random_seed(42)
let inside = 0
let N = 10000
for i in range(N):
    let x = random() * 2.0 - 1.0
    let y = random() * 2.0 - 1.0
    if x*x + y*y <= 1.0:
        inside = inside + 1
let pi_est = 4.0 * inside / N`);
  near(get('pi_est'),Math.PI,0.1);
});

console.log('\n'+'═'.repeat(48));
console.log(`Advanced DSL: ${passed+failed} tests  ✅ ${passed} passed  ❌ ${failed} failed`);
console.log('═'.repeat(48));
process.exit(failed>0?1:0);

} // end main

main().catch(e=>{ console.error(e); process.exit(1); });
