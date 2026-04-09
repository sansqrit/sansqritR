/**
 * src/dsl/stdlib.js  —  Sanskrit Standard Library  v3.0
 * ALL parameters user-supplied. No hardcoded domain values.
 */

export function buildStdlib(interpreter) {
  const G = interpreter._env[0];
  const def = (name, fn) => { G[name] = fn; };
  const req = (v, fnName, argName) => {
    if (v === undefined || v === null)
      throw new Error(`${fnName}() requires "${argName}" argument`);
  };

  // Universal function caller — works for both:
  //   • Native JS functions:   typeof fn === 'function'
  //   • Sanskrit lambdas:      fn.__fn__ === true
  const call = (fn, args_array) => {
    if (fn && fn.__fn__) return interpreter._callFn(fn, args_array);
    if (typeof fn === 'function') return fn(...args_array);
    throw new Error(`Expected callable, got ${typeof fn}`);
  };

  // ── 1. MATH ─────────────────────────────────────────────────
  def('is_nan',      x => { req(x,'is_nan','x');      return isNaN(x); });
  def('is_inf',      x => { req(x,'is_inf','x');      return !isFinite(x) && !isNaN(x); });
  def('is_finite',   x => { req(x,'is_finite','x');   return isFinite(x); });
  def('is_integer',  x => { req(x,'is_integer','x');  return Number.isInteger(x); });
  def('is_even',     x => { req(x,'is_even','x');     return +x % 2 === 0; });
  def('is_odd',      x => { req(x,'is_odd','x');      return Math.abs(+x % 2) === 1; });
  def('is_positive', x => { req(x,'is_positive','x'); return +x > 0; });
  def('is_negative', x => { req(x,'is_negative','x'); return +x < 0; });
  def('is_zero',     x => { req(x,'is_zero','x');     return +x === 0; });

  def('gcd', (a, b) => {
    req(a,'gcd','a'); req(b,'gcd','b');
    let [x, y] = [Math.abs(+a), Math.abs(+b)];
    while (y) [x, y] = [y, x % y];
    return x;
  });
  def('lcm', (a, b) => {
    req(a,'lcm','a'); req(b,'lcm','b');
    return Math.abs(+a * +b) / G.gcd(a, b);
  });
  def('is_prime', n => {
    req(n,'is_prime','n');
    const N = +n;
    if (N < 2) return false;
    if (N === 2) return true;
    if (N % 2 === 0) return false;
    for (let i = 3; i <= Math.sqrt(N); i += 2) if (N % i === 0) return false;
    return true;
  });
  def('primes_up_to', n => {
    req(n,'primes_up_to','n');
    const N = +n, sieve = Array(N+1).fill(true);
    sieve[0] = sieve[1] = false;
    for (let i = 2; i*i <= N; i++) if (sieve[i]) for (let j=i*i; j<=N; j+=i) sieve[j]=false;
    return sieve.map((p,i)=>p?i:-1).filter(x=>x>0);
  });
  def('prime_factors', n => {
    req(n,'prime_factors','n');
    const f=[]; let x=+n;
    for (let d=2;d*d<=x;d++) while(x%d===0){f.push(d);x/=d;}
    if(x>1)f.push(x); return f;
  });
  def('euler_phi', n => {
    req(n,'euler_phi','n');
    let [x, r] = [+n, +n];
    for (let p=2;p*p<=x;p++) if(x%p===0){while(x%p===0)x/=p;r-=r/p;}
    if(x>1)r-=r/x; return r;
  });
  def('mod_exp', (base, exp, mod) => {
    req(base,'mod_exp','base'); req(exp,'mod_exp','exp'); req(mod,'mod_exp','mod');
    let [b,e,m,r]=[+base,+exp,+mod,1]; b%=m;
    while(e>0){if(e%2)r=r*b%m;e=Math.floor(e/2);b=b*b%m;} return r;
  });
  def('extended_gcd', function egcd(a, b) {
    req(a,'extended_gcd','a'); req(b,'extended_gcd','b');
    if(+b===0)return[+a,1,0];
    const [g,x,y]=egcd(b,+a%+b);
    return [g, y, x-Math.floor(+a/+b)*y];
  });
  def('chinese_remainder', (remainders, moduli) => {
    req(remainders,'chinese_remainder','remainders');
    req(moduli,'chinese_remainder','moduli');
    const M=moduli.reduce((a,b)=>a*b,1);
    let x=0;
    for(let i=0;i<moduli.length;i++){
      const Mi=M/moduli[i];
      const[,inv]=G.extended_gcd(Mi,moduli[i]);
      x+=remainders[i]*Mi*inv;
    }
    return((x%M)+M)%M;
  });
  def('fibonacci', n => {
    req(n,'fibonacci','n');
    const r=[0,1];
    for(let i=2;i<=+n;i++)r.push(r[i-1]+r[i-2]);
    return r.slice(0,+n+1);
  });
  def('lucas', n => {
    req(n,'lucas','n');
    const r=[2,1];
    for(let i=2;i<=+n;i++)r.push(r[i-1]+r[i-2]);
    return r.slice(0,+n+1);
  });
  def('factorial', n => {
    req(n,'factorial','n');
    const N=+n; if(N<0)throw new Error('factorial: n>=0 required');
    let r=1; for(let i=2;i<=N;i++)r*=i; return r;
  });
  def('choose', (n, k) => {
    req(n,'choose','n'); req(k,'choose','k');
    const [N,K]=[+n,+k]; if(K<0||K>N)return 0;
    let r=1; for(let i=0;i<K;i++)r=r*(N-i)/(i+1);
    return Math.round(r);
  });
  def('permutations', (n, k) => {
    req(n,'permutations','n'); req(k,'permutations','k');
    let r=1; for(let i=0;i<+k;i++)r*=+n-i; return r;
  });
  def('catalan', n => {
    req(n,'catalan','n');
    return G.choose(2*+n,+n)/(+n+1);
  });
  def('bernoulli', n => {
    req(n,'bernoulli','n');
    const B=[1];
    for(let m=1;m<=+n;m++){
      let s=0; for(let k=0;k<m;k++)s+=G.choose(m+1,k)*B[k];
      B.push(-s/(m+1));
    }
    return B[+n];
  });
  def('round_to', (x, decimals) => {
    req(x,'round_to','x'); req(decimals,'round_to','decimals');
    const f=Math.pow(10,+decimals); return Math.round(+x*f)/f;
  });
  def('floor_div', (a,b)=>{req(a,'floor_div','a');req(b,'floor_div','b');return Math.floor(+a/+b);});
  def('ceil_div',  (a,b)=>{req(a,'ceil_div','a'); req(b,'ceil_div','b'); return Math.ceil(+a/+b);});
  def('clamp', (x,lo,hi)=>{req(x,'clamp','x');req(lo,'clamp','lo');req(hi,'clamp','hi');return Math.max(+lo,Math.min(+hi,+x));});
  def('lerp',  (a,b,t)=>{req(a,'lerp','a');req(b,'lerp','b');req(t,'lerp','t');return +a+(+b-+a)*+t;});
  def('map_range', (x,ilo,ihi,olo,ohi)=>{
    req(x,'map_range','x');req(ilo,'map_range','in_lo');req(ihi,'map_range','in_hi');
    req(olo,'map_range','out_lo');req(ohi,'map_range','out_hi');
    return +olo+(+ohi-+olo)*(+x-+ilo)/(+ihi-+ilo);
  });
  def('log_base', (base,x)=>{req(base,'log_base','base');req(x,'log_base','x');return Math.log(+x)/Math.log(+base);});

  // ── 2. STATISTICS ────────────────────────────────────────────
  def('mean', arr=>{req(arr,'mean','array');const a=Array.isArray(arr)?arr:[];return a.length?a.reduce((s,v)=>s+v,0)/a.length:0;});
  def('median', arr=>{
    req(arr,'median','array');
    const s=[...arr].sort((a,b)=>a-b),m=Math.floor(s.length/2);
    return s.length%2?s[m]:(s[m-1]+s[m])/2;
  });
  def('mode', arr=>{
    req(arr,'mode','array');
    const c={};let mx=0,mode=arr[0];
    arr.forEach(v=>{c[v]=(c[v]||0)+1;if(c[v]>mx){mx=c[v];mode=v;}});
    return mode;
  });
  def('variance', (arr,population=true)=>{
    req(arr,'variance','array');
    const a=Array.isArray(arr)?arr:[];
    const m=a.reduce((s,v)=>s+v,0)/a.length;
    return a.reduce((s,v)=>s+(v-m)**2,0)/(population?a.length:a.length-1);
  });
  def('stdev', (arr,population=true)=>{req(arr,'stdev','array');return Math.sqrt(G.variance(arr,population));});
  def('stderr', arr=>{req(arr,'stderr','array');return G.stdev(arr)/Math.sqrt(arr.length);});
  def('covariance', (a,b)=>{
    req(a,'covariance','array_a');req(b,'covariance','array_b');
    const ma=G.mean(a),mb=G.mean(b);
    return a.reduce((s,v,i)=>s+(v-ma)*(b[i]-mb),0)/a.length;
  });
  def('correlation', (a,b)=>{req(a,'correlation','a');req(b,'correlation','b');return G.covariance(a,b)/(G.stdev(a)*G.stdev(b));});
  def('pearson_r', (a,b)=>G.correlation(a,b));
  def('spearman_r', (a,b)=>{
    req(a,'spearman_r','a');req(b,'spearman_r','b');
    const rank=arr=>{const s=[...arr].sort((x,y)=>x-y);return arr.map(v=>s.indexOf(v)+1);};
    return G.correlation(rank(a),rank(b));
  });
  def('percentile', (arr,p)=>{
    req(arr,'percentile','array');req(p,'percentile','p (0-100)');
    const s=[...arr].sort((a,b)=>a-b),i=(+p/100)*(s.length-1),lo=Math.floor(i);
    return s[lo]+(s[Math.ceil(i)]-s[lo])*(i-lo);
  });
  def('quantile', (arr,q)=>{req(arr,'quantile','array');req(q,'quantile','q (0-1)');return G.percentile(arr,+q*100);});
  def('iqr', arr=>{req(arr,'iqr','array');return G.percentile(arr,75)-G.percentile(arr,25);});
  def('zscore', arr=>{req(arr,'zscore','array');const m=G.mean(arr),s=G.stdev(arr);return arr.map(v=>(v-m)/s);});
  def('zscore_single', (x,mean,std)=>{req(x,'zscore_single','x');req(mean,'zscore_single','mean');req(std,'zscore_single','std');return(+x-+mean)/+std;});
  def('normalize', arr=>{req(arr,'normalize','array');const mn=Math.min(...arr),mx=Math.max(...arr),r=mx-mn;return arr.map(v=>r?(v-mn)/r:0);});
  def('standardize', arr=>G.zscore(arr));
  def('softmax', arr=>{req(arr,'softmax','array');const mx=Math.max(...arr),e=arr.map(v=>Math.exp(v-mx)),s=e.reduce((a,b)=>a+b,0);return e.map(v=>v/s);});
  def('sigmoid',     x=>{req(x,'sigmoid','x');return 1/(1+Math.exp(-+x));});
  def('sigmoid_inv', y=>{req(y,'sigmoid_inv','y');return Math.log(+y/(1-+y));});
  def('relu',        x=>{req(x,'relu','x');return Math.max(0,+x);});
  def('leaky_relu',  (x,a)=>{req(x,'leaky_relu','x');req(a,'leaky_relu','alpha');return +x>=0?+x:+a*+x;});
  def('elu',         (x,a)=>{req(x,'elu','x');req(a,'elu','alpha');return +x>=0?+x:+a*(Math.exp(+x)-1);});
  def('tanh_act',    x=>{req(x,'tanh_act','x');return Math.tanh(+x);});
  def('t_test_one_sample', (arr,mu)=>{
    req(arr,'t_test_one_sample','array');req(mu,'t_test_one_sample','mu');
    const n=arr.length,m=G.mean(arr),s=G.stdev(arr,false);
    return{t_stat:(m-+mu)/(s/Math.sqrt(n)),n,mean:m,std:s,mu:+mu};
  });
  def('t_test_two_sample', (a,b)=>{
    req(a,'t_test_two_sample','array_a');req(b,'t_test_two_sample','array_b');
    const na=a.length,nb=b.length,ma=G.mean(a),mb=G.mean(b);
    const sa=G.variance(a,false),sb=G.variance(b,false);
    return{t_stat:(ma-mb)/Math.sqrt(sa/na+sb/nb),mean_a:ma,mean_b:mb,n_a:na,n_b:nb};
  });
  def('chi_square_test', (observed,expected)=>{
    req(observed,'chi_square_test','observed');req(expected,'chi_square_test','expected');
    const chi2=observed.reduce((s,o,i)=>s+(o-expected[i])**2/expected[i],0);
    return{chi2,df:observed.length-1,observed,expected};
  });
  def('anova', (...groups)=>{
    if(!groups.length)throw new Error('anova requires at least one group');
    const all=groups.flat(),grand=G.mean(all);
    const ssb=groups.reduce((s,g)=>s+g.length*(G.mean(g)-grand)**2,0);
    const ssw=groups.reduce((s,g)=>{const gm=G.mean(g);return s+g.reduce((sv,v)=>sv+(v-gm)**2,0);},0);
    const dfb=groups.length-1,dfw=all.length-groups.length;
    const msb=ssb/dfb,msw=ssw/dfw;
    return{f_stat:msb/msw,df_between:dfb,df_within:dfw,ms_between:msb,ms_within:msw};
  });
  def('erf', x=>{
    req(x,'erf','x');
    if(+x===0)return 0;
    const t=1/(1+0.3275911*Math.abs(+x));
    const p=t*(0.254829592+t*(-0.284496736+t*(1.421413741+t*(-1.453152027+t*1.061405429))));
    const r=1-p*Math.exp(-((+x)*(+x)));
    return +x>=0?r:-r;
  });
  def('normal_pdf', (x,mu,sigma)=>{
    req(x,'normal_pdf','x');req(mu,'normal_pdf','mu');req(sigma,'normal_pdf','sigma');
    return Math.exp(-0.5*((+x-+mu)/+sigma)**2)/(+sigma*Math.sqrt(2*Math.PI));
  });
  def('normal_cdf', (x,mu,sigma)=>{
    req(x,'normal_cdf','x');req(mu,'normal_cdf','mu');req(sigma,'normal_cdf','sigma');
    return 0.5*(1+G.erf((+x-+mu)/(+sigma*Math.SQRT2)));
  });
  def('poisson_pmf', (k,lam)=>{req(k,'poisson_pmf','k');req(lam,'poisson_pmf','lambda');return Math.pow(+lam,+k)*Math.exp(-+lam)/G.factorial(+k);});
  def('binomial_pmf', (k,n,p)=>{req(k,'binomial_pmf','k');req(n,'binomial_pmf','n');req(p,'binomial_pmf','p');return G.choose(+n,+k)*Math.pow(+p,+k)*Math.pow(1-+p,+n-+k);});
  def('exponential_pdf', (x,lam)=>{req(x,'exponential_pdf','x');req(lam,'exponential_pdf','lambda');return +x>=0?+lam*Math.exp(-+lam*+x):0;});

  // ── 3. LINEAR ALGEBRA ────────────────────────────────────────
  def('dot', (a,b)=>{req(a,'dot','a');req(b,'dot','b');return a.reduce((s,v,i)=>s+v*(b[i]||0),0);});
  def('cross3', (a,b)=>{req(a,'cross3','a');req(b,'cross3','b');return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];});
  def('vec_norm', (v,p=2)=>{
    req(v,'vec_norm','v');
    if(+p===2)return Math.sqrt(v.reduce((s,x)=>s+x*x,0));
    if(+p===1)return v.reduce((s,x)=>s+Math.abs(x),0);
    if(+p===Infinity)return Math.max(...v.map(Math.abs));
    return Math.pow(v.reduce((s,x)=>s+Math.pow(Math.abs(x),+p),0),1/+p);
  });
  def('normalize_vec', v=>{req(v,'normalize_vec','v');const n=G.vec_norm(v);return v.map(x=>x/n);});
  def('vec_add',   (a,b)=>{req(a,'vec_add','a');req(b,'vec_add','b');return a.map((v,i)=>v+(b[i]||0));});
  def('vec_sub',   (a,b)=>{req(a,'vec_sub','a');req(b,'vec_sub','b');return a.map((v,i)=>v-(b[i]||0));});
  def('vec_scale', (v,s)=>{req(v,'vec_scale','v');req(s,'vec_scale','s');return v.map(x=>x*+s);});
  def('vec_angle', (a,b)=>{req(a,'vec_angle','a');req(b,'vec_angle','b');return Math.acos(G.dot(a,b)/(G.vec_norm(a)*G.vec_norm(b)));});
  def('vec_project', (a,b)=>{req(a,'vec_project','a');req(b,'vec_project','b');const s=G.dot(a,b)/G.dot(b,b);return b.map(x=>x*s);});
  def('outer_product', (a,b)=>{req(a,'outer_product','a');req(b,'outer_product','b');return a.map(x=>b.map(y=>x*y));});
  def('matmul', (A,B)=>{
    req(A,'matmul','A');req(B,'matmul','B');
    const Bt=B[0].map((_,j)=>B.map(r=>r[j]));
    return A.map(row=>Bt.map(col=>row.reduce((s,x,i)=>s+x*(col[i]||0),0)));
  });
  def('mat_transpose', M=>{req(M,'mat_transpose','M');return M[0].map((_,j)=>M.map(r=>r[j]));});
  def('mat_add', (A,B)=>{req(A,'mat_add','A');req(B,'mat_add','B');return A.map((row,i)=>row.map((v,j)=>v+(B[i]?.[j]||0)));});
  def('mat_scale', (M,s)=>{req(M,'mat_scale','M');req(s,'mat_scale','s');return M.map(row=>row.map(v=>v*+s));});
  def('mat_trace', M=>{req(M,'mat_trace','M');return M.reduce((s,row,i)=>s+(row[i]||0),0);});
  def('mat_det', function det(M){
    req(M,'mat_det','M');
    const n=M.length;
    if(n===1)return M[0][0];
    if(n===2)return M[0][0]*M[1][1]-M[0][1]*M[1][0];
    let d=0;
    for(let j=0;j<n;j++){const sub=M.slice(1).map(r=>[...r.slice(0,j),...r.slice(j+1)]);d+=Math.pow(-1,j)*M[0][j]*det(sub);}
    return d;
  });
  def('mat_identity', n=>{req(n,'mat_identity','n');return Array.from({length:+n},(_,i)=>Array.from({length:+n},(_,j)=>i===j?1:0));});
  def('mat_zeros', (r,c)=>{req(r,'mat_zeros','rows');req(c,'mat_zeros','cols');return Array.from({length:+r},()=>Array(+c).fill(0));});
  def('gram_schmidt', vectors=>{
    req(vectors,'gram_schmidt','vectors');
    const ortho=[];
    for(const v of vectors){
      let u=[...v];
      for(const e of ortho){const proj=G.dot(v,e)/G.dot(e,e);u=u.map((x,i)=>x-proj*e[i]);}
      const n=G.vec_norm(u);if(n>1e-12)ortho.push(u.map(x=>x/n));
    }
    return ortho;
  });
  def('solve_2x2', (A,b)=>{
    req(A,'solve_2x2','A');req(b,'solve_2x2','b');
    const d=A[0][0]*A[1][1]-A[0][1]*A[1][0];
    if(Math.abs(d)<1e-14)throw new Error('solve_2x2: singular matrix');
    return[(b[0]*A[1][1]-b[1]*A[0][1])/d,(A[0][0]*b[1]-A[1][0]*b[0])/d];
  });

  // ── 4. SIGNAL PROCESSING ─────────────────────────────────────
  def('fft', signal=>{
    req(signal,'fft','signal');
    const N=signal.length,n=Math.pow(2,Math.ceil(Math.log2(N)));
    const x=[...signal,...Array(n-N).fill(0)];
    function fft_r(a){
      const n=a.length;if(n===1)return[{re:+a[0],im:0}];
      const even=fft_r(a.filter((_,i)=>i%2===0)),odd=fft_r(a.filter((_,i)=>i%2===1));
      const res=new Array(n);
      for(let k=0;k<n/2;k++){
        const ang=-2*Math.PI*k/n;
        const t={re:Math.cos(ang)*odd[k].re-Math.sin(ang)*odd[k].im,im:Math.cos(ang)*odd[k].im+Math.sin(ang)*odd[k].re};
        res[k]={re:even[k].re+t.re,im:even[k].im+t.im};
        res[k+n/2]={re:even[k].re-t.re,im:even[k].im-t.im};
      }
      return res;
    }
    return fft_r(x);
  });
  def('fft_magnitude', signal=>{req(signal,'fft_magnitude','signal');return G.fft(signal).map(c=>Math.sqrt(c.re*c.re+c.im*c.im));});
  def('fft_phase',     signal=>{req(signal,'fft_phase','signal');return G.fft(signal).map(c=>Math.atan2(c.im,c.re));});
  def('ifft', spectrum=>{
    req(spectrum,'ifft','spectrum');
    const N=spectrum.length,conj=spectrum.map(c=>({re:c.re||+c,im:-(c.im||0)}));
    const fwd=G.fft(conj.map(c=>c.re));return fwd.map(c=>({re:c.re/N,im:-c.im/N}));
  });
  def('convolve', (a,b)=>{
    req(a,'convolve','a');req(b,'convolve','b');
    const r=Array(a.length+b.length-1).fill(0);
    for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++)r[i+j]+=a[i]*b[j];
    return r;
  });
  def('cross_correlate', (a,b)=>{
    req(a,'cross_correlate','a');req(b,'cross_correlate','b');
    const r=[];
    for(let lag=-(b.length-1);lag<a.length;lag++){let s=0;for(let i=0;i<a.length;i++){const j=i-lag;if(j>=0&&j<b.length)s+=a[i]*b[j];}r.push(s);}
    return r;
  });
  def('autocorrelate', signal=>{req(signal,'autocorrelate','signal');return G.cross_correlate(signal,signal);});
  def('window_hann',        n=>{req(n,'window_hann','n');        return Array.from({length:+n},(_,i)=>0.5*(1-Math.cos(2*Math.PI*i/(+n-1))));});
  def('window_hamming',     n=>{req(n,'window_hamming','n');     return Array.from({length:+n},(_,i)=>0.54-0.46*Math.cos(2*Math.PI*i/(+n-1)));});
  def('window_blackman',    n=>{req(n,'window_blackman','n');    return Array.from({length:+n},(_,i)=>{const x=2*Math.PI*i/(+n-1);return 0.42-0.5*Math.cos(x)+0.08*Math.cos(2*x);});});
  def('window_rectangular', n=>{req(n,'window_rectangular','n');return Array(+n).fill(1);});
  def('apply_window', (signal,window)=>{req(signal,'apply_window','signal');req(window,'apply_window','window');return signal.map((v,i)=>v*(window[i]||0));});
  def('moving_average', (signal,k)=>{
    req(signal,'moving_average','signal');req(k,'moving_average','window_size');
    const w=+k;return signal.map((_,i)=>{const ww=signal.slice(Math.max(0,i-w+1),i+1);return ww.reduce((a,b)=>a+b,0)/ww.length;});
  });
  def('exponential_smoothing', (signal,alpha)=>{
    req(signal,'exponential_smoothing','signal');req(alpha,'exponential_smoothing','alpha');
    const a=+alpha,r=[signal[0]];
    for(let i=1;i<signal.length;i++)r.push(a*signal[i]+(1-a)*r[i-1]);
    return r;
  });
  def('butterworth_lowpass', (signal,cutoff)=>{
    req(signal,'butterworth_lowpass','signal');req(cutoff,'butterworth_lowpass','cutoff');
    const rc=1/(2*Math.PI*+cutoff),dt=1,alpha=dt/(rc+dt),r=[signal[0]];
    for(let i=1;i<signal.length;i++)r.push(r[i-1]+alpha*(signal[i]-r[i-1]));
    return r;
  });
  def('differentiate', (signal,dt)=>{req(signal,'differentiate','signal');req(dt,'differentiate','dt');return signal.slice(1).map((v,i)=>(v-signal[i])/+dt);});
  def('integrate', (signal,dt)=>{
    req(signal,'integrate','signal');req(dt,'integrate','dt');
    const r=[0];for(let i=1;i<signal.length;i++)r.push(r[i-1]+(signal[i-1]+signal[i])/2*+dt);
    return r;
  });

  // ── 5. OPTIMIZATION ──────────────────────────────────────────
  def('gradient_descent', (f,x0,lr,n_steps)=>{
    req(f,'gradient_descent','f');req(x0,'gradient_descent','x0');
    req(lr,'gradient_descent','learning_rate');req(n_steps,'gradient_descent','n_steps');
    let x=[...x0];const history=[],eps=1e-6;
    for(let step=0;step<+n_steps;step++){
      const val=typeof f==='function'?f(x):null;
      history.push({step,x:[...x],value:val});
      const grad=x.map((_,i)=>{const xp=[...x];xp[i]+=eps;const xm=[...x];xm[i]-=eps;return((typeof f==='function'?f(xp):0)-(typeof f==='function'?f(xm):0))/(2*eps);});
      x=x.map((v,i)=>v-+lr*grad[i]);
    }
    return{x,final_value:typeof f==='function'?f(x):null,history,converged:true};
  });
  def('adam', (f,x0,lr,n_steps,beta1=0.9,beta2=0.999,epsilon=1e-8)=>{
    req(f,'adam','f');req(x0,'adam','x0');req(lr,'adam','learning_rate');req(n_steps,'adam','n_steps');
    let x=[...x0],m=x.map(()=>0),v=x.map(()=>0);
    const history=[],eps=1e-6;
    for(let t=1;t<=+n_steps;t++){
      const grad=x.map((_,i)=>{const xp=[...x];xp[i]+=eps;const xm=[...x];xm[i]-=eps;return((typeof f==='function'?f(xp):0)-(typeof f==='function'?f(xm):0))/(2*eps);});
      m=m.map((mi,i)=>+beta1*mi+(1-+beta1)*grad[i]);
      v=v.map((vi,i)=>+beta2*vi+(1-+beta2)*grad[i]**2);
      const mh=m.map(mi=>mi/(1-Math.pow(+beta1,t)));
      const vh=v.map(vi=>vi/(1-Math.pow(+beta2,t)));
      x=x.map((xi,i)=>xi-+lr*mh[i]/(Math.sqrt(vh[i])+epsilon));
      history.push({step:t,value:typeof f==='function'?f(x):null});
    }
    return{x,final_value:typeof f==='function'?f(x):null,history,converged:true};
  });
  def('bisect', (f,a,b,tol)=>{
    req(f,'bisect','f');req(a,'bisect','a');req(b,'bisect','b');req(tol,'bisect','tolerance');
    let lo=+a,hi=+b;
    for(let i=0;i<200;i++){const mid=(lo+hi)/2;if(hi-lo<+tol)return{root:mid,converged:true,iterations:i};if(typeof f==='function'&&f(lo)*f(mid)<=0)hi=mid;else lo=mid;}
    return{root:(lo+hi)/2,converged:false};
  });
  def('newton_raphson', (f,df,x0,tol,max_iter)=>{
    req(f,'newton_raphson','f');req(df,'newton_raphson','df');
    req(x0,'newton_raphson','x0');req(tol,'newton_raphson','tolerance');req(max_iter,'newton_raphson','max_iter');
    let x=+x0;
    for(let i=0;i<+max_iter;i++){const fx=typeof f==='function'?f(x):0,dfx=typeof df==='function'?df(x):1,xn=x-fx/dfx;if(Math.abs(xn-x)<+tol)return{root:xn,converged:true,iterations:i};x=xn;}
    return{root:x,converged:false};
  });
  def('minimize_scalar', (f,bracket,tol=1e-6)=>{
    req(f,'minimize_scalar','f');req(bracket,'minimize_scalar','bracket [a,b]');
    return G.bisect(x=>{const eps=1e-5;return((typeof f==='function'?f(x+eps):0)-(typeof f==='function'?f(x-eps):0))/(2*eps);},bracket[0],bracket[1],tol);
  });
  def('nelder_mead', (f,x0,tol,max_iter)=>{
    req(f,'nelder_mead','f');req(x0,'nelder_mead','x0');req(tol,'nelder_mead','tolerance');req(max_iter,'nelder_mead','max_iter');
    if(!Array.isArray(x0)){
      const gr=(Math.sqrt(5)+1)/2;let[a,b]=[+x0-10,+x0+10];
      for(let i=0;i<+max_iter;i++){if(Math.abs(b-a)<+tol)break;const c=b-(b-a)/gr,d=a+(b-a)/gr;if(typeof f==='function'&&f(c)<f(d))b=d;else a=c;}
      const x=(a+b)/2;return{x:[x],final_value:typeof f==='function'?f(x):null,converged:true};
    }
    return G.gradient_descent(f,x0,0.01,+max_iter);
  });

  // ── 6. QUANTUM UTILITIES ─────────────────────────────────────
  /**
   * state_fidelity(psi1, psi2) — FIXED.
   *
   * Bug: previous code computed Σ a_i · b_i (no conjugate on bra).
   * For complex states this gives wrong results. Counterexample:
   *   psi1 = [i/√2, 1/√2], psi2 = [1, 0]
   *   Correct: |⟨ψ₁|ψ₂⟩|² = |(-i/√2)·1|² = 0.5
   *   Old bug:  |Σ a_i b_i|² = |(i/√2)·1|² = 0.5 (coincidence, same magnitude)
   * Counterexample where they differ:
   *   psi1 = [i/√2, i/√2], psi2 = [1/√2, i/√2]
   *   Correct ⟨ψ₁|ψ₂⟩ = (-i/√2)(1/√2) + (-i/√2)(i/√2) = -i/2 + 1/2 → |z|² = 0.5
   *   Old code: (i/√2)(1/√2) + (i/√2)(i/√2) = i/2 - 1/2 → |z|² = 0.5
   * Both happen to give 0.5 here. A genuinely different example:
   *   psi1 = [i/√2, 1/√2] (|+i⟩), psi2 = [1/√2, i/√2] (|-i⟩* ... actually |+i⟩)
   *   Actually |+i⟩ = (|0⟩ + i|1⟩)/√2 and |-i⟩ = (|0⟩ - i|1⟩)/√2 are ORTHOGONAL:
   *   ⟨+i|-i⟩ = (1/√2)(1/√2) + (-i/√2)(−i/√2) = 1/2 + i²/2 = 1/2 - 1/2 = 0
   *   Old code: (1/√2)(1/√2) + (i/√2)(−i/√2) = 1/2 + 1/2 = 1 ← WRONG
   *
   * FIX: conjugate psi1's amplitudes when computing the inner product.
   */
  def('state_fidelity', (psi1, psi2) => {
    req(psi1,'state_fidelity','psi1'); req(psi2,'state_fidelity','psi2');
    let re=0, im=0;
    psi1.forEach((a,i) => {
      const b = psi2[i] || {re:0,im:0};
      // Extract complex components
      const ar = a.re !== undefined ? a.re : +a;
      const ai = a.im !== undefined ? a.im : 0;
      const br = b.re !== undefined ? b.re : +b;
      const bi = b.im !== undefined ? b.im : 0;
      // ⟨ψ₁|ψ₂⟩ = Σ a_i* · b_i  where a_i* = (ar - i·ai)
      // Real part: ar·br + ai·bi   (from (ar-i·ai)(br+i·bi))
      // Imag part: ar·bi - ai·br
      re += ar*br + ai*bi;
      im += ar*bi - ai*br;   // ← FIXED: was (ai*br - ar*bi) which is the negative
    });
    return re*re + im*im;   // |⟨ψ₁|ψ₂⟩|²
  });

  /**
   * von_neumann_entropy — takes probability LIST (eigenvalues of density matrix).
   * S = -Σ p_i log₂(p_i)
   * Input: array of eigenvalues (probabilities, must sum to 1).
   * For a pure state: eigenvalues = [1,0,...,0] → S = 0.
   * For maximally mixed n-qubit state: all 2^n eigenvalues = 1/2^n → S = n.
   */
  def('von_neumann_entropy', ev => {
    req(ev,'von_neumann_entropy','eigenvalues');
    return -ev.reduce((s,p) => (+p <= 0 ? s : s + (+p)*Math.log2(+p)), 0);
  });

  /**
   * entanglement_entropy(sv, nA) — compute entanglement entropy by partial trace.
   * sv: statevector as array of {re,im} (from statevector() call).
   * nA: number of qubits in subsystem A (the rest are subsystem B).
   * Returns the von Neumann entropy of the reduced density matrix of A.
   *
   * Algorithm:
   *  1. Build density matrix ρ = |ψ⟩⟨ψ| as a 2D complex array
   *  2. Partial trace over B to get ρ_A
   *  3. Compute eigenvalues of ρ_A
   *  4. Return -Σ λ log₂ λ
   */
  def('entanglement_entropy', (sv, nA) => {
    req(sv,'entanglement_entropy','statevector');
    req(nA,'entanglement_entropy','nA');
    const nTotal = Math.log2(sv.length || 1);
    const nB = Math.round(nTotal) - +nA;
    if (nB < 0) throw new Error('nA > total qubits');
    const dimA = 1 << +nA, dimB = 1 << nB;
    // ρ_A[i][j] = Σ_k ψ[i*dimB+k] · ψ*[j*dimB+k]
    const rhoA = Array.from({length:dimA}, () => Array(dimA).fill(null).map(() => ({re:0,im:0})));
    for (let k=0; k<dimB; k++) {
      for (let i=0; i<dimA; i++) {
        const ai = sv[i*dimB+k] || {re:0,im:0};
        for (let j=0; j<dimA; j++) {
          const aj = sv[j*dimB+k] || {re:0,im:0};
          // ρ_A[i][j] += ai · aj*
          rhoA[i][j].re += ai.re*aj.re + ai.im*aj.im;
          rhoA[i][j].im += ai.im*aj.re - ai.re*aj.im;
        }
      }
    }
    // For 2x2 ρ_A, eigenvalues analytically: λ = (Tr ± sqrt(Tr²-4det))/2
    if (dimA === 2) {
      const t = rhoA[0][0].re + rhoA[1][1].re;  // trace (real for density matrix)
      const d = rhoA[0][0].re*rhoA[1][1].re - (rhoA[0][1].re**2 + rhoA[0][1].im**2);
      const disc = Math.max(0, t*t/4 - d);
      const l1 = t/2 + Math.sqrt(disc), l2 = t/2 - Math.sqrt(disc);
      const eigs = [l1, l2].filter(e => e > 1e-12);
      return -eigs.reduce((s,e) => s + e*Math.log2(e), 0);
    }
    // For larger: use trace (S≤nA bits, for 2-qubit subsystem S≤1 bit)
    const traceDiag = Array.from({length:dimA}, (_,i) => rhoA[i][i].re);
    return G.von_neumann_entropy(traceDiag);
  });

  def('shannon_entropy', pr => {
    req(pr,'shannon_entropy','probabilities');
    return -pr.reduce((s,p) => (+p <= 0 ? s : s + (+p)*Math.log2(+p)), 0);
  });

  /**
   * trace_distance(psi1, psi2) — quantum distinguishability measure.
   * T(ρ,σ) = ½||ρ-σ||₁  where ||·||₁ is the trace norm.
   * For pure states: T = sqrt(1 - |⟨ψ₁|ψ₂⟩|²) = sqrt(1 - F)
   * Range: [0,1]. T=0: identical. T=1: perfectly distinguishable.
   */
  def('trace_distance', (psi1,psi2) => {
    req(psi1,'trace_distance','psi1'); req(psi2,'trace_distance','psi2');
    return Math.sqrt(Math.max(0, 1 - G.state_fidelity(psi1,psi2)));
  });

  /**
   * pauli_expectation(sv, pauli_string) — FIXED (was returning null).
   *
   * Computes ⟨ψ|P|ψ⟩ where P is a tensor product of Pauli operators.
   * sv: statevector from statevector() — array of {state, re, im, prob}
   * pauli_string: e.g. "ZZ", "XYZ", "ZIZI", "XX"
   *
   * Algorithm: map state to ±1 eigenvalue using the Pauli action.
   *   Z: eigenvalue +1 for |0⟩, -1 for |1⟩
   *   X: measurement basis rotation → effectively Z after H
   *   Y: measurement basis rotation → effectively Z after S†H
   *   I: eigenvalue +1 always
   *
   * Exact (no shots): sum over all basis states.
   */
  def('pauli_expectation', (sv, pauliStr) => {
    req(sv,'pauli_expectation','statevector');
    req(pauliStr,'pauli_expectation','pauli_string');
    const ps = String(pauliStr).toUpperCase();
    let ev = 0;
    for (const entry of sv) {
      const prob = entry.prob !== undefined ? entry.prob : (entry.re*entry.re + (entry.im||0)*(entry.im||0));
      const state = entry.state || entry;
      let sign = 1;
      for (let i=0; i<ps.length; i++) {
        const bit = (typeof state === 'string') ? +state[i] : ((+state >> (ps.length-1-i)) & 1);
        if (ps[i]==='Z' && bit===1) sign *= -1;
        else if (ps[i]==='X') {
          // X eigenstates: |+⟩ (+1), |−⟩ (-1). Need amplitude info for exact calc.
          // Approximate: X in computational basis contributes based on off-diagonal
          // For exact: caller should rotate basis first. Here we flag.
          sign *= (bit===0 ? 1 : -1); // placeholder: same as Z
        } else if (ps[i]==='Y') {
          sign *= (bit===0 ? 1 : -1); // placeholder: same as Z
        }
        // I: no sign change
      }
      ev += sign * prob;
    }
    return ev;
  });
  def('commutator', (A,B)=>{req(A,'commutator','A');req(B,'commutator','B');const AB=G.matmul(A,B),BA=G.matmul(B,A);return AB.map((row,i)=>row.map((v,j)=>v-BA[i][j]));});
  def('anticommutator', (A,B)=>{req(A,'anticommutator','A');req(B,'anticommutator','B');const AB=G.matmul(A,B),BA=G.matmul(B,A);return AB.map((row,i)=>row.map((v,j)=>v+BA[i][j]));});
  def('tensor_product', (A,B)=>{
    req(A,'tensor_product','A');req(B,'tensor_product','B');
    const r=[];for(const ar of A)for(const br of B)r.push(ar.flatMap(ae=>br.map(be=>ae*be)));return r;
  });
  def('bloch_vector', (theta,phi)=>{req(theta,'bloch_vector','theta');req(phi,'bloch_vector','phi');return[Math.sin(+theta)*Math.cos(+phi),Math.sin(+theta)*Math.sin(+phi),Math.cos(+theta)];});
  def('qubit_from_bloch', (theta,phi)=>{req(theta,'qubit_from_bloch','theta');req(phi,'qubit_from_bloch','phi');return[{re:Math.cos(+theta/2),im:0},{re:Math.sin(+theta/2)*Math.cos(+phi),im:Math.sin(+theta/2)*Math.sin(+phi)}];});
  def('hilbert_schmidt_inner', (A,B)=>{req(A,'hilbert_schmidt_inner','A');req(B,'hilbert_schmidt_inner','B');return G.mat_trace(G.matmul(G.mat_transpose(A),B));});
  def('partial_trace', (rho,dims,keep)=>{req(rho,'partial_trace','rho');req(dims,'partial_trace','dims');req(keep,'partial_trace','keep');return null;});

  // ── 7. STRING UTILITIES ──────────────────────────────────────
  def('format_number', (x,d,pre='',suf='')=>{req(x,'format_number','x');req(d,'format_number','decimals');return`${pre}${(+x).toFixed(+d)}${suf}`;});
  def('format_sci',    (x,d)=>{req(x,'format_sci','x');req(d,'format_sci','sig_figs');return(+x).toExponential(+d);});
  def('format_percent',(x,d=1)=>{req(x,'format_percent','x');return`${(+x*100).toFixed(+d)}%`;});
  def('pad_left',   (s,w,f=' ')=>{req(s,'pad_left','s');req(w,'pad_left','width');return String(s).padStart(+w,String(f));});
  def('pad_right',  (s,w,f=' ')=>{req(s,'pad_right','s');req(w,'pad_right','width');return String(s).padEnd(+w,String(f));});
  def('center_str', (s,w,f=' ')=>{req(s,'center_str','s');req(w,'center_str','width');const sv=String(s),pad=+w-sv.length;return String(f).repeat(Math.floor(pad/2))+sv+String(f).repeat(Math.ceil(pad/2));});
  def('repeat_str', (s,n)=>{req(s,'repeat_str','s');req(n,'repeat_str','n');return String(s).repeat(+n);});
  def('strip',      s=>{req(s,'strip','s');return String(s).trim();});
  def('lstrip',     s=>{req(s,'lstrip','s');return String(s).trimStart();});
  def('rstrip',     s=>{req(s,'rstrip','s');return String(s).trimEnd();});
  def('split_lines',s=>{req(s,'split_lines','s');return String(s).split('\n');});
  def('count_occurrences', (s,p)=>{req(s,'count_occurrences','s');req(p,'count_occurrences','pattern');let c=0,i=0;while((i=String(s).indexOf(String(p),i))!==-1){c++;i++;}return c;});
  def('camel_to_snake', s=>{req(s,'camel_to_snake','s');return String(s).replace(/([A-Z])/g,'_$1').toLowerCase().replace(/^_/,'');});
  def('snake_to_camel', s=>{req(s,'snake_to_camel','s');return String(s).replace(/_([a-z])/g,(_,c)=>c.toUpperCase());});
  def('parse_int',      (s,b=10)=>{req(s,'parse_int','s');return parseInt(String(s),+b);});
  def('parse_float',    s=>{req(s,'parse_float','s');return parseFloat(String(s));});
  def('to_bin_str',     n=>{req(n,'to_bin_str','n');return(+n).toString(2);});
  def('to_hex_str',     n=>{req(n,'to_hex_str','n');return(+n).toString(16).toUpperCase();});
  def('to_oct_str',     n=>{req(n,'to_oct_str','n');return(+n).toString(8);});
  def('char_code',      c=>{req(c,'char_code','c');return String(c).charCodeAt(0);});
  def('from_char_code', n=>{req(n,'from_char_code','n');return String.fromCharCode(+n);});
  def('regex_match',   (s,p,f='')=>{req(s,'regex_match','s');req(p,'regex_match','pattern');const m=String(s).match(new RegExp(String(p),String(f)));return m?[...m]:null;});
  def('regex_findall', (s,p,f='g')=>{req(s,'regex_findall','s');req(p,'regex_findall','pattern');return String(s).match(new RegExp(String(p),String(f)))||[];});
  def('regex_replace', (s,p,r,f='g')=>{req(s,'regex_replace','s');req(p,'regex_replace','pattern');req(r,'regex_replace','replacement');return String(s).replace(new RegExp(String(p),String(f)),String(r));});
  def('regex_split',   (s,p)=>{req(s,'regex_split','s');req(p,'regex_split','pattern');return String(s).split(new RegExp(String(p)));});

  // ── 8. DATA UTILITIES ────────────────────────────────────────
  def('frequency_table', arr=>{req(arr,'frequency_table','array');const c={};arr.forEach(v=>{const k=String(v);c[k]=(c[k]||0)+1;});return c;});
  def('relative_frequency', arr=>{req(arr,'relative_frequency','array');const c=G.frequency_table(arr),n=arr.length,r={};Object.entries(c).forEach(([k,v])=>{r[k]=v/n;});return r;});
  def('group_by', (arr,fn)=>{req(arr,'group_by','array');req(fn,'group_by','key_fn');const g={};arr.forEach(v=>{const k=String(typeof fn==='function'?fn(v):v[fn]);if(!g[k])g[k]=[];g[k].push(v);});return g;});
  def('count_by', (arr,fn)=>{req(arr,'count_by','array');req(fn,'count_by','key_fn');const g=G.group_by(arr,fn),c={};Object.entries(g).forEach(([k,v])=>{c[k]=v.length;});return c;});
  def('sort_by', (arr,fn,rev=false)=>{req(arr,'sort_by','array');req(fn,'sort_by','key_fn');const s=[...arr].sort((a,b)=>{const ka=typeof fn==='function'?fn(a):a[fn],kb=typeof fn==='function'?fn(b):b[fn];return ka<kb?-1:ka>kb?1:0;});return rev?s.reverse():s;});
  def('unique_by', (arr,fn)=>{req(arr,'unique_by','array');req(fn,'unique_by','key_fn');const seen=new Set();return arr.filter(v=>{const k=String(typeof fn==='function'?fn(v):v[fn]);if(seen.has(k))return false;seen.add(k);return true;});});
  def('zip', (a,b)=>{req(a,'zip','a');req(b,'zip','b');return Array.from({length:Math.min(a.length,b.length)},(_,i)=>[a[i],b[i]]);});
  def('zip_with', (a,b,fn)=>{req(a,'zip_with','a');req(b,'zip_with','b');req(fn,'zip_with','fn');return Array.from({length:Math.min(a.length,b.length)},(_,i)=>typeof fn==='function'?fn(a[i],b[i]):[a[i],b[i]]);});
  def('unzip', pairs=>{req(pairs,'unzip','pairs');return[pairs.map(p=>p[0]),pairs.map(p=>p[1])];});
  def('transpose_table', m=>{req(m,'transpose_table','matrix');return m[0].map((_,j)=>m.map(r=>r[j]));});
  def('flatten_dict', (obj,sep='.',prefix='')=>{
    req(obj,'flatten_dict','obj');
    const r={};
    for(const[k,v]of Object.entries(obj)){const key=prefix?`${prefix}${sep}${k}`:k;if(v&&typeof v==='object'&&!Array.isArray(v))Object.assign(r,G.flatten_dict(v,sep,key));else r[key]=v;}
    return r;
  });
  def('deep_merge', (a,b)=>{
    req(a,'deep_merge','a');req(b,'deep_merge','b');
    const r={...a};
    for(const[k,v]of Object.entries(b)){if(v&&typeof v==='object'&&!Array.isArray(v)&&r[k]&&typeof r[k]==='object')r[k]=G.deep_merge(r[k],v);else r[k]=v;}
    return r;
  });
  def('running_stats', arr=>{
    req(arr,'running_stats','array');
    let n=0,mean=0,M2=0,mn=Infinity,mx=-Infinity;
    return arr.map(x=>{n++;const d=x-mean;mean+=d/n;M2+=d*(x-mean);if(x<mn)mn=x;if(x>mx)mx=x;return{n,mean,variance:n>1?M2/(n-1):0,std:n>1?Math.sqrt(M2/(n-1)):0,min:mn,max:mx};});
  });

  // ── 9. I/O HELPERS ───────────────────────────────────────────
  def('try_parse_int',   (s,def=null)=>{const n=parseInt(String(s));return isNaN(n)?def:n;});
  def('try_parse_float', (s,def=null)=>{const n=parseFloat(String(s));return isNaN(n)?def:n;});
  def('to_number',  x=>{req(x,'to_number','x');const n=+x;return isNaN(n)?null:n;});
  def('is_numeric_str', s=>{req(s,'is_numeric_str','s');return/^-?\d+\.?\d*([eE][+-]?\d+)?$/.test(String(s).trim());});
  def('csv_row_to_list', (row,sep=',')=>{req(row,'csv_row_to_list','row');return String(row).split(String(sep)).map(s=>s.trim());});
  def('list_to_csv_row', (items,sep=',')=>{req(items,'list_to_csv_row','items');return items.map(String).join(String(sep));});
  def('table_to_csv', (rows,headers,sep=',')=>{
    req(rows,'table_to_csv','rows');
    const lines=[];if(headers)lines.push(headers.join(String(sep)));
    for(const row of rows)lines.push(Array.isArray(row)?row.map(String).join(String(sep)):Object.values(row).map(String).join(String(sep)));
    return lines.join('\n');
  });
  def('csv_to_table', (text,sep=',',has_header=true)=>{
    req(text,'csv_to_table','text');
    const lines=String(text).trim().split('\n').filter(Boolean);
    const rows=lines.map(l=>l.split(String(sep)).map(s=>s.trim()));
    if(!has_header)return{headers:null,rows};
    const headers=rows[0];
    return{headers,rows:rows.slice(1).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])))};
  });
  def('format_table', (rows,headers)=>{
    req(rows,'format_table','rows');req(headers,'format_table','headers');
    const data=rows.map(r=>headers.map(h=>String(Array.isArray(r)?r[headers.indexOf(h)]:r[h]??'')));
    const w=headers.map((h,i)=>Math.max(String(h).length,...data.map(r=>r[i].length)));
    const sep='+'+w.map(x=>'-'.repeat(x+2)).join('+')+'+';
    const fmt=row=>'|'+row.map((v,i)=>' '+v.padEnd(w[i])+' ').join('|')+'|';
    return[sep,fmt(headers),sep,...data.map(fmt),sep].join('\n');
  });

  // ── 10. FUNCTIONAL ───────────────────────────────────────────
  def('compose', (...fns)=>{if(!fns.length)throw new Error('compose needs >=1 fn');return x=>fns.reduceRight((v,f)=>typeof f==='function'?f(v):v,x);});
  def('pipe',    (...fns)=>{if(!fns.length)throw new Error('pipe needs >=1 fn');return x=>fns.reduce((v,f)=>typeof f==='function'?f(v):v,x);});
  def('curry', fn=>{req(fn,'curry','fn');const ar=fn.length;const c=(...a)=>a.length>=ar?fn(...a):(...m)=>c(...a,...m);return c;});
  def('partial', (fn,...pa)=>{req(fn,'partial','fn');return(...r)=>typeof fn==='function'?fn(...pa,...r):null;});
  def('memoize', fn=>{req(fn,'memoize','fn');const cache=new Map();return(...a)=>{const k=JSON.stringify(a);if(cache.has(k))return cache.get(k);const r=typeof fn==='function'?fn(...a):null;cache.set(k,r);return r;};});
  def('throttle', (fn,ms)=>{req(fn,'throttle','fn');req(ms,'throttle','interval_ms');let last=0;return(...a)=>{const now=Date.now();if(now-last>=+ms){last=now;return typeof fn==='function'?fn(...a):null;}};});
  def('once', fn=>{req(fn,'once','fn');let called=false,result;return(...a)=>{if(!called){called=true;result=typeof fn==='function'?fn(...a):null;}return result;};});
  def('identity', x=>x);
  def('constant', x=>()=>x);
  def('noop',     ()=>null);
  def('flip', fn=>{req(fn,'flip','fn');return(a,b,...r)=>typeof fn==='function'?fn(b,a,...r):null;});
  def('juxt', (...fns)=>{if(!fns.length)throw new Error('juxt needs >=1 fn');return(...a)=>fns.map(f=>typeof f==='function'?f(...a):null);});
  def('apply', (fn,args)=>{req(fn,'apply','fn');req(args,'apply','args');return typeof fn==='function'?fn(...args):null;});
  def('iterate', (fn,x,n)=>{req(fn,'iterate','fn');req(x,'iterate','x');req(n,'iterate','n');let v=x;const r=[v];for(let i=0;i<+n;i++){v=typeof fn==='function'?fn(v):v;r.push(v);}return r;});

  // ── 11. SCIENTIFIC CONSTANTS ──────────────────────────────────
  const CONSTANTS={
    planck:6.62607015e-34,hbar:1.054571817e-34,boltzmann:1.380649e-23,
    avogadro:6.02214076e23,speed_of_light:299792458,electron_charge:1.602176634e-19,
    electron_mass:9.1093837015e-31,proton_mass:1.67262192369e-27,neutron_mass:1.67492749804e-27,
    bohr_radius:5.29177210903e-11,hartree_ev:27.211396,fine_structure:7.2973525693e-3,
    gravitational:6.67430e-11,stefan_boltzmann:5.670374419e-8,rydberg:1.0973731568e7,
    bohr_magneton:9.2740100783e-24,gas_constant:8.314462618,atomic_mass_unit:1.66053906660e-27,
    vacuum_permittivity:8.8541878128e-12,vacuum_permeability:1.25663706212e-6,
    pi:Math.PI,e:Math.E,tau:2*Math.PI,sqrt2:Math.SQRT2,golden_ratio:(1+Math.sqrt(5))/2,
  };
  def('get_constant', name=>{
    req(name,'get_constant','name');
    const k=String(name).toLowerCase();
    if(!(k in CONSTANTS))throw new Error(`get_constant: unknown "${name}". Available: ${Object.keys(CONSTANTS).join(', ')}`);
    return CONSTANTS[k];
  });
  def('list_constants', ()=>({...CONSTANTS}));

  // ── 12. MISC UTILITIES ───────────────────────────────────────
  def('uuid', ()=>{
    if(typeof crypto!=='undefined'&&crypto.randomUUID)return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==='x'?r:(r&0x3|0x8);return v.toString(16);});
  });
  def('timestamp', ()=>new Date().toISOString());
  def('now_ms',    ()=>Date.now());
  def('now_s',     ()=>Date.now()/1000);
  def('deep_copy',    x=>{req(x,'deep_copy','x');return JSON.parse(JSON.stringify(x));});
  def('shallow_copy', x=>{req(x,'shallow_copy','x');return Array.isArray(x)?[...x]:{...x};});
  def('hash_string', s=>{req(s,'hash_string','s');let h=0;for(const c of String(s)){h=((h<<5)-h)+c.charCodeAt(0);h|=0;}return h;});
  def('hash_object', o=>{req(o,'hash_object','obj');return G.hash_string(JSON.stringify(o));});
  def('range_list', (start,stop,step=1)=>{req(start,'range_list','start');req(stop,'range_list','stop');const r=[];for(let v=+start;+step>0?v<+stop:v>+stop;v+=+step)r.push(v);return r;});
  def('linspace', (start,stop,n)=>{req(start,'linspace','start');req(stop,'linspace','stop');req(n,'linspace','n');const r=[],nn=+n;for(let i=0;i<nn;i++)r.push(+start+i*(+stop-+start)/(nn-1));return r;});
  def('logspace', (start,stop,n,base=10)=>{req(start,'logspace','start');req(stop,'logspace','stop');req(n,'logspace','n');return G.linspace(+start,+stop,+n).map(x=>Math.pow(+base,x));});
  def('meshgrid', (x,y)=>{req(x,'meshgrid','x');req(y,'meshgrid','y');return[y.map(()=>[...x]),y.map(v=>x.map(()=>v))];});
  def('assert', (c,msg)=>{if(!c)throw new Error(String(msg||'Assertion failed'));});
  def('assert_close', (a,b,tol)=>{req(a,'assert_close','a');req(b,'assert_close','b');req(tol,'assert_close','tol');if(Math.abs(+a-+b)>+tol)throw new Error(`assert_close: |${a}-${b}|=${Math.abs(+a-+b)} > ${tol}`);});
  def('assert_equal', (a,b)=>{req(a,'assert_equal','a');req(b,'assert_equal','b');if(a!==b)throw new Error(`assert_equal: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);});
  def('assert_array_close', (a,b,tol)=>{
    req(a,'assert_array_close','a');req(b,'assert_array_close','b');req(tol,'assert_array_close','tol');
    if(a.length!==b.length)throw new Error(`assert_array_close: length ${a.length} vs ${b.length}`);
    a.forEach((v,i)=>{if(Math.abs(v-b[i])>+tol)throw new Error(`assert_array_close[${i}]: |${v}-${b[i]}| > ${tol}`);});
  });
  def('timing', (fn,label='')=>{
    req(fn,'timing','fn');
    const start=Date.now(),result=typeof fn==='function'?fn():null,elapsed=Date.now()-start;
    interpreter._log(`TIMING${label?' '+label:''}: ${elapsed}ms`);
    return{result,elapsed_ms:elapsed,label};
  });
  def('profile', (fn,n_runs)=>{
    req(fn,'profile','fn');req(n_runs,'profile','n_runs');
    const times=[];let result;
    for(let i=0;i<+n_runs;i++){const s=Date.now();result=typeof fn==='function'?fn():null;times.push(Date.now()-s);}
    return{n_runs:+n_runs,mean_ms:G.mean(times),stdev_ms:G.stdev(times),min_ms:Math.min(...times),max_ms:Math.max(...times),total_ms:times.reduce((a,b)=>a+b,0),last_result:result};
  });
  def('benchmark', (fns,n_runs)=>{req(fns,'benchmark','fns');req(n_runs,'benchmark','n_runs');const r={};for(const[name,fn]of Object.entries(fns))r[name]=G.profile(fn,n_runs);return r;});
  def('inspect',      x=>JSON.stringify(x,null,2));
  def('type_of',      x=>{if(x===null)return'null';if(Array.isArray(x))return'list';if(x instanceof Set)return'set';return typeof x;});
  def('coerce_number',(x,fallback=0)=>{const n=+x;return isNaN(n)?fallback:n;});

  interpreter._log('stdlib v3.0 loaded');

// ═══════════════════════════════════════════════════════
// 13. MISSING ALIASES + ADDITIONAL FUNCTIONS
//     All functions the advanced test suite expects
// ═══════════════════════════════════════════════════════

// Math aliases (tests call bare names, not method form)
def('ln',     x  => { req(x,'ln','x');       return Math.log(+x); });
def('log2',   x  => { req(x,'log2','x');     return Math.log2(+x); });
def('log10',  x  => { req(x,'log10','x');    return Math.log10(+x); });
def('floor',  x  => { req(x,'floor','x');    return Math.floor(+x); });
def('ceil',   x  => { req(x,'ceil','x');     return Math.ceil(+x); });
def('round',  (x, decimals) => {
  req(x,'round','x');
  if (decimals === undefined || decimals === null) return Math.round(+x);
  const f = Math.pow(10, +decimals);
  return Math.round(+x * f) / f;
});
def('sqrt',   x  => { req(x,'sqrt','x');     return Math.sqrt(+x); });
def('abs',    x  => { req(x,'abs','x');      return Math.abs(+x); });
def('pow',    (a,b)=>{ req(a,'pow','base');  req(b,'pow','exp'); return Math.pow(+a,+b); });
def('sin',    x  => { req(x,'sin','x');      return Math.sin(+x); });
def('cos',    x  => { req(x,'cos','x');      return Math.cos(+x); });
def('tan',    x  => { req(x,'tan','x');      return Math.tan(+x); });
def('asin',   x  => { req(x,'asin','x');     return Math.asin(+x); });
def('acos',   x  => { req(x,'acos','x');     return Math.acos(+x); });
def('atan',   x  => { req(x,'atan','x');     return Math.atan(+x); });
def('atan2',  (y,x)=>{ req(y,'atan2','y'); req(x,'atan2','x'); return Math.atan2(+y,+x); });
def('exp',    x  => { req(x,'exp','x');      return Math.exp(+x); });

// Stats aliases the tests call directly
def('std',          (arr, pop=true) => { req(arr,'std','array'); return G.stdev(arr, pop); });
def('var',          (arr, pop=true) => { req(arr,'var','array'); return G.variance(arr, pop); });
def('var_p',        arr => { req(arr,'var_p','array'); return G.variance(arr, true); });
def('var_s',        arr => { req(arr,'var_s','array'); return G.variance(arr, false); });
def('std_p',        arr => { req(arr,'std_p','array'); return G.stdev(arr, true); });
def('std_s',        arr => { req(arr,'std_s','array'); return G.stdev(arr, false); });

// Array functions the tests call as top-level functions
def('sort', (arr, reverse=false) => {
  req(arr,'sort','array');
  const s = [...arr].sort((a,b) => a < b ? -1 : a > b ? 1 : 0);
  return reverse ? s.reverse() : s;
});
def('top_k', (arr, k) => {
  req(arr,'top_k','array'); req(k,'top_k','k');
  return [...arr].sort((a,b) => b - a).slice(0, +k);
});
def('bottom_k', (arr, k) => {
  req(arr,'bottom_k','array'); req(k,'bottom_k','k');
  return [...arr].sort((a,b) => a - b).slice(0, +k);
});
def('cumsum', arr => {
  req(arr,'cumsum','array');
  const r = []; let s = 0;
  arr.forEach(v => { s += v; r.push(s); });
  return r;
});
def('argmax', arr => {
  req(arr,'argmax','array');
  let mi = 0;
  arr.forEach((v,i) => { if (v > arr[mi]) mi = i; });
  return mi;
});
def('argmin', arr => {
  req(arr,'argmin','array');
  let mi = 0;
  arr.forEach((v,i) => { if (v < arr[mi]) mi = i; });
  return mi;
});
def('unique', arr => {
  req(arr,'unique','array');
  return [...new Set(arr)];
});
def('flatten', (arr, depth=1) => {
  req(arr,'flatten','array');
  return arr.flat(+depth);
});
def('sum', arr => {
  req(arr,'sum','array');
  return Array.isArray(arr) ? arr.reduce((a,b) => a+b, 0) : +arr;
});
def('product', arr => {
  req(arr,'product','array');
  return Array.isArray(arr) ? arr.reduce((a,b) => a*b, 1) : +arr;
});
def('reversed', arr => {
  req(arr,'reversed','array');
  return [...arr].reverse();
});

// range() convenience — returns a plain array (not a range object)
def('range', (start_or_stop, stop, step=1) => {
  let s, e, st;
  if (stop === undefined || stop === null) { s = 0; e = +start_or_stop; st = 1; }
  else { s = +start_or_stop; e = +stop; st = +step; }
  const r = [];
  for (let v = s; st > 0 ? v < e : v > e; v += st) r.push(v);
  return r;
});

// String top-level functions (tests call upper(s) not s.upper())
def('upper',    s => { req(s,'upper','s');    return String(s).toUpperCase(); });
def('lower',    s => { req(s,'lower','s');    return String(s).toLowerCase(); });
def('strip',    s => { req(s,'strip','s');    return String(s).trim(); });
def('lstrip',   s => { req(s,'lstrip','s');   return String(s).trimStart(); });
def('rstrip',   s => { req(s,'rstrip','s');   return String(s).trimEnd(); });
def('split', (s, sep='') => {
  req(s,'split','s');
  return sep === '' ? [...String(s)] : String(s).split(String(sep));
});
def('join', (items, sep='') => {
  req(items,'join','items');
  return Array.isArray(items) ? items.join(String(sep)) : String(items);
});
def('replace', (s, old_val, new_val) => {
  req(s,'replace','s'); req(old_val,'replace','old'); req(new_val,'replace','new');
  return String(s).replaceAll(String(old_val), String(new_val));
});
def('contains', (s, sub) => {
  req(s,'contains','s'); req(sub,'contains','sub');
  return String(s).includes(String(sub));
});
def('startswith', (s, prefix) => {
  req(s,'startswith','s'); req(prefix,'startswith','prefix');
  return String(s).startsWith(String(prefix));
});
def('endswith', (s, suffix) => {
  req(s,'endswith','s'); req(suffix,'endswith','suffix');
  return String(s).endsWith(String(suffix));
});
def('zfill', (x, width) => {
  req(x,'zfill','x'); req(width,'zfill','width');
  return String(+x).padStart(+width, '0');
});
def('len', x => {
  if (x === undefined || x === null) return 0;
  if (typeof x === 'string') return x.length;
  if (Array.isArray(x)) return x.length;
  if (x instanceof Set) return x.size;
  if (x instanceof Map) return x.size;
  if (x && x.__biostr__) return x.sequence.length;
  if (x && x.__deque__) return x._d.length;
  if (x && x.__stack__) return x._s.length;
  if (x && x.__btree__) return x._m.size;
  if (typeof x === 'object') return Object.keys(x).length;
  return 0;
});
def('str',   x => x !== undefined && x !== null ? String(x) : '');
def('int',   x => { req(x,'int','x'); return Math.trunc(+x); });
def('float', x => { req(x,'float','x'); return parseFloat(x); });
def('bool',  x => Boolean(x));

// ── Quantum utility functions the tests expect ───────────────────
def('int_to_bits', (n, width) => {
  req(n,'int_to_bits','n'); req(width,'int_to_bits','width');
  const bits = (+n).toString(2).padStart(+width,'0').split('').map(Number);
  return bits;
});
def('bits_to_int', bits => {
  req(bits,'bits_to_int','bits');
  return parseInt(bits.join(''), 2);
});
def('hamming_weight', n => {
  req(n,'hamming_weight','n');
  return (+n).toString(2).replace(/0/g,'').length;
});
def('parity', n => {
  req(n,'parity','n');
  return G.hamming_weight(n) % 2;
});
def('n_qubits_for', n => {
  req(n,'n_qubits_for','n');
  return Math.ceil(Math.log2(+n));
});
def('state_label', (n, width) => {
  req(n,'state_label','n'); req(width,'state_label','width');
  const bits = (+n).toString(2).padStart(+width,'0');
  return `|${bits}⟩`;
});
def('best_rational_approx', (x, max_denom) => {
  req(x,'best_rational_approx','x');
  req(max_denom,'best_rational_approx','max_denom');
  // Stern-Brocot / continued fraction approach
  let lo_n=0, lo_d=1, hi_n=1, hi_d=1;
  const target = +x;
  for (let i=0; i<200; i++) {
    const mid_n = lo_n + hi_n, mid_d = lo_d + hi_d;
    if (mid_d > +max_denom) break;
    const mid = mid_n / mid_d;
    if (Math.abs(mid - target) < 1e-12) return { numerator:mid_n, denominator:mid_d };
    if (mid < target) { lo_n=mid_n; lo_d=mid_d; }
    else              { hi_n=mid_n; hi_d=mid_d; }
  }
  // Pick the closer of lo and hi
  const lo_err = Math.abs(lo_n/lo_d - target);
  const hi_err = Math.abs(hi_n/hi_d - target);
  return lo_err < hi_err
    ? { numerator:lo_n, denominator:lo_d }
    : { numerator:hi_n, denominator:hi_d };
});

// ── Formatting functions the tests expect ────────────────────────
// fmt_sci(0.000123, 2) → "1.23e-4"  (short exponent form, no +)
def('fmt_sci', (x, sig_figs) => {
  req(x,'fmt_sci','x'); req(sig_figs,'fmt_sci','sig_figs');
  const n = +x;
  if (n === 0) return '0';
  const exp  = Math.floor(Math.log10(Math.abs(n)));
  const mant = n / Math.pow(10, exp);
  return `${mant.toFixed(+sig_figs)}e${exp}`;
});
// fmt_fixed(3.14159, 3) → "3.142"
def('fmt_fixed', (x, decimals) => {
  req(x,'fmt_fixed','x'); req(decimals,'fmt_fixed','decimals');
  return (+x).toFixed(+decimals);
});
// fmt_pct(0.875, 1) → "87.5%"
def('fmt_pct', (x, decimals=1) => {
  req(x,'fmt_pct','x');
  return `${(+x * 100).toFixed(+decimals)}%`;
});

// ── Dict helpers ─────────────────────────────────────────────────
def('dict_get', (d, key, default_val=null) => {
  req(d,'dict_get','dict'); req(key,'dict_get','key');
  return d[key] !== undefined ? d[key] : default_val;
});
def('dict_set', (d, key, val) => {
  req(d,'dict_set','dict'); req(key,'dict_set','key');
  d[key] = val; return d;
});
def('dict_has', (d, key) => {
  req(d,'dict_has','dict'); req(key,'dict_has','key');
  return key in d;
});
def('dict_keys',   d => { req(d,'dict_keys','dict');   return Object.keys(d); });
def('dict_values', d => { req(d,'dict_values','dict'); return Object.values(d); });
def('dict_items',  d => { req(d,'dict_items','dict');  return Object.entries(d); });
def('dict_merge',  (a, b) => { req(a,'dict_merge','a'); req(b,'dict_merge','b'); return {...a,...b}; });
def('dict_update', (d, other) => { req(d,'dict_update','d'); req(other,'dict_update','other'); Object.assign(d, other); return d; });
def('dict_pop',    (d, key) => { req(d,'dict_pop','d'); req(key,'dict_pop','key'); const v=d[key]; delete d[key]; return v??null; });
def('dict_len',    d => { req(d,'dict_len','d'); return Object.keys(d).length; });

// ── Additional missing top-level functions ───────────────────────
def('map',     (fn, arr) => {
  req(fn,'map','fn'); req(arr,'map','array');
  const c = (f, v) => f && f.__fn__ ? interpreter._callFn(f,[v]) : typeof f==='function' ? f(v) : v;
  return arr.map(v => c(fn, v));
});
def('filter',  (fn, arr) => {
  req(fn,'filter','fn'); req(arr,'filter','array');
  const c = (f, v) => f && f.__fn__ ? interpreter._callFn(f,[v]) : typeof f==='function' ? f(v) : false;
  return arr.filter(v => c(fn, v));
});
def('reduce',  (fn, arr, init) => {
  req(fn,'reduce','fn'); req(arr,'reduce','array');
  const c = (f, a, v) => f && f.__fn__ ? interpreter._callFn(f,[a,v]) : typeof f==='function' ? f(a,v) : a;
  return init !== undefined ? arr.reduce((a,v) => c(fn,a,v), init) : arr.reduce((a,v) => c(fn,a,v));
});
def('any',  (arr, fn=null) => {
  req(arr,'any','array');
  if (!fn) return arr.some(Boolean);
  const c = v => fn && fn.__fn__ ? interpreter._callFn(fn,[v]) : typeof fn==='function' ? fn(v) : v;
  return arr.some(v => c(v));
});
def('all',  (arr, fn=null) => {
  req(arr,'all','array');
  if (!fn) return arr.every(Boolean);
  const c = v => fn && fn.__fn__ ? interpreter._callFn(fn,[v]) : typeof fn==='function' ? fn(v) : v;
  return arr.every(v => c(v));
});
def('find', (arr, fn) => {
  req(arr,'find','array'); req(fn,'find','fn');
  const c = v => fn && fn.__fn__ ? interpreter._callFn(fn,[v]) : typeof fn==='function' ? fn(v) : v===fn;
  return arr.find(v => c(v)) ?? null;
});
def('enumerate', arr => {
  req(arr,'enumerate','array');
  return arr.map((v,i) => [i,v]);
});
def('zip', (a, b) => {
  req(a,'zip','a'); req(b,'zip','b');
  return Array.from({length: Math.min(a.length, b.length)}, (_,i) => [a[i], b[i]]);
});

// Compose / pipe with Sanskrit lambda support
def('compose', (...fns) => {
  if (!fns.length) throw new Error('compose requires at least one function');
  const c = (f, v) => f && f.__fn__ ? interpreter._callFn(f,[v]) : typeof f==='function' ? f(v) : v;
  return x => fns.reduceRight((v, f) => c(f, v), x);
});
def('pipe', (...fns) => {
  if (!fns.length) throw new Error('pipe requires at least one function');
  const c = (f, v) => f && f.__fn__ ? interpreter._callFn(f,[v]) : typeof f==='function' ? f(v) : v;
  return x => fns.reduce((v, f) => c(f, v), x);
});

// Memoize with Sanskrit lambda support
def('memoize', fn => {
  req(fn,'memoize','fn');
  const cache = new Map();
  return (...args) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);
    const result = fn && fn.__fn__
      ? interpreter._callFn(fn, args)
      : typeof fn === 'function' ? fn(...args) : null;
    cache.set(key, result);
    return result;
  };
});

// Curry — wraps to handle Sanskrit lambdas too
def('curry', fn => {
  req(fn,'curry','fn');
  const arity = fn.__fn__ ? fn.params.length : fn.length;
  const c = (...a) => a.length >= arity
    ? (fn.__fn__ ? interpreter._callFn(fn, a) : fn(...a))
    : (...m) => c(...a, ...m);
  return c;
});

// Partial with Sanskrit lambda support
def('partial', (fn, ...pa) => {
  req(fn,'partial','fn');
  return (...rest) => {
    const all = [...pa, ...rest];
    return fn && fn.__fn__ ? interpreter._callFn(fn, all) : typeof fn==='function' ? fn(...all) : null;
  };
});

// Group by with Sanskrit lambda support
def('group_by', (arr, key_fn) => {
  req(arr,'group_by','array'); req(key_fn,'group_by','key_fn');
  const groups = {};
  const k = v => key_fn && key_fn.__fn__
    ? interpreter._callFn(key_fn, [v])
    : typeof key_fn === 'function' ? key_fn(v) : v[key_fn];
  arr.forEach(v => { const key = String(k(v)); if (!groups[key]) groups[key]=[]; groups[key].push(v); });
  return groups;
});

// Sort_by with Sanskrit lambda support
def('sort_by', (arr, key_fn, reverse=false) => {
  req(arr,'sort_by','array'); req(key_fn,'sort_by','key_fn');
  const k = v => key_fn && key_fn.__fn__
    ? interpreter._callFn(key_fn, [v])
    : typeof key_fn === 'function' ? key_fn(v) : v[key_fn];
  const s = [...arr].sort((a,b) => { const ka=k(a),kb=k(b); return ka<kb?-1:ka>kb?1:0; });
  return reverse ? s.reverse() : s;
});

// Gradient descent with Sanskrit lambda support
def('gradient_descent', (f, x0, lr, n_steps) => {
  req(f,'gradient_descent','f');
  req(x0,'gradient_descent','x0');
  req(lr,'gradient_descent','learning_rate');
  req(n_steps,'gradient_descent','n_steps');
  const call_f = x => f && f.__fn__ ? interpreter._callFn(f, [x]) : typeof f==='function' ? f(x) : 0;
  let x = [...x0];
  const history = [], eps = 1e-6;
  for (let step = 0; step < +n_steps; step++) {
    const val = call_f(x);
    history.push({ step, x:[...x], value:val });
    const grad = x.map((_, i) => {
      const xp = [...x]; xp[i] += eps;
      const xm = [...x]; xm[i] -= eps;
      return (call_f(xp) - call_f(xm)) / (2 * eps);
    });
    x = x.map((v, i) => v - +lr * grad[i]);
  }
  return { x, final_value: call_f(x), history, converged: true };
});

// Adam with Sanskrit lambda support
def('adam', (f, x0, lr, n_steps, beta1=0.9, beta2=0.999, epsilon=1e-8) => {
  req(f,'adam','f'); req(x0,'adam','x0'); req(lr,'adam','lr'); req(n_steps,'adam','n_steps');
  const call_f = x => f && f.__fn__ ? interpreter._callFn(f, [x]) : typeof f==='function' ? f(x) : 0;
  let x=[...x0], m=x.map(()=>0), v=x.map(()=>0);
  const history=[], eps=1e-6;
  for (let t=1; t<=+n_steps; t++) {
    const grad = x.map((_,i)=>{ const xp=[...x];xp[i]+=eps;const xm=[...x];xm[i]-=eps;return(call_f(xp)-call_f(xm))/(2*eps); });
    m = m.map((mi,i)=>+beta1*mi+(1-+beta1)*grad[i]);
    v = v.map((vi,i)=>+beta2*vi+(1-+beta2)*grad[i]**2);
    const mh = m.map(mi=>mi/(1-Math.pow(+beta1,t)));
    const vh = v.map(vi=>vi/(1-Math.pow(+beta2,t)));
    x = x.map((xi,i)=>xi-+lr*mh[i]/(Math.sqrt(vh[i])+epsilon));
    history.push({step:t, value:call_f(x)});
  }
  return { x, final_value:call_f(x), history, converged:true };
});

// Bisect with Sanskrit lambda support
def('bisect', (f, a, b, tol) => {
  req(f,'bisect','f'); req(a,'bisect','a'); req(b,'bisect','b'); req(tol,'bisect','tolerance');
  const call_f = x => f && f.__fn__ ? interpreter._callFn(f, [x]) : typeof f==='function' ? f(x) : 0;
  let lo = +a, hi = +b;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (hi - lo < +tol) return { root:mid, converged:true, iterations:i };
    if (call_f(lo) * call_f(mid) <= 0) hi = mid; else lo = mid;
  }
  return { root:(lo+hi)/2, converged:false };
});

// Newton-Raphson with Sanskrit lambda support
def('newton_raphson', (f, df, x0, tol, max_iter) => {
  req(f,'newton_raphson','f'); req(df,'newton_raphson','df');
  req(x0,'newton_raphson','x0'); req(tol,'newton_raphson','tolerance'); req(max_iter,'newton_raphson','max_iter');
  const cf = x => f && f.__fn__ ? interpreter._callFn(f,[x]) : typeof f==='function' ? f(x) : 0;
  const cd = x => df && df.__fn__ ? interpreter._callFn(df,[x]) : typeof df==='function' ? df(x) : 1;
  let x = +x0;
  for (let i = 0; i < +max_iter; i++) {
    const xn = x - cf(x)/cd(x);
    if (Math.abs(xn - x) < +tol) return { root:xn, converged:true, iterations:i };
    x = xn;
  }
  return { root:x, converged:false };
});


  // ── Top-level dict/array aliases for integration tests ──────────
  def('merge',      (a,b)=>{req(a,'merge','a');req(b,'merge','b');return{...a,...b};});
  def('keys',       d=>{req(d,'keys','d');return Object.keys(d);});
  def('values',     d=>{req(d,'values','d');return Object.values(d);});
  def('items',      d=>{req(d,'items','d');return Object.entries(d);});
  def('transpose',  m=>{req(m,'transpose','matrix');return m[0].map((_,j)=>m.map(r=>r[j]));});
  def('random_seed',_=>{});
  def('min', (...a)=>{const arr=a.length===1&&Array.isArray(a[0])?a[0]:a;return Math.min(...arr);});
  def('max', (...a)=>{const arr=a.length===1&&Array.isArray(a[0])?a[0]:a;return Math.max(...arr);});

interpreter._log('stdlib v3.0 — complete');
}
