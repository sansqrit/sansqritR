/*!
 * quantum_engine/src/lib.rs  — Sanskrit Visual Builder · Rust Engine v3.1
 * All 15 JS bugs fixed. Compiles to WASM (wasm-pack) and native (cargo test).
 */
#![allow(non_snake_case, clippy::upper_case_acronyms, dead_code)]
use std::collections::{HashMap, HashSet};
use std::f64::consts::PI;
use serde::{Deserialize, Serialize};
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

// === COMPLEX ================================================================
#[derive(Clone,Copy,Debug,PartialEq,Serialize,Deserialize)]
pub struct C64 { pub re: f64, pub im: f64 }
impl C64 {
    #[inline] pub const fn new(re:f64,im:f64)->Self{Self{re,im}}
    #[inline] pub const fn zero()->Self{Self::new(0.,0.)}
    #[inline] pub const fn one()->Self{Self::new(1.,0.)}
    #[inline] pub fn phase(t:f64)->Self{Self::new(t.cos(),t.sin())}
    #[inline] pub fn norm_sq(self)->f64{self.re*self.re+self.im*self.im}
    #[inline] pub fn conj(self)->Self{Self::new(self.re,-self.im)}
    #[inline] pub fn scale(self,s:f64)->Self{Self::new(self.re*s,self.im*s)}
}
impl std::ops::Add for C64{type Output=Self;#[inline]fn add(self,b:Self)->Self{Self::new(self.re+b.re,self.im+b.im)}}
impl std::ops::Sub for C64{type Output=Self;#[inline]fn sub(self,b:Self)->Self{Self::new(self.re-b.re,self.im-b.im)}}
impl std::ops::Mul for C64{type Output=Self;#[inline]fn mul(self,b:Self)->Self{Self::new(self.re*b.re-self.im*b.im,self.re*b.im+self.im*b.re)}}
impl std::ops::Neg for C64{type Output=Self;#[inline]fn neg(self)->Self{Self::new(-self.re,-self.im)}}
const Z0:C64=C64::zero(); const O:C64=C64::one();
const N1:C64=C64::new(-1.,0.); const I_:C64=C64::new(0.,1.); const NI:C64=C64::new(0.,-1.);
fn s2()->f64{std::f64::consts::FRAC_1_SQRT_2}
type G2=[[C64;2];2];
fn gI()->G2{[[O,Z0],[Z0,O]]}
fn gX()->G2{[[Z0,O],[O,Z0]]}
fn gY()->G2{[[Z0,NI],[I_,Z0]]}
fn gZ()->G2{[[O,Z0],[Z0,N1]]}
fn gH()->G2{let s=s2();[[C64::new(s,0.),C64::new(s,0.)],[C64::new(s,0.),C64::new(-s,0.)]]}
fn gS()->G2{[[O,Z0],[Z0,I_]]}
fn gSdg()->G2{[[O,Z0],[Z0,NI]]}
fn gT()->G2{[[O,Z0],[Z0,C64::phase(PI/4.)]]}
fn gTdg()->G2{[[O,Z0],[Z0,C64::phase(-PI/4.)]]}
fn gSX()->G2{[[C64::new(0.5,0.5),C64::new(0.5,-0.5)],[C64::new(0.5,-0.5),C64::new(0.5,0.5)]]}
pub fn named_gate(n:&str)->Option<G2>{Some(match n{"I"=>gI(),"X"=>gX(),"Y"=>gY(),"Z"=>gZ(),"H"=>gH(),"S"=>gS(),"Sdg"=>gSdg(),"T"=>gT(),"Tdg"=>gTdg(),"SX"=>gSX(),_=>return None})}
pub fn param_gate(n:&str,t:f64,p:f64,l:f64)->Option<G2>{
    let(c,s)=((t/2.).cos(),(t/2.).sin());
    Some(match n{
        "Rx"=>[[C64::new(c,0.),C64::new(0.,-s)],[C64::new(0.,-s),C64::new(c,0.)]],
        "Ry"=>[[C64::new(c,0.),C64::new(-s,0.)],[C64::new(s,0.),C64::new(c,0.)]],
        "Rz"=>[[C64::phase(-t/2.),Z0],[Z0,C64::phase(t/2.)]],
        "P" =>[[O,Z0],[Z0,C64::phase(t)]],
        "U3"=>{let ep=C64::phase(p);let el=C64::phase(l);let epl=C64::phase(p+l);
               [[C64::new(c,0.),C64::new(-s,0.)*el],[C64::new(s,0.)*ep,C64::new(c,0.)*epl]]},
        _=>return None
    })
}

// === AMPS ===================================================================
const PRUNE:f64=1e-24; const DENSE_THRESH:f64=0.12;
enum Stor{Sp(HashMap<u64,C64>),De(Vec<f64>)}
pub struct Amps{pub size:usize,s:Stor}
impl Amps{
    pub fn new(sz:usize)->Self{Self{size:sz,s:Stor::Sp(HashMap::new())}}
    pub fn set(&mut self,i:u64,a:C64){
        if a.norm_sq()<PRUNE{self.del(i);return;}
        match &mut self.s{
            Stor::De(v)=>{v[i as usize*2]=a.re;v[i as usize*2+1]=a.im;}
            Stor::Sp(m)=>{m.insert(i,a);if m.len() as f64/self.size as f64>=DENSE_THRESH{self.dense();}}
        }
    }
    pub fn get(&self,i:u64)->C64{match &self.s{Stor::De(v)=>{let k=i as usize*2;C64::new(v[k],v[k+1])}Stor::Sp(m)=>*m.get(&i).unwrap_or(&Z0)}}
    pub fn del(&mut self,i:u64){match &mut self.s{Stor::De(v)=>{let k=i as usize*2;v[k]=0.;v[k+1]=0.;}Stor::Sp(m)=>{m.remove(&i);}}}
    pub fn each<F:FnMut(u64,C64)>(&self,mut f:F){match &self.s{
        Stor::De(v)=>{for i in 0..self.size{let r=v[i*2];let im=v[i*2+1];if r*r+im*im>1e-28{f(i as u64,C64::new(r,im));}}}
        Stor::Sp(m)=>{for(&i,&a) in m{f(i,a);}}
    }}
    pub fn renorm(&mut self){let mut n2=0.;self.each(|_,a|{n2+=a.norm_sq();});if(n2-1.).abs()<1e-10{return;}let s=1./n2.sqrt().max(1e-30);match &mut self.s{Stor::De(v)=>{for x in v.iter_mut(){*x*=s;}}Stor::Sp(m)=>{for a in m.values_mut(){*a=a.scale(s);}}}}
    pub fn clone_a(&self)->Self{let s=match &self.s{Stor::De(v)=>Stor::De(v.clone()),Stor::Sp(m)=>Stor::Sp(m.clone())};Self{size:self.size,s}}
    fn dense(&mut self){if let Stor::Sp(m)=&self.s{let mut v=vec![0.;self.size*2];for(&i,&a) in m{v[i as usize*2]=a.re;v[i as usize*2+1]=a.im;}self.s=Stor::De(v);}}
}

// === RNG ====================================================================
#[cfg(target_arch="wasm32")] fn rng()->f64{js_sys::Math::random()}
#[cfg(not(target_arch="wasm32"))] fn rng()->f64{
    use std::sync::atomic::{AtomicU64,Ordering};
    static S:AtomicU64=AtomicU64::new(0x853c49e6748fea9b);
    let mut x=S.load(Ordering::Relaxed);
    x^=x<<13;x^=x>>7;x^=x<<17;S.store(x,Ordering::Relaxed);
    (x>>11) as f64*(1./(1u64<<53) as f64)
}

// === SHARD ==================================================================
pub struct Shard{pub id:usize,pub sq:usize,pub nq:usize,pub sz:usize,pub a:Amps,pub gc:u64}
impl Shard{
    pub fn new(id:usize,sq:usize,nq:usize)->Self{
        let sz=1<<nq;let mut a=Amps::new(sz);a.set(0,O);
        Self{id,sq,nq,sz,a,gc:0}
    }
    // BUG#1 FIX: HashSet anchors cover both |0> and |1> components
    pub fn g1(&mut self,lq:usize,gate:G2){
        let[[a,b],[c,d]]=gate; let st=1u64<<lq;
        let mut anc:HashSet<u64>=HashSet::new();
        self.a.each(|i,_|{anc.insert(i&!st);});
        for &i0 in &anc{let i1=i0|st;let a0=self.a.get(i0);let a1=self.a.get(i1);self.a.set(i0,a*a0+b*a1);self.a.set(i1,c*a0+d*a1);}
        self.gc+=1;if self.gc%100==0{self.a.renorm();}
    }
    pub fn gate(&mut self,lq:usize,nm:&str){self.g1(lq,named_gate(nm).unwrap_or_else(||panic!("gate {}",nm)));}
    pub fn param(&mut self,lq:usize,nm:&str,t:f64,p:f64,l:f64){self.g1(lq,param_gate(nm,t,p,l).unwrap_or_else(||panic!("param {}",nm)));}
    // BUG#2 FIX: anchors cover ctrl=1,tgt=1 case
    pub fn cnot(&mut self,c:usize,t:usize){
        let cm=1u64<<c;let tm=1u64<<t;let mut anc:HashSet<u64>=HashSet::new();
        self.a.each(|i,_|{if i&cm!=0{anc.insert(i&!tm);}});
        for &i0 in &anc{let i1=i0|tm;let a=self.a.get(i0);let b=self.a.get(i1);self.a.set(i0,b);self.a.set(i1,a);}
        self.gc+=1;
    }
    pub fn cz(&mut self,a:usize,b:usize){
        let ma=1u64<<a;let mb=1u64<<b;let mut fl:Vec<u64>=Vec::new();
        self.a.each(|i,_|{if i&ma!=0&&i&mb!=0{fl.push(i);}});
        for i in fl{let x=self.a.get(i);self.a.set(i,-x);}self.gc+=1;
    }
    // BUG#3 FIX: canonical anchor from both orientations
    pub fn swap(&mut self,a:usize,b:usize){
        let ma=1u64<<a;let mb=1u64<<b;let mut anc:HashSet<u64>=HashSet::new();
        self.a.each(|i,_|{let ha=i&ma!=0;let hb=i&mb!=0;if ha!=hb{anc.insert((i|ma)&!mb);}});
        for &i0 in &anc{let i1=(i0&!ma)|mb;let a=self.a.get(i0);let b=self.a.get(i1);self.a.set(i0,b);self.a.set(i1,a);}
        self.gc+=1;
    }
    // BUG#4 FIX: anchors for all ctrl1=1,ctrl2=1 states
    pub fn toff(&mut self,c1:usize,c2:usize,t:usize){
        let m1=1u64<<c1;let m2=1u64<<c2;let mt=1u64<<t;let mut anc:HashSet<u64>=HashSet::new();
        self.a.each(|i,_|{if i&m1!=0&&i&m2!=0{anc.insert(i&!mt);}});
        for &i0 in &anc{let i1=i0|mt;let a=self.a.get(i0);let b=self.a.get(i1);self.a.set(i0,b);self.a.set(i1,a);}
        self.gc+=1;
    }
    pub fn ncz(&mut self,bits:&[usize]){
        let mk:u64=bits.iter().fold(0u64,|acc,&q|acc|(1u64<<q));
        let mut fl:Vec<u64>=Vec::new();
        self.a.each(|i,_|{if i&mk==mk{fl.push(i);}});
        for i in fl{let a=self.a.get(i);self.a.set(i,-a);}self.gc+=1;
    }
    pub fn meas(&mut self,lq:usize)->u8{
        let mk=1u64<<lq;let mut p1=0.;
        self.a.each(|i,a|{if i&mk!=0{p1+=a.norm_sq();}});
        let out=if rng()<p1{1u8}else{0u8};
        let km=if out==1{mk}else{0};let sc=1./((if out==1{p1}else{1.-p1}).max(1e-15).sqrt());
        let mut dl:Vec<u64>=Vec::new();let mut up:Vec<(u64,C64)>=Vec::new();
        self.a.each(|i,a|{if(i&mk)==km{up.push((i,a.scale(sc)));}else{dl.push(i);}});
        for i in dl{self.a.del(i);}for(i,a)in up{self.a.set(i,a);}out
    }
    pub fn cln(&self)->Self{Self{id:self.id,sq:self.sq,nq:self.nq,sz:self.sz,a:self.a.clone_a(),gc:self.gc}}
}

// === QUANTUM REGISTER =======================================================
const SHSZ:usize=10;
pub struct QReg{pub name:String,pub nq:usize,pub shards:Vec<Shard>,log:Vec<String>}
impl QReg{
    pub fn new(nm:&str,nq:usize)->Self{
        assert!(nq>0);let mut sh=Vec::new();let mut i=0;
        while i<nq{let n=(nq-i).min(SHSZ);sh.push(Shard::new(sh.len(),i,n));i+=n;}
        let ns=sh.len();let mut r=Self{name:nm.to_string(),nq,shards:sh,log:Vec::new()};
        r.log(&format!("Reg \"{}\" {}q {}sh",nm,nq,ns));r
    }
    pub fn res(&self,q:usize)->(usize,usize){
        assert!(q<self.nq,"qubit {} OOB {}",q,self.nq);
        let mut c=0;for(si,s) in self.shards.iter().enumerate(){if q<c+s.nq{return(si,q-c);}c+=s.nq;}
        panic!("bug res({})",q)
    }
    fn log(&mut self,m:&str){self.log.push(m.to_string());}
    // BUG#5 FIX: A in LOW bits, B in HIGH bits
    pub fn merge(&mut self,sa:usize,sb:usize){
        let(s1,s2)=if sa<sb{(sa,sb)}else{(sb,sa)};
        let mut aa:Vec<(u64,C64)>=Vec::new();let mut ab:Vec<(u64,C64)>=Vec::new();
        self.shards[s1].a.each(|i,a|{aa.push((i,a));});
        self.shards[s2].a.each(|i,a|{ab.push((i,a));});
        let na=self.shards[s1].nq;let nb=self.shards[s2].nq;
        let nn=na+nb;let ns=1<<nn;let nsq=self.shards[s1].sq;
        let mut c=Shard::new(s1,nsq,nn);c.sz=ns;c.a=Amps::new(ns);
        for&(ia,aa) in&aa{for&(ib,ab) in&ab{c.a.set(ia|(ib<<na),aa*ab);}}
        self.shards[s1]=c;self.shards.remove(s2);
        let mut cum=0;for(i,s) in self.shards.iter_mut().enumerate(){s.id=i;s.sq=cum;cum+=s.nq;}
    }
    fn ess(&mut self,a:usize,b:usize){let(sa,_)=self.res(a);let(sb,_)=self.res(b);if sa!=sb{self.merge(sa,sb);}}

