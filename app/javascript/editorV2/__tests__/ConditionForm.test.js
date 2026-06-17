import { beforeEach, describe, expect, it } from 'vitest'

import ConditionForm from '../panels/ConditionForm.js'

function option(value, label = value) {
  return `<option value="${value}">${label}</option>`
}

const relationalSubjectOptions = ['moved_piece', 'allied', 'enemy', 'enemy_moved_piece']
  .map(value => option(value))
  .join('')
const censusSubjectOptions = ['moved_piece', 'allied', 'enemy', 'enemy_moved_piece']
  .map(value => option(value))
  .join('')
const relationalOperatorOptions = ['targets', 'shield', 'adjacent']
  .map(value => option(value))
  .join('')
const capturesSubjectOptions = ['captured_piece', 'enemy_captured_piece']
  .map(value => option(value))
  .join('')
const capturesOperatorOptions = ['exists', 'does_not_exist', 'value', 'same_piece']
  .map((value, i) => `<label class="condition-form-checkbox"><input type="radio" name="cond-captures-operator" value="${value}"${i === 0 ? ' checked' : ''}><span>${value}</span></label>`)
  .join('')
const capturesTargetOptions = ['exact_number', 'moved_piece', 'allied', 'enemy', 'enemy_moved_piece', 'captured_piece', 'enemy_captured_piece']
  .map(value => option(value))
  .join('')
const censusOperatorOptions = ['count', 'mobility', 'value']
  .map((value, i) => `<label class="condition-form-checkbox"><input type="radio" name="cond-census-operator" value="${value}"${i === 0 ? ' checked' : ''}><span>${value}</span></label>`)
  .join('')
const censusTargetOptions = ['exact_number', 'prior_board_state', 'moved_piece', 'allied', 'enemy', 'enemy_moved_piece', 'captured_piece', 'enemy_captured_piece']
  .map(value => option(value))
  .join('')
function radioList(name) {
  return [1, 2, 3, 4, 5, 6, 7, 8]
    .map(v => `<label class="condition-form-checkbox"><input type="radio" name="${name}" value="${v}"${v === 1 ? ' checked' : ''}><span>${v}</span></label>`)
    .join('')
}

