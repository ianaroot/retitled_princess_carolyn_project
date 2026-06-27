import { describe, expect, it } from 'vitest'
import { buildCombinedPlan } from 'editorV2/panels/condition_preview/plans/plan'
import {
  exampleFingerprint,
  MOVE_KIND_CASTLE, MOVE_KIND_PROMOTION, MOVE_KIND_EN_PASSANT
} from 'editorV2/panels/condition_preview/shared/example_utils'
import { collectForwardPropositionExamples } from 'editorV2/panels/condition_preview/forward_proposition/collect'
import { assembleWithSpecialQuota } from 'editorV2/panels/condition_preview/shared/example_assembly'

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

const SPECIAL_KINDS = new Set([MOVE_KIND_CASTLE, MOVE_KIND_PROMOTION, MOVE_KIND_EN_PASSANT])

// Canonical 30/30-special reproducer: a permissive condition special moves
// trivially satisfy too.
describe('forward-proposition special-vs-standard starvation', () => {
  const payload = {
    version: 2, kind: 'relational',
    subject: 'allied', subjectFilter: 'any',
    operator: 'attack',
    target: 'enemy', targetFilter: 'any',
    subjectComparisonMetric: 'count', subjectComparator: 'greater_than',
    subjectComparisonSource: 'exact_number', subjectComparisonSourceTotal: 0
  }

  it('runs the standard shift to production for a special-satisfiable permissive condition', () => {
    const combinedPlan = buildCombinedPlan([payload])
    const standardExamples = []
    const produced = {
      'forward-proposition': 0,
      'forward-proposition.standard': 0,
      'forward-proposition.special': 0
    }
    collectForwardPropositionExamples({
      combinedPlan, random: seededRandom(1), maxStandardSize: 400,
      addUnique: makeAdder(), standardExamples, produced, attempts: 1200
    })

    expect(produced['forward-proposition.standard']).toBeGreaterThan(0)
    expect(produced['forward-proposition.special']).toBeGreaterThan(0)
  })

  it('holds special at or below the ceiling and gives the rest to standard once assembled', () => {
    const combinedPlan = buildCombinedPlan([payload])
    const standardExamples = []
    const produced = {
      'forward-proposition': 0,
      'forward-proposition.standard': 0,
      'forward-proposition.special': 0
    }
    collectForwardPropositionExamples({
      combinedPlan, random: seededRandom(1), maxStandardSize: 400,
      addUnique: makeAdder(), standardExamples, produced, attempts: 1200
    })

    const assembled = assembleWithSpecialQuota({
      examples: standardExamples, combinedPlan, maxExamples: 30, random: seededRandom(2)
    })
    const special = assembled.filter(e => SPECIAL_KINDS.has(e.moveKind)).length
    const standard = assembled.length - special

    expect(assembled.length).toBeLessThanOrEqual(30)
    expect(special).toBeLessThanOrEqual(12)
    expect(standard).toBeGreaterThanOrEqual(18)
  })
})