    // 1Q gates
    pub fn H(&mut self,q:usize){let(si,lq)=self.res(q);self.shards[si].gate(lq,"H");self.log(&format!("H[{}]",q));}
    pub fn X(&mut self,q:usize){let(si,lq)=self.res(q);self.shards[si].gate(lq,"X");}
    pub fn Y(&mut self,q:usize){let(si,lq)=self.res(q);self.shards[si].gate(lq,"Y");}
    pub fn Z(&mut self,q:usize){let(si,lq)=self.res(q);self.shards[si].gate(lq,"Z");}
    pub fn S(&mut self,q:usize){let(si,lq)=self.res(q);self.shards[si].gate(lq,"S");}
    pub fn Sdg(&mut self,q:usize){let(si,lq)=self.res(q);self.shards[si].gate(lq,"Sdg");}
    pub fn T(&mut self,q:usize){let(si,lq)=self.res(q);self.shards[si].gate(lq,"T");}
    pub fn Tdg(&mut self,q:usize){let(si,lq)=self.res(q);self.shards[si].gate(lq,"Tdg");}
    pub fn SX(&mut self,q:usize){let(si,lq)=self.res(q);self.shards[si].gate(lq,"SX");}
    pub fn Rx(&mut self,q:usize,t:f64){let(si,lq)=self.res(q);self.shards[si].param(lq,"Rx",t,0.,0.);}
    pub fn Ry(&mut self,q:usize,t:f64){let(si,lq)=self.res(q);self.shards[si].param(lq,"Ry",t,0.,0.);}
    pub fn Rz(&mut self,q:usize,t:f64){let(si,lq)=self.res(q);self.shards[si].param(lq,"Rz",t,0.,0.);}
    pub fn P(&mut self,q:usize,t:f64){let(si,lq)=self.res(q);self.shards[si].param(lq,"P",t,0.,0.);}
    pub fn U3(&mut self,q:usize,t:f64,p:f64,l:f64){let(si,lq)=self.res(q);self.shards[si].param(lq,"U3",t,p,l);}
    pub fn H_all(&mut self){for q in 0..self.nq{self.H(q);}}
    pub fn X_all(&mut self){for q in 0..self.nq{self.X(q);}}