function buildPanel() {
  const panel = document.createElement('div')
  panel.id = 'node-form-panel'
  panel.innerHTML = `
    <button type="button" id="cond-mode-census">Positions</button>
    <button type="button" id="cond-mode-relational" class="active">Attack/Defend</button>
    <button type="button" id="cond-mode-captures">Captures</button>

    <div class="condition-form-layout">
      <select id="cond-left-subject">${relationalSubjectOptions}</select>
      <label class="condition-form-checkbox">
        <input id="cond-left-filter-mode" type="checkbox">
        <span>Non-</span>
      </label>
      <select id="cond-left-filter">${option('any')}${option('pawn')}${option('rook')}</select>
      <div id="cond-left-comparison-metric">
        <label class="condition-form-checkbox"><input type="radio" name="cond-left-comparison-metric" value="count" checked><span>Count</span></label>
        <label class="condition-form-checkbox"><input type="radio" name="cond-left-comparison-metric" value="individual_value"><span>Value</span></label>
      </div>
      <select id="cond-left-comparator">
        <option value="equal_to">equal to</option>
        <option value="greater_than">greater than</option>
        <option value="less_than">less than</option>
        <option value="greater_than_or_equal_to">at least</option>
        <option value="less_than_or_equal_to">at most</option>
      </select>
      <div id="cond-left-comparison-section" class="condition-form-comparison">
        <div id="cond-left-comparison-body"></div>
        <p id="cond-left-comparison-locked-note" class="hidden"></p>
      </div>
      <div id="cond-left-comparison-source-stack" class="condition-form-comparison-source-stack">
        <select id="cond-left-comparison-source">
          ${option('exact_number', 'Integer')}
          ${option('prior_board_state', 'Prior Board State')}
        </select>
        <input id="cond-left-comparison-source-total" type="number">
      </div>

      <select id="cond-relational-operator">${relationalOperatorOptions}</select>

      <select id="cond-right-subject">${relationalSubjectOptions}</select>
      <label class="condition-form-checkbox">
        <input id="cond-right-filter-mode" type="checkbox">
        <span>Non-</span>
      </label>
      <select id="cond-right-filter">${option('any')}${option('pawn')}${option('rook')}</select>
      <div id="cond-right-comparison-metric">
        <label class="condition-form-checkbox"><input type="radio" name="cond-right-comparison-metric" value="count" checked><span>Count</span></label>
        <label class="condition-form-checkbox"><input type="radio" name="cond-right-comparison-metric" value="individual_value"><span>Value</span></label>
      </div>
      <select id="cond-right-comparator">
        <option value="equal_to">equal to</option>
        <option value="greater_than">greater than</option>
        <option value="less_than">less than</option>
        <option value="greater_than_or_equal_to">at least</option>
        <option value="less_than_or_equal_to">at most</option>
      </select>
      <div id="cond-right-comparison-section" class="condition-form-comparison">
        <div id="cond-right-comparison-body"></div>
        <p id="cond-right-comparison-locked-note" class="hidden"></p>
      </div>
      <div id="cond-right-comparison-source-stack" class="condition-form-comparison-source-stack">
        <select id="cond-right-comparison-source">
          ${option('exact_number', 'Integer')}
          ${option('prior_board_state', 'Prior Board State')}
        </select>
        <input id="cond-right-comparison-source-total" type="number">
      </div>

      <div id="cond-right-card-label"></div>
      <div id="cond-right-relational-fields"></div>
      <div id="cond-left-filter-row"></div>
      <div id="cond-right-filter-row"></div>
      <p id="cond-relational-target-note" class="hidden"></p>
    </div>

    <div class="condition-form-layout condition-form-position-layout hidden" id="cond-census-layout">
      <select id="cond-census-subject">${censusSubjectOptions}</select>
      <div id="cond-census-filter-row">
        <label class="condition-form-checkbox">
          <input id="cond-census-filter-mode" type="checkbox">
          <span>Non-</span>
        </label>
        <select id="cond-census-filter">${option('any')}${option('pawn')}${option('rook')}</select>
      </div>
      <div id="cond-census-comparison" class="condition-form-comparison">
        <div id="cond-census-comparison-body">
          <div id="cond-census-operator">${censusOperatorOptions}</div>
          <select id="cond-census-comparator">
            <option value="equal_to">equal to</option>
            <option value="greater_than">greater than</option>
            <option value="less_than">less than</option>
            <option value="greater_than_or_equal_to">at least</option>
            <option value="less_than_or_equal_to">at most</option>
          </select>
          <div id="cond-census-target-stack" class="condition-form-comparison-source-stack">
            <select id="cond-census-target">${censusTargetOptions}</select>
            <input id="cond-census-target-total" type="number">
          </div>
        </div>
      </div>

      <div id="cond-census-scope">
        <label class="condition-form-checkbox">
          <input type="radio" name="cond-census-scope" id="cond-census-scope-whole" value="whole">
          <span>Whole board</span>
        </label>
        <label class="condition-form-checkbox">
          <input type="radio" name="cond-census-scope" id="cond-census-axis-rank" value="rank" checked>
          <span>Rank</span>
        </label>
        <label class="condition-form-checkbox">
          <input type="radio" name="cond-census-scope" id="cond-census-axis-file" value="file">
          <span>File</span>
        </label>
        <label class="condition-form-checkbox">
          <input type="radio" name="cond-census-scope" id="cond-census-axis-square" value="square">
          <span>Square</span>
        </label>
      </div>
      <div id="cond-census-region-comparator">
        <label class="condition-form-checkbox"><input type="radio" name="cond-census-region-comparator" value="equal_to" checked><span>=</span></label>
        <label class="condition-form-checkbox"><input type="radio" name="cond-census-region-comparator" value="greater_than"><span>></span></label>
        <label class="condition-form-checkbox"><input type="radio" name="cond-census-region-comparator" value="less_than"><span><</span></label>
      </div>

      <section id="cond-census-region-target">
        <div id="cond-census-rank-input">${radioList('cond-census-rank-input')}</div>
        <div id="cond-census-file-input" class="hidden">${radioList('cond-census-file-input')}</div>
        <div id="cond-census-square-inputs" class="hidden">
          <div id="cond-census-square-file">${radioList('cond-census-square-file')}</div>
          <div id="cond-census-square-rank">${radioList('cond-census-square-rank')}</div>
        </div>
      </section>
      <p id="cond-census-rank-note" class="hidden"></p>
    </div>

    <div class="condition-form-layout condition-form-captures-layout hidden" id="cond-captures-layout">
      <select id="cond-captures-subject">${capturesSubjectOptions}</select>
      <div id="cond-captures-filter-row">
        <label class="condition-form-checkbox">
          <input id="cond-captures-filter-mode" type="checkbox">
          <span>Non-</span>
        </label>
        <select id="cond-captures-filter">${option('any')}${option('pawn')}${option('rook')}</select>
      </div>
      <div id="cond-captures-operator">${capturesOperatorOptions}</div>
      <select id="cond-captures-comparator">
        <option value="equal_to">equal to</option>
        <option value="greater_than">greater than</option>
        <option value="less_than">less than</option>
        <option value="greater_than_or_equal_to">at least</option>
        <option value="less_than_or_equal_to">at most</option>
      </select>
      <div id="cond-captures-target-stack" class="condition-form-comparison-source-stack">
        <select id="cond-captures-target">${capturesTargetOptions}</select>
        <div id="cond-captures-target-filter-row">
          <label class="condition-form-checkbox">
            <input id="cond-captures-target-filter-mode" type="checkbox">
            <span>Non-</span>
          </label>
          <select id="cond-captures-target-filter">${option('any')}${option('pawn')}${option('rook')}</select>
        </div>
        <input id="cond-captures-target-total" type="number">
      </div>
      <p id="cond-captures-enemy-note" class="hidden">enemy captured note</p>
    </div>

    <div id="cond-formulation-preview"></div>
  `
  document.body.appendChild(panel)
  return panel
}

