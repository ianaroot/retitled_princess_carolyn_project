import { renderConditionSentence } from 'editorV2/utils/conditionPreviewFormatter'
import { pillInputs } from 'editorV2/panels/condition_form/dom_helpers'
import RelationalMode from 'editorV2/panels/condition_form/relational_mode'
import CensusMode from 'editorV2/panels/condition_form/census_mode'
import CapturesMode from 'editorV2/panels/condition_form/captures_mode'

const DEFAULT_GRAMMAR_RULES = Object.freeze({
  editorSubjects: ['allied', 'enemy', 'moved_piece', 'captured_piece', 'enemy_moved_piece', 'enemy_captured_piece'],
  positionSubjects: ['allied', 'enemy', 'moved_piece', 'enemy_moved_piece'],
  regularRelationalSubjects: ['allied', 'enemy', 'moved_piece', 'enemy_moved_piece'],
  regularRelationalTargets: ['allied', 'enemy', 'moved_piece', 'enemy_moved_piece'],
  relationalOperatorTargetRules: {
    attack: 'opposing_team',
    defend: 'same_team',
    cover: 'same_team',
    shield: 'same_team',
    adjacent: 'any_regular'
  },
  samePieceTargets: {
    enemy_moved_piece: ['captured_piece'],
    captured_piece: ['enemy_moved_piece']
  },
  teamSubjectGroups: {
    allied: ['allied', 'moved_piece'],
    enemy: ['enemy', 'enemy_moved_piece']
  },
  opposingTeamGroups: {
    allied: 'enemy',
    enemy: 'allied'
  },
  census: {
    regionSubjects: ['allied', 'enemy', 'moved_piece', 'enemy_moved_piece'],
    wholeBoardSubjects: ['allied', 'enemy', 'moved_piece', 'enemy_moved_piece']
  },
  capturesSubjects: ['captured_piece', 'enemy_captured_piece']
})

class ConditionForm {
  constructor(editorPanel) {
    this.editorPanel = editorPanel
    this.grammarRules = this.readGrammarRules()
    this.modes = {
      relational: new RelationalMode(this.grammarRules),
      census: new CensusMode(this.grammarRules),
      captures: new CapturesMode(this.grammarRules)
    }
    this.state = this.defaultState()
    this.boundHandleFieldChange = this.handleFieldChange.bind(this)
    this.boundHandleModeRelational = () => this.handleModeChange('relational')
    this.boundHandleModeCensus = () => this.handleModeChange('census')
    this.boundHandleModeCaptures = () => this.handleModeChange('captures')
  }

  defaultState() {
    return {
      mode: 'relational',
      relational: this.modes.relational.defaultState(),
      census: this.modes.census.defaultState(),
      captures: this.modes.captures.defaultState()
    }
  }

  readGrammarRules() {
    const element = document.getElementById('node-grammar-rules')
    if (!element?.textContent) { return DEFAULT_GRAMMAR_RULES }
    try {
      return JSON.parse(element.textContent)
    } catch {
      return DEFAULT_GRAMMAR_RULES
    }
  }

  attach() {
    const fields = this.fields()
    fields.all.forEach(field => field?.addEventListener('change', this.boundHandleFieldChange))
    fields.numberInputs.forEach(field => field?.addEventListener('input', this.boundHandleFieldChange))
    fields.modeRelationalBtn?.addEventListener('click', this.boundHandleModeRelational)
    fields.modeCensusBtn?.addEventListener('click', this.boundHandleModeCensus)
    fields.modeCapturesBtn?.addEventListener('click', this.boundHandleModeCaptures)
  }

  detach() {
    const fields = this.fields()
    fields.all.forEach(field => field?.removeEventListener('change', this.boundHandleFieldChange))
    fields.numberInputs.forEach(field => field?.removeEventListener('input', this.boundHandleFieldChange))
    fields.modeRelationalBtn?.removeEventListener('click', this.boundHandleModeRelational)
    fields.modeCensusBtn?.removeEventListener('click', this.boundHandleModeCensus)
    fields.modeCapturesBtn?.removeEventListener('click', this.boundHandleModeCaptures)
  }

