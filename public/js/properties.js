/**
 * public/js/properties.js
 * ─────────────────────────────────────────────────────────────────────────
 * Sanskrit Visual Builder v3.1 — Block Properties Panel
 *
 * Renders a dynamic form for configuring any selected block.
 * Each block definition carries a `params` array describing its fields.
 * When the user edits a field, onUpdate(fieldName, value) is called so
 * canvas.js can re-render the block and regenerate code.
 */

// ── Field type descriptors ────────────────────────────────────────────────────
// Maps param type → how to render the input element
const FIELD_RENDERERS = {
  number:  renderNumber,
  string:  renderString,
  bool:    renderBool,
  select:  renderSelect,
  text:    renderTextarea,
};

// ── Tooltips / documentation for well-known parameter names ──────────────────
const PARAM_DOCS = {
  n_qubits:   'Number of qubits in this register. Each additional qubit doubles the Hilbert space.',
  name:       'Variable name used in generated code. Use letters/numbers, no spaces.',
  qubit:      'Index of the qubit to apply the gate to. Starts at 0.',
  control:    'Control qubit index. Gate fires only when this qubit is |1⟩.',
  target:     'Target qubit index. This qubit is modified by the gate.',
  ctrl1:      'First control qubit (Toffoli requires both controls = |1⟩).',
  ctrl2:      'Second control qubit.',
  qubit_a:    'First qubit for two-qubit gate.',
  qubit_b:    'Second qubit for two-qubit gate.',
  theta:      'Rotation angle in radians. π/2 ≈ 1.5708, π ≈ 3.1416.',
  phi:        'Azimuthal angle φ for U3 gate (radians).',
  lam:        'Lambda angle λ for U3 gate (radians).',
  shots:      'Number of measurement repetitions. More shots → better statistics.',
  ansatz:     'Parameterised circuit template. UCCSD is standard for chemistry.',
  optimizer:  'Classical optimiser for VQE parameter search.',
  max_iter:   'Maximum number of VQE optimisation iterations.',
  inverse:    'If true, applies the inverse (adjoint) QFT.',
  basis_set:  'Quantum chemistry orbital basis. STO-3G is minimal; cc-pVDZ is more accurate.',
  bond_length:'Distance between atoms in Ångströms (1 Å = 0.1 nm).',
  charge:     'Net charge of the molecule. 0 = neutral.',
  multiplicity: 'Spin multiplicity. 1 = singlet (most stable ground states).',
  filename:   'Path to the input file, relative to the project root.',
  label:      'Optional text label shown above the output.',
  p_layers:   'Number of QAOA layers p. More layers → better solution quality but slower.',
  n_nodes:    'Number of nodes in the graph for combinatorial optimisation.',
};

// ── Public class ─────────────────────────────────────────────────────────────
export class Properties {
  /**
   * @param {HTMLElement} formEl    - Container for the dynamic form
   * @param {HTMLElement} emptyEl   - "Click a block" placeholder
   * @param {HTMLElement} titleEl   - Panel title element
   */
  constructor(formEl, emptyEl, titleEl) {
    this.formEl  = formEl;
    this.emptyEl = emptyEl;
    this.titleEl = titleEl;
    this._onUpdate  = null;
    this._currentBlock = null;
  }

  /**
   * Show the properties form for `block`.
   * @param {Object}   block    - { def, params, id }
   * @param {Function} onUpdate - callback(fieldName, newValue)
   */
  show(block, onUpdate) {
    this._currentBlock = block;
    this._onUpdate     = onUpdate;

    this.emptyEl.classList.add('hidden');
    this.formEl.classList.remove('hidden');

    const def = block.def;
    this.titleEl.textContent = def.label || def.id;

    this.formEl.innerHTML = '';

    // ── Block header info ─────────────────────────────────────────────────
    const info = document.createElement('div');
    info.style.cssText = 'margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--border)';
    info.innerHTML = `
      <div style="font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:4px">
        ${def.category || ''}
      </div>
      <div style="font-size:12px;color:var(--text2);line-height:1.5">
        ${def.description || ''}
      </div>
    `;
    this.formEl.appendChild(info);

    // ── Parameters ────────────────────────────────────────────────────────
    const params = def.params || [];
    if (params.length > 0) {
      appendSectionTitle(this.formEl, 'Parameters');
      for (const param of params) {
        const field = this._buildField(param, block.params[param.name]);
        this.formEl.appendChild(field);
      }
    }

    // ── Port summary ──────────────────────────────────────────────────────
    const inputs  = def.inputs  || [];
    const outputs = def.outputs || [];
    if (inputs.length > 0 || outputs.length > 0) {
      appendSectionTitle(this.formEl, 'Ports');
      if (inputs.length > 0) {
        const inp = document.createElement('div');
        inp.style.marginBottom = '6px';
        inp.innerHTML = `<div style="font-size:10px;color:var(--text2);margin-bottom:3px">INPUTS</div>` +
          inputs.map(p => portBadge(p, 'in')).join('');
        this.formEl.appendChild(inp);
      }
      if (outputs.length > 0) {
        const out = document.createElement('div');
        out.innerHTML = `<div style="font-size:10px;color:var(--text2);margin-bottom:3px">OUTPUTS</div>` +
          outputs.map(p => portBadge(p, 'out')).join('');
        this.formEl.appendChild(out);
      }
    }

    // ── Block ID (read-only) ──────────────────────────────────────────────
    appendSectionTitle(this.formEl, 'Info');
    const idRow = document.createElement('div');
    idRow.innerHTML = `
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text2);margin-bottom:4px">
        <span>Block ID</span>
        <code style="font-size:10px;background:var(--bg3);padding:2px 6px;border-radius:3px">${def.id}</code>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text2)">
        <span>Instance</span>
        <code style="font-size:10px;background:var(--bg3);padding:2px 6px;border-radius:3px">${block.id}</code>
      </div>
    `;
    this.formEl.appendChild(idRow);
  }

