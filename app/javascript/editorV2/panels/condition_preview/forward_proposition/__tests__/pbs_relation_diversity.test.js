import { describe, expect, it } from 'vitest'
import { buildCombinedPlan } from 'editorV2/panels/condition_preview/plans/plan'
import { exampleFingerprint } from 'editorV2/panels/condition_preview/shared/example_utils'
import { collectForwardPropositionExamples } from 'editorV2/panels/condition_preview/forward_proposition/collect'
import CandidateMoveAnalysisV2 from 'bot_execution/candidate_move_analysis_v2'

function seededRandom(seed = 1) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function makeAdder() {
  const seen = new Set()
  return function addUnique(example, pool) {
    const id = exampleFingerprint(example)
    if (seen.has(id)) { return }
    seen.add(id)
    pool.push(example)
  }
}

function pbsRelationStats(payload, { seeds, attemptsPerSeed }) {
  const combinedPlan = buildCombinedPlan([payload])
  if (combinedPlan.status !== 'supported') {
    return { verifiedCount: 0, examples: [], status: combinedPlan.status, reason: combinedPlan.reason }
  }
  let verifiedCount = 0
  const examples = []
  for (const seed of seeds) {
    const standardExamples = []
    const produced = { 'forward-proposition': 0 }
    collectForwardPropositionExamples({
      combinedPlan,
      random: seededRandom(seed),
      maxStandardSize: 10000,
      addUnique: makeAdder(),
      standardExamples,
      produced,
      attempts: attemptsPerSeed
    })
    verifiedCount += produced['forward-proposition']
    examples.push(...standardExamples)
  }
  return { verifiedCount, examples, status: 'supported' }
}

function deltaHistogram(examples, payload) {
  const histogram = new Map()
  const args = {
    subject: payload.subject,
    subjectFilter: payload.subjectFilter || 'any',
    subjectFilterMode: payload.subjectFilterMode || null,
    operator: payload.operator,
    target: payload.target,
    targetFilter: payload.targetFilter || 'any',
    targetFilterMode: payload.targetFilterMode || null
  }
  for (const example of examples) {
    const analysis = new CandidateMoveAnalysisV2({ board: example.priorBoard, moveObject: example.moveObject })
    const after = analysis.relationalResult({ ...args, boardScope: 'after' })
    const prior = analysis.relationalResult({ ...args, boardScope: 'prior' })
    const key = `${prior.pairs.length}->${after.pairs.length}`
    histogram.set(key, (histogram.get(key) ?? 0) + 1)
  }
  return histogram
}

function countEmptyPriorDeltas(histogram) {
  let total = 0
  for (const [key, count] of histogram) {
    const [prior, after] = key.split('->').map(Number)
    if (prior === 0 && after >= 1) { total += count }
  }
  return total
}

function countVacuousDeltas(histogram) {
  return histogram.get('0->0') ?? 0
}

const DEFAULT_SEEDS = [11, 22, 33, 44, 55]
const ATTEMPTS_PER_SEED = 200
const MIN_EMPTY_PRIOR_DELTAS = 5