    // 2Q gates
    pub fn CNOT(&mut self,c:usize,t:usize){assert_ne!(c,t);self.ess(c,t);let(si,lc)=self.res(c);let(_,lt)=self.res(t);self.shards[si].cnot(lc,lt);self.log(&format!("CNOT[{},{}]",c,t));}
    pub fn CX(&mut self,c:usize,t:usize){self.CNOT(c,t);}
    pub fn CZ(&mut self,a:usize,b:usize){self.ess(a,b);let(si,la)=self.res(a);let(_,lb)=self.res(b);self.shards[si].cz(la,lb);}
    pub fn CY(&mut self,c:usize,t:usize){self.Sdg(t);self.CNOT(c,t);self.S(t);}
    pub fn SWAP(&mut self,a:usize,b:usize){if a==b{return;}self.ess(a,b);let(si,la)=self.res(a);let(_,lb)=self.res(b);self.shards[si].swap(la,lb);}
    // BUG#7 FIX: H,CNOT(a,b),CNOT(b,a),H,S,S — not SWAP+S+S
    pub fn iSWAP(&mut self,a:usize,b:usize){self.H(a);self.CNOT(a,b);self.CNOT(b,a);self.H(b);self.S(a);self.S(b);}
    pub fn RZZ(&mut self,a:usize,b:usize,t:f64){self.CNOT(a,b);self.Rz(b,t);self.CNOT(a,b);}
    pub fn RXX(&mut self,a:usize,b:usize,t:f64){self.H(a);self.H(b);self.RZZ(a,b,t);self.H(a);self.H(b);}
    pub fn RYY(&mut self,a:usize,b:usize,t:f64){let p=PI/2.;self.Rx(a,p);self.Rx(b,p);self.RZZ(a,b,t);self.Rx(a,-p);self.Rx(b,-p);}
    pub fn MS(&mut self,a:usize,b:usize){self.RXX(a,b,PI/2.);}
    pub fn CP(&mut self,c:usize,t:usize,th:f64){
        self.ess(c,t);let(si,lc)=self.res(c);let(_,lt)=self.res(t);
        let mc=1u64<<lc;let mt=1u64<<lt;let ph=C64::phase(th);
        let mut tg:Vec<u64>=Vec::new();
        self.shards[si].a.each(|i,_|{if i&mc!=0&&i&mt!=0{tg.push(i);}});
        for i in tg{let a=self.shards[si].a.get(i);self.shards[si].a.set(i,a*ph);}
    }
    pub fn CRz(&mut self,c:usize,t:usize,th:f64){self.Rz(t,th/2.);self.CNOT(c,t);self.Rz(t,-th/2.);self.CNOT(c,t);}