  fields() {
    const leftSubject = this.editorPanel.querySelector('#cond-left-subject')
    const leftFilterMode = this.editorPanel.querySelector('#cond-left-filter-mode')
    const leftFilter = this.editorPanel.querySelector('#cond-left-filter')
    const leftComparisonMetric = this.editorPanel.querySelector('#cond-left-comparison-metric')
    const leftComparisonMetricInputs = pillInputs(leftComparisonMetric)
    const leftComparator = this.editorPanel.querySelector('#cond-left-comparator')
    const leftComparisonSource = this.editorPanel.querySelector('#cond-left-comparison-source')
    const leftComparisonSourceTotal = this.editorPanel.querySelector('#cond-left-comparison-source-total')
    const relationalOperatorSelect = this.editorPanel.querySelector('#cond-relational-operator')
    const rightSubject = this.editorPanel.querySelector('#cond-right-subject')
    const rightFilterMode = this.editorPanel.querySelector('#cond-right-filter-mode')
    const rightFilter = this.editorPanel.querySelector('#cond-right-filter')
    const rightComparisonMetric = this.editorPanel.querySelector('#cond-right-comparison-metric')
    const rightComparisonMetricInputs = pillInputs(rightComparisonMetric)
    const rightComparator = this.editorPanel.querySelector('#cond-right-comparator')
    const rightComparisonSource = this.editorPanel.querySelector('#cond-right-comparison-source')
    const rightComparisonSourceTotal = this.editorPanel.querySelector('#cond-right-comparison-source-total')
    const censusSubject = this.editorPanel.querySelector('#cond-census-subject')
    const censusFilterMode = this.editorPanel.querySelector('#cond-census-filter-mode')
    const censusFilter = this.editorPanel.querySelector('#cond-census-filter')
    const censusOperator = this.editorPanel.querySelector('#cond-census-operator')
    const censusOperatorInputs = pillInputs(censusOperator)
    const censusComparator = this.editorPanel.querySelector('#cond-census-comparator')
    const censusTarget = this.editorPanel.querySelector('#cond-census-target')
    const censusTargetTotal = this.editorPanel.querySelector('#cond-census-target-total')
    const censusScopeWhole = this.editorPanel.querySelector('#cond-census-scope-whole')
    const censusAxisRank = this.editorPanel.querySelector('#cond-census-axis-rank')
    const censusAxisFile = this.editorPanel.querySelector('#cond-census-axis-file')
    const censusAxisSquare = this.editorPanel.querySelector('#cond-census-axis-square')
    const censusRegionComparator = this.editorPanel.querySelector('#cond-census-region-comparator')
    const censusRegionComparatorInputs = pillInputs(censusRegionComparator)
    const censusRankInput = this.editorPanel.querySelector('#cond-census-rank-input')
    const censusFileInput = this.editorPanel.querySelector('#cond-census-file-input')
    const censusSquareFile = this.editorPanel.querySelector('#cond-census-square-file')
    const censusSquareRank = this.editorPanel.querySelector('#cond-census-square-rank')
    const capturesSubject = this.editorPanel.querySelector('#cond-captures-subject')
    const capturesFilterMode = this.editorPanel.querySelector('#cond-captures-filter-mode')
    const capturesFilter = this.editorPanel.querySelector('#cond-captures-filter')
    const capturesOperator = this.editorPanel.querySelector('#cond-captures-operator')
    const capturesOperatorInputs = pillInputs(capturesOperator)
    const capturesComparator = this.editorPanel.querySelector('#cond-captures-comparator')
    const capturesComparatorInputs = pillInputs(capturesComparator)
    const capturesTarget = this.editorPanel.querySelector('#cond-captures-target')
    const capturesTargetFilter = this.editorPanel.querySelector('#cond-captures-target-filter')
    const capturesTargetFilterMode = this.editorPanel.querySelector('#cond-captures-target-filter-mode')
    const capturesTargetTotal = this.editorPanel.querySelector('#cond-captures-target-total')
    const censusRankInputs = pillInputs(censusRankInput)
    const censusFileInputs = pillInputs(censusFileInput)
    const censusSquareFileInputs = pillInputs(censusSquareFile)
    const censusSquareRankInputs = pillInputs(censusSquareRank)

    return {
      leftSubject,
      leftFilterMode,
      leftFilter,
      leftComparisonMetric,
      leftComparisonMetricInputs,
      leftComparator,
      leftComparisonSource,
      leftComparisonSourceTotal,
      relationalOperatorSelect,
      rightSubject,
      rightFilterMode,
      rightFilter,
      rightComparisonMetric,
      rightComparisonMetricInputs,
      rightComparator,
      rightComparisonSource,
      rightComparisonSourceTotal,
      censusSubject,
      censusFilterMode,
      censusFilter,
      censusOperator,
      censusOperatorInputs,
      censusComparator,
      censusTarget,
      censusTargetTotal,
      censusScopeWhole,
      censusAxisRank,
      censusAxisFile,
      censusAxisSquare,
      censusRegionComparator,
      censusRegionComparatorInputs,
      censusRankInput,
      censusFileInput,
      censusSquareFile,
      censusSquareRank,
      censusRankInputs,
      censusFileInputs,
      censusSquareFileInputs,
      censusSquareRankInputs,
      capturesSubject,
      capturesFilterMode,
      capturesFilter,
      capturesOperator,
      capturesOperatorInputs,
      capturesComparator,
      capturesComparatorInputs,
      capturesTarget,
      capturesTargetFilter,
      capturesTargetFilterMode,
      capturesTargetTotal,
      leftComparisonBody: this.editorPanel.querySelector('#cond-left-comparison-body'),
      leftComparisonLockedNote: this.editorPanel.querySelector('#cond-left-comparison-locked-note'),
      leftFilterModeControl: leftFilterMode?.closest('.condition-form-checkbox'),
      rightComparisonBody: this.editorPanel.querySelector('#cond-right-comparison-body'),
      rightComparisonLockedNote: this.editorPanel.querySelector('#cond-right-comparison-locked-note'),
      rightFilterModeControl: rightFilterMode?.closest('.condition-form-checkbox'),
      rightCardLabel: this.editorPanel.querySelector('#cond-right-card-label'),
      rightRelationalFields: this.editorPanel.querySelector('#cond-right-relational-fields'),
      leftComparisonSection: this.editorPanel.querySelector('#cond-left-comparison-section'),
      leftFilterRow: this.editorPanel.querySelector('#cond-left-filter-row'),
      rightFilterRow: this.editorPanel.querySelector('#cond-right-filter-row'),
      formulationPreview: this.editorPanel.querySelector('#cond-formulation-preview'),
      modeRelationalBtn: this.editorPanel.querySelector('#cond-mode-relational'),
      modeCensusBtn: this.editorPanel.querySelector('#cond-mode-census'),
      modeCapturesBtn: this.editorPanel.querySelector('#cond-mode-captures'),
      relationalTargetNote: this.editorPanel.querySelector('#cond-relational-target-note'),
      leftAggregateNote: this.editorPanel.querySelector('#cond-left-aggregate-note'),
      rightAggregateNote: this.editorPanel.querySelector('#cond-right-aggregate-note'),
      mainLayout: this.editorPanel.querySelector('.condition-form-layout:not(.condition-form-position-layout):not(.condition-form-captures-layout)'),
      censusLayout: this.editorPanel.querySelector('#cond-census-layout'),
      capturesLayout: this.editorPanel.querySelector('#cond-captures-layout'),
      capturesFilterRow: this.editorPanel.querySelector('#cond-captures-filter-row'),
      capturesTargetStack: this.editorPanel.querySelector('#cond-captures-target-stack'),
      capturesTargetFilterRow: this.editorPanel.querySelector('#cond-captures-target-filter-row'),
      capturesFilterModeControl: capturesFilterMode?.closest('.condition-form-checkbox'),
      capturesTargetFilterModeControl: capturesTargetFilterMode?.closest('.condition-form-checkbox'),
      capturesEnemyNote: this.editorPanel.querySelector('#cond-captures-enemy-note'),
      censusFilterRow: this.editorPanel.querySelector('#cond-census-filter-row'),
      censusFilterModeControl: censusFilterMode?.closest('.condition-form-checkbox'),
      censusScope: this.editorPanel.querySelector('#cond-census-scope'),
      censusSquareInputs: this.editorPanel.querySelector('#cond-census-square-inputs'),
      censusRegionTarget: this.editorPanel.querySelector('#cond-census-region-target'),
      censusRankNote: this.editorPanel.querySelector('#cond-census-rank-note'),
      all: [
        leftSubject, leftFilterMode, leftFilter, ...leftComparisonMetricInputs, leftComparator, leftComparisonSource,
        relationalOperatorSelect,
        rightSubject, rightFilterMode, rightFilter, ...rightComparisonMetricInputs, rightComparator, rightComparisonSource,
        censusSubject, censusFilterMode, censusFilter, ...censusOperatorInputs, censusComparator,
        censusTarget,
        censusScopeWhole, censusAxisRank, censusAxisFile, censusAxisSquare, ...censusRegionComparatorInputs,
        ...censusRankInputs, ...censusFileInputs, ...censusSquareFileInputs, ...censusSquareRankInputs,
        capturesSubject, capturesFilterMode, capturesFilter, ...capturesOperatorInputs, ...capturesComparatorInputs,
        capturesTarget, capturesTargetFilter, capturesTargetFilterMode
      ],
      numberInputs: [
        leftComparisonSourceTotal,
        rightComparisonSourceTotal,
        censusTargetTotal,
        capturesTargetTotal
      ]
    }
  }