describe('PBS relation diversity', () => {
  // Dormant: relational aggregate_value is grammar-gated. Engine retained.
  it.skip('shield aggregate_value > PBS produces 0→N deltas', () => {
    const payload = {
      version: 2, kind: 'relational',
      subject: 'enemy', subjectFilter: 'pawn', subjectFilterMode: 'exclude',
      operator: 'shield',
      target: 'enemy', targetFilter: 'queen', targetFilterMode: 'include',
      subjectComparisonMetric: 'aggregate_value',
      subjectComparator: 'greater_than',
      subjectComparisonSource: 'prior_board_state'
    }
    const stats = pbsRelationStats(payload, { seeds: DEFAULT_SEEDS, attemptsPerSeed: ATTEMPTS_PER_SEED })
    const histogram = deltaHistogram(stats.examples, payload)
    expect(countEmptyPriorDeltas(histogram)).toBeGreaterThanOrEqual(MIN_EMPTY_PRIOR_DELTAS)
  })

  it.skip('attack aggregate_value > PBS produces 0→N deltas', () => {
    const payload = {
      version: 2, kind: 'relational',
      subject: 'allied', subjectFilter: 'knight',
      operator: 'attack',
      target: 'enemy', targetFilter: 'queen',
      subjectComparisonMetric: 'aggregate_value',
      subjectComparator: 'greater_than',
      subjectComparisonSource: 'prior_board_state'
    }
    const stats = pbsRelationStats(payload, { seeds: DEFAULT_SEEDS, attemptsPerSeed: ATTEMPTS_PER_SEED })
    const histogram = deltaHistogram(stats.examples, payload)
    expect(countEmptyPriorDeltas(histogram)).toBeGreaterThanOrEqual(MIN_EMPTY_PRIOR_DELTAS)
  })

  it.skip('defend aggregate_value > PBS produces 0→N deltas', () => {
    const payload = {
      version: 2, kind: 'relational',
      subject: 'allied', subjectFilter: 'knight',
      operator: 'defend',
      target: 'allied', targetFilter: 'queen',
      subjectComparisonMetric: 'aggregate_value',
      subjectComparator: 'greater_than',
      subjectComparisonSource: 'prior_board_state'
    }
    const stats = pbsRelationStats(payload, { seeds: DEFAULT_SEEDS, attemptsPerSeed: ATTEMPTS_PER_SEED })
    const histogram = deltaHistogram(stats.examples, payload)
    expect(countEmptyPriorDeltas(histogram)).toBeGreaterThanOrEqual(MIN_EMPTY_PRIOR_DELTAS)
  })

  it.skip('adjacent aggregate_value > PBS produces 0→N deltas', () => {
    const payload = {
      version: 2, kind: 'relational',
      subject: 'allied', subjectFilter: 'knight',
      operator: 'adjacent',
      target: 'enemy', targetFilter: 'queen',
      subjectComparisonMetric: 'aggregate_value',
      subjectComparator: 'greater_than',
      subjectComparisonSource: 'prior_board_state'
    }
    const stats = pbsRelationStats(payload, { seeds: DEFAULT_SEEDS, attemptsPerSeed: ATTEMPTS_PER_SEED })
    const histogram = deltaHistogram(stats.examples, payload)
    expect(countEmptyPriorDeltas(histogram)).toBeGreaterThanOrEqual(MIN_EMPTY_PRIOR_DELTAS)
  })

  it('adjacent count < PBS produces N→0 deltas with both-allied sides', () => {
    const payload = {
      version: 2, kind: 'relational',
      subject: 'allied', subjectFilter: 'bishop',
      operator: 'adjacent',
      target: 'allied', targetFilter: 'queen',
      subjectComparisonMetric: 'count',
      subjectComparator: 'less_than',
      subjectComparisonSource: 'prior_board_state'
    }
    const stats = pbsRelationStats(payload, { seeds: DEFAULT_SEEDS, attemptsPerSeed: ATTEMPTS_PER_SEED })
    const histogram = deltaHistogram(stats.examples, payload)
    let nToZero = 0
    for (const [key, count] of histogram) {
      const [prior, after] = key.split('->').map(Number)
      if (after === 0 && prior >= 1) { nToZero += count }
    }
    expect(nToZero).toBeGreaterThanOrEqual(MIN_EMPTY_PRIOR_DELTAS)
  })

  it.skip('shield aggregate_value = PBS produces 0=0 examples', () => {
    const payload = {
      version: 2, kind: 'relational',
      subject: 'enemy', subjectFilter: 'pawn', subjectFilterMode: 'exclude',
      operator: 'shield',
      target: 'enemy', targetFilter: 'queen', targetFilterMode: 'include',
      subjectComparisonMetric: 'aggregate_value',
      subjectComparator: 'equal_to',
      subjectComparisonSource: 'prior_board_state'
    }
    const stats = pbsRelationStats(payload, { seeds: DEFAULT_SEEDS, attemptsPerSeed: ATTEMPTS_PER_SEED })
    const histogram = deltaHistogram(stats.examples, payload)
    expect(countVacuousDeltas(histogram)).toBeGreaterThanOrEqual(MIN_EMPTY_PRIOR_DELTAS)
  })
})
