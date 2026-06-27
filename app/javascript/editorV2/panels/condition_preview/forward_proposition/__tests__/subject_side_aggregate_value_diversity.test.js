import { describe, expect, it } from 'vitest'
import { buildCombinedPlan } from 'editorV2/panels/condition_preview/plans/plan'
import { exampleFingerprint } from 'editorV2/panels/condition_preview/shared/example_utils'
import { collectForwardPropositionExamples } from 'editorV2/panels/condition_preview/forward_proposition/collect'

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

function countBlackPawnAttackersOf(afterBoard, targetPos) {
  const targetRank = Math.floor(targetPos / 8)
  const targetFile = targetPos % 8
  let count = 0
  for (let pos = 0; pos < 64; pos += 1) {
    if (afterBoard.teamAt(pos) !== 'B' || afterBoard.pieceTypeAt(pos) !== 'P') { continue }
    const rank = Math.floor(pos / 8)
    const file = pos % 8
    if (rank === targetRank + 1 && Math.abs(file - targetFile) === 1) { count += 1 }
  }
  return count
}

const payload = {
  version: 2, kind: 'relational',
  subject: 'enemy', subjectFilter: 'any',
  operator: 'attack',
  target: 'moved_piece', targetFilter: 'any',
  subjectComparisonMetric: 'aggregate_value', subjectComparator: 'less_than',
  subjectComparisonSource: 'exact_number', subjectComparisonSourceTotal: 3
}

function collect(seed) {
  const combinedPlan = buildCombinedPlan([payload])
  const standardExamples = []
  const produced = { 'forward-proposition': 0 }
  collectForwardPropositionExamples({
    combinedPlan,
    random: seededRandom(seed),
    maxStandardSize: 100,
    addUnique: makeAdder(),
    standardExamples,
    produced,
    attempts: 1200
  })
  return standardExamples
}

// Dormant: relational aggregate_value is grammar-gated. Engine retained.
describe.skip('enemy aggregate_value < 3 attack moved_piece diversity', () => {
  // Seed-brittle: if random-consumption order shifts upstream, seed 7777's output changes and this may fail despite the feature working. Start any failure investigation by checking whether the planning path is firing at all.
  it('produces at least one example with two pawn attackers', () => {
    const examples = collect(7777)
    expect(examples.length).toBeGreaterThan(0)
    const hasTwoPawnAttackers = examples.some(ex => {
      const dest = ex.moveObject.endPosition
      return countBlackPawnAttackersOf(ex.afterBoard, dest) >= 2
    })
    expect(hasTwoPawnAttackers).toBe(true)
  })
})
