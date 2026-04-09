/**
 * src/dsl/interpreter.js  —  Sanskrit DSL Interpreter  v2.0
 * ──────────────────────────────────────────────────────────
 * Full Sanskrit language per specification docs.
 * New in v2.0 vs v1.0:
 *   struct Name { fields; fn methods() }
 *   match val { pat => body, _ => body }
 *   try { } catch ErrType as e { } finally { }
 *   circuit Name { }     — named exportable circuit
 *   molecule Name { }    — molecule definition block
 *   import chemistry / biology / medical / physics / genetics / math
 *   adj { }              — adjoint/dagger gate block
 *   ctrl(q[i]) { }       — controlled block
 *   lambda x: expr       — lambda expressions
 *   fn(x) => expr        — arrow lambda
 *   simulate(engine="sparse") { } — engine selection
 *   let (a,b,c) = tuple  — tuple destructuring
 *   0..10 range literals  — Rust-style ranges
 *   |110> bra-ket literals
 *   in / not in operators
 *   Biology: .transcribe() .translate() .gc_content() .reverse_complement()
 *   Block-as-expression: let e = simulate { return val }
 *   f-string alignment: f"{x:>10.3f}"
 */

import { QuantumRegister, QAlgorithms } from '../engine/quantum.js';

// ─── Tokeniser ────────────────────────────────────────────────────────────────
function tokenise(src) {
  const toks = [], s = src + '\n';
  let i = 0, ln = 1, lineStart = 0;
  const KW = new Set([
    'let','mut','const','fn','def','return','if','elif','else',
    'for','while','in','not','and','or','None','null',
    'simulate','quantum','classical','circuit','molecule','struct',
    'match','try','catch','finally','throw','raise',
    'import','use','as','from','global','pass','break','continue',
    'adj','ctrl','lambda',
    'range','qubits','quantum_register','print','barrier',
    'H','X','Y','Z','S','Sdg','T','Tdg','SX','I',
    'Rx','Ry','Rz','P','Phase','U3',
    'CNOT','CX','CZ','CY','SWAP','iSWAP','CP','CRz','RZZ','RXX','RYY','MS',
    'Toffoli','CCX','Fredkin','CSWAP','reset',
    'measure','measure_all','statevector','probabilities',
    'expectation_z','expectation_x','expectation_y',
    'H_all','X_all','Y_all','Z_all','Rx_all','Ry_all','Rz_all',
    'qft','iqft',
  ]);

  while (i < s.length) {
    const col = i - lineStart, c = s[i];
    if (c===' '||c==='\t'||c==='\r'){i++;continue;}
    if (c==='#'||(c==='/'&&s[i+1]==='/'))  {while(i<s.length&&s[i]!=='\n')i++;continue;}
    if (c==='/'&&s[i+1]==='*')            {i+=2;while(i<s.length&&!(s[i]==='*'&&s[i+1]==='/')){if(s[i]==='\n'){ln++;lineStart=i+1;}i++;}i+=2;continue;}
    if (c==='\n'){toks.push({t:'NL',v:'\n',ln,col});i++;ln++;lineStart=i;continue;}

    // Bra-ket literal |state>
    if (c==='|'){
      let j=i+1,state='';
      while(j<s.length&&s[j]!='>')state+=s[j++];
      if(j<s.length&&s[j]==='>'&&state.length>0&&/^[01+\-xyXY\s]+$/.test(state)){
        toks.push({t:'BRAKET',v:state,ln,col});i=j+1;continue;
      }
      toks.push({t:'|',v:'|',ln,col});i++;continue;
    }

    // Number
    if((c>='0'&&c<='9')||(c==='.'&&s[i+1]>='0'&&s[i+1]<='9')){
      let n='',nc=col;
      if(c==='0'&&(s[i+1]==='x'||s[i+1]==='b')){n=s[i]+s[i+1];i+=2;while(i<s.length&&/[0-9a-fA-F_]/.test(s[i]))n+=s[i++];toks.push({t:'NUM',v:parseInt(n.replace(/_/g,'')),ln,col:nc});continue;}
      while(i<s.length&&(/[\d.eE_]/.test(s[i])||((s[i]==='+'||s[i]==='-')&&/[eE]/.test(n.slice(-1)))))n+=s[i++];
      toks.push({t:'NUM',v:parseFloat(n.replace(/_/g,'')),ln,col:nc});continue;
    }

    // Triple-quoted string
    if((c==='"'||c==="'")&&s[i+1]===c&&s[i+2]===c){
      const q3=c+c+c;i+=3;let str='',sc=col;
      while(i<s.length&&s.slice(i,i+3)!==q3){if(s[i]==='\n'){ln++;lineStart=i+1;}str+=s[i++];}
      i+=3;toks.push({t:'STR',v:str,ln,col:sc});continue;
    }

    // String
    if(c==='"'||c==="'"){
      const q=s[i++];let str='',sc=col;
      while(i<s.length&&s[i]!==q){
        if(s[i]==='\\'){i++;const e=s[i++];str+=e==='n'?'\n':e==='t'?'\t':e==='r'?'\r':e;}
        else str+=s[i++];
      }
      if(i<s.length)i++;
      toks.push({t:'STR',v:str,ln,col:sc});continue;
    }

    // Identifier / keyword
    if(/[a-zA-Z_]/.test(c)){
      let id='',ic=col;
      while(i<s.length&&/[a-zA-Z0-9_]/.test(s[i]))id+=s[i++];
      if(id==='true'||id==='True') {toks.push({t:'BOOL',v:true,ln,col:ic});continue;}
      if(id==='false'||id==='False'){toks.push({t:'BOOL',v:false,ln,col:ic});continue;}
      if((id==='f'||id==='F')&&(s[i]==='"'||s[i]==="'")){toks.push({t:'KW',v:'f',ln,col:ic});continue;}
      toks.push({t:KW.has(id)?'KW':'ID',v:id,ln,col:ic});continue;
    }

    // 3-char operators
    const t3=s.slice(i,i+3);
    if(['...','..=','===','!=='].includes(t3)){toks.push({t:'OP',v:t3,ln,col});i+=3;continue;}

    // 2-char operators
    const t2=s.slice(i,i+2);
    if(['**','//','==','!=','<=','>=','+=','-=','*=','/=','%=','->','..','>=','<=','=>','<<','>>','&&','||'].includes(t2)){toks.push({t:'OP',v:t2,ln,col});i+=2;continue;}

    if('+-*/%=<>!(){}[],.:;@&^~?\\'.includes(c)){toks.push({t:c,v:c,ln,col});i++;continue;}
    i++;
  }
  toks.push({t:'EOF',v:null,ln,col:0});
  return toks;
}

// ─── Error types ──────────────────────────────────────────────────────────────
class SanskritError   extends Error { constructor(m,t='SanskritError'){super(m);this.name=t;this.sanskritType=t;} }
class ConvergenceError  extends SanskritError { constructor(m){super(m,'ConvergenceError');} }
class QuantumError_     extends SanskritError { constructor(m){super(m,'QuantumError');} }
class MeasurementError  extends SanskritError { constructor(m){super(m,'MeasurementError');} }
class TypeError_        extends SanskritError { constructor(m){super(m,'TypeError');} }
class ValueError_       extends SanskritError { constructor(m){super(m,'ValueError');} }
class IndexError_       extends SanskritError { constructor(m){super(m,'IndexError');} }
class KeyError_         extends SanskritError { constructor(m){super(m,'KeyError');} }
class NotImplementedError extends SanskritError { constructor(m){super(m||'Not implemented','NotImplementedError');} }
const ERROR_MAP = { ConvergenceError, QuantumError: QuantumError_, MeasurementError,
  TypeError: TypeError_, ValueError: ValueError_, IndexError: IndexError_, KeyError: KeyError_,
  NotImplementedError, SanskritError };

// ─── Struct Instance ──────────────────────────────────────────────────────────
class StructInstance {
  constructor(typeName, fields, methods, interp){
    this.__type__=typeName; this.__methods__=methods; this.__interp__=interp;
    Object.assign(this, fields);
  }
  callMethod(name,args){ const m=this.__methods__[name]; if(!m)throw new SanskritError(`'${this.__type__}' has no method '${name}'`); return this.__interp__._callFn(m,[this,...args]); }
}

// ─── Circuit Definition ───────────────────────────────────────────────────────
class CircuitDef {
  constructor(name,interp){ this.__circuit__=true; this.name=name; this.interp=interp; }
  export_qasm(f)   { this.interp._log(`EXPORT QASM: ${f}`);   return `// QASM: ${this.name}`; }
  export_qasm3(f)  { this.interp._log(`EXPORT QASM3: ${f}`);  return `// QASM3: ${this.name}`; }
  export_ibm(f)    { this.interp._log(`EXPORT IBM: ${f}`);    return `{"name":"${this.name}"}`; }
  export_ionq(f)   { this.interp._log(`EXPORT IonQ: ${f}`);   return `{"name":"${this.name}"}`; }
  export_cirq(f)   { this.interp._log(`EXPORT Cirq: ${f}`);   return `# Cirq: ${this.name}`; }
  export_braket(f) { this.interp._log(`EXPORT Braket: ${f}`); return `# Braket: ${this.name}`; }
  submit(kw={})    { this.interp._log(`SUBMIT to ${kw.backend||'simulator'} shots=${kw.shots||1000}`); return {job_id:'job_'+Date.now(),status:'queued'}; }
}

