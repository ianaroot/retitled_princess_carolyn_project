import { beforeEach, describe, expect, it, vi } from 'vitest'

const { noteSpy, weightSpy } = vi.hoisted(() => ({
  noteSpy: vi.fn(),
  weightSpy: vi.fn(() => 1.0)
}))

vi.mock('editorV2/panels/condition_preview/forward_proposition/coverage_record', async (importOriginal) => {
  const mod = await importOriginal()
  return {
    ...mod,
    createCoverageRecord: () => ({
      noteVerifiedExample: noteSpy,
      weightFor: weightSpy
    })
  }
})

import { buildCombinedPlan } from 'editorV2/panels/condition_preview/plans/plan'
import {
  exampleFingerprint,
  MOVE_KIND_CASTLE, MOVE_KIND_PROMOTION, MOVE_KIND_EN_PASSANT
} from 'editorV2/panels/condition_preview/shared/example_utils'
import { STANDARD_KEY } from 'editorV2/panels/condition_preview/forward_proposition/coverage_record'
import { collectForwardPropositionExamples } from 'editorV2/panels/condition_preview/forward_proposition/collect'

const SPECIAL_KINDS = new Set([MOVE_KIND_CASTLE, MOVE_KIND_PROMOTION, MOVE_KIND_EN_PASSANT])

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

function runCollect({ attempts = 500 } = {}) {
  const payload = {
    version: 2, kind: 'relational',
    subject: 'allied', subjectFilter: 'any',
    operator: 'attack',
    target: 'enemy', targetFilter: 'any',
    subjectComparisonMetric: 'count', subjectComparator: 'greater_than',
    subjectComparisonSource: 'exact_number', subjectComparisonSourceTotal: 0
  }
  const combinedPlan = buildCombinedPlan([payload])
  const standardExamples = []
  const produced = {
    'forward-proposition': 0,
    'forward-proposition.standard': 0,
    'forward-proposition.special': 0
  }
  collectForwardPropositionExamples({
    combinedPlan, random: seededRandom(1), maxStandardSize: 400,
    addUnique: makeAdder(), standardExamples, produced, attempts
  })
  return standardExamples
}

function expectedScenarioFor(example) {
  return SPECIAL_KINDS.has(example.moveKind) ? example.moveKind : STANDARD_KEY
}

describe('coverage_record plumbing through collectForwardPropositionExamples', () => {
  beforeEach(() => {
    noteSpy.mockClear()
    weightSpy.mockClear()
  })

  it('notes one verified example per accepted unique example, in order, with the example.bindingComboKey', () => {
    const examples = runCollect()
    expect(examples.length).toBeGreaterThan(0)
    expect(noteSpy).toHaveBeenCalledTimes(examples.length)
    examples.forEach((example, i) => {
      const [scenarioName, shapeKey] = noteSpy.mock.calls[i]
      expect(scenarioName).toBe(expectedScenarioFor(example))
      expect(shapeKey).toBe(example.bindingComboKey)
    })
  })

  it('consults weightFor for every scenario it later notes', () => {
    const examples = runCollect()
    expect(examples.length).toBeGreaterThan(0)
    const notedScenarios = new Set(noteSpy.mock.calls.map(([s]) => s))
    const weightedScenarios = new Set(weightSpy.mock.calls.map(([s]) => s))
    for (const scenario of notedScenarios) {
      expect(weightedScenarios).toContain(scenario)
    }
  })
})