    // 3Q gates
    pub fn Toffoli(&mut self,c1:usize,c2:usize,t:usize){
        let(s1,_)=self.res(c1);let(s2,_)=self.res(c2);if s1!=s2{self.merge(s1,s2);}
        let(s1b,_)=self.res(c1);let(st,_)=self.res(t);if s1b!=st{self.merge(s1b,st);}
        let(si,l1)=self.res(c1);let(_,l2)=self.res(c2);let(_,lt)=self.res(t);
        self.shards[si].toff(l1,l2,lt);
    }
    pub fn CCX(&mut self,c1:usize,c2:usize,t:usize){self.Toffoli(c1,c2,t);}
    pub fn Fredkin(&mut self,c:usize,a:usize,b:usize){self.CNOT(b,a);self.Toffoli(c,a,b);self.CNOT(b,a);}
    pub fn CSWAP(&mut self,c:usize,a:usize,b:usize){self.Fredkin(c,a,b);}
    pub fn barrier(&mut self){}
    pub fn reset(&mut self,q:usize){if self.mq(q)==1{self.X(q);}}

    // Measurement
    pub fn mq(&mut self,q:usize)->u8{let(si,lq)=self.res(q);self.shards[si].meas(lq)}
    pub fn measure_qubit(&mut self,q:usize)->u8{self.mq(q)}
    pub fn measure_all(&mut self,shots:usize)->HashMap<String,usize>{
        let mut h:HashMap<String,usize>=HashMap::new();
        if shots==1{let k:String=(0..self.nq).map(|q|if self.mq(q)==1{'1'}else{'0'}).collect();*h.entry(k).or_insert(0)+=1;return h;}
        let pr=self.probs_map();let st:Vec<String>=pr.keys().cloned().collect();
        let pv:Vec<f64>=st.iter().map(|s|*pr.get(s).unwrap()).collect();
        let mut cum=Vec::with_capacity(pv.len());let mut acc=0.;for&p in&pv{acc+=p;cum.push(acc);}
        for _ in 0..shots{let r=rng();let i=cum.partition_point(|&c|c<r).min(st.len().saturating_sub(1));*h.entry(st[i].clone()).or_insert(0)+=1;}
        h
    }
    pub fn probabilities(&self)->HashMap<String,f64>{self.probs_map()}

