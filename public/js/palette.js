/**
 * public/js/palette.js
 * Block palette: fetches block registry from server, renders categories,
 * handles search and drag-to-canvas.
 */

// Category icons and colours matching the registry categories
const CAT_META = {
  'Quantum':           { icon: '⚛',  color: '#60A5FA' },
  'Chemistry':         { icon: '⚗',  color: '#34D399' },
  'Drug Discovery':    { icon: '💊', color: '#A78BFA' },
  'Biology':           { icon: '🧬', color: '#FB7185' },
  'Physics':           { icon: '🔭', color: '#F472B6' },
  'Materials':         { icon: '🔬', color: '#C084FC' },
  'Astrophysics':      { icon: '🌌', color: '#7DD3FC' },
  'ML':                { icon: '🤖', color: '#FBBF24' },
  'GenAI':             { icon: '🦾', color: '#F97316' },
  'Data':              { icon: '📊', color: '#FB923C' },
  'Optimization':      { icon: '🎯', color: '#4ADE80' },
  'Combinatorial':     { icon: '🔀', color: '#86EFAC' },
  'Statistics':        { icon: '📈', color: '#A3E635' },
  'Signal':            { icon: '〰', color: '#22D3EE' },
  'Linear Algebra':    { icon: '⊗',  color: '#818CF8' },
  'Finance':           { icon: '💹', color: '#34D399' },
  'NLP':               { icon: '💬', color: '#60A5FA' },
  'Vision':            { icon: '👁',  color: '#F472B6' },
  'Medical':           { icon: '🏥', color: '#FB7185' },
  'Climate':           { icon: '🌍', color: '#4ADE80' },
  'Network':           { icon: '🕸',  color: '#A78BFA' },
  'Output':            { icon: '📤', color: '#38BDF8' },
  'Utility':           { icon: '🔧', color: '#94A3B8' },
  'Custom':            { icon: '⚙',  color: '#CBD5E1' },
  'Math':              { icon: '∑',  color: '#FBBF24' },
  'Robotics':          { icon: '🤖', color: '#F97316' },
  'IoT':               { icon: '📡', color: '#38BDF8' },
};

function getCatMeta(catFull) {
  // catFull might be "Quantum / Registers" — get the top-level
  const top = catFull.split('/')[0].trim();
  return CAT_META[top] || { icon: '◆', color: '#94A3B8' };
}

export class Palette {
  constructor(listEl, searchEl, clearEl) {
    this.listEl   = listEl;
    this.searchEl = searchEl;
    this.clearEl  = clearEl;
    this.blocks   = [];
    this.categories = {};  // name → [blocks]
    this.collapsed  = new Set();
  }

  async load() {
    try {
      const res = await fetch('/api/blocks');
      if (res.ok) {
        const data = await res.json();
        this.blocks = data.blocks || data || [];
      }
    } catch(e) {
      // Server not running — use built-in minimal set for offline demo
      this.blocks = BUILTIN_BLOCKS;
    }
    this._organise();
    this._render(this.categories);
    this._bindSearch();
  }

  _organise() {
    this.categories = {};
    for (const block of this.blocks) {
      const cat = block.category || 'Utility';
      if (!this.categories[cat]) this.categories[cat] = [];
      this.categories[cat].push(block);
    }
  }

  _render(cats) {
    this.listEl.innerHTML = '';
    for (const [catName, blocks] of Object.entries(cats)) {
      const meta = getCatMeta(catName);
      const div  = document.createElement('div');
      div.className = 'palette-category';
      div.dataset.cat = catName.split('/')[0].trim();

      const header = document.createElement('div');
      header.className = 'palette-cat-header';
      if (this.collapsed.has(catName)) header.classList.add('collapsed');
      header.style.borderLeft = `3px solid ${meta.color}`;
      header.innerHTML = `<span>${meta.icon} ${catName}</span><span class="palette-cat-arrow">▾</span>`;
      header.addEventListener('click', () => {
        header.classList.toggle('collapsed');
        if (header.classList.contains('collapsed')) {
          this.collapsed.add(catName); items.style.display = 'none';
        } else {
          this.collapsed.delete(catName); items.style.display = '';
        }
      });

      const items = document.createElement('div');
      items.className = 'palette-items';
      if (this.collapsed.has(catName)) items.style.display = 'none';

      for (const block of blocks) {
        const item = this._makeItem(block, meta);
        items.appendChild(item);
      }

      div.appendChild(header);
      div.appendChild(items);
      this.listEl.appendChild(div);
    }
  }