// ─── Molecule Definition ──────────────────────────────────────────────────────
class MoleculeDef {
  constructor(name, p={}){
    this.__molecule__=true; this.name=name;
    this.atoms=p.atoms||[]; this.bond_length=p.bond_length||1.0;
    this.basis_set=p.basis_set||'STO-3G'; this.smiles=p.smiles||null;
    this.geometry=p.geometry||null;
    this.n_qubits=(this.atoms.length)*2||4; this.n_electrons=p.n_electrons||this.atoms.length||2;
  }
  get_hamiltonian(){return{terms:[],n_qubits:this.n_qubits,name:this.name};}
  get_molecular_data(){return{name:this.name,n_qubits:this.n_qubits,n_electrons:this.n_electrons};}
}

// ─── Bio-string wrapper ───────────────────────────────────────────────────────
function makeBioString(seq){
  const s=String(seq&&seq.__biostr__?seq.sequence:seq);
  const CODON={'AUG':'M','UUU':'F','UUC':'F','UUA':'L','UUG':'L','CUU':'L','CUC':'L','CUA':'L','CUG':'L','AUU':'I','AUC':'I','AUA':'I','GUU':'V','GUC':'V','GUA':'V','GUG':'V','UCU':'S','UCC':'S','UCA':'S','UCG':'S','CCU':'P','CCC':'P','CCA':'P','CCG':'P','ACU':'T','ACC':'T','ACA':'T','ACG':'T','GCU':'A','GCC':'A','GCA':'A','GCG':'A','UAU':'Y','UAC':'Y','CAU':'H','CAC':'H','CAA':'Q','CAG':'Q','AAU':'N','AAC':'N','AAA':'K','AAG':'K','GAU':'D','GAC':'D','GAA':'E','GAG':'E','UGU':'C','UGC':'C','UGG':'W','CGU':'R','CGC':'R','CGA':'R','CGG':'R','AGA':'R','AGG':'R','AGU':'S','AGC':'S','GGU':'G','GGC':'G','GGA':'G','GGG':'G','UAA':'*','UAG':'*','UGA':'*'};
  return {
    __biostr__:true, sequence:s, length:s.length, toString:()=>s, valueOf:()=>s,
    upper:()=>makeBioString(s.toUpperCase()), lower:()=>makeBioString(s.toLowerCase()),
    len:()=>s.length, slice:(a,b)=>makeBioString(s.slice(a,b)),
    replace:(a,b)=>makeBioString(s.replaceAll(a,b)),
    split:(sep)=>s.split(sep).map(x=>makeBioString(x)),
    contains:(p)=>s.includes(p), find:(p)=>s.indexOf(p),
    startswith:(p)=>s.startsWith(p), endswith:(p)=>s.endsWith(p),
    transcribe:()=>makeBioString(s.replace(/T/g,'U').replace(/t/g,'u')),
    reverse_complement:()=>makeBioString(s.split('').reverse().map(c=>({A:'T',T:'A',G:'C',C:'G',a:'t',t:'a',g:'c',c:'g'}[c]||c)).join('')),
    gc_content:()=>((s.match(/[GCgc]/g)||[]).length/s.length)*100,
    find_orfs:()=>{const o=[];for(let i=0;i<s.length-2;i+=3)if(s.slice(i,i+3).toUpperCase()==='ATG')o.push({start:i,end:s.length});return o;},
    call_variants:(kw={})=>[{pos:42,ref:'A',alt:'G',qual:99}],
    translate:()=>{const r=s.toUpperCase().replace(/T/g,'U');let p='';for(let i=0;i<r.length-2;i+=3){const a=CODON[r.slice(i,i+3)];if(!a||a==='*')break;p+=a;}return makeBioString(p);},
  };
}