    // BUG#6 FIX: real {re,im} + reversed bit string
    pub fn statevector(&self)->Vec<SV>{
        let mut ent:Vec<(u64,C64,usize)>=Vec::new();
        self.shards[0].a.each(|i,a|{ent.push((i,a,self.shards[0].nq));});
        for si in 1..self.shards.len(){
            let sh=&self.shards[si];let mut nx:Vec<(u64,C64,usize)>=Vec::new();
            for&(ia,aa,cn) in&ent{sh.a.each(|ib,ab|{nx.push((ia|(ib<<cn),aa*ab,cn+sh.nq));});}
            ent=nx;
        }
        let nq=self.nq;
        let mut r:Vec<SV>=ent.iter().filter(|(_,a,_)|a.norm_sq()>1e-14)
            .map(|&(i,a,_)|{
                // LSB-first: string[j] = bit j of idx = qubit j
                let st:String=(0..nq).map(|j|if(i>>j)&1==1{'1'}else{'0'}).collect();
                SV{state:st,re:a.re,im:a.im,prob:a.norm_sq()}
            }).collect();
        r.sort_by(|a,b|b.prob.partial_cmp(&a.prob).unwrap_or(std::cmp::Ordering::Equal));r
    }

    pub fn expectation_val(&self,ps:&str)->f64{
        let ps=ps.to_uppercase();let mut cl=self.clone_r();
        for(i,c) in ps.chars().enumerate(){if i>=cl.nq{break;}match c{'X'=>{cl.H(i);}'Y'=>{cl.Sdg(i);cl.H(i);}_=>{}}}
        let pr=cl.probs_map();let mut ev=0.;
        for(st,&p) in&pr{let sg=st.chars().zip(ps.chars()).fold(1.,|s,(b,c)|if c!='I'&&b=='1'{-s}else{s});ev+=sg*p;}ev
    }
    pub fn expectation_z(&self,q:usize)->f64{
        let ps:String=(0..self.nq).map(|i|if i==q{'Z'}else{'I'}).collect();self.expectation_val(&ps)
    }
    // BUG#8 FIX: 2π/2^(k-j+1) not π/2^(k-j)
    pub fn qft(&mut self,nq:usize,inv:bool,off:usize){
        let sg=if inv{-1.}else{1.};
        for j in off..(off+nq){self.H(j);for k in(j+1)..(off+nq){let a=sg*2.*PI/(1u64<<(k-j+1))as f64;self.CP(k,j,a);}}
        for i in 0..nq/2{self.SWAP(off+i,off+nq-1-i);}
    }
    // BUG#10 FIX: proper n-controlled-Z for nq>2
    pub fn ncz_all(&mut self){
        match self.nq{1=>{self.Z(0);}2=>{self.CZ(0,1);}
        _=>{while self.shards.len()>1{self.merge(0,1);}let all:Vec<usize>=(0..self.nq).collect();self.shards[0].ncz(&all);}}
    }
    pub fn clone_r(&self)->Self{Self{name:format!("{}_c",self.name),nq:self.nq,shards:self.shards.iter().map(|s|s.cln()).collect(),log:Vec::new()}}
    fn probs_map(&self)->HashMap<String,f64>{let sv=self.statevector();let mut m:HashMap<String,f64>=HashMap::new();for e in sv{*m.entry(e.state).or_insert(0.)+=e.prob;}m}
    pub fn n_qubits(&self)->usize{self.nq}
    pub fn diag(&self)->String{format!("QReg \"{}\" {}q {} shards",self.name,self.nq,self.shards.len())}
}

#[derive(Clone,Debug,Serialize,Deserialize)]
pub struct SV{pub state:String,pub re:f64,pub im:f64,pub prob:f64}
// Also export as StateEntry alias for compatibility
pub type StateEntry=SV;

// === ALGORITHMS =============================================================
pub struct QAlg;
impl QAlg{
    pub fn bell()->QReg{let mut q=QReg::new("q",2);q.H(0);q.CNOT(0,1);q}
    pub fn ghz(n:usize)->QReg{let mut q=QReg::new("q",n);q.H(0);for i in 1..n{q.CNOT(0,i);}q}
    pub fn grover(nq:usize,marked:&[usize],shots:usize)->HashMap<String,usize>{
        let mut q=QReg::new("q",nq);let bn=1usize<<nq;let m=marked.len().max(1);
        let th=((m as f64/bn as f64).sqrt()).asin();let it=((PI/(4.*th)).round() as usize).max(1);
        q.H_all();
        for _ in 0..it{
            for&tg in marked{
                for i in 0..nq{if(tg>>(nq-1-i))&1==0{q.X(i);}}
                q.ncz_all();
                for i in 0..nq{if(tg>>(nq-1-i))&1==0{q.X(i);}}
            }
            q.H_all();q.X_all();q.ncz_all();q.X_all();q.H_all();
        }
        q.measure_all(shots)
    }
}

// BUG#9 FIX: complex conjugate on bra
pub fn state_fidelity(sv1:&[SV],sv2:&[SV])->f64{
    let m:HashMap<&str,(f64,f64)>=sv2.iter().map(|e|(e.state.as_str(),(e.re,e.im))).collect();
    let(mut re,mut im)=(0.,0.);
    for e in sv1{if let Some(&(r2,i2))=m.get(e.state.as_str()){re+=e.re*r2+e.im*i2;im+=e.re*i2-e.im*r2;}}
    re*re+im*im
}

// === WASM BINDINGS ==========================================================
#[cfg(target_arch="wasm32")] use js_sys;
#[cfg(target_arch="wasm32")]
#[wasm_bindgen] pub struct WasmReg{i:QReg}
#[cfg(target_arch="wasm32")]
#[wasm_bindgen] impl WasmReg{
    #[wasm_bindgen(constructor)] pub fn new(nm:&str,nq:usize)->Self{
        #[cfg(feature="console_error_panic_hook")] console_error_panic_hook::set_once();
        Self{i:QReg::new(nm,nq)}
    }
    pub fn H(&mut self,q:usize){self.i.H(q);}  pub fn X(&mut self,q:usize){self.i.X(q);}
    pub fn Y(&mut self,q:usize){self.i.Y(q);}  pub fn Z(&mut self,q:usize){self.i.Z(q);}
    pub fn S(&mut self,q:usize){self.i.S(q);}  pub fn Sdg(&mut self,q:usize){self.i.Sdg(q);}
    pub fn T(&mut self,q:usize){self.i.T(q);}  pub fn Tdg(&mut self,q:usize){self.i.Tdg(q);}
    pub fn SX(&mut self,q:usize){self.i.SX(q);} pub fn H_all(&mut self){self.i.H_all();} pub fn X_all(&mut self){self.i.X_all();}
    pub fn Rx(&mut self,q:usize,t:f64){self.i.Rx(q,t);} pub fn Ry(&mut self,q:usize,t:f64){self.i.Ry(q,t);}
    pub fn Rz(&mut self,q:usize,t:f64){self.i.Rz(q,t);} pub fn P(&mut self,q:usize,t:f64){self.i.P(q,t);}
    pub fn U3(&mut self,q:usize,t:f64,p:f64,l:f64){self.i.U3(q,t,p,l);}
    pub fn CNOT(&mut self,c:usize,t:usize){self.i.CNOT(c,t);}  pub fn CX(&mut self,c:usize,t:usize){self.i.CX(c,t);}
    pub fn CZ(&mut self,a:usize,b:usize){self.i.CZ(a,b);}      pub fn CY(&mut self,c:usize,t:usize){self.i.CY(c,t);}
    pub fn SWAP(&mut self,a:usize,b:usize){self.i.SWAP(a,b);}  pub fn iSWAP(&mut self,a:usize,b:usize){self.i.iSWAP(a,b);}
    pub fn RZZ(&mut self,a:usize,b:usize,t:f64){self.i.RZZ(a,b,t);} pub fn RXX(&mut self,a:usize,b:usize,t:f64){self.i.RXX(a,b,t);}
    pub fn RYY(&mut self,a:usize,b:usize,t:f64){self.i.RYY(a,b,t);} pub fn MS(&mut self,a:usize,b:usize){self.i.MS(a,b);}
    pub fn CP(&mut self,c:usize,t:usize,th:f64){self.i.CP(c,t,th);} pub fn CRz(&mut self,c:usize,t:usize,th:f64){self.i.CRz(c,t,th);}
    pub fn Toffoli(&mut self,c1:usize,c2:usize,t:usize){self.i.Toffoli(c1,c2,t);}
    pub fn CCX(&mut self,c1:usize,c2:usize,t:usize){self.i.CCX(c1,c2,t);}
    pub fn Fredkin(&mut self,c:usize,a:usize,b:usize){self.i.Fredkin(c,a,b);}
    pub fn CSWAP(&mut self,c:usize,a:usize,b:usize){self.i.CSWAP(c,a,b);}
    pub fn barrier(&mut self){self.i.barrier();} pub fn reset(&mut self,q:usize){self.i.reset(q);}
    pub fn qft(&mut self,nq:usize,inv:bool){self.i.qft(nq,inv,0);}
    pub fn measure_qubit(&mut self,q:usize)->u8{self.i.mq(q)}
    pub fn measure_all(&mut self,shots:usize)->String{serde_json::to_string(&self.i.measure_all(shots)).unwrap_or_default()}
    pub fn statevector(&self)->String{serde_json::to_string(&self.i.statevector()).unwrap_or_default()}
    pub fn probabilities(&self)->String{serde_json::to_string(&self.i.probabilities()).unwrap_or_default()}
    pub fn expectation_val(&self,ps:&str)->f64{self.i.expectation_val(ps)}
    pub fn expectation_z(&self,q:usize)->f64{self.i.expectation_z(q)}
    pub fn n_qubits(&self)->usize{self.i.nq} pub fn diag(&self)->String{self.i.diag()}
}
#[cfg(target_arch="wasm32")]
#[wasm_bindgen] pub fn grover_search(nq:usize,tg:usize,shots:usize)->String{serde_json::to_string(&QAlg::grover(nq,&[tg],shots)).unwrap_or_default()}
#[cfg(target_arch="wasm32")]
#[wasm_bindgen] pub fn bell_state(shots:usize)->String{serde_json::to_string(&QAlg::bell().measure_all(shots)).unwrap_or_default()}
#[cfg(target_arch="wasm32")]
#[wasm_bindgen] pub fn ghz_state(n:usize,shots:usize)->String{serde_json::to_string(&QAlg::ghz(n).measure_all(shots)).unwrap_or_default()}
#[cfg(target_arch="wasm32")]
#[wasm_bindgen] pub fn wasm_fidelity(s1:&str,s2:&str)->f64{
    let v1:Vec<SV>=serde_json::from_str(s1).unwrap_or_default();
    let v2:Vec<SV>=serde_json::from_str(s2).unwrap_or_default();
    state_fidelity(&v1,&v2)
}

