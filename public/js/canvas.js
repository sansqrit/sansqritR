/**
 * public/js/canvas.js
 * SVG-based visual canvas: drag blocks from palette, connect with wires,
 * generate Sanskrit code from the visual graph.
 */

const PORT_R   = 7;
const GRID     = 20;
const BLK_W    = 180;
const BLK_H_BASE = 70;
const HDR_H    = 28;
const PARAM_H  = 18;
const PORT_SPACING = 22;

// Port type → CSS class and wire colour
const PORT_CLASSES = {
  quantum: 'port-quantum',
  number:  'port-number',
  list:    'port-list',
  dict:    'port-dict',
  string:  'port-string',
  any:     'port-any',
  bool:    'port-any',
};
const WIRE_CLASSES = {
  quantum: 'wire-quantum',
  number:  'wire-number',
  list:    'wire-list',
  dict:    'wire-dict',
};

// Category header colours
const CAT_COLOURS = {
  'Quantum':      '#1D4ED8',
  'Chemistry':    '#059669',
  'Biology':      '#7C3AED',
  'Physics':      '#DB2777',
  'ML':           '#D97706',
  'Data':         '#EA580C',
  'Output':       '#0E7490',
  'Utility':      '#374151',
  'Math':         '#92400E',
  'Drug':         '#4338CA',
  'Materials':    '#5B21B6',
  'Astrophysics': '#1E40AF',
  'Finance':      '#065F46',
  'NLP':          '#1E3A5F',
  'Climate':      '#166534',
};

function catColor(cat) {
  const top = (cat || '').split('/')[0].trim();
  return CAT_COLOURS[top] || '#374151';
}

let nextId = 1;

export class Canvas {
  constructor(svgEl) {
    this.svg       = svgEl;
    this.blocksEl  = svgEl.querySelector('#canvas-blocks');
    this.wiresEl   = svgEl.querySelector('#canvas-wires');
    this.wireDraft = svgEl.querySelector('#wire-draft');
    this.gridEl    = svgEl.querySelector('#canvas-grid');
    this.emptyHint = document.getElementById('canvas-empty-hint');

    this.blocks    = new Map();   // id → { def, el, x, y, params, ports }
    this.wires     = new Map();   // id → { fromBlock, fromPort, toBlock, toPort, el }
    this.selected  = null;

    // Viewport transform
    this.viewX = 0; this.viewY = 0; this.viewScale = 1;

    // Wire drawing state
    this.drawingWire = null;   // { fromBlock, fromPort, startX, startY }

    // Drag state
    this.dragging = null;      // { block, startMX, startMY, startBX, startBY }
    this.panning  = false;
    this.panStart = null;

    this.onBlockSelect = null;
  }

  init() {
    this._drawGrid();
    this._bindSVGEvents();
    this._bindDropEvents();
  }

  // ── Grid ────────────────────────────────────────────────────────────────────
  _drawGrid() {
    const W = 8000, H = 6000;
    let html = '';
    for (let x = 0; x <= W; x += GRID) {
      const major = x % (GRID*5) === 0;
      html += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" class="${major?'canvas-grid-major':'canvas-grid-line'}"/>`;
    }
    for (let y = 0; y <= H; y += GRID) {
      const major = y % (GRID*5) === 0;
      html += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" class="${major?'canvas-grid-major':'canvas-grid-line'}"/>`;
    }
    this.gridEl.innerHTML = html;
  }