  _makeItem(block, meta) {
    const div = document.createElement('div');
    div.className = 'palette-item';
    div.dataset.blockId = block.id;
    div.draggable = true;
    div.innerHTML = `
      <span class="palette-item-icon" style="color:${meta.color}">${meta.icon}</span>
      <span class="palette-item-label">${block.label || block.id}</span>
    `;
    div.title = block.description || block.label || block.id;

    // Drag start: encode block data
    div.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', JSON.stringify({
        type: 'block', blockId: block.id
      }));
      e.dataTransfer.effectAllowed = 'copy';
    });

    return div;
  }

  _bindSearch() {
    this.searchEl.addEventListener('input', () => this._doSearch());
    this.clearEl.addEventListener('click', () => {
      this.searchEl.value = '';
      this._doSearch();
    });
  }

  _doSearch() {
    const q = this.searchEl.value.toLowerCase().trim();
    if (!q) { this._render(this.categories); return; }

    const filtered = {};
    for (const [cat, blocks] of Object.entries(this.categories)) {
      const matched = blocks.filter(b =>
        (b.label || b.id).toLowerCase().includes(q) ||
        (b.description || '').toLowerCase().includes(q) ||
        b.id.toLowerCase().includes(q)
      );
      if (matched.length > 0) filtered[cat] = matched;
    }
    this._render(filtered);
    // Expand all categories in search results
    this.listEl.querySelectorAll('.palette-cat-header').forEach(h => {
      h.classList.remove('collapsed');
      h.nextElementSibling.style.display = '';
    });
  }
}