  deselect() {
    this._currentBlock = null;
    this._onUpdate     = null;
    this.formEl.classList.add('hidden');
    this.emptyEl.classList.remove('hidden');
    this.titleEl.textContent = 'Properties';
  }

  // ── Build a single form field ─────────────────────────────────────────────
  _buildField(param, currentValue) {
    const wrapper = document.createElement('div');
    wrapper.className = 'prop-field';

    // Label
    const label = document.createElement('label');
    label.className = 'prop-label';
    label.textContent = formatParamName(param.name);
    wrapper.appendChild(label);

    // Input element
    const type     = param.type || 'string';
    const renderer = FIELD_RENDERERS[type] || renderString;
    const input    = renderer(param, currentValue ?? param.default);
    input.className += ' prop-input prop-' + type;
    wrapper.appendChild(input);

    // Change handler
    input.addEventListener('change', () => {
      const val = parseValue(input, type);
      if (this._onUpdate) this._onUpdate(param.name, val);
    });
    // Also handle live typing for text inputs
    if (type !== 'bool' && type !== 'select') {
      input.addEventListener('input', () => {
        const val = parseValue(input, type);
        if (this._onUpdate) this._onUpdate(param.name, val);
      });
    }

    // Optional description/tooltip
    const doc = param.description || PARAM_DOCS[param.name];
    if (doc) {
      const desc = document.createElement('div');
      desc.className = 'prop-description';
      desc.textContent = doc;
      wrapper.appendChild(desc);
    }

    return wrapper;
  }
}

// ── Field renderer helpers ────────────────────────────────────────────────────

function renderNumber(param, value) {
  const el = document.createElement('input');
  el.type  = 'number';
  el.value = value ?? param.default ?? 0;
  if (param.min  !== undefined) el.min  = param.min;
  if (param.max  !== undefined) el.max  = param.max;
  if (param.step !== undefined) el.step = param.step;
  else el.step = 'any';
  return el;
}

function renderString(param, value) {
  const el = document.createElement('input');
  el.type        = 'text';
  el.value       = value ?? param.default ?? '';
  el.placeholder = param.placeholder || param.name;
  return el;
}

function renderBool(param, value) {
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.alignItems = 'center';
  wrapper.style.gap = '8px';

  const el = document.createElement('input');
  el.type    = 'checkbox';
  el.checked = Boolean(value ?? param.default ?? false);
  el.style.width  = '16px';
  el.style.height = '16px';
  el.style.accentColor = 'var(--teal)';
  el.style.cursor = 'pointer';

  const lbl = document.createElement('span');
  lbl.style.fontSize = '12px';
  lbl.style.color    = 'var(--text2)';
  lbl.textContent    = el.checked ? 'Yes' : 'No';
  el.addEventListener('change', () => { lbl.textContent = el.checked ? 'Yes' : 'No'; });

  wrapper.appendChild(el);
  wrapper.appendChild(lbl);
  // Make the wrapper behave like an input for event delegation
  wrapper._isCheckboxWrapper = true;
  wrapper._input = el;
  return el;  // return the checkbox itself for .value access
}

function renderSelect(param, value) {
  const el = document.createElement('select');
  el.className = 'prop-select';
  const options = param.options || [];
  for (const opt of options) {
    const o = document.createElement('option');
    if (typeof opt === 'object') { o.value = opt.value; o.textContent = opt.label || opt.value; }
    else { o.value = opt; o.textContent = opt; }
    if (o.value === String(value ?? param.default)) o.selected = true;
    el.appendChild(o);
  }
  return el;
}

function renderTextarea(param, value) {
  const el = document.createElement('textarea');
  el.className = 'prop-textarea prop-input';
  el.rows      = 3;
  el.value     = value ?? param.default ?? '';
  el.placeholder = param.placeholder || '';
  el.style.resize = 'vertical';
  return el;
}

// ── Parse value from input element ───────────────────────────────────────────
function parseValue(input, type) {
  if (type === 'bool')   return input.type === 'checkbox' ? input.checked : input.value === 'true';
  if (type === 'number') return input.value === '' ? 0 : Number(input.value);
  return input.value;
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
function appendSectionTitle(parent, text) {
  const el = document.createElement('div');
  el.className = 'prop-section-title';
  el.textContent = text;
  parent.appendChild(el);
}

function formatParamName(name) {
  // snake_case → Title Case Words
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

// ── Port type badge ───────────────────────────────────────────────────────────
const PORT_COLOURS = {
  quantum: '#7C3AED',
  number:  '#1D4ED8',
  list:    '#0F766E',
  dict:    '#92400E',
  string:  '#374151',
  bool:    '#059669',
  any:     '#064E3B',
};

function portBadge(port, dir) {
  const color = PORT_COLOURS[port.type] || PORT_COLOURS.any;
  const arrow = dir === 'in' ? '→' : '←';
  return `<span style="
    display:inline-flex;align-items:center;gap:4px;
    font-size:10px;padding:2px 7px;border-radius:10px;
    background:${color}22;border:1px solid ${color}55;
    color:${color};margin:2px 3px 2px 0;
  ">
    <span style="font-size:8px">${arrow}</span>
    ${port.name}
    <span style="opacity:0.7;font-size:9px">${port.type}</span>
  </span>`;
}