  // ── Drop handling ────────────────────────────────────────────────────────────
  _bindDropEvents() {
    const wrap = this.svg.parentElement;
    wrap.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    wrap.addEventListener('drop', e => {
      e.preventDefault();
      try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        if (data.type === 'block') {
          const rect = wrap.getBoundingClientRect();
          const x = (e.clientX - rect.left - this.viewX) / this.viewScale;
          const y = (e.clientY - rect.top  - this.viewY) / this.viewScale;
          this._dropBlock(data.blockId, x, y);
        }
      } catch(err) {}
    });
  }

  async _dropBlock(blockId, x, y) {
    // Fetch block definition from server or use cached
    let def = this._blockDefs?.get(blockId);
    if (!def) {
      try {
        const res = await fetch(`/api/blocks?id=${blockId}`);
        if (res.ok) {
          const data = await res.json();
          def = (data.blocks || [data]).find(b => b.id === blockId);
        }
      } catch(e) {}
    }
    if (!def) {
      def = { id: blockId, label: blockId, category: 'Utility', params: [], inputs: [], outputs: [] };
    }
    const snapped = { x: Math.round(x/GRID)*GRID, y: Math.round(y/GRID)*GRID };
    this.addBlock(def, snapped.x, snapped.y);
  }

  // ── Block creation ───────────────────────────────────────────────────────────
  addBlock(def, x, y) {
    const id   = `blk_${nextId++}`;
    const params = {};
    (def.params || []).forEach(p => { params[p.name] = p.default ?? ''; });

    const nIn  = (def.inputs  || []).length;
    const nOut = (def.outputs || []).length;
    const nParam = (def.params || []).length;
    const height = Math.max(BLK_H_BASE, HDR_H + nParam * PARAM_H + 20);

    const g = document.createElementNS('http://www.w3.org/2000/svg','g');
    g.classList.add('block-group');
    g.dataset.blockId = id;
    this._renderBlock(g, def, id, x, y, params, height);
    this.blocksEl.appendChild(g);

    const block = { def, el: g, x, y, params, height, id };
    this.blocks.set(id, block);

    this._bindBlockEvents(block);
    this._updateEmptyHint();
    if (this.onBlockSelect) this.onBlockSelect(block);
    return block;
  }

  _renderBlock(g, def, id, x, y, params, height) {
    const color = catColor(def.category);
    const nIn   = (def.inputs  || []).length;
    const nOut  = (def.outputs || []).length;

    g.innerHTML = `
      <rect class="block-body" x="${x}" y="${y}" width="${BLK_W}" height="${height}" rx="8"/>
      <rect class="block-outline" x="${x}" y="${y}" width="${BLK_W}" height="${height}" rx="8" fill="none" stroke="#3D4B61" stroke-width="1"/>
      <rect x="${x}" y="${y}" width="${BLK_W}" height="${HDR_H}" rx="8" fill="${color}"/>
      <rect x="${x}" y="${y+HDR_H-4}" width="${BLK_W}" height="4" fill="${color}"/>
      <text class="block-title" x="${x+10}" y="${y+18}">${def.label || def.id}</text>
      <text class="block-cat"   x="${x+10}" y="${y+26}" opacity="0.7">${(def.category||'').split('/').slice(-1)[0] || ''}</text>
      ${this._renderParams(def, x, y, params)}
      ${this._renderPorts(def, id, x, y, height, nIn, nOut)}
    `;
  }

  _renderParams(def, x, y, params) {
    let html = ''; let py = y + HDR_H + 14;
    (def.params || []).slice(0, 5).forEach(p => {
      const v = String(params[p.name] ?? p.default ?? '');
      html += `<text class="block-param-label" x="${x+10}" y="${py}">${p.name}:</text>`;
      html += `<text class="block-param-value" x="${x+80}" y="${py}">${v.length>12 ? v.slice(0,12)+'…' : v}</text>`;
      py += PARAM_H;
    });
    return html;
  }

  _renderPorts(def, id, x, y, height, nIn, nOut) {
    let html = '';
    (def.inputs || []).forEach((port, i) => {
      const py = y + HDR_H + (i+1) * (height - HDR_H) / (nIn + 1);
      const cls = PORT_CLASSES[port.type] || 'port-any';
      html += `<circle class="port ${cls}" data-block="${id}" data-port="${port.name}" data-dir="in"
                        cx="${x}" cy="${py}" r="${PORT_R}"/>`;
      html += `<text class="port-label" x="${x+12}" y="${py+4}">${port.name}</text>`;
    });
    (def.outputs || []).forEach((port, i) => {
      const py = y + HDR_H + (i+1) * (height - HDR_H) / (nOut + 1);
      const cls = PORT_CLASSES[port.type] || 'port-any';
      html += `<circle class="port ${cls}" data-block="${id}" data-port="${port.name}" data-dir="out"
                        cx="${x+BLK_W}" cy="${py}" r="${PORT_R}"/>`;
      html += `<text class="port-label" text-anchor="end" x="${x+BLK_W-12}" y="${py+4}">${port.name}</text>`;
    });
    return html;
  }

  // ── Block / wire events ───────────────────────────────────────────────────────
  _bindSVGEvents() {
    this.svg.addEventListener('mousedown',  e => this._onMouseDown(e));
    this.svg.addEventListener('mousemove',  e => this._onMouseMove(e));
    this.svg.addEventListener('mouseup',    e => this._onMouseUp(e));
    this.svg.addEventListener('wheel',      e => this._onWheel(e), { passive: false });
    this.svg.addEventListener('click',      e => this._onClick(e));
    this.svg.addEventListener('dblclick',   e => this._onDblClick(e));
    document.addEventListener('keydown',    e => this._onKey(e));
  }

  _bindBlockEvents(block) {
    // Ports: start/end wire drawing
    block.el.querySelectorAll('.port').forEach(portEl => {
      portEl.addEventListener('mousedown', e => {
        e.stopPropagation();
        const dir   = portEl.dataset.dir;
        const bId   = portEl.dataset.block;
        const pName = portEl.dataset.port;
        if (dir === 'out') this._startWire(e, bId, pName);
      });
      portEl.addEventListener('mouseup', e => {
        e.stopPropagation();
        const dir   = portEl.dataset.dir;
        const bId   = portEl.dataset.block;
        const pName = portEl.dataset.port;
        if (dir === 'in' && this.drawingWire) this._endWire(bId, pName);
      });
    });
  }

  _svgPoint(e) {
    const rect = this.svg.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - this.viewX) / this.viewScale,
      y: (e.clientY - rect.top  - this.viewY) / this.viewScale,
    };
  }

  _onMouseDown(e) {
    const blkEl = e.target.closest('.block-group');
    if (blkEl && !e.target.classList.contains('port')) {
      e.preventDefault();
      const block = this.blocks.get(blkEl.dataset.blockId);
      if (!block) return;
      this._selectBlock(block);
      const pt = this._svgPoint(e);
      this.dragging = { block, startMX: pt.x, startMY: pt.y, startBX: block.x, startBY: block.y };
    } else if (e.target === this.svg || e.target.id === 'canvas-grid' || e.target.tagName === 'line') {
      e.preventDefault();
      this._selectBlock(null);
      this.panning = true;
      this.panStart = { x: e.clientX, y: e.clientY, vx: this.viewX, vy: this.viewY };
    }
  }

  _onMouseMove(e) {
    if (this.dragging) {
      const pt = this._svgPoint(e);
      const dx = pt.x - this.dragging.startMX;
      const dy = pt.y - this.dragging.startMY;
      const nx = Math.round((this.dragging.startBX + dx) / GRID) * GRID;
      const ny = Math.round((this.dragging.startBY + dy) / GRID) * GRID;
      this._moveBlock(this.dragging.block, nx, ny);
    } else if (this.panning && this.panStart) {
      this.viewX = this.panStart.vx + (e.clientX - this.panStart.x);
      this.viewY = this.panStart.vy + (e.clientY - this.panStart.y);
      this._applyTransform();
    } else if (this.drawingWire) {
      const pt = this._svgPoint(e);
      this._updateDraftWire(pt.x, pt.y);
    }
  }

  _onMouseUp(e) {
    this.dragging = null;
    this.panning  = false;
    if (this.drawingWire) { this._cancelWire(); }
  }

  _onWheel(e) {
    e.preventDefault();
    const rect  = this.svg.getBoundingClientRect();
    const mx    = e.clientX - rect.left;
    const my    = e.clientY - rect.top;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    this.viewScale = Math.min(2.5, Math.max(0.3, this.viewScale * delta));
    this.viewX = mx - (mx - this.viewX) * delta;
    this.viewY = my - (my - this.viewY) * delta;
    this._applyTransform();
  }

  _onClick(e) {
    const wireEl = e.target.closest('.wire');
    if (wireEl) {
      this.wires.forEach((w,id) => {
        if (w.el === wireEl) { wireEl.classList.toggle('selected'); }
      });
    }
  }

  _onDblClick(e) {
    // Double-click empty canvas → reset view
    if (e.target === this.svg || e.target.id === 'canvas-grid') {
      this.viewX = 60; this.viewY = 60; this.viewScale = 1;
      this._applyTransform();
    }
  }

  _onKey(e) {
    if ((e.key === 'Delete' || e.key === 'Backspace') && document.activeElement.tagName !== 'INPUT') {
      // Delete selected block
      if (this.selected) {
        this._deleteBlock(this.selected.id);
        this.selected = null;
        if (this.onBlockSelect) this.onBlockSelect(null);
      }
      // Delete selected wire
      this.wires.forEach((w,id) => {
        if (w.el.classList.contains('selected')) this._deleteWire(id);
      });
    }
    if (e.key === 'Escape') { this.selected = null; this.wires.forEach(w=>w.el.classList.remove('selected')); }
  }

  _applyTransform() {
    [this.blocksEl, this.wiresEl, this.gridEl].forEach(el => {
      el.setAttribute('transform', `translate(${this.viewX},${this.viewY}) scale(${this.viewScale})`);
    });
    this.wireDraft.parentElement.setAttribute('transform',
      `translate(${this.viewX},${this.viewY}) scale(${this.viewScale})`);
  }

  _selectBlock(block) {
    if (this.selected) this.selected.el.classList.remove('selected');
    this.selected = block;
    if (block) block.el.classList.add('selected');
    if (this.onBlockSelect) this.onBlockSelect(block);
  }

  _moveBlock(block, nx, ny) {
    block.x = nx; block.y = ny;
    this._rerenderBlock(block);
    this._rerenderWires(block.id);
  }

  _rerenderBlock(block) {
    this._renderBlock(block.el, block.def, block.id, block.x, block.y, block.params, block.height);
    this._bindBlockEvents(block);
  }

  _rerenderWires(blockId) {
    this.wires.forEach((w, wid) => {
      if (w.fromBlock === blockId || w.toBlock === blockId) {
        this._drawWire(w);
      }
    });
  }

  _deleteBlock(id) {
    const block = this.blocks.get(id);
    if (!block) return;
    block.el.remove();
    this.blocks.delete(id);
    // Remove connected wires
    const toDelete = [];
    this.wires.forEach((w,wid) => { if (w.fromBlock===id || w.toBlock===id) toDelete.push(wid); });
    toDelete.forEach(wid => this._deleteWire(wid));
    this._updateEmptyHint();
  }

  // ── Wire drawing ──────────────────────────────────────────────────────────────
  _portPosition(blockId, portName, dir) {
    const block = this.blocks.get(blockId);
    if (!block) return null;
    const ports = dir === 'out' ? (block.def.outputs || []) : (block.def.inputs || []);
    const idx   = ports.findIndex(p => p.name === portName);
    if (idx < 0) return null;
    const count = ports.length;
    const py    = block.y + HDR_H + (idx+1) * (block.height - HDR_H) / (count+1);
    const px    = dir === 'out' ? block.x + BLK_W : block.x;
    return { x: px, y: py, port: ports[idx] };
  }

  _startWire(e, blockId, portName) {
    const pos = this._portPosition(blockId, portName, 'out');
    if (!pos) return;
    e.preventDefault();
    this.drawingWire = { fromBlock: blockId, fromPort: portName, startX: pos.x, startY: pos.y };
    this.wireDraft.setAttribute('d', `M ${pos.x} ${pos.y}`);
  }

  _updateDraftWire(mx, my) {
    if (!this.drawingWire) return;
    const { startX, startY } = this.drawingWire;
    const cx = (startX + mx) / 2;
    this.wireDraft.setAttribute('d', `M ${startX} ${startY} C ${cx} ${startY}, ${cx} ${my}, ${mx} ${my}`);
  }

  _endWire(toBlock, toPort) {
    if (!this.drawingWire) return;
    const { fromBlock, fromPort } = this.drawingWire;
    this._cancelWire();
    if (fromBlock === toBlock) return;  // no self-wires
    // Check no duplicate
    let dup = false;
    this.wires.forEach(w => { if (w.fromBlock===fromBlock && w.fromPort===fromPort && w.toBlock===toBlock && w.toPort===toPort) dup=true; });
    if (dup) return;
    const wid = `wire_${nextId++}`;
    const wireEl = document.createElementNS('http://www.w3.org/2000/svg','path');
    wireEl.classList.add('wire');
    const fromDef = this.blocks.get(fromBlock)?.def;
    const portDef = (fromDef?.outputs||[]).find(p=>p.name===fromPort);
    if (portDef) wireEl.classList.add(WIRE_CLASSES[portDef.type] || '');
    this.wiresEl.appendChild(wireEl);
    const wire = { fromBlock, fromPort, toBlock, toPort, el: wireEl };
    this.wires.set(wid, wire);
    this._drawWire(wire);
  }

  _drawWire(wire) {
    const from = this._portPosition(wire.fromBlock, wire.fromPort, 'out');
    const to   = this._portPosition(wire.toBlock,   wire.toPort,  'in');
    if (!from || !to) return;
    const cx = (from.x + to.x) / 2;
    wire.el.setAttribute('d', `M ${from.x} ${from.y} C ${cx} ${from.y}, ${cx} ${to.y}, ${to.x} ${to.y}`);
  }

  _cancelWire() {
    this.drawingWire = null;
    this.wireDraft.setAttribute('d', '');
  }

  _deleteWire(wid) {
    const w = this.wires.get(wid);
    if (w) { w.el.remove(); this.wires.delete(wid); }
  }

  // ── Block parameter update ───────────────────────────────────────────────────
  updateBlockParam(blockId, field, value) {
    const block = this.blocks.get(blockId);
    if (!block) return;
    block.params[field] = value;
    this._rerenderBlock(block);
    this._rerenderWires(blockId);
  }

  // ── Code generation from canvas ───────────────────────────────────────────────
  toCode() {
    if (this.blocks.size === 0) return '';
    const lines = ['-- Generated by Sanskrit Visual Builder v3.1', ''];

    // Topological sort of blocks by wire order
    const order = this._topoSort();

    for (const blockId of order) {
      const block = this.blocks.get(blockId);
      if (!block) continue;
      const code = this._blockToCode(block);
      if (code) lines.push(code);
    }
    return lines.join('\n');
  }

  _topoSort() {
    const inEdges = new Map();
    this.blocks.forEach((_, id) => inEdges.set(id, 0));
    this.wires.forEach(w => { inEdges.set(w.toBlock, (inEdges.get(w.toBlock)||0) + 1); });
    const queue  = [...inEdges.entries()].filter(([,v])=>v===0).map(([k])=>k);
    const result = [];
    while (queue.length) {
      const cur = queue.shift(); result.push(cur);
      this.wires.forEach(w => {
        if (w.fromBlock === cur) {
          const nv = (inEdges.get(w.toBlock)||1) - 1;
          inEdges.set(w.toBlock, nv);
          if (nv === 0) queue.push(w.toBlock);
        }
      });
    }
    // Append any remaining (cycles or isolated)
    this.blocks.forEach((_,id) => { if (!result.includes(id)) result.push(id); });
    return result;
  }

  _blockToCode(block) {
    const { def, params } = block;
    const id = def.id;
    const p  = params;

    // Find what this block's quantum register input comes from
    const regWire = [...this.wires.values()].find(w => w.toBlock === block.id);
    const regVar  = regWire ? this._varName(regWire.fromBlock) : (p.name || 'q');

    switch(id) {
      case 'quantum_register': return `let ${p.name||'q'} = qubits(${p.n_qubits||2})`;
      case 'hadamard':  return `H(${regVar}[${p.qubit||0}])`;
      case 'x_gate':    return `X(${regVar}[${p.qubit||0}])`;
      case 'y_gate':    return `Y(${regVar}[${p.qubit||0}])`;
      case 'z_gate':    return `Z(${regVar}[${p.qubit||0}])`;
      case 's_gate':    return `S(${regVar}[${p.qubit||0}])`;
      case 't_gate':    return `T(${regVar}[${p.qubit||0}])`;
      case 'rx_gate':   return `Rx(${regVar}[${p.qubit||0}], ${p.theta||1.5708})`;
      case 'ry_gate':   return `Ry(${regVar}[${p.qubit||0}], ${p.theta||1.5708})`;
      case 'rz_gate':   return `Rz(${regVar}[${p.qubit||0}], ${p.theta||1.5708})`;
      case 'cnot_gate': return `CNOT(${regVar}[${p.control||0}], ${regVar}[${p.target||1}])`;
      case 'cz_gate':   return `CZ(${regVar}[${p.qubit_a||0}], ${regVar}[${p.qubit_b||1}])`;
      case 'swap_gate': return `SWAP(${regVar}[${p.qubit_a||0}], ${regVar}[${p.qubit_b||1}])`;
      case 'toffoli_gate': return `Toffoli(${regVar}[${p.ctrl1||0}], ${regVar}[${p.ctrl2||1}], ${regVar}[${p.target||2}])`;
      case 'measure_all': return `let result_${block.id.replace('blk_','')} = measure_all(${regVar}, shots=${p.shots||1000})\nprint(result_${block.id.replace('blk_','')}.histogram)`;
      case 'measure_single': return `let bit_${block.id.replace('blk_','')} = measure(${regVar}[${p.qubit||0}])`;
      case 'statevector_block': return `let sv_${block.id.replace('blk_','')} = statevector(${regVar})\nprint(sv_${block.id.replace('blk_','')})`;
      case 'vqe_block': return `let vqe_result = vqe(molecule, ansatz="${p.ansatz||'UCCSD'}", shots=${p.shots||2000})\nprint(vqe_result.energy)`;
      case 'grover_block': return `let gr = grover(${p.n_qubits||4}, [${p.target||7}], ${p.shots||1000})\nprint(gr.histogram)`;
      case 'qft_block': return `${regVar}.qft(${regVar}.n_qubits, ${p.inverse||false})`;
      case 'print_block': {
        const inWire = [...this.wires.values()].find(w => w.toBlock === block.id);
        const val = inWire ? `result_${inWire.fromBlock.replace('blk_','')}` : '"value"';
        return `print(${val})`;
      }
      default: return `-- ${def.label || id}`;
    }
  }

  _varName(blockId) {
    const block = this.blocks.get(blockId);
    if (!block) return 'q';
    return block.params.name || 'q';
  }

  // ── Utility ───────────────────────────────────────────────────────────────────
  clear() {
    this.blocks.forEach(b => b.el.remove());
    this.blocks.clear();
    this.wires.forEach(w => w.el.remove());
    this.wires.clear();
    this.selected = null;
    this._updateEmptyHint();
    if (this.onBlockSelect) this.onBlockSelect(null);
  }

  _updateEmptyHint() {
    if (this.emptyHint) {
      this.emptyHint.classList.toggle('hidden', this.blocks.size > 0);
    }
  }
}