  populate(nodeData = {}) {
    if (this.isValidV2Node(nodeData)) {
      this.state = this.stateFromNodeData(nodeData)
    } else {
      this.state = this.defaultState()
    }
    const mode = this.state.mode
    this.modes[mode].applyCompatibilityRules(this.state[mode])
    this.render()
  }

  isValidV2Node(nodeData = {}) {
    return nodeData.version === 2 && ['relational', 'census', 'identity'].includes(nodeData.kind)
  }

  stateFromNodeData(nodeData) {
    const mode = this.modeForNodeData(nodeData)
    const state = {
      mode,
      relational: this.modes.relational.defaultState(),
      census: this.modes.census.defaultState(),
      captures: this.modes.captures.defaultState()
    }
    state[mode] = this.modes[mode].fromNodeData(nodeData)
    return state
  }

  modeForNodeData(nodeData) {
    if (nodeData.kind === 'identity') { return 'captures' }
    if (nodeData.kind === 'census' && this.isCapturedSubject(nodeData.subject)) { return 'captures' }
    if (nodeData.kind === 'census') { return 'census' }
    return 'relational'
  }

  isCapturedSubject(subject) {
    const capturesSubjects = this.grammarRules.capturesSubjects || ['captured_piece', 'enemy_captured_piece']
    return capturesSubjects.includes(subject)
  }