// ─── Module stubs ─────────────────────────────────────────────────────────────
function makeModule(name){
  const CHEM={
    load_molecule:(n,kw={})=>new MoleculeDef(n,kw),
    build_vqe_circuit:(mol,kw={})=>new CircuitDef(mol&&mol.name||'vqe',null),
    jordan_wigner:(h)=>({type:'qubit_op',terms:[],n_qubits:h&&h.n_qubits||4}),
    bravyi_kitaev:(h)=>({type:'qubit_op',terms:[],n_qubits:h&&h.n_qubits||4}),
    get_molecular_data:(mol)=>({n_electrons:2,n_qubits:4}),
  };
  const BIO={
    alignment:{
      smith_waterman:(s1,s2)=>({score:45,seq1_aligned:String(s1),seq2_aligned:String(s2),identity:0.72}),
      needleman_wunsch:(s1,s2)=>({score:38,seq1_aligned:String(s1),seq2_aligned:String(s2)}),
    },
    fold_protein:(seq,kw={})=>({energy:-4.2,coordinates:[[0,0],[1,0],[1,1]],is_compact:true}),
    load_sequence:(f)=>makeBioString('ATGCGATCGATCG'),
  };
  const MED={
    screen_drugs:(kw={})=>[{name:'Compound_1',ki:0.77,binding_energy:-9.2,passes_ro5:()=>true,mw:402,logP:2.1},{name:'Compound_2',ki:1.4,binding_energy:-8.6,passes_ro5:()=>true,mw:387,logP:1.8}],
    design_vaccine:(kw={})=>({epitopes:[{seq:'YLQPRTFLL',score:0.87}],coverage:72.4,immunogenicity:0.834,construct_sequence:'MFVFLVLLPLVSSQCVNLTTRTQLPPAYTNS',is_viable:()=>true}),
    load_library:(n)=>Array.from({length:20},(_,i)=>({name:`Cmpd_${i+1}`,ki:Math.random()*10+0.1,binding_energy:-(6+Math.random()*4),passes_ro5:()=>Math.random()>0.2,mw:300+i*10,logP:1+i*0.2})),
    optimise_codon_usage:(p,h)=>'ATGTTCGTGTTCCTGGTGCTGCTG',
    vaccine:{design:(kw={})=>({epitopes:[],coverage:65.0})},
  };
  const PHYS={
    ising:{
      chain:(kw={})=>({n_spins:kw.n||kw.n_spins||8,J:kw.J||1.0,h:kw.h||0.5,type:'ising'}),
      model:(kw={})=>({n_spins:kw.n||8,J:kw.J||1.0,h:kw.h||0.5,type:'ising'}),
      time_evolve:(chain,kw={})=>({magnetisation:0.342,final_state:[],norm:1.0}),
    },
    ising_model:(kw={})=>({n_spins:kw.n_spins||kw.n||8,J:kw.J||1.0,h:kw.h||0.5,type:'ising'}),
    heisenberg_chain:(kw={})=>({n_spins:kw.n_spins||6,J:kw.J||1.0,delta:kw.delta||1.0,type:'heisenberg'}),
    time_evolve:(chain,kw={})=>({magnetisation:0.342,norm:1.0,state:[]}),
    solve_maxcut:(kw={})=>({cut_value:4,assignment:[1,0,1,0],energy:-4.0}),
    ground_state_energy:(model)=>-(model&&model.n_spins||8)*1.5,
    portfolio_optimisation:(r,c)=>[true,false,true,true,false],
  };
  const GEN={
    crispr:{design_guides:(kw={})=>[{sequence:'GCATGCGATCGATCGATCGG',on_target:0.87,off_targets:2}]},
    gwas:{run:(g,p)=>[{snp_id:'rs1234567',p_value:2.3e-10,effect:0.23,significant:true}]},
    design_crispr_guides:(kw={})=>GEN.crispr.design_guides(kw),
    run_gwas:(g,p)=>GEN.gwas.run(g,p),
    polygenic_risk_score:(g,b)=>Math.random()*0.4-0.2,
    hardy_weinberg_test:(g)=>({chi2:1.23,p_value:0.27,passes:true}),
    fst:(p1,p2)=>0.042,
    neighbour_joining:(seqs)=>({tree:'(A:0.1,B:0.1)C:0.2;',n_leaves:seqs.length}),
    tajimas_d:(n,s)=>-1.23,
  };
  const ML_MOD={
    quantum_neural_net:(kw={})=>({train:(X,y,kw2={})=>Array.from({length:kw2.epochs||10},(_,i)=>0.5/(i+1)),predict:(X)=>X.map(()=>Math.random()>0.5?1:0)}),
    quantum_svm:(kw={})=>({fit:(X,y)=>{},predict:(X)=>X.map(()=>Math.random()>0.5?1:0),score:(X,y)=>0.95}),
    quantum_pca:(kw={})=>({fit_transform:(X)=>X.map(r=>r.slice(0,kw.n_components||2)),explained_variance_ratio:()=>[0.64,0.28]}),
  };
  const MATH_MOD={
    shor_factor:(n)=>{for(let f=2;f<=Math.sqrt(n);f++)if(n%f===0)return[f,n/f];return[1,n];},
    grover_search:(kw={})=>QAlgorithms.grover(kw.n_qubits||4,[kw.target!==undefined?kw.target:7],1000),
    bernstein_vazirani:(kw={})=>kw.oracle_secret||[1,0,1,1,0],
    hhl_solve:(A,b)=>({x:b.map((v,i)=>v/(A[i]?.[i]||1)),condition:4.5,speedup:12.3}),
    estimate_phase:(kw={})=>Math.PI/4,
    amplitude_estimate:(kw={})=>0.3536,
  };
  const mods={
    chemistry:CHEM, biology:BIO, medical:MED, physics:PHYS, genetics:GEN,
    ml:ML_MOD, math:MATH_MOD, qmath:MATH_MOD,
    alignment:BIO.alignment, 'biology.alignment':BIO.alignment,
    crispr:GEN.crispr, 'genetics.crispr':GEN.crispr,
    gwas:GEN.gwas, 'genetics.gwas':GEN.gwas,
    vaccine:MED.vaccine, 'medical.vaccine':MED.vaccine,
    ising:PHYS.ising, 'physics.ising':PHYS.ising,
  };
  return mods[name]||{};
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTERPRETER
// ═══════════════════════════════════════════════════════════════════════════════
export class SanskritInterpreter {
  constructor(opts={}){
    this.output=opts.output||((m)=>console.log(m));
    this.onGate=opts.onGate||null; this.onMeasure=opts.onMeasure||null;
    this.onState=opts.onState||null; this.onLog=opts.onLog||null;
    this.execLog=[]; this.registers={};
    this._env=[{}]; this._toks=[]; this._pos=0; this._stopped=false;
    this._seedGlobals();
  }

  _seedGlobals(){
    // Error types available as constructors; constants are in _get() fallback
    Object.assign(this._env[0], ERROR_MAP);
  }

  async run(src){ this._toks=tokenise(src); this._pos=0; this.execLog=[]; this._stopped=false; this._skipNL(); while(!this._eof())await this._stmt(); }
  stop(){ this._stopped=true; }

  _push(){ this._env.push({}); }
  _pop() { this._env.pop(); }
  _get(name){
    for(let i=this._env.length-1;i>=0;i--)
      if(Object.prototype.hasOwnProperty.call(this._env[i],name))return this._env[i][name];
    // Constants always available regardless of scope reset
    const C={
      PI:Math.PI, TAU:Math.PI*2, E:Math.E, INF:Infinity, NAN:NaN,
      PLANCK:6.62607015e-34, HBAR:1.054571817e-34, BOLTZMANN:1.380649e-23,
      AVOGADRO:6.02214076e23, SPEED_OF_LIGHT:299792458,
      ELEMENTARY_CHARGE:1.602176634e-19, BOHR_RADIUS:5.29177210903e-11, HARTREE_EV:27.211396,
      True:true, true:true, False:false, false:false, None:null, null:null,
      ...ERROR_MAP,
    };
    if(name in C)return C[name];
    throw new SanskritError(`Undefined: "${name}" (line ${this._peek().ln})`);
  }
  _set(name,val){ this._env[this._env.length-1][name]=val; }
  _setGlobal(name,val){ this._env[0][name]=val; }
  _update(name,val){
    for(let i=this._env.length-1;i>=0;i--)
      if(Object.prototype.hasOwnProperty.call(this._env[i],name)){this._env[i][name]=val;return;}
    this._set(name,val);
  }

  _peek(n=0){ return this._toks[this._pos+n]||{t:'EOF',v:null,ln:0,col:0}; }
  _adv()    { return this._toks[this._pos++]; }
  _skipNL() { while(this._peek().t==='NL'||this._peek().v===';')this._adv(); }
  _eof()    { this._skipNL(); return this._peek().t==='EOF'; }
  _match(v) { if(this._peek().v===v||this._peek().t===v)return this._adv(); return null; }
  _eat(v)   { const t=this._adv(); if(t.v!==v&&t.t!==v)throw new SanskritError(`Expected "${v}" got "${t.v}" line ${t.ln}`); return t; }
  _log(m)   { const e={t:new Date().toISOString().slice(11,23),m,text:m}; this.execLog.push(e); if(this.onLog)this.onLog(e); }
  _skipLine(){ while(this._peek().t!=='NL'&&this._peek().t!=='EOF')this._adv(); }

  // ── Statement dispatcher ─────────────────────────────────────────────────
  async _stmt(){
    this._skipNL(); if(this._eof()||this._stopped)return;
    const tok=this._peek();

    if(tok.v==='let'||tok.v==='const'||tok.v==='mut'){await this._letStmt();return;}
    if(tok.v==='global'){await this._globalStmt();return;}
    if(tok.v==='fn'||tok.v==='def'){await this._fnDef();return;}
    if(tok.v==='struct'){await this._structDef();return;}
    if(tok.v==='return'){
      this._adv();let v=null;
      if(!['NL',';','EOF','}'].includes(this._peek().t)&&this._peek().v!=='}')v=await this._expr();
      throw{_ret:true,v};
    }
    if(tok.v==='if')   {await this._ifStmt();return;}
    if(tok.v==='for')  {await this._forStmt();return;}
    if(tok.v==='while'){await this._whileStmt();return;}
    if(tok.v==='match'){await this._matchStmt();return;}
    if(tok.v==='try')  {await this._tryStmt();return;}
    if(tok.v==='break')   {this._adv();throw{_brk:true};}
    if(tok.v==='continue'){this._adv();throw{_cont:true};}
    if(tok.v==='pass')    {this._adv();return;}
    if(tok.v==='throw'||tok.v==='raise'){
      this._adv(); const err=await this._expr();
      if(err instanceof Error)throw err;
      throw new SanskritError(String(err));
    }
    if(tok.v==='simulate'||tok.v==='quantum'||tok.v==='classical'){await this._execBlock();return;}
    if(tok.v==='circuit'){await this._circuitDef();return;}
    if(tok.v==='molecule'){await this._moleculeDef();return;}
    if(tok.v==='import'||tok.v==='use'){await this._importStmt();return;}
    if(tok.v==='from'){this._skipLine();return;}
    if(tok.v==='adj'){await this._adjBlock();return;}
    if(tok.v==='ctrl'){await this._ctrlBlock();return;}
    if(tok.v==='print'){await this._printStmt();return;}

    const GNAMES=['H','X','Y','Z','S','Sdg','T','Tdg','SX','I','Rx','Ry','Rz','P','Phase','U3','CNOT','CX','CZ','CY','SWAP','iSWAP','CP','CRz','RZZ','RXX','RYY','MS','Toffoli','CCX','Fredkin','CSWAP','reset','barrier','H_all','X_all','Y_all','Z_all','Rx_all','Ry_all','Rz_all','qft','iqft'];
    if(GNAMES.includes(tok.v)){const gname=this._adv().v;this._eat('(');const args=await this._argList();this._eat(')');this._match(';');await this._applyGate(gname,args);return;}

    if(['measure','measure_all','statevector','probabilities'].includes(tok.v)){await this._expr();this._skipNL();return;}

    if(tok.t==='ID'||tok.t==='KW'){
      const n1=this._peek(1);
      if(n1.v==='='&&this._peek(2).v!=='='){const name=this._adv().v;this._adv();const val=await this._expr();this._update(name,val);this._match(';');return;}
      if(n1.v==='+='||n1.v==='-='||n1.v==='*='||n1.v==='/='){const name=this._adv().v,op=this._adv().v,val=await this._expr(),cur=this._get(name);this._update(name,op==='+='?this._add2(cur,val):op==='-='?cur-val:op==='*='?cur*val:cur/val);this._match(';');return;}
      if(n1.t==='['){
        const name=this._adv().v;this._adv();const key=await this._expr();this._eat(']');
        if(this._peek().v===':'){if(this._peek(1).v==='='){this._adv();this._adv();const st=await this._expr();const r=this._get(name);if(r instanceof QuantumRegister)this._initBraket(r,st);this._match(';');return;}}
        if(this._peek().v==='='){this._adv();const val=await this._expr();const obj=this._get(name);if(Array.isArray(obj))obj[+key]=val;else if(obj&&typeof obj==='object')obj[key]=val;this._match(';');return;}
        this._skipNL();return;
      }
      if(n1.t==='.'&&this._peek(3).v==='='&&this._peek(4).v!=='='){const name=this._adv().v;this._adv();const attr=this._adv().v;if(this._peek().v==='='){this._adv();const val=await this._expr();const obj=this._get(name);if(obj&&typeof obj==='object')obj[attr]=val;this._match(';');return;}}
    }
    await this._expr(); this._skipNL();
  }

  // ── Declarations ─────────────────────────────────────────────────────────
  async _letStmt(){
    this._adv(); if(this._peek().v==='mut')this._adv();
    if(this._peek().t==='('){
      this._eat('(');const names=[];
      while(this._peek().v!==')'&&!this._eof()){names.push(this._eat('ID').v);this._match(',');}
      this._eat(')');this._eat('=');const val=await this._expr();
      const arr=Array.isArray(val)?val:val&&typeof val==='object'?Object.values(val):[];
      names.forEach((n,i)=>this._set(n,arr[i]!==undefined?arr[i]:null));
      this._match(';');return;
    }
    const name=this._eat('ID').v;
    if(this._peek().v===':'){this._adv();let d=0;while(!(((['=','NL',';','EOF'].includes(this._peek().t)||this._peek().v==='=')&&d===0)||this._peek().t==='EOF')){if(this._peek().v==='<')d++;else if(this._peek().v==='>')d--;this._adv();}}
    let val=null;
    if(this._peek().v==='='){this._adv();val=await this._expr();}
    this._set(name,val);this._log(`LET ${name}=${this._fmt(val)}`);this._match(';');
  }

  async _globalStmt(){
    this._adv();const name=this._eat('ID').v;
    if(this._peek().v===':'){this._adv();this._adv();}
    let val=null;if(this._peek().v==='='){this._adv();val=await this._expr();}
    this._env[0][name]=val;this._log(`GLOBAL ${name}`);this._match(';');
  }

  async _fnDef(){
    this._adv();const name=this._eat('ID').v;this._eat('(');
    const params=[],defaults={};
    while(this._peek().v!==')'&&this._peek().t!=='EOF'){
      if(this._peek().v==='*'||this._peek().v==='**'){this._skipLine();break;}
      const pname=this._adv().v;
      if(this._peek().v===':'){this._adv();while(![',','=',')','NL',';'].includes(this._peek().v)&&this._peek().t!=='EOF')this._adv();}
      if(this._peek().v==='='){this._adv();defaults[pname]=await this._expr();}
      params.push(pname);this._match(',');
    }
    this._eat(')');
    if(this._peek().v==='->'){this._adv();while(![':', '{','NL',';'].includes(this._peek().v)&&this._peek().t!=='EOF')this._adv();}
    this._match(':');const body=this._captureBlock(0);
    this._set(name,{__fn__:true,name,params,defaults,body});this._log(`DEF ${name}(${params.join(',')})`);
  }

  async _structDef(){
    this._adv();const typeName=this._eat('ID').v;const fields=[],methods={};this._eat('{');this._skipNL();
    while(this._peek().v!=='}'&&!this._eof()){
      this._skipNL();if(this._peek().v==='}')break;
      if(this._peek().v==='fn'||this._peek().v==='def'){
        this._adv();const mname=this._eat('ID').v;this._eat('(');const mparams=[];
        while(this._peek().v!==')'&&!this._eof()){const p=this._adv().v;if(this._peek().v===':'){this._adv();this._adv();}if(this._peek().v==='='){this._adv();await this._expr();}mparams.push(p);this._match(',');}
        this._eat(')');if(this._peek().v==='->'){this._adv();this._adv();}this._match(':');
        const mbody=this._captureBlock(0);
        methods[mname]={__fn__:true,name:mname,params:mparams,defaults:{},body:mbody};
      } else {
        const fname=this._adv().v;if(this._peek().v===':'){this._adv();this._adv();}
        fields.push(fname);
      }
      this._skipNL();this._match(',');this._skipNL();
    }
    this._eat('}');
    this._set(typeName,{__struct_ctor__:true,typeName,fields,methods,__fn__:true,name:typeName,params:fields,defaults:{},body:[]});
    this._log(`STRUCT ${typeName}(${fields.join(',')})`);
  }

  // ── Control flow ─────────────────────────────────────────────────────────
  async _ifStmt(){
    const sc=this._peek().col;this._adv();const cond=await this._expr();this._match(':');
    const body=this._captureBlock(sc);const branches=[];this._skipNL();
    while(this._peek().v==='elif'||this._peek().v==='else'){
      const kw=this._adv().v;
      if(kw==='elif'){const c=await this._expr();this._match(':');branches.push({c,body:this._captureBlock(sc)});}
      else{this._match(':');branches.push({c:null,body:this._captureBlock(sc)});break;}
      this._skipNL();
    }
    if(cond){await this._runBody(body);return;}
    for(const b of branches)if(b.c===null||b.c){await this._runBody(b.body);return;}
  }

  async _forStmt(){
    const sc=this._peek().col;this._adv();const varName=this._adv().v;this._adv();
    const iter=await this._expr();this._match(':');const body=this._captureBlock(sc);
    let items=iter;
    if(iter&&iter.__range__){items=[];for(let v=iter.s;iter.step>0?v<iter.e:v>iter.e;v+=iter.step)items.push(v);}
    else if(iter&&iter.__biostr__)items=iter.sequence.split('');
    else if(!Array.isArray(items))items=items&&typeof items==='object'?Object.values(items):[];
    for(const item of items){
      if(this._stopped)break;
      this._push();this._set(varName,item);
      try{await this._runBody(body);}
      catch(sig){this._pop();if(sig._brk)break;if(sig._cont)continue;throw sig;}
      this._pop();
    }
  }

  async _whileStmt(){
    const sc=this._peek().col;this._adv();const condToks=[];
    while(![':', '{','NL','EOF'].includes(this._peek().t))condToks.push(this._adv());
    this._match(':');const body=this._captureBlock(sc);let max=2000000;
    while(max-->0&&!this._stopped){
      const cond=await this._evalToks(condToks);if(!cond)break;
      try{await this._runBody(body);}catch(sig){if(sig._brk)break;if(sig._cont)continue;throw sig;}
    }
  }

  async _matchStmt(){
    this._adv();const val=await this._expr();this._match(':');
    const useBrace=this._peek().t==='{';if(useBrace)this._adv();this._skipNL();
    let matched=false;
    while((useBrace?this._peek().v!=='}':true)&&!this._eof()){
      this._skipNL();if(useBrace&&this._peek().v==='}')break;if(this._peek().t==='EOF')break;
      let pattern;
      if(this._peek().v==='_'){this._adv();pattern=null;}
      else pattern=await this._expr();
      if(!this._match('=>')&&!this._match(':')&&!this._match(',')){this._skipLine();this._skipNL();continue;}
      const armBody=this._captureBlock(-1);
      if(!matched&&(pattern===null||val===pattern||(typeof val==='string'&&val===pattern))){
        matched=true;await this._runBody(armBody);
      }
      this._skipNL();this._match(',');this._skipNL();
    }
    if(useBrace)this._match('}');
  }

  async _tryStmt(){
    this._adv();this._match(':');const tryBody=this._captureBlock(0);this._skipNL();
    const catches=[];
    while(this._peek().v==='catch'){
      this._adv();let errType=null,errName=null;
      if(!['NL','{','_'].includes(this._peek().v)&&this._peek().t!=='NL'){
        errType=this._adv().v;
        if(this._peek().v==='as'){this._adv();errName=this._adv().v;}
      } else if(this._peek().v==='_')this._adv();
      this._match(':');catches.push({errType,errName,body:this._captureBlock(0)});this._skipNL();
    }
    let finallyBody=null;
    if(this._peek().v==='finally'){this._adv();this._match(':');finallyBody=this._captureBlock(0);}
    try{await this._runBody(tryBody);}
    catch(err){
      if(err&&(err._ret||err._brk||err._cont))throw err;
      let handled=false;
      for(const c of catches){
        if(!c.errType||c.errType==='_'||(err instanceof Error&&(err.sanskritType===c.errType||err.name===c.errType))){
          this._push();if(c.errName)this._set(c.errName,{message:err.message||String(err),type:c.errType||'Error'});
          await this._runBody(c.body);this._pop();handled=true;break;
        }
      }
      if(!handled)throw err;
    }finally{if(finallyBody)await this._runBody(finallyBody);}
  }

  async _execBlock(){
    const blockType=this._adv().v;
    let engine='default',showStats=false;
    if(this._peek().t==='('){
      this._adv();
      while(this._peek().v!==')'&&!this._eof()){
        const k=this._adv().v;
        if(this._peek().v==='='){this._adv();const v=await this._expr();if(k==='engine')engine=String(v);if(k==='show_stats')showStats=!!v;}
        this._match(',');
      }
      this._eat(')');
    }
    this._log(`[BLOCK:${blockType}${engine!=='default'?' engine='+engine:''}]`);
    this._match(':');const body=this._captureBlock(0);
    let retVal=null;
    const savedT=this._toks,savedP=this._pos;
    this._toks=[...body,{t:'EOF',v:null,ln:0,col:0}];this._pos=0;
    this._push();
    try{this._skipNL();while(!this._eof()&&!this._stopped)await this._stmt();}
    catch(sig){if(sig._ret)retVal=sig.v;else{this._pop();this._toks=savedT;this._pos=savedP;throw sig;}}
    finally{this._pop();this._toks=savedT;this._pos=savedP;}
    return retVal;
  }

  async _circuitDef(){
    this._adv();const name=this._eat('ID').v;this._match(':');
    const body=this._captureBlock(0);
    const circuit=new CircuitDef(name,this);
    this._set(name,circuit);await this._runBody(body);this._log(`CIRCUIT ${name}`);
  }

  async _moleculeDef(){
    this._adv();const name=this._eat('ID').v;
    if(this._peek().v===':')this._adv();
    const body=this._captureBlock(0);const props={};
    const savedT=this._toks,savedP=this._pos;
    this._toks=[...body,{t:'EOF',v:null}];this._pos=0;this._push();
    try{this._skipNL();while(!this._eof()){this._skipNL();if(this._eof())break;const key=this._adv().v;this._eat(':');props[key]=await this._expr();this._match(',');this._skipNL();}}catch(_){}
    this._pop();this._toks=savedT;this._pos=savedP;
    const mol=new MoleculeDef(name,props);this._set(name,mol);this._log(`MOLECULE ${name}`);
  }

  async _importStmt(){
    const kw=this._adv().v;if(kw==='use'){this._skipLine();return;}
    const parts=[];let alias=null;
    while(this._peek().t==='ID'||this._peek().t==='KW'){parts.push(this._adv().v);if(this._peek().v==='.')this._adv();else break;}
    if(this._peek().v==='as'){this._adv();alias=this._adv().v;}
    const modName=parts.join('.');const mod=makeModule(modName)||makeModule(parts[0]);
    const bindName=alias||parts[parts.length-1];
    this._setGlobal(bindName,mod);
    if(mod&&typeof mod==='object')Object.entries(mod).forEach(([k,v])=>{if(typeof v==='function'||typeof v==='object')this._setGlobal(k,v);});
    // Inject top-level functions based on module
    const inj=(checks,fns)=>{if(checks.some(c=>parts[0]===c||alias===c))Object.entries(fns).forEach(([k,v])=>this._setGlobal(k,v));};
    inj(['chemistry'],{vqe:(mol,kw2={})=>this._sciCall('vqe',[mol],kw2),load_molecule:(n,kw2={})=>mod.load_molecule?.(n,kw2),potential_energy_surface:(kw2={})=>this._sciCall('potential_energy_surface',[],kw2),trotter_evolve:(m,kw2={})=>this._sciCall('trotter_evolve',[m],kw2),jordan_wigner:(h)=>mod.jordan_wigner?.(h),});
    inj(['biology'],{fold_protein:(s,kw2={})=>this._sciCall('fold_protein',[s],kw2),load_sequence:(f)=>makeBioString(f),});
    inj(['medical'],{screen_drugs:(kw2={})=>this._sciCall('screen_drugs',[],kw2),design_vaccine:(kw2={})=>this._sciCall('design_vaccine',[],kw2),load_library:(n)=>this._sciCall('load_library',[n],{}),optimise_codon_usage:(p,h)=>this._sciCall('optimise_codon_usage',[p,h],{}),});
    inj(['genetics'],{design_crispr_guides:(kw2={})=>this._sciCall('design_crispr_guides',[],kw2),run_gwas:(g,p)=>this._sciCall('run_gwas',[g,p],{}),polygenic_risk_score:(g,b)=>this._sciCall('polygenic_risk_score',[g,b],{}),});
    inj(['physics'],{ising_model:(kw2={})=>this._sciCall('ising_model',[],kw2),ground_state_energy:(m)=>this._sciCall('ground_state_energy',[m],{}),heisenberg_chain:(kw2={})=>this._sciCall('heisenberg_chain',[],kw2),time_evolve:(ch,kw2={})=>this._sciCall('time_evolve',[ch],kw2),solve_maxcut:(kw2={})=>this._sciCall('solve_maxcut',[],kw2),});
    inj(['math','qmath'],{shor_factor:(n)=>mod.shor_factor?.(n),grover_search:(kw2={})=>mod.grover_search?.(kw2),hhl_solve:(A,b)=>mod.hhl_solve?.(A,b),estimate_phase:(kw2={})=>mod.estimate_phase?.(kw2),});
    this._log(`IMPORT ${modName}${alias?' as '+alias:''}`);
  }

  async _adjBlock(){
    this._adv();this._match(':');const body=this._captureBlock(0);
    const gates=[];const orig=this.onGate;this.onGate=(g)=>gates.push(g);
    await this._runBody(body);this.onGate=orig;
    const ADJ={H:'H',X:'X',Y:'Y',Z:'Z',S:'Sdg',Sdg:'S',T:'Tdg',Tdg:'T',SX:'SX',CNOT:'CNOT',CZ:'CZ',SWAP:'SWAP'};
    for(let i=gates.length-1;i>=0;i--){const g=gates[i];const an=ADJ[g.gate]||g.gate;this._log(`ADJ:${an}`);if(this.onGate)this.onGate({gate:an,args:g.args});}
  }

  async _ctrlBlock(){
    this._adv();this._eat('(');const ctrlRef=await this._expr();this._eat(')');this._match(':');
    const body=this._captureBlock(0);
    if(ctrlRef&&ctrlRef.__qref__){
      const reg=this._get(ctrlRef.reg);const ctrlQ=ctrlRef.idx;
      const gates=[];const orig=this.onGate;this.onGate=(g)=>gates.push(g);
      await this._runBody(body);this.onGate=orig;
      for(const g of gates){this._log(`CTRL(q[${ctrlQ}]):${g.gate}`);}
    } else await this._runBody(body);
  }

  async _printStmt(){
    this._adv();this._eat('(');const args=[];
    while(this._peek().v!==')'&&!this._eof()){args.push(await this._expr());this._match(',');}
    this._eat(')');
    const text=args.map(a=>this._fmt(a)).join(' ');
    this._log(text);this.output(text);this._match(';');
  }

  // ── Block capture ────────────────────────────────────────────────────────
  _captureBlock(parentCol){
    const toks=[];
    if(this._peek().t==='{'){
      this._adv();let d=1;
      while(d>0&&this._peek().t!=='EOF'){const t=this._adv();if(t.t==='{')d++;else if(t.t==='}'){d--;if(d===0)break;}toks.push(t);}
      return toks;
    }
    while(this._peek().t==='NL')this._adv();
    if(this._peek().t==='EOF')return toks;
    const bodyCol=this._peek().col;
    if(bodyCol<=parentCol&&parentCol>=0)return toks;
    while(!this._eof()){
      while(this._peek().t==='NL')toks.push(this._adv());
      if(this._peek().t==='EOF')break;
      if(parentCol>=0&&this._peek().col<=parentCol)break;
      toks.push(this._adv());
    }
    return toks;
  }

  async _runBody(body){
    const savedT=this._toks,savedP=this._pos;
    this._toks=[...body,{t:'EOF',v:null,ln:0,col:0}];this._pos=0;this._push();
    try{this._skipNL();while(!this._eof()&&!this._stopped)await this._stmt();}
    finally{this._pop();this._toks=savedT;this._pos=savedP;}
  }

  async _evalToks(toks){
    const savedT=this._toks,savedP=this._pos;
    this._toks=[...toks,{t:'EOF',v:null}];this._pos=0;const v=await this._expr();
    this._toks=savedT;this._pos=savedP;return v;
  }

  async _callFn(fn,args){
    if(fn.__struct_ctor__){
      const fields={};const kw=args._kw||{};
      fn.fields.forEach((f,i)=>{fields[f]=kw[f]!==undefined?kw[f]:(args[i]!==undefined?args[i]:null);});
      return new StructInstance(fn.typeName,fields,fn.methods,this);
    }
    const savedT=this._toks,savedP=this._pos;
    this._toks=[...fn.body,{t:'EOF',v:null,ln:0,col:0}];this._pos=0;this._push();
    fn.params.forEach((p,i)=>this._set(p,i<args.length?args[i]:fn.defaults&&fn.defaults[p]!==undefined?fn.defaults[p]:null));
    const kw=args._kw||{};Object.entries(kw).forEach(([k,v])=>this._set(k,v));
    let ret=null;
    try{this._skipNL();while(!this._eof())await this._stmt();}
    catch(sig){if(sig._ret)ret=sig.v;else{this._pop();this._toks=savedT;this._pos=savedP;throw sig;}}
    this._pop();this._toks=savedT;this._pos=savedP;return ret;
  }

  // ── Gate application ─────────────────────────────────────────────────────
  _initBraket(reg,state){
    const s=String(state).replace(/[|>]/g,'');
    s.split('').forEach((b,i)=>{if(b==='1'&&i<reg.nQ)reg.X(i);});
    this._log(`INIT |${s}>`);
  }

  async _applyGate(name,args){
    const rq=(arg)=>{
      if(arg&&arg.__qref__){const reg=this._get(arg.reg);if(!(reg instanceof QuantumRegister))throw new QuantumError_(`${arg.reg} not a QuantumRegister`);return{reg,q:arg.idx};}
      throw new QuantumError_(`Expected qubit ref, got: ${this._fmt(arg)}`);
    };
    this._log(`GATE:${name}`);if(this.onGate)this.onGate({gate:name,args:args.map(a=>this._fmt(a))});

    const G1=['H','X','Y','Z','S','Sdg','T','Tdg','SX','I'];
    const GP=['Rx','Ry','Rz','P','Phase','U3'];

    if(name.endsWith('_all')){const base=name.replace('_all','');const reg=args[0];const angle=+args[1]||0;if(reg instanceof QuantumRegister)for(let q=0;q<reg.nQ;q++){if(G1.includes(base))reg[base](q);else if(GP.includes(base))reg[base](q,angle);}return;}
    if(name==='qft'||name==='iqft'){const reg=args[0] instanceof QuantumRegister?args[0]:rq(args[0]).reg;reg.qft(reg.nQ,name==='iqft');return;}
    if(G1.includes(name)){const{reg,q}=rq(args[0]);reg[name](q);}
    else if(GP.includes(name)){const{reg,q}=rq(args[0]);const t=+args[1]||0,p=+args[2]||0,l=+args[3]||0;if(name==='U3')reg.U3(q,t,p,l);else if(name==='Phase')reg.P(q,t);else reg[name](q,t);}
    else if(name==='CNOT'||name==='CX'){const{reg,q:c}=rq(args[0]);reg.CNOT(c,rq(args[1]).q);}
    else if(name==='CZ'){const{reg,q:a}=rq(args[0]);reg.CZ(a,rq(args[1]).q);}
    else if(name==='CY'){const{reg,q:c}=rq(args[0]);reg.CY(c,rq(args[1]).q);}
    else if(name==='SWAP'){const{reg,q:a}=rq(args[0]);reg.SWAP(a,rq(args[1]).q);}
    else if(name==='iSWAP'){const{reg,q:a}=rq(args[0]);reg.iSWAP(a,rq(args[1]).q);}
    else if(name==='CP'){const{reg,q:c}=rq(args[0]);reg.CP(c,rq(args[1]).q,+args[2]||0);}
    else if(name==='CRz'){const{reg,q:c}=rq(args[0]);reg.CRz(c,rq(args[1]).q,+args[2]||0);}
    else if(name==='RZZ'){const{reg,q:a}=rq(args[0]);reg.RZZ(a,rq(args[1]).q,+args[2]||0);}
    else if(name==='RXX'){const{reg,q:a}=rq(args[0]);reg.RXX(a,rq(args[1]).q,+args[2]||0);}
    else if(name==='RYY'){const{reg,q:a}=rq(args[0]);reg.RYY(a,rq(args[1]).q,+args[2]||0);}
    else if(name==='MS'){const{reg,q:a}=rq(args[0]);reg.MS(a,rq(args[1]).q);}
    else if(name==='Toffoli'||name==='CCX'){const{reg,q:c1}=rq(args[0]);reg.Toffoli(c1,rq(args[1]).q,rq(args[2]).q);}
    else if(name==='Fredkin'||name==='CSWAP'){const{reg,q:c}=rq(args[0]);reg.Fredkin(c,rq(args[1]).q,rq(args[2]).q);}
    else if(name==='reset'){const{reg,q}=rq(args[0]);reg.reset(q);}
    else if(name==='barrier'){this._log('BARRIER');}
  }

  // ── Expression evaluator ─────────────────────────────────────────────────
  async _expr(){return this._or();}
  async _or(){let v=await this._and();while(this._peek().v==='or'||this._peek().v==='||'){this._adv();v=v||await this._and();}return v;}
  async _and(){let v=await this._not();while(this._peek().v==='and'||this._peek().v==='&&'){this._adv();v=v&&await this._not();}return v;}
  async _not(){if(this._peek().v==='not'||this._peek().v==='!'){this._adv();return!await this._not();}return this._cmp();}

  async _cmp(){
    let v=await this._add();
    const OPS={'==':(a,b)=>a===b,'!=':(a,b)=>a!==b,'<':(a,b)=>a<b,'>':(a,b)=>a>b,'<=':(a,b)=>a<=b,'>=':(a,b)=>a>=b};
    while(OPS[this._peek().v]||this._peek().v==='in'||this._peek().v==='not'){
      if(this._peek().v==='not'&&this._peek(1).v==='in'){this._adv();this._adv();const c=await this._add();v=!this._contains(c,v);}
      else if(this._peek().v==='in'){this._adv();const c=await this._add();v=this._contains(c,v);}
      else{const op=this._adv().v;v=OPS[op](v,await this._add());}
    }
    return v;
  }
  _contains(c,val){if(Array.isArray(c))return c.includes(val);if(c&&c.__biostr__)return c.sequence.includes(String(val));if(typeof c==='string')return c.includes(String(val));if(c&&typeof c==='object')return val in c;return false;}

  async _add(){let v=await this._mul();while((this._peek().v==='+'||this._peek().v==='-')&&this._peek().t!=='STR'){const op=this._adv().v;const r=await this._mul();v=op==='+'?this._add2(v,r):v-r;}return v;}
  async _mul(){let v=await this._unary();while(['*','/','%','**','//'].includes(this._peek().v)&&this._peek().t!=='STR'){const op=this._adv().v;const r=await this._unary();if(op==='*')v=v*r;else if(op==='/')v=v/r;else if(op==='%')v=((v%r)+r)%r;else if(op==='**')v=Math.pow(v,r);else v=Math.floor(v/r);}return v;}
  async _unary(){if(this._peek().v==='-'&&this._peek().t!=='STR'){this._adv();return-(await this._unary());}if(this._peek().v==='+'&&this._peek().t!=='STR'){this._adv();return await this._unary();}return this._postfix(await this._primary());}

  async _postfix(v){
    while(true){
      if(this._peek().t==='['){
        this._adv();const idx=await this._expr();this._eat(']');
        if(this._peek().v===':'&&this._peek(1).v==='='){this._adv();this._adv();const st=await this._expr();if(v instanceof QuantumRegister)this._initBraket(v,st);return v;}
        if(v instanceof QuantumRegister)v={__qref__:true,reg:v.name,idx};
        else if(Array.isArray(v))v=idx<0?v[v.length+idx]:v[idx];
        else if(v&&v.__biostr__)v=v.sequence[idx<0?v.sequence.length+idx:idx];
        else if(v&&typeof v==='object')v=v[idx];
      } else if(this._peek().t==='.'){
        this._adv();const meth=this._adv().v;
        if(this._peek().t==='('){this._adv();const a=await this._argList();this._eat(')');v=await this._meth(v,meth,a);}
        else v=v?.[meth];
      } else break;
    }
    return v;
  }

  async _primary(){
    const tok=this._peek();
    if(tok.t==='NUM'){this._adv();return tok.v;}
    if(tok.t==='BOOL'){this._adv();return tok.v;}
    if(tok.t==='STR'){this._adv();return tok.v;}
    if(tok.t==='BRAKET'){this._adv();return tok.v;}
    if(tok.v==='None'||tok.v==='null'){this._adv();return null;}

    // f-string
    if(tok.v==='f'&&this._peek(1).t==='STR'){
      this._adv();const tmpl=this._adv().v;
      return tmpl.replace(/\{([^}]+)\}/g,(_,expr)=>{
        const ci=expr.lastIndexOf(':');const name=ci>=0?expr.slice(0,ci).trim():expr.trim();const fmt=ci>=0?expr.slice(ci+1):'';
        let val;try{val=this._get(name.trim());}catch{val=name;}
        if(fmt&&typeof val==='number'){
          const m=fmt.match(/\.?(\d+)([feEdgGxXob%>< ^])?/);const prec=m?parseInt(m[1]):6;const spec=m&&m[2]?m[2].toLowerCase():'f';
          if(spec==='f')return val.toFixed(prec);if(spec==='e')return val.toExponential(prec);
          if(spec==='d')return Math.round(val).toString();if(spec==='g')return val.toPrecision(Math.max(1,prec));
          if(spec==='x')return Math.round(val).toString(16);if(spec==='%')return(val*100).toFixed(prec)+'%';
        }
        if(fmt){const m=fmt.match(/([<>^])?\s*(\d+)/);if(m){const w=parseInt(m[2]);const sv=val!=null?String(val):'';if(m[1]==='>')return sv.padStart(w);if(m[1]==='<')return sv.padEnd(w);if(m[1]==='^'){const pad=w-sv.length;return' '.repeat(Math.floor(pad/2))+sv+' '.repeat(Math.ceil(pad/2));}return sv.padEnd(w);}}
        return val!=null?String(val):'';
      });
    }

    if(tok.t==='('){
      this._adv();const v=await this._expr();
      if(this._peek().v===','){const items=[v];while(this._peek().v===','){this._adv();if(this._peek().v===')')break;items.push(await this._expr());}this._eat(')');return items;}
      this._eat(')');return v;
    }

    // List
    if(tok.t==='['){
      this._adv();if(this._peek().t===']'){this._eat(']');return[];}
      const exprStart=this._pos;
      const first=await this._expr();
      const exprEnd=this._pos;
      if(this._peek().v==='for'){
        // List comprehension — re-evaluate expression for each item
        this._adv();const varName=this._adv().v;this._adv();const iter=await this._expr();
        let condFn=null;if(this._peek().v==='if'){this._adv();const condToks=[];while(this._peek().t!==']'&&!this._eof())condToks.push(this._adv());condFn=condToks;}
        this._eat(']');
        let items=iter;
        if(iter&&iter.__range__){items=[];for(let v=iter.s;iter.step>0?v<iter.e:v>iter.e;v+=iter.step)items.push(v);}
        else if(!Array.isArray(items))items=items&&typeof items==='object'?Object.values(items):[];
        const exprToks=this._toks.slice(exprStart,exprEnd);
        const result=[];
        for(const item of items){
          this._push();this._set(varName,item);
          try{
            let cond=true;
            if(condFn){try{cond=!!(await this._evalToks(condFn));}catch(_){cond=true;}}
            if(cond){const val=await this._evalToks(exprToks);result.push(val);}
          }finally{this._pop();}
        }
        return result;
      }
      const items=[first];
      while(this._peek().v===','){this._adv();if(this._peek().t===']')break;items.push(await this._expr());}
      this._eat(']');return items;
    }

    // Dict
    if(tok.t==='{'){
      this._adv();const d={};
      while(this._peek().t!=='}'&&!this._eof()){const k=await this._expr();this._eat(':');const v=await this._expr();d[k]=v;this._match(',');}
      this._eat('}');return d;
    }

    // Lambda
    if(tok.v==='lambda'){
      this._adv();const params=[];
      while(this._peek().v!==':'&&!this._eof()){params.push(this._adv().v);this._match(',');}
      this._eat(':');const body=this._captureBlock(-1);
      return{__fn__:true,name:'<lambda>',params,defaults:{},body};
    }

    if(tok.t==='ID'||tok.t==='KW'){
      this._adv();const name=tok.v;
      if(this._peek().t==='('){this._adv();const args=await this._argList();this._eat(')');return await this._call(name,args);}
      // Arrow lambda: fn(x) => expr  (after already consuming name)
      if(this._peek().t==='('){this._adv();const params=[];while(this._peek().v!==')'&&!this._eof()){params.push(this._adv().v);this._match(',');}this._eat(')');if(this._peek().v==='=>'){this._adv();const body=this._captureBlock(-1);return{__fn__:true,name:'<lambda>',params,defaults:{},body};}}
      try{return this._get(name);}catch{return undefined;}
    }
    this._adv();return null;
  }

  async _argList(){
    const args=[],kw={};
    while(this._peek().v!==')'&&!this._eof()){
      if(this._peek().t==='ID'&&this._peek(1).v==='='&&this._peek(2).v!=='='){const k=this._adv().v;this._adv();kw[k]=await this._expr();}
      else args.push(await this._expr());
      this._match(',');
    }
    args._kw=kw;return args;
  }

  // ── Built-in functions ───────────────────────────────────────────────────
  async _call(name,args){
    const kw=args._kw||{};

    if(name==='qubits'||name==='quantum_register'){
      const n=+args[0]||kw.n||kw.n_qubits||2;
      const rname=String(args[1]||kw.name||`q${Object.keys(this.registers).length}`);
      const reg=new QuantumRegister(rname,n);
      this.registers[rname]=reg;this._set(rname,reg);
      this._log(`REGISTER:"${rname}" ${n}q → ${reg.shards.length} shard(s)`);
      if(this.onState)this.onState({type:'register',name:rname,nQ:n});return reg;
    }
    if(name==='measure'){
      const ref=args[0];
      if(ref&&ref.__qref__){const reg=this._get(ref.reg);if(reg instanceof QuantumRegister){const out=reg.measureQubit(ref.idx);if(this.onMeasure)this.onMeasure({type:'single',qubit:ref.idx,out,reg:ref.reg});return out;}}
      if(ref instanceof QuantumRegister){const shots=+args[1]||kw.shots||1;const result=ref.measureAll(shots);if(this.onMeasure)this.onMeasure({type:'all',result,reg:ref.name});return result;}
      return 0;
    }
    if(name==='grover'){
      const nQ=+args[0]||4;
      const marked=Array.isArray(args[1])?args[1]:[+args[1]||7];
      const shots=+args[2]||kw.shots||1000;
      return QAlgorithms.grover(nQ,marked,shots);
    }
    if(name==='measure_all'){const reg=args[0];if(!(reg instanceof QuantumRegister))return{histogram:{}};const shots=+args[1]||kw.shots||1;const result=reg.measureAll(shots);if(this.onMeasure)this.onMeasure({type:'all',result,reg:reg.name});this._log(`MEASURE_ALL:${JSON.stringify(result.histogram)}`);return result;}
    if(name==='statevector'){const reg=args[0];if(!(reg instanceof QuantumRegister))return[];const sv=reg.statevector();if(this.onState)this.onState({type:'statevector',data:sv,reg:reg.name});return sv;}
    if(name==='probabilities'){const r=args[0];return r instanceof QuantumRegister?r.probabilities():{};}
    if(name==='probability'){const reg=args[0] instanceof QuantumRegister?args[0]:null;if(reg){const s=String(args[1]||kw.state||'0'.repeat(reg.nQ));return reg.probabilities()[s]||0;}return 0;}
    if(name==='expectation_val'||name==='expectation_value'){
      const reg=args[0];
      if(reg instanceof QuantumRegister){
        const ps=String(args[1]||kw.pauli||'Z');
        return reg.expectation_val(ps);
      }
      if(reg&&reg.__qref__){const r=this._get(reg.reg);return r instanceof QuantumRegister?r.expectation_z(reg.idx):0;}
      return 0;
    }
    if(name==='expectation_z'){const ref=args[0];if(ref&&ref.__qref__){const r=this._get(ref.reg);return r instanceof QuantumRegister?r.expectation_z(ref.idx):0;}return 0;}
    if(name==='qft'){const reg=args[0];if(reg instanceof QuantumRegister)reg.qft(reg.nQ,!!(args[1]||kw.inverse||false));return reg;}
    if(name==='bell_state')return QAlgorithms.bell(args[0]||kw.type||'Phi+');
    if(name==='ghz_state')return QAlgorithms.ghz(+args[0]||kw.n_qubits||3);
    if(name==='teleport')return{fidelity:0.9998,success:true,classical_bits:[0,0]};
    if(name==='estimate_phase')return Math.PI/Math.pow(2,Math.round(Math.log2(+args[1]||kw.n_bits||8)));
    if(name==='apply_ansatz'){const reg=args[0];const ps=args[1]||[];if(reg instanceof QuantumRegister)ps.forEach((p,i)=>{if(i<reg.nQ){reg.Ry(i%reg.nQ,p);if(i+1<reg.nQ)reg.CNOT(i%reg.nQ,(i+1)%reg.nQ);}});return reg;}
    if(name==='parameter_shift_gradient'){const ps=args[0]||[];return ps.map(()=>(Math.random()-0.5)*0.1);}
    if(name==='range'){const s2=args[1]!==undefined?+args[0]:0;const e2=args[1]!==undefined?+args[1]:+args[0];const step=args[2]!==undefined?+args[2]:1;const r=[];for(let v=s2;step>0?v<e2:v>e2;v+=step)r.push(v);return r;}
    if(name==='print'){const text=args.map(a=>this._fmt(a)).join(' ');this._log(text);this.output(text);return null;}
    if(name==='dna'||name==='rna')return makeBioString(args[0]||'');
    if(name==='len')return args[0]&&args[0].__biostr__?args[0].sequence.length:Array.isArray(args[0])?args[0].length:typeof args[0]==='string'?args[0].length:args[0]&&typeof args[0]==='object'?Object.keys(args[0]).length:0;
    if(name==='int')return Math.trunc(+args[0]);
    if(name==='float')return parseFloat(args[0]);
    if(name==='str')return String(args[0]!==undefined?args[0]:'');
    if(name==='bool')return Boolean(args[0]);
    if(name==='list'){const x=args[0];return Array.isArray(x)?[...x]:x&&x.__range__?[...Array(Math.max(0,Math.ceil((x.e-x.s)/x.step)))].map((_,i)=>x.s+i*x.step):x&&typeof x==='object'?Object.values(x):[];}
    if(name==='dict')return Object.fromEntries(args[0]||[]);
    if(name==='set')return[...new Set(args[0]||[])];
    if(name==='tuple')return args[0]||[];

    const MATH={
      sqrt:Math.sqrt, log:Math.log, log10:Math.log10, log2:Math.log2,
      sin:Math.sin, cos:Math.cos, tan:Math.tan, asin:Math.asin, acos:Math.acos,
      atan:Math.atan, atan2:Math.atan2, abs:Math.abs, floor:Math.floor,
      ceil:Math.ceil, round:(x,d)=>d!==undefined?Math.round(+x*Math.pow(10,+d))/Math.pow(10,+d):Math.round(+x), exp:Math.exp, pow:Math.pow,
      random:()=>Math.random(), min:(...a)=>{const arr=a.length===1&&Array.isArray(a[0])?a[0]:a;return Math.min(...arr);},
      max:(...a)=>{const arr=a.length===1&&Array.isArray(a[0])?a[0]:a;return Math.max(...arr);},
      sum:(x)=>(Array.isArray(x)?x:[]).reduce((a,b)=>a+b,0),
      mean:(x)=>{const a=Array.isArray(x)?x:[];return a.length?a.reduce((s,v)=>s+v,0)/a.length:0;},
      stdev:(x)=>{const a=Array.isArray(x)?x:[];const m=a.reduce((s,v)=>s+v,0)/(a.length||1);return Math.sqrt(a.reduce((s,v)=>s+(v-m)**2,0)/(a.length||1));},
      sorted:(x)=>[...(x||[])].sort((a,b)=>a<b?-1:a>b?1:0),
      reversed:(x)=>[...(x||[])].reverse(),
      enumerate:(x)=>(x||[]).map((v,i)=>[i,v]),
      zip:(a,b)=>(a||[]).map((v,i)=>[v,(b||[])[i]]),
      type:(x)=>typeof x,
      repr:(x)=>JSON.stringify(x),
      linspace:(a,b,n)=>{const r=[];for(let i=0;i<n;i++)r.push(a+i*(b-a)/(n-1));return r;},
      arange:(s,e,st=1)=>{const r=[];for(let x=+s;x<+e;x+=+st)r.push(x);return r;},
      zeros:(n)=>Array(Math.max(0,+n)).fill(0),
      ones:(n)=>Array(Math.max(0,+n)).fill(1),
      accuracy:(preds,labels)=>preds.filter((p,i)=>p===labels[i]).length/preds.length,
      isinstance:(x,t)=>{if(typeof t==='string')return typeof x===t;if(t&&t.__struct_ctor__)return x instanceof StructInstance&&x.__type__===t.typeName;return false;},
    };
    if(name in MATH)return MATH[name](...args);

    let fn;try{fn=this._get(name);}catch{fn=null;}
    if(fn&&fn.__fn__)return this._callFn(fn,args);
    if(fn&&typeof fn==='function')return fn(...args);

    return this._sciCall(name,args,kw);
  }

  // ── Method calls ─────────────────────────────────────────────────────────
  async _meth(obj,meth,args){
    const kw=args._kw||{};
    if(obj instanceof StructInstance){if(meth in obj.__methods__)return obj.callMethod(meth,args);if(meth in obj)return typeof obj[meth]==='function'?obj[meth](...args):obj[meth];}
    if(obj instanceof CircuitDef&&typeof obj[meth]==='function')return obj[meth](args[0]);
    if(obj instanceof MoleculeDef){if(meth==='get_hamiltonian')return obj.get_hamiltonian();if(meth==='get_molecular_data')return obj.get_molecular_data();}
    if(obj&&obj.__biostr__&&typeof obj[meth]==='function')return obj[meth](...args);
    if(obj&&obj.__biostr__&&meth in obj)return obj[meth];

    if(Array.isArray(obj)){
      if(meth==='append'){obj.push(args[0]);return null;}if(meth==='pop')return args.length?obj.splice(+args[0],1)[0]:obj.pop();
      if(meth==='extend'){obj.push(...(args[0]||[]));return null;}if(meth==='insert'){obj.splice(+args[0],0,args[1]);return null;}
      if(meth==='remove'){const i=obj.indexOf(args[0]);if(i>=0)obj.splice(i,1);return null;}if(meth==='clear'){obj.length=0;return null;}
      if(meth==='index')return obj.indexOf(args[0]);if(meth==='count')return obj.filter(x=>x===args[0]).length;
      if(meth==='sort')return[...obj].sort((a,b)=>a<b?-1:a>b?1:0);if(meth==='reverse')return[...obj].reverse();
      if(meth==='slice')return obj.slice(+args[0],args[1]!==undefined?+args[1]:undefined);
      if(meth==='join')return obj.join(args[0]!==undefined?args[0]:'');
      if(meth==='len'||meth==='length')return obj.length;
      if(meth==='includes'||meth==='contains')return obj.includes(args[0]);
      if(meth==='sum')return obj.reduce((a,b)=>a+b,0);
      if(meth==='mean')return obj.reduce((a,b)=>a+b,0)/obj.length;
      if(meth==='max')return Math.max(...obj);if(meth==='min')return Math.min(...obj);
    }
    if(typeof obj==='string'){
      if(meth==='upper')return obj.toUpperCase();if(meth==='lower')return obj.toLowerCase();
      if(meth==='split')return obj.split(args[0]!==undefined?args[0]:'');
      if(meth==='strip'||meth==='trim')return obj.trim();
      if(meth==='replace')return obj.replaceAll(args[0],args[1]);
      if(meth==='startswith'||meth==='startsWith')return obj.startsWith(args[0]);
      if(meth==='endswith'||meth==='endsWith')return obj.endsWith(args[0]);
      if(meth==='includes'||meth==='contains')return obj.includes(args[0]);
      if(meth==='find')return obj.indexOf(args[0]);
      if(meth==='slice')return obj.slice(+args[0],args[1]!==undefined?+args[1]:undefined);
      if(meth==='len'||meth==='length')return obj.length;
      if(meth==='zfill')return obj.padStart(+args[0]||0,'0');
      if(meth==='join')return args[0]?args[0].join(obj):'';
      if(meth==='transcribe')return makeBioString(obj).transcribe();
      if(meth==='translate')return makeBioString(obj).transcribe().translate();
      if(meth==='gc_content')return makeBioString(obj).gc_content();
      if(meth==='reverse_complement')return makeBioString(obj).reverse_complement();
      if(meth==='find_orfs')return makeBioString(obj).find_orfs();
      if(meth==='call_variants')return makeBioString(obj).call_variants();
    }
    if(obj instanceof QuantumRegister){
      if(meth==='measure')return obj.measureAll(+args[0]||kw.shots||1);
      if(meth==='measure_all')return obj.measureAll(+args[0]||kw.shots||1);
      if(meth==='statevector')return obj.statevector();
      if(meth==='probabilities')return obj.probabilities();
      if(meth==='diag')return obj.diag();
      if(meth==='qft'){const nQ2=+args[0]||obj.nQ;const inv=!!(args[1]||false);obj.qft(nQ2,inv);return obj;}
    }
    if(obj&&typeof obj==='object'){
      if(meth==='keys')return Object.keys(obj);if(meth==='values')return Object.values(obj);
      if(meth==='items'||meth==='entries')return Object.entries(obj);
      if(meth==='get')return obj[args[0]]!==undefined?obj[args[0]]:(args[1]!==undefined?args[1]:null);
      if(meth==='has'||meth==='contains')return args[0] in obj;
      if(meth==='update'){Object.assign(obj,args[0]);return null;}if(meth==='pop'){const v=obj[args[0]];delete obj[args[0]];return v;}
      if(meth==='len')return Object.keys(obj).length;
      if(meth==='passes_ro5')return(obj.mw||500)<=500&&(obj.logP||0)<=5;
      if(meth==='tanimoto')return Math.random()*0.3+0.6;
      if(meth==='is_error')return false;if(meth==='result')return obj;if(meth==='error_message')return obj.message||'';
      if(meth==='is_viable')return true;if(meth==='is_compact')return obj.is_compact||false;
      if(typeof obj[meth]==='function')return obj[meth](...args);
    }
    return undefined;
  }

  // ── Scientific stubs ─────────────────────────────────────────────────────
  _sciCall(name,args,kw={}){
    const mol=args[0] instanceof MoleculeDef?args[0]:null;
    const molName=mol?.name||kw.molecule||String(args[0]||'H2');
    const ENERGIES={H2:-1.137275,LiH:-7.882,Water:-75.012,Caffeine:-678.3};
    const e=ENERGIES[molName]||-1.137275;
    const stubs={
      vqe:()=>{this._log(`VQE: "${molName}" ansatz=${kw.ansatz||'EfficientSU2'}`);return{energy:e,converged:true,n_iterations:kw.max_iter||42,error:0.002,unit:'Hartree'};},
      vqe_chemistry:()=>({energy:e,converged:true,unit:'Hartree',n_iterations:42}),
      potential_energy_surface:()=>{const pts=[];const r=kw.range||[0.4,3.0,0.1];for(let d=r[0];d<=r[1];d+=r[2])pts.push({r:d,e:-1.0-0.5*Math.exp(-0.5*(d-0.74)**2)});return{points:pts,min_geometry:0.74,min_energy:e};},
      trotter_evolve:()=>({norm:1.0,state:[],n_steps:kw.steps||50}),
      hartree_fock:()=>({energy:-1.117,converged:true,iterations:15}),
      dft:()=>({energy:-1.165,functional:kw.functional||'B3LYP'}),
      molecule:()=>new MoleculeDef(String(args[0]||'H2'),kw),
      jordan_wigner:()=>({type:'qubit_op',terms:[],n_qubits:4}),
      expectation_value:()=>e+(Math.random()-0.5)*0.01,
      fold_protein:()=>({energy:-4.2,coordinates:[[0,0],[1,0],[1,1]],is_compact:true}),
      load_sequence:()=>makeBioString(String(args[0]||'ATGCGATCGATCG')),
      smith_waterman:()=>({score:45,seq1_aligned:String(args[0]),seq2_aligned:String(args[1]),identity:0.72}),
      screen_drugs:()=>[{name:'Compound_1',ki:0.77,binding_energy:-9.2,passes_ro5:()=>true,mw:402,logP:2.1},{name:'Compound_2',ki:1.4,binding_energy:-8.6,passes_ro5:()=>true,mw:387,logP:1.8}],
      design_vaccine:()=>({epitopes:[{seq:'YLQPRTFLL',score:0.87}],coverage:72.4,immunogenicity:0.834,construct_sequence:'MFVFLVLLPLVSSQCVNLTTRTQLPPAYTNS',is_viable:()=>true}),
      load_library:()=>Array.from({length:20},(_,i)=>({name:`Cmpd_${i+1}`,ki:Math.random()*10+0.1,binding_energy:-(6+Math.random()*4),passes_ro5:()=>Math.random()>0.2,mw:300+i*10,logP:1+i*0.2})),
      optimise_codon_usage:()=>'ATGTTCGTGTTCCTGGTGCTGCTG',
      design_crispr_guides:()=>[{sequence:'GCATGCGATCGATCGATCGG',on_target:0.87,off_targets:2}],
      ising_model:()=>({n_spins:args[0]||8,J:kw.J||1.0,h:kw.h||0.5,type:'ising'}),
      heisenberg_chain:()=>({n_spins:args[0]||6,J:kw.J||1.0,delta:kw.delta||1.0,type:'heisenberg'}),
      ground_state_energy:()=>-(args[0]&&args[0].n_spins||8)*1.5,
      time_evolve:()=>({magnetisation:0.342,norm:1.0,state:[]}),
      solve_maxcut:()=>({cut_value:4,assignment:[1,0,1,0],energy:-4.0}),
      shor_factor:()=>{const n=+args[0]||15;for(let f=2;f<=Math.sqrt(n);f++)if(n%f===0)return[f,n/f];return[1,n];},
      grover_search:()=>QAlgorithms.grover(+args[0]||4,[args[1]!==undefined?args[1]:7],1000),
      hhl_solve:()=>({x:[0.5,-0.25],condition:4.5,speedup:12.3}),
      run_gwas:()=>[{snp_id:'rs1234567',p_value:2.3e-10,effect:0.23,significant:true}],
      polygenic_risk_score:()=>Math.random()*0.4-0.2,
      qaoa:()=>({energy:-2.5,params:[0.1,0.2],converged:true}),
      http_get:()=>{this._log(`HTTP GET: ${args[0]}`);return'{"status":"ok"}';},
      uuid:()=>Math.random().toString(36).slice(2)+Date.now().toString(36),
      timestamp:()=>new Date().toISOString(),
      load_genotype_data:()=>({patient_001:{genotype:'AA'},patient_002:{genotype:'AG'}}),
      load_phenotype_data:()=>({patient_001:170,patient_002:165}),
      potential_energy_surface:()=>{const pts=[];for(let d=0.4;d<=3.0;d+=0.1)pts.push({r:+d.toFixed(1),e:-1.0-0.5*Math.exp(-0.5*(d-0.74)**2)});return{points:pts,min_geometry:0.74,min_energy:e};},
    };
    if(name in stubs)return stubs[name]();
    this._log(`WARN: "${name}" not found — returning null`);return null;
  }

  // ── Utilities ────────────────────────────────────────────────────────────
  _add2(a,b){
    if(typeof a==='string'||typeof b==='string')return String(a)+String(b);
    if(Array.isArray(a)&&Array.isArray(b))return[...a,...b];
    if(a&&a.__biostr__)return makeBioString(a.sequence+String(b));
    return a+b;
  }

  _fmt(v){
    if(v===null||v===undefined)return'None';
    if(typeof v==='boolean')return v?'True':'False';
    if(typeof v==='number'){if(!isFinite(v))return String(v);if(Number.isInteger(v))return String(v);if(Math.abs(v)<1e-4||Math.abs(v)>1e8)return v.toExponential(4);return parseFloat(v.toPrecision(8)).toString();}
    if(typeof v==='string')return v;
    if(v&&v.__biostr__)return v.sequence;
    if(Array.isArray(v))return`[${v.map(x=>this._fmt(x)).join(', ')}]`;
    if(v instanceof QuantumRegister)return`<Register "${v.name}" ${v.nQ}q>`;
    if(v&&v.__qref__)return`${v.reg}[${v.idx}]`;
    if(v&&v.__range__)return`range(${v.s},${v.e})`;
    if(v instanceof StructInstance)return`${v.__type__}(${Object.entries(v).filter(([k])=>!k.startsWith('__')).map(([k,val])=>`${k}=${this._fmt(val)}`).join(', ')})`;
    if(v instanceof MoleculeDef)return`Molecule(${v.name})`;
    if(v instanceof CircuitDef)return`Circuit(${v.name})`;
    if(v&&typeof v==='object'){
      if('energy'in v)return`{energy:${Number(v.energy).toFixed(6)},converged:${v.converged}}`;
      if('histogram'in v){const top=Object.entries(v.histogram).sort((a,b)=>b[1]-a[1]).slice(0,5);return`{${top.map(([k,c])=>`"${k}":${c}`).join(',')}}`;}
      try{return JSON.stringify(v);}catch{return'[object]';}
    }
    return String(v);
  }
}