describe('ConditionForm', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('defaults a new condition to moved piece attacking more enemies than the prior board state', () => {
    const panel = buildPanel()
    const form = new ConditionForm(panel)
    form.attach()

    form.populate({})

    expect(form.state.mode).toBe('relational')
    expect(form.buildPayload()).toEqual({
      version: 2,
      kind: 'relational',
      subject: 'moved_piece',
      subjectFilter: 'any',
      operator: 'attack',
      target: 'enemy',
      targetFilter: 'any',
      targetComparisonMetric: 'count',
      targetComparator: 'greater_than',
      targetComparisonSource: 'prior_board_state'
    })
  })

  it('toggles only the matching numeric selector for each comparison block', () => {
    const panel = buildPanel()
    const form = new ConditionForm(panel)
    form.attach()

    form.populate({
      version: 2,
      kind: 'relational',
      subject: 'allied',
      subjectFilter: 'any',
      subjectComparisonMetric: 'count',
      subjectComparator: 'equal_to',
      subjectComparisonSource: 'exact_number',
      subjectComparisonSourceTotal: 2,
      operator: 'attack',
      target: 'enemy',
      targetFilter: 'any'
    })

    expect(panel.querySelector('#cond-left-comparison-source').classList.contains('hidden')).toBe(false)
    expect(panel.querySelector('#cond-left-comparison-source-total').classList.contains('hidden')).toBe(false)
    expect(panel.querySelector('#cond-right-comparison-source-total').classList.contains('hidden')).toBe(false)

    const rightSource = panel.querySelector('#cond-right-comparison-source')
    rightSource.value = 'prior_board_state'
    rightSource.dispatchEvent(new Event('change', { bubbles: true }))

    expect(panel.querySelector('#cond-left-comparison-source-total').classList.contains('hidden')).toBe(false)
    expect(panel.querySelector('#cond-right-comparison-source-total').classList.contains('hidden')).toBe(true)
    expect(panel.querySelector('#cond-right-comparison-source').classList.contains('hidden')).toBe(false)

    expect(panel.querySelector('#cond-left-comparison-body').classList.contains('condition-form-comparison__body--locked')).toBe(true)
    expect(panel.querySelector('#cond-left-comparison-locked-note').classList.contains('hidden')).toBe(false)
  })

  it('hides the numeric selector when the left source is symbolic and leaves the right side alone', () => {
    const panel = buildPanel()
    const form = new ConditionForm(panel)
    form.attach()

    form.populate({
      version: 2,
      kind: 'relational',
      subject: 'allied',
      subjectFilter: 'any',
      subjectComparisonMetric: 'count',
      subjectComparator: 'equal_to',
      subjectComparisonSource: 'exact_number',
      subjectComparisonSourceTotal: 2,
      operator: 'attack',
      target: 'enemy',
      targetFilter: 'any'
    })

    const leftSource = panel.querySelector('#cond-left-comparison-source')
    leftSource.value = 'prior_board_state'
    leftSource.dispatchEvent(new Event('change', { bubbles: true }))

    expect(panel.querySelector('#cond-left-comparison-source-total').classList.contains('hidden')).toBe(true)
    expect(panel.querySelector('#cond-right-comparison-source-total').classList.contains('hidden')).toBe(false)
    expect(panel.querySelector('#cond-left-comparison-source').classList.contains('hidden')).toBe(false)
  })

  it('hides and clears the subject non toggle when the subject filter is any', () => {
    const panel = buildPanel()
    const form = new ConditionForm(panel)
    form.attach()

    form.populate({
      version: 2,
      kind: 'relational',
      subject: 'allied',
      subjectFilter: 'pawn',
      subjectFilterMode: 'exclude',
      operator: 'attack',
      target: 'enemy',
      targetFilter: 'pawn'
    })

    const leftFilterMode = panel.querySelector('#cond-left-filter-mode')
    const leftFilterModeControl = leftFilterMode.closest('.condition-form-checkbox')
    expect(leftFilterMode.checked).toBe(true)
    expect(leftFilterModeControl.classList.contains('condition-form-checkbox--unavailable')).toBe(false)

    const leftFilter = panel.querySelector('#cond-left-filter')
    leftFilter.value = 'any'
    leftFilter.dispatchEvent(new Event('change', { bubbles: true }))

    expect(leftFilterMode.checked).toBe(false)
    expect(leftFilterModeControl.classList.contains('condition-form-checkbox--unavailable')).toBe(true)
    expect(form.buildPayload()).not.toHaveProperty('subjectFilterMode')
  })

  it('hides and clears the target non toggle when the target filter is any', () => {
    const panel = buildPanel()
    const form = new ConditionForm(panel)
    form.attach()

    form.populate({
      version: 2,
      kind: 'relational',
      subject: 'allied',
      subjectFilter: 'pawn',
      operator: 'attack',
      target: 'enemy',
      targetFilter: 'pawn',
      targetFilterMode: 'exclude'
    })

    const rightFilterMode = panel.querySelector('#cond-right-filter-mode')
    const rightFilterModeControl = rightFilterMode.closest('.condition-form-checkbox')
    expect(rightFilterMode.checked).toBe(true)
    expect(rightFilterModeControl.classList.contains('condition-form-checkbox--unavailable')).toBe(false)

    const rightFilter = panel.querySelector('#cond-right-filter')
    rightFilter.value = 'any'
    rightFilter.dispatchEvent(new Event('change', { bubbles: true }))

    expect(rightFilterMode.checked).toBe(false)
    expect(rightFilterModeControl.classList.contains('condition-form-checkbox--unavailable')).toBe(true)
    expect(form.buildPayload()).not.toHaveProperty('targetFilterMode')
  })

  it('allows any regular target for the targets operator regardless of team', () => {
    const panel = buildPanel()
    const form = new ConditionForm(panel)
    form.attach()

    form.populate({
      version: 2,
      kind: 'relational',
      subject: 'allied',
      subjectFilter: 'any',
      operator: 'attack',
      target: 'enemy',
      targetFilter: 'any'
    })

    const rightSubject = panel.querySelector('#cond-right-subject')
    expect(form.buildPayload().operator).toBe('attack')
    expect(rightSubject.querySelector('option[value="enemy"]').disabled).toBe(false)
    expect(rightSubject.querySelector('option[value="enemy_moved_piece"]').disabled).toBe(false)
    expect(rightSubject.querySelector('option[value="allied"]').disabled).toBe(false)
    expect(rightSubject.querySelector('option[value="moved_piece"]').disabled).toBe(false)
    expect(rightSubject.querySelector('option[value="captured_piece"]')).toBeNull()
  })

  it('translates targets operator to defend when subject and target are same team', () => {
    const panel = buildPanel()
    const form = new ConditionForm(panel)
    form.attach()

    form.populate({
      version: 2,
      kind: 'relational',
      subject: 'allied',
      subjectFilter: 'any',
      operator: 'defend',
      target: 'moved_piece',
      targetFilter: 'any'
    })

    expect(form.buildPayload().operator).toBe('defend')

    const rightSubject = panel.querySelector('#cond-right-subject')
    rightSubject.value = 'enemy'
    rightSubject.dispatchEvent(new Event('change', { bubbles: true }))
    expect(form.buildPayload().operator).toBe('attack')
  })

  it('limits shield targets to the same team as the selected subject', () => {
    const panel = buildPanel()
    const form = new ConditionForm(panel)
    form.attach()

    form.populate({
      version: 2,
      kind: 'relational',
      subject: 'enemy',
      subjectFilter: 'any',
      operator: 'shield',
      target: 'allied',
      targetFilter: 'any'
    })

    const rightSubject = panel.querySelector('#cond-right-subject')
    expect(form.buildPayload().target).toBe('enemy')
    expect(rightSubject.querySelector('option[value="enemy"]').disabled).toBe(false)
    expect(rightSubject.querySelector('option[value="enemy_moved_piece"]').disabled).toBe(false)
    expect(rightSubject.querySelector('option[value="allied"]').disabled).toBe(true)
    expect(rightSubject.querySelector('option[value="moved_piece"]').disabled).toBe(true)
  })

  it('keeps adjacent targets unrestricted among regular relational targets', () => {
    const panel = buildPanel()
    const form = new ConditionForm(panel)
    form.attach()

    form.populate({
      version: 2,
      kind: 'relational',
      subject: 'allied',
      subjectFilter: 'any',
      operator: 'adjacent',
      target: 'enemy_moved_piece',
      targetFilter: 'any'
    })

    const rightSubject = panel.querySelector('#cond-right-subject')
    expect(form.buildPayload().target).toBe('enemy_moved_piece')
    expect(rightSubject.querySelector('option[value="allied"]').disabled).toBe(false)
    expect(rightSubject.querySelector('option[value="enemy"]').disabled).toBe(false)
    expect(rightSubject.querySelector('option[value="moved_piece"]').disabled).toBe(false)
    expect(rightSubject.querySelector('option[value="enemy_moved_piece"]').disabled).toBe(false)
    expect(rightSubject.querySelector('option[value="captured_piece"]')).toBeNull()
  })

  it('uses rendered grammar config for shield target scoping', () => {
    const rules = document.createElement('script')
    rules.type = 'application/json'
    rules.id = 'node-grammar-rules'
    rules.textContent = JSON.stringify({
      editorSubjects: ['allied', 'enemy', 'moved_piece', 'captured_piece', 'enemy_moved_piece', 'enemy_captured_piece'],
      regularRelationalSubjects: ['allied', 'enemy', 'moved_piece', 'enemy_moved_piece'],
      regularRelationalTargets: ['allied', 'enemy', 'moved_piece', 'enemy_moved_piece'],
      relationalOperatorTargetRules: { shield: 'opposing_team' },
      samePieceTargets: { enemy_moved_piece: ['captured_piece'], captured_piece: ['enemy_moved_piece'] },
      teamSubjectGroups: { allied: ['allied', 'moved_piece'], enemy: ['enemy', 'enemy_moved_piece'] },
      opposingTeamGroups: { allied: 'enemy', enemy: 'allied' }
    })
    document.body.appendChild(rules)

    const panel = buildPanel()
    const form = new ConditionForm(panel)
    form.attach()

    form.populate({
      version: 2,
      kind: 'relational',
      subject: 'allied',
      subjectFilter: 'any',
      operator: 'shield',
      target: 'moved_piece',
      targetFilter: 'any'
    })

    expect(form.buildPayload().target).toBe('enemy')
  })

  it('loads a whole-board value census and drops any target piece-type filter', () => {
    const panel = buildPanel()
    const form = new ConditionForm(panel)
    form.attach()

    form.populate({
      version: 2,
      kind: 'census',
      subject: 'allied',
      subjectFilter: 'any',
      operator: 'value',
      comparator: 'greater_than',
      target: 'enemy',
      targetFilter: 'rook',
      targetFilterMode: 'exclude'
    })

    expect(panel.querySelector('#cond-census-scope-whole').checked).toBe(true)
    expect(panel.querySelector('#cond-census-region-target').classList.contains('hidden')).toBe(false)
    const squareInputs = panel.querySelector('#cond-census-square-inputs')
    expect(squareInputs.classList.contains('hidden')).toBe(false)
    expect(squareInputs.classList.contains('condition-form-radio-list--disabled')).toBe(true)
    expect(panel.querySelector('#cond-census-square-rank input').disabled).toBe(true)
    expect(panel.querySelector('#cond-census-target-total').classList.contains('hidden')).toBe(true)

    const payload = form.buildPayload()
    expect(payload).toMatchObject({
      version: 2,
      kind: 'census',
      subject: 'allied',
      subjectFilter: 'any',
      operator: 'value',
      comparator: 'greater_than',
      target: 'enemy',
      targetFilter: 'any'
    })
    expect(payload).not.toHaveProperty('targetFilterMode')
    expect(payload).not.toHaveProperty('positionAxis')
    expect(payload).not.toHaveProperty('positionComparator')
    expect(payload).not.toHaveProperty('positionTarget')
  })

  it('loads a whole-board prior_board_state census round-trip', () => {
    const panel = buildPanel()
    const form = new ConditionForm(panel)
    form.attach()

    form.populate({
      version: 2,
      kind: 'census',
      subject: 'moved_piece',
      subjectFilter: 'rook',
      subjectFilterMode: 'include',
      operator: 'mobility',
      comparator: 'greater_than',
      target: 'prior_board_state'
    })

    expect(panel.querySelector('#cond-census-scope-whole').checked).toBe(true)
    const payload = form.buildPayload()
    expect(payload).toEqual({
      version: 2,
      kind: 'census',
      subject: 'moved_piece',
      subjectFilter: 'rook',
      subjectFilterMode: 'include',
      operator: 'mobility',
      comparator: 'greater_than',
      target: 'prior_board_state'
    })
  })

  it('limits whole-board mobility targets to integer and prior board state', () => {
    const panel = buildPanel()
    const form = new ConditionForm(panel)
    form.attach()

    form.populate({
      version: 2,
      kind: 'census',
      subject: 'allied',
      subjectFilter: 'any',
      operator: 'mobility',
      comparator: 'greater_than',
      target: 'enemy'
    })

    const targetSelect = panel.querySelector('#cond-census-target')
    expect(form.buildPayload().target).toBe('exact_number')
    expect(targetSelect.querySelector('option[value="enemy"]').disabled).toBe(true)
    expect(targetSelect.querySelector('option[value="captured_piece"]').disabled).toBe(true)
    expect(targetSelect.querySelector('option[value="exact_number"]').disabled).toBe(false)
    expect(targetSelect.querySelector('option[value="prior_board_state"]').disabled).toBe(false)
  })

  it('loads a region census and emits spatial keys with an exact_number target', () => {
    const panel = buildPanel()
    const form = new ConditionForm(panel)
    form.attach()

    form.populate({
      version: 2,
      kind: 'census',
      subject: 'allied',
      subjectFilter: 'any',
      positionAxis: 'rank',
      positionComparator: 'equal_to',
      positionTarget: 5,
      operator: 'count',
      comparator: 'greater_than',
      target: 'exact_number',
      targetTotal: 2
    })

    expect(panel.querySelector('#cond-census-axis-rank').checked).toBe(true)
    expect(panel.querySelector('#cond-census-region-target').classList.contains('hidden')).toBe(false)
    expect(panel.querySelector('#cond-census-rank-note').classList.contains('hidden')).toBe(false)

    expect(form.buildPayload()).toEqual({
      version: 2,
      kind: 'census',
      subject: 'allied',
      subjectFilter: 'any',
      positionAxis: 'rank',
      positionComparator: 'equal_to',
      positionTarget: 5,
      operator: 'count',
      comparator: 'greater_than',
      target: 'exact_number',
      targetTotal: 2
    })
  })

  it('shows the region census target select and switches count to prior_board_state', () => {
    const panel = buildPanel()
    const form = new ConditionForm(panel)
    form.attach()

    form.populate({
      version: 2,
      kind: 'census',
      subject: 'allied',
      subjectFilter: 'any',
      positionAxis: 'file',
      positionComparator: 'equal_to',
      positionTarget: 3,
      operator: 'count',
      comparator: 'greater_than',
      target: 'exact_number',
      targetTotal: 0
    })

    expect(panel.querySelector('#cond-census-target').classList.contains('hidden')).toBe(false)
    expect(panel.querySelector('#cond-census-rank-note').classList.contains('hidden')).toBe(true)

    const targetSelect = panel.querySelector('#cond-census-target')
    targetSelect.value = 'prior_board_state'
    targetSelect.dispatchEvent(new Event('change', { bubbles: true }))

    expect(form.buildPayload()).toMatchObject({
      kind: 'census',
      positionAxis: 'file',
      positionTarget: 3,
      target: 'prior_board_state'
    })
    expect(form.buildPayload()).not.toHaveProperty('targetTotal')
  })

  it('preserves relational state when switching to the census tab and back', () => {
    const panel = buildPanel()
    const form = new ConditionForm(panel)
    form.attach()

    form.populate({
      version: 2,
      kind: 'relational',
      subject: 'allied',
      subjectFilter: 'pawn',
      operator: 'shield',
      target: 'moved_piece',
      targetFilter: 'any'
    })

    panel.querySelector('#cond-mode-census').dispatchEvent(new Event('click'))
    panel.querySelector('#cond-mode-relational').dispatchEvent(new Event('click'))

    const payload = form.buildPayload()
    expect(payload.kind).toBe('relational')
    expect(payload.subject).toBe('allied')
    expect(payload.subjectFilter).toBe('pawn')
    expect(payload.operator).toBe('shield')
    expect(payload.target).toBe('moved_piece')
  })

  it('preserves census state when switching to relational and back', () => {
    const panel = buildPanel()
    const form = new ConditionForm(panel)
    form.attach()

    form.populate({
      version: 2,
      kind: 'census',
      subject: 'enemy',
      subjectFilter: 'any',
      operator: 'count',
      comparator: 'greater_than',
      target: 'exact_number',
      targetTotal: 3
    })

    panel.querySelector('#cond-mode-relational').dispatchEvent(new Event('click'))
    panel.querySelector('#cond-mode-census').dispatchEvent(new Event('click'))

    const payload = form.buildPayload()
    expect(payload.kind).toBe('census')
    expect(payload.subject).toBe('enemy')
    expect(payload.operator).toBe('count')
    expect(payload.targetTotal).toBe(3)
  })

  it('shows the whole-board target select with no advanced toggle', () => {
    const panel = buildPanel()
    const form = new ConditionForm(panel)
    form.attach()

    form.populate({
      version: 2,
      kind: 'census',
      subject: 'allied',
      subjectFilter: 'any',
      operator: 'count',
      comparator: 'greater_than',
      target: 'exact_number',
      targetTotal: 2
    })

    expect(panel.querySelector('#cond-census-scope-whole').checked).toBe(true)
    expect(panel.querySelector('#cond-census-comparison-toggle')).toBeNull()
    expect(panel.querySelector('#cond-census-target').classList.contains('hidden')).toBe(false)
    expect(form.buildPayload()).toMatchObject({ kind: 'census', target: 'exact_number', targetTotal: 2 })
  })

  it('loads a region prior_board_state census and round-trips spatial keys', () => {
    const panel = buildPanel()
    const form = new ConditionForm(panel)
    form.attach()

    form.populate({
      version: 2,
      kind: 'census',
      subject: 'allied',
      subjectFilter: 'rook',
      subjectFilterMode: 'include',
      positionAxis: 'rank',
      positionComparator: 'equal_to',
      positionTarget: 5,
      operator: 'count',
      comparator: 'greater_than',
      target: 'prior_board_state'
    })

    expect(panel.querySelector('#cond-census-target').classList.contains('hidden')).toBe(false)
    expect(form.buildPayload()).toEqual({
      version: 2,
      kind: 'census',
      subject: 'allied',
      subjectFilter: 'rook',
      subjectFilterMode: 'include',
      positionAxis: 'rank',
      positionComparator: 'equal_to',
      positionTarget: 5,
      operator: 'count',
      comparator: 'greater_than',
      target: 'prior_board_state'
    })
  })

  it('loads an actor-target whole-board value census', () => {
    const panel = buildPanel()
    const form = new ConditionForm(panel)
    form.attach()

    form.populate({
      version: 2,
      kind: 'census',
      subject: 'allied',
      subjectFilter: 'any',
      operator: 'value',
      comparator: 'greater_than',
      target: 'enemy',
      targetFilter: 'rook'
    })

    expect(panel.querySelector('#cond-census-target').classList.contains('hidden')).toBe(false)
    expect(form.buildPayload().target).toBe('enemy')
  })

  it('round-trips a non-default relational comparator through the dropdown', () => {
    const panel = buildPanel()
    const form = new ConditionForm(panel)
    form.attach()

    form.populate({
      version: 2,
      kind: 'relational',
      subject: 'allied',
      subjectFilter: 'any',
      subjectComparisonMetric: 'count',
      subjectComparator: 'greater_than',
      subjectComparisonSource: 'exact_number',
      subjectComparisonSourceTotal: 2,
      operator: 'attack',
      target: 'enemy',
      targetFilter: 'any'
    })

    expect(panel.querySelector('#cond-left-comparator').value).toBe('greater_than')
    expect(form.buildPayload().subjectComparator).toBe('greater_than')
  })

  it('a relational with no explicit comparison emits no comparison fields', () => {
    const panel = buildPanel()
    const form = new ConditionForm(panel)
    form.attach()

    form.populate({
      version: 2,
      kind: 'relational',
      subject: 'allied',
      subjectFilter: 'any',
      operator: 'attack',
      target: 'enemy',
      targetFilter: 'any'
    })

    const payload = form.buildPayload()
    expect(payload).not.toHaveProperty('subjectComparisonMetric')
    expect(payload).not.toHaveProperty('subjectComparator')
    expect(payload).not.toHaveProperty('subjectComparisonSource')
    expect(payload).not.toHaveProperty('targetComparisonMetric')
    expect(payload).not.toHaveProperty('targetComparator')
    expect(payload).not.toHaveProperty('targetComparisonSource')
  })

  describe('captures mode', () => {
    it('defaults to Exists, emitting a count = 1 whole-board census payload', () => {
      const panel = buildPanel()
      const form = new ConditionForm(panel)
      form.attach()

      panel.querySelector('#cond-mode-captures').dispatchEvent(new Event('click'))

      expect(form.state.mode).toBe('captures')
      expect(panel.querySelector('#cond-captures-layout').classList.contains('hidden')).toBe(false)
      expect(form.buildPayload()).toEqual({
        version: 2,
        kind: 'census',
        subject: 'captured_piece',
        subjectFilter: 'any',
        operator: 'count',
        comparator: 'equal_to',
        target: 'exact_number',
        targetTotal: 1
      })
    })

    it('emits a count = 0 payload for Doesn\'t exist', () => {
      const panel = buildPanel()
      const form = new ConditionForm(panel)
      form.attach()

      panel.querySelector('#cond-mode-captures').dispatchEvent(new Event('click'))
      const doesNotExist = panel.querySelector('#cond-captures-operator input[value="does_not_exist"]')
      doesNotExist.checked = true
      doesNotExist.dispatchEvent(new Event('change'))

      expect(form.buildPayload()).toEqual({
        version: 2,
        kind: 'census',
        subject: 'captured_piece',
        subjectFilter: 'any',
        operator: 'count',
        comparator: 'equal_to',
        target: 'exact_number',
        targetTotal: 0
      })
    })

    it('hides collection actors (allied/enemy) from value-comparison targets', () => {
      const panel = buildPanel()
      const form = new ConditionForm(panel)
      form.attach()

      panel.querySelector('#cond-mode-captures').dispatchEvent(new Event('click'))
      const valueOp = panel.querySelector('#cond-captures-operator input[value="value"]')
      valueOp.checked = true
      valueOp.dispatchEvent(new Event('change'))

      const target = panel.querySelector('#cond-captures-target')
      expect(target.querySelector('option[value="allied"]').hidden).toBe(true)
      expect(target.querySelector('option[value="enemy"]').hidden).toBe(true)
      expect(target.querySelector('option[value="moved_piece"]').hidden).toBe(false)
      expect(target.querySelector('option[value="enemy_captured_piece"]').hidden).toBe(false)
      expect(target.querySelector('option[value="exact_number"]').hidden).toBe(false)
    })

    it('routes a count = 1 captured census node into the captures tab as Exists', () => {
      const panel = buildPanel()
      const form = new ConditionForm(panel)
      form.attach()

      const node = {
        version: 2,
        kind: 'census',
        subject: 'captured_piece',
        subjectFilter: 'any',
        operator: 'count',
        comparator: 'equal_to',
        target: 'exact_number',
        targetTotal: 1
      }
      form.populate(node)

      expect(form.state.mode).toBe('captures')
      expect(panel.querySelector('#cond-captures-layout').classList.contains('hidden')).toBe(false)
      expect(form.buildPayload()).toEqual(node)
    })

    it('loads a count = 0 captured census node as Doesn\'t exist', () => {
      const panel = buildPanel()
      const form = new ConditionForm(panel)
      form.attach()

      const node = {
        version: 2,
        kind: 'census',
        subject: 'captured_piece',
        subjectFilter: 'any',
        operator: 'count',
        comparator: 'equal_to',
        target: 'exact_number',
        targetTotal: 0
      }
      form.populate(node)

      expect(form.state.mode).toBe('captures')
      expect(form.buildPayload()).toEqual(node)
    })

    it('collapses a legacy non-canonical captured count payload to Exists', () => {
      const panel = buildPanel()
      const form = new ConditionForm(panel)
      form.attach()

      form.populate({
        version: 2,
        kind: 'census',
        subject: 'captured_piece',
        subjectFilter: 'any',
        operator: 'count',
        comparator: 'greater_than',
        target: 'exact_number',
        targetTotal: 2
      })

      expect(form.state.mode).toBe('captures')
      expect(form.buildPayload()).toEqual({
        version: 2,
        kind: 'census',
        subject: 'captured_piece',
        subjectFilter: 'any',
        operator: 'count',
        comparator: 'equal_to',
        target: 'exact_number',
        targetTotal: 1
      })
    })

    it('keeps an on-board whole-board census node in the positions tab', () => {
      const panel = buildPanel()
      const form = new ConditionForm(panel)
      form.attach()

      form.populate({
        version: 2,
        kind: 'census',
        subject: 'allied',
        subjectFilter: 'any',
        operator: 'count',
        comparator: 'greater_than',
        target: 'exact_number',
        targetTotal: 1
      })

      expect(form.state.mode).toBe('census')
    })

    it('loads a same_piece identity node into the captures tab', () => {
      const panel = buildPanel()
      const form = new ConditionForm(panel)
      form.attach()

      form.populate({
        version: 2,
        kind: 'identity',
        subject: 'captured_piece',
        target: 'enemy_moved_piece'
      })

      expect(form.state.mode).toBe('captures')
      expect(panel.querySelector('#cond-captures-layout').classList.contains('hidden')).toBe(false)
      expect(form.buildPayload()).toEqual({
        version: 2,
        kind: 'identity',
        subject: 'captured_piece',
        target: 'enemy_moved_piece'
      })
    })

    it('switches the operator to same_piece and emits a kind identity payload', () => {
      const panel = buildPanel()
      const form = new ConditionForm(panel)
      form.attach()

      panel.querySelector('#cond-mode-captures').dispatchEvent(new Event('click'))
      const samePiece = panel.querySelector('#cond-captures-operator input[value="same_piece"]')
      samePiece.checked = true
      samePiece.dispatchEvent(new Event('change'))

      expect(form.buildPayload()).toEqual({
        version: 2,
        kind: 'identity',
        subject: 'captured_piece',
        target: 'enemy_moved_piece'
      })
    })

    it('builds a value capture with a singular-actor target and target filter', () => {
      const panel = buildPanel()
      const form = new ConditionForm(panel)
      form.attach()

      const node = {
        version: 2,
        kind: 'census',
        subject: 'captured_piece',
        subjectFilter: 'any',
        operator: 'value',
        comparator: 'greater_than',
        target: 'enemy_moved_piece',
        targetFilter: 'pawn',
        targetFilterMode: 'exclude'
      }
      form.populate(node)

      expect(form.state.mode).toBe('captures')
      expect(form.buildPayload()).toEqual(node)
    })

    it('persists a subject filter on a same_piece capture (eval-inert until phase 2)', () => {
      const panel = buildPanel()
      const form = new ConditionForm(panel)
      form.attach()

      const node = {
        version: 2,
        kind: 'identity',
        subject: 'captured_piece',
        target: 'enemy_moved_piece',
        subjectFilter: 'pawn',
        subjectFilterMode: 'include'
      }
      form.populate(node)

      expect(form.state.mode).toBe('captures')
      expect(form.buildPayload()).toEqual(node)
    })

    it('switches enemy_captured_piece to a capturable subject when same_piece is picked', () => {
      const panel = buildPanel()
      const form = new ConditionForm(panel)
      form.attach()

      panel.querySelector('#cond-mode-captures').dispatchEvent(new Event('click'))
      const subject = panel.querySelector('#cond-captures-subject')
      subject.value = 'enemy_captured_piece'
      subject.dispatchEvent(new Event('change'))

      const samePiece = panel.querySelector('#cond-captures-operator input[value="same_piece"]')
      expect(samePiece.disabled).toBe(false)
      samePiece.checked = true
      samePiece.dispatchEvent(new Event('change'))

      expect(form.buildPayload()).toEqual({
        version: 2,
        kind: 'identity',
        subject: 'captured_piece',
        target: 'enemy_moved_piece'
      })
    })

    it('shows the prior-move note only when the subject is enemy_captured_piece', () => {
      const panel = buildPanel()
      const form = new ConditionForm(panel)
      form.attach()

      panel.querySelector('#cond-mode-captures').dispatchEvent(new Event('click'))
      const note = panel.querySelector('#cond-captures-enemy-note')
      expect(note.classList.contains('hidden')).toBe(true)

      const subject = panel.querySelector('#cond-captures-subject')
      subject.value = 'enemy_captured_piece'
      subject.dispatchEvent(new Event('change'))

      expect(note.classList.contains('hidden')).toBe(false)
    })

    it('no longer offers captured pieces as positions (census) subjects', () => {
      const panel = buildPanel()
      expect(panel.querySelector('#cond-census-subject option[value="captured_piece"]')).toBeNull()
      expect(panel.querySelector('#cond-census-subject option[value="enemy_captured_piece"]')).toBeNull()
    })
  })
})