  render() {
    const fields = this.fields()
    const isRelational = this.state.mode === 'relational'
    const isCensus = this.state.mode === 'census'
    const isCaptures = this.state.mode === 'captures'

    fields.modeRelationalBtn?.classList.toggle('active', isRelational)
    fields.modeCensusBtn?.classList.toggle('active', isCensus)
    fields.modeCapturesBtn?.classList.toggle('active', isCaptures)

    fields.relationalOperatorSelect?.classList.toggle('hidden', !isRelational)
    fields.rightRelationalFields?.classList.toggle('hidden', !isRelational)
    fields.leftComparisonSection?.classList.toggle('hidden', !isRelational)
    fields.mainLayout?.classList.toggle('hidden', !isRelational)
    fields.censusLayout?.classList.toggle('hidden', !isCensus)
    fields.capturesLayout?.classList.toggle('hidden', !isCaptures)

    this.modes[this.state.mode].render(this.state[this.state.mode], fields)

    if (fields.formulationPreview) {
      renderConditionSentence(fields.formulationPreview, this.buildPayload())
    }

    if (this.onStateChange) { this.onStateChange(this.buildPayload()) }
  }

  handleModeChange(mode) {
    if (this.state.mode === mode) { return }
    this.state.mode = mode
    this.render()
  }

  handleFieldChange() {
    const fields = this.fields()

    const mode = this.state.mode
    this.modes[mode].readFields(this.state[mode], fields)
    this.modes[mode].applyCompatibilityRules(this.state[mode])

    this.render()
  }

  buildPayload() {
    return this.modes[this.state.mode].buildPayload(this.state[this.state.mode])
  }

}

export default ConditionForm