// ── Minimal built-in blocks for offline use ─────────────────────────────────
const BUILTIN_BLOCKS = [
  // Quantum
  { id:'quantum_register', label:'Quantum Register', category:'Quantum / Registers', description:'Create n qubits', params:[{name:'n_qubits',type:'number',default:2},{name:'name',type:'string',default:'q'}], inputs:[], outputs:[{name:'register',type:'quantum'}] },
  { id:'hadamard', label:'Hadamard Gate', category:'Quantum / Single-Qubit Gates', description:'H|0⟩=(|0⟩+|1⟩)/√2', params:[{name:'qubit',type:'number',default:0}], inputs:[{name:'register',type:'quantum'}], outputs:[{name:'register',type:'quantum'}] },
  { id:'x_gate', label:'X Gate (NOT)', category:'Quantum / Single-Qubit Gates', description:'Bit flip', params:[{name:'qubit',type:'number',default:0}], inputs:[{name:'register',type:'quantum'}], outputs:[{name:'register',type:'quantum'}] },
  { id:'y_gate', label:'Y Gate', category:'Quantum / Single-Qubit Gates', description:'Y Pauli', params:[{name:'qubit',type:'number',default:0}], inputs:[{name:'register',type:'quantum'}], outputs:[{name:'register',type:'quantum'}] },
  { id:'z_gate', label:'Z Gate', category:'Quantum / Single-Qubit Gates', description:'Phase flip', params:[{name:'qubit',type:'number',default:0}], inputs:[{name:'register',type:'quantum'}], outputs:[{name:'register',type:'quantum'}] },
  { id:'s_gate', label:'S Gate', category:'Quantum / Single-Qubit Gates', description:'Phase +i', params:[{name:'qubit',type:'number',default:0}], inputs:[{name:'register',type:'quantum'}], outputs:[{name:'register',type:'quantum'}] },
  { id:'t_gate', label:'T Gate', category:'Quantum / Single-Qubit Gates', description:'Phase e^(iπ/4)', params:[{name:'qubit',type:'number',default:0}], inputs:[{name:'register',type:'quantum'}], outputs:[{name:'register',type:'quantum'}] },
  { id:'rx_gate', label:'Rx Gate', category:'Quantum / Rotation Gates', description:'X-axis rotation', params:[{name:'qubit',type:'number',default:0},{name:'theta',type:'number',default:1.5708}], inputs:[{name:'register',type:'quantum'}], outputs:[{name:'register',type:'quantum'}] },
  { id:'ry_gate', label:'Ry Gate', category:'Quantum / Rotation Gates', description:'Y-axis rotation', params:[{name:'qubit',type:'number',default:0},{name:'theta',type:'number',default:1.5708}], inputs:[{name:'register',type:'quantum'}], outputs:[{name:'register',type:'quantum'}] },
  { id:'rz_gate', label:'Rz Gate', category:'Quantum / Rotation Gates', description:'Z-axis rotation', params:[{name:'qubit',type:'number',default:0},{name:'theta',type:'number',default:1.5708}], inputs:[{name:'register',type:'quantum'}], outputs:[{name:'register',type:'quantum'}] },
  { id:'cnot_gate', label:'CNOT Gate', category:'Quantum / Two-Qubit Gates', description:'Controlled-NOT', params:[{name:'control',type:'number',default:0},{name:'target',type:'number',default:1}], inputs:[{name:'register',type:'quantum'}], outputs:[{name:'register',type:'quantum'}] },
  { id:'cz_gate', label:'CZ Gate', category:'Quantum / Two-Qubit Gates', description:'Controlled-Z', params:[{name:'qubit_a',type:'number',default:0},{name:'qubit_b',type:'number',default:1}], inputs:[{name:'register',type:'quantum'}], outputs:[{name:'register',type:'quantum'}] },
  { id:'swap_gate', label:'SWAP Gate', category:'Quantum / Two-Qubit Gates', description:'Swap two qubits', params:[{name:'qubit_a',type:'number',default:0},{name:'qubit_b',type:'number',default:1}], inputs:[{name:'register',type:'quantum'}], outputs:[{name:'register',type:'quantum'}] },
  { id:'toffoli_gate', label:'Toffoli (CCX)', category:'Quantum / Three-Qubit Gates', description:'Doubly-controlled X', params:[{name:'ctrl1',type:'number',default:0},{name:'ctrl2',type:'number',default:1},{name:'target',type:'number',default:2}], inputs:[{name:'register',type:'quantum'}], outputs:[{name:'register',type:'quantum'}] },
  { id:'measure_all', label:'Measure All', category:'Quantum / Measurement', description:'Measure all qubits N shots', params:[{name:'shots',type:'number',default:1000}], inputs:[{name:'register',type:'quantum'}], outputs:[{name:'result',type:'dict'}] },
  { id:'measure_single', label:'Measure Qubit', category:'Quantum / Measurement', description:'Measure one qubit: returns 0 or 1', params:[{name:'qubit',type:'number',default:0}], inputs:[{name:'register',type:'quantum'}], outputs:[{name:'bit',type:'number'}] },
  { id:'statevector_block', label:'Statevector', category:'Quantum / Measurement', description:'Get full quantum state', params:[], inputs:[{name:'register',type:'quantum'}], outputs:[{name:'statevector',type:'list'}] },
  { id:'vqe_block', label:'VQE', category:'Quantum / Algorithms', description:'Variational Quantum Eigensolver', params:[{name:'ansatz',type:'string',default:'UCCSD'},{name:'shots',type:'number',default:2000}], inputs:[{name:'molecule',type:'any'}], outputs:[{name:'result',type:'dict'}] },
  { id:'grover_block', label:'Grover Search', category:'Quantum / Algorithms', description:'O(√N) quantum search', params:[{name:'n_qubits',type:'number',default:4},{name:'target',type:'number',default:7},{name:'shots',type:'number',default:1000}], inputs:[], outputs:[{name:'result',type:'dict'}] },
  { id:'qft_block', label:'QFT', category:'Quantum / Algorithms', description:'Quantum Fourier Transform', params:[{name:'inverse',type:'bool',default:false}], inputs:[{name:'register',type:'quantum'}], outputs:[{name:'register',type:'quantum'}] },
  // Data
  { id:'print_block', label:'Print', category:'Output', description:'Display a value', params:[{name:'label',type:'string',default:''}], inputs:[{name:'value',type:'any'}], outputs:[] },
  { id:'csv_source', label:'CSV Source', category:'Data / Sources', description:'Load CSV file', params:[{name:'filename',type:'string',default:'data.csv'}], inputs:[], outputs:[{name:'data',type:'list'}] },
  // Math
  { id:'mean_block', label:'Mean', category:'Math / Statistics', description:'Average of a list', params:[], inputs:[{name:'array',type:'list'}], outputs:[{name:'mean',type:'number'}] },
  { id:'stdev_block', label:'Standard Deviation', category:'Math / Statistics', description:'Std deviation', params:[{name:'population',type:'bool',default:true}], inputs:[{name:'array',type:'list'}], outputs:[{name:'stdev',type:'number'}] },
];