// === TESTS ==================================================================
#[cfg(test)]
mod tests{
    use super::*;
    fn prob(h:&HashMap<String,usize>,s:&str,n:usize)->f64{*h.get(s).unwrap_or(&0) as f64/n as f64}

    #[test] fn s_on_one(){
        let mut q=QReg::new("q",1);q.X(0);q.S(0);
        let sv=q.statevector();assert_eq!(sv.len(),1);assert_eq!(sv[0].state,"1");
        assert!(sv[0].re.abs()<1e-10,"re={}",sv[0].re);assert!((sv[0].im-1.).abs()<1e-10,"im={}",sv[0].im);
    }
    #[test] fn h_s_plus_i(){
        let mut q=QReg::new("q",1);q.H(0);q.S(0);
        let sv=q.statevector();let e=sv.iter().find(|e|e.state=="1").unwrap();
        assert!(e.re.abs()<1e-10);assert!((e.im-std::f64::consts::FRAC_1_SQRT_2).abs()<1e-10,"im={}",e.im);
    }
    #[test] fn iswap_01(){
        let mut q=QReg::new("q",2);q.X(1);q.iSWAP(0,1);
        let h=q.measure_all(400);assert_eq!(*h.get("10").unwrap_or(&0),400,"iSWAP|01>={:?}",h);
    }
    #[test] fn iswap_11(){
        let mut q=QReg::new("q",2);q.X(0);q.X(1);q.iSWAP(0,1);
        let h=q.measure_all(200);assert_eq!(*h.get("11").unwrap_or(&0),200,"iSWAP|11>={:?}",h);
    }
    #[test] fn bell(){
        let mut q=QReg::new("q",2);q.H(0);q.CNOT(0,1);let h=q.measure_all(1000);
        assert_eq!(*h.get("01").unwrap_or(&0),0);assert_eq!(*h.get("10").unwrap_or(&0),0);
        assert!((prob(&h,"00",1000)-0.5).abs()<0.07);assert!((prob(&h,"11",1000)-0.5).abs()<0.07);
    }
    #[test] fn cross_shard_cnot(){
        let mut q=QReg::new("q",11);q.H(0);q.CNOT(0,10);let h=q.measure_all(400);
        assert_eq!(h.len(),2,"cross-shard bell={:?}",h);
        for k in h.keys(){let c:Vec<char>=k.chars().collect();assert_eq!(c[0],c[10],"k={}",k);}
    }
    #[test] fn cross_shard_toffoli(){
        let mut q=QReg::new("q",12);q.X(0);q.X(1);q.Toffoli(0,1,11);let h=q.measure_all(50);
        let k=h.keys().next().unwrap();let c:Vec<char>=k.chars().collect();
        assert_eq!(c[0],'1');assert_eq!(c[1],'1');assert_eq!(c[11],'1',"Toff k={}",k);
    }
    #[test] fn grover_4q(){
        let h=QAlg::grover(4,&[7],2000);let f=*h.get("0111").unwrap_or(&0);
        assert!(f as f64/2000.>0.90,"grover={:.1}%",f as f64/20.);
    }
    #[test] fn qft_roundtrip(){
        let mut q=QReg::new("q",4);q.X(0);q.X(2);q.qft(4,false,0);q.qft(4,true,0);
        let h=q.measure_all(100);assert_eq!(*h.get("1010").unwrap_or(&0),100,"qft={:?}",h);
    }
    #[test] fn ev_z(){
        let q=QReg::new("q",1);assert!((q.expectation_z(0)-1.).abs()<1e-10);
        let mut q1=QReg::new("q",1);q1.X(0);assert!((q1.expectation_z(0)+1.).abs()<1e-10);
        let mut qp=QReg::new("q",1);qp.H(0);assert!(qp.expectation_z(0).abs()<1e-10);
    }
    #[test] fn fidelity_tests(){
        let mut q=QReg::new("q",2);q.H(0);q.CNOT(0,1);let sv=q.statevector();
        assert!((state_fidelity(&sv,&sv)-1.).abs()<1e-10);
        let mut q1=QReg::new("q",1);q1.H(0);q1.S(0);let sv1=q1.statevector();
        let mut q2=QReg::new("q",1);q2.H(0);q2.Sdg(0);let sv2=q2.statevector();
        assert!(state_fidelity(&sv1,&sv2)<1e-10,"F(+i,-i)={}",state_fidelity(&sv1,&sv2));
    }
    #[test] fn rxx_entangles(){
        let mut q=QReg::new("q",2);q.RXX(0,1,PI/2.);let h=q.measure_all(600);
        assert_eq!(h.len(),2,"RXX={:?}",h);
        assert!((prob(&h,"00",600)-0.5).abs()<0.07);assert!((prob(&h,"11",600)-0.5).abs()<0.07);
    }
}
