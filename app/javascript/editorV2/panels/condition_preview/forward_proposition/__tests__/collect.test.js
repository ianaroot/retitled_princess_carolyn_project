import { describe, expect, it } from 'vitest'
import Board from 'gameplay/board'
import { buildCombinedPlan } from 'editorV2/panels/condition_preview/plans/plan'
import { exampleFingerprint } from 'editorV2/panels/condition_preview/shared/example_utils'
import {
  collectForwardPropositionExamples, specialScenarioBudgets
} from 'editorV2/panels/condition_preview/forward_proposition/collect'

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

describe('collectForwardPropositionExamples', () => {
  it('produces verified examples for a simple knight-mover chain', () => {
    const combinedPlan = buildCombinedPlan([{
      version: 2, kind: 'census',
      subject: 'moved_piece', subjectFilter: 'knight',
      operator: 'count', comparator: 'greater_than',
      target: 'exact_number', targetTotal: 0
    }])
    const standardExamples = []
    const produced = { 'forward-proposition': 0 }

    collectForwardPropositionExamples({
      combinedPlan,
      random: Math.random,
      maxStandardSize: 50,
      addUnique: makeAdder(),
      standardExamples,
      produced,
      attempts: 200
    })

    expect(standardExamples.length).toBeGreaterThan(0)
    expect(produced['forward-proposition']).toBeGreaterThan(0)
  })

  it('produces castle examples for a castle-compatible chain', () => {
    const combinedPlan = buildCombinedPlan([{
      version: 2, kind: 'census',
      subject: 'allied', subjectFilter: 'pawn',
      operator: 'count', comparator: 'greater_than_or_equal_to',
      target: 'exact_number', targetTotal: 0
    }])
    const standardExamples = []
    const produced = { 'forward-proposition': 0 }

    collectForwardPropositionExamples({
      combinedPlan,
      random: seededRandom(11),
      maxStandardSize: 200,
      addUnique: makeAdder(),
      standardExamples,
      produced,
      attempts: 200
    })

    const castleExamples = standardExamples.filter(e => /^O-O/.test(e.moveObject?.pieceNotation ?? ''))
    expect(castleExamples.length).toBeGreaterThan(0)
  })

  it('produces verified examples for "no enemy attacker on moved_piece" (count=0 relational)', () => {
    const combinedPlan = buildCombinedPlan([{
      version: 2, kind: 'relational',
      subject: 'enemy', subjectFilter: 'any',
      operator: 'attack',
      target: 'moved_piece', targetFilter: 'any',
      subjectComparisonMetric: 'count', subjectComparator: 'equal_to',
      subjectComparisonSource: 'exact_number', subjectComparisonSourceTotal: 0
    }])
    const standardExamples = []
    const produced = { 'forward-proposition': 0 }

    collectForwardPropositionExamples({
      combinedPlan,
      random: seededRandom(9101),
      maxStandardSize: 50,
      addUnique: makeAdder(),
      standardExamples,
      produced,
      attempts: 200
    })

    expect(standardExamples.length).toBeGreaterThan(0)
    expect(produced['forward-proposition']).toBeGreaterThan(0)
  })

  it('generates examples for enemy_moved_piece same_piece captured_piece, including en passant', () => {
    const combinedPlan = buildCombinedPlan([{
      version: 2, kind: 'identity',
      subject: 'enemy_moved_piece',
      target: 'captured_piece'
    }])
    const standardExamples = []
    const produced = { 'forward-proposition': 0 }

    collectForwardPropositionExamples({
      combinedPlan,
      random: seededRandom(17),
      maxStandardSize: 500,
      addUnique: makeAdder(),
      standardExamples,
      produced,
      attempts: 1000
    })

    expect(produced['forward-proposition']).toBeGreaterThan(0)
    const enPassantExamples = standardExamples.filter(e => {
      const endPos = e.moveObject.endPosition
      return e.priorBoard.pieceTypeAt(endPos) === Board.EMPTY
    })
    expect(enPassantExamples.length).toBeGreaterThan(0)
  })

  it('generates examples for moved_piece value less_than captured_piece', () => {
    const combinedPlan = buildCombinedPlan([{
      version: 2, kind: 'census',
      subject: 'moved_piece', subjectFilter: 'any',
      operator: 'value', comparator: 'less_than',
      target: 'captured_piece', targetFilter: 'any'
    }])
    const standardExamples = []
    const produced = { 'forward-proposition': 0 }

    collectForwardPropositionExamples({
      combinedPlan,
      random: seededRandom(23),
      maxStandardSize: 300,
      addUnique: makeAdder(),
      standardExamples,
      produced,
      attempts: 500
    })

    expect(produced['forward-proposition']).toBeGreaterThan(0)
  })
})

describe('specialScenarioBudgets', () => {
  const mockScenario = (name, weight) => ({ name, attemptWeight: weight, buildCtxDelta: () => ({}) })
  const mockA = mockScenario('mock-a', 10)
  const mockB = mockScenario('mock-b', 10)
  const mockC = mockScenario('mock-c', 20)
  const allMocks = [mockA, mockB, mockC] // weight sum = 40

  function findBudget(result, name) {
    return result.find(r => r.scenario.name === name)?.budget
  }

  it('splits the special budget proportionally to weight', () => {
    const result = specialScenarioBudgets(allMocks, 200)
    const a = findBudget(result, 'mock-a')
    const b = findBudget(result, 'mock-b')
    const c = findBudget(result, 'mock-c')
    expect(a).toBe(b)
    expect(c).toBeGreaterThanOrEqual(2 * a - 1)
    expect(c).toBeLessThanOrEqual(2 * a + 1)
  })

  it('redistributes weight of absent scenarios to the remaining eligibles', () => {
    const all = specialScenarioBudgets(allMocks, 200)
    const partial = specialScenarioBudgets([mockA, mockC], 200)
    expect(findBudget(partial, 'mock-a')).toBeGreaterThan(findBudget(all, 'mock-a'))
    expect(findBudget(partial, 'mock-c')).toBeGreaterThan(findBudget(all, 'mock-c'))
  })

  it('returns an empty list with no standard entry when nothing is eligible', () => {
    expect(specialScenarioBudgets([], 200)).toEqual([])
  })

  it('scales each scenario’s budget linearly with the special attempt count', () => {
    const small = specialScenarioBudgets(allMocks, 100)
    const large = specialScenarioBudgets(allMocks, 1000)
    const smallC = findBudget(small, 'mock-c')
    const largeC = findBudget(large, 'mock-c')
    expect(largeC).toBeGreaterThanOrEqual(10 * smallC - 5)
    expect(largeC).toBeLessThanOrEqual(10 * smallC + 5)
  })

  it('keeps the total at or marginally above the special attempt count', () => {
    const result = specialScenarioBudgets(allMocks, 200)
    const total = result.reduce((s, r) => s + r.budget, 0)
    expect(total).toBeGreaterThanOrEqual(200)
    expect(total).toBeLessThanOrEqual(200 + allMocks.length)
  })
})
