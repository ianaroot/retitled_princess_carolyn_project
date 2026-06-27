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

function countWhitePawnsAttackingBlackQueen(afterBoard) {
  let queenPos = -1
  for (let pos = 0; pos < 64; pos += 1) {
    if (afterBoard.teamAt(pos) === 'B' && afterBoard.pieceTypeAt(pos) === 'Q') {
      queenPos = pos
      break
    }
  }
  if (queenPos === -1) { return 0 }
  const queenFile = queenPos % 8
  const queenRank = Math.floor(queenPos / 8)
  let count = 0
  for (let pos = 0; pos < 64; pos += 1) {
    if (afterBoard.teamAt(pos) !== 'W' || afterBoard.pieceTypeAt(pos) !== 'P') { continue }
    const file = pos % 8
    const rank = Math.floor(pos / 8)
    if (queenRank === rank + 1 && Math.abs(queenFile - file) === 1) { count += 1 }
  }
  return count
}

const payload = {
  version: 2, kind: 'relational',
  subject: 'moved_piece', subjectFilter: 'pawn',
  operator: 'attack',
  target: 'enemy', targetFilter: 'queen',
  subjectComparisonMetric: 'count', subjectComparator: 'equal_to',
  subjectComparisonSource: 'exact_number', subjectComparisonSourceTotal: 1
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

describe('moved_piece pawn attack enemy queen count = 1', () => {
  it('produces examples where one allied pawn attacks the queen', () => {
    const examples = collect(7002)
    expect(examples.length).toBeGreaterThan(0)
    const hasSingleAttacker = examples.some(ex => countWhitePawnsAttackingBlackQueen(ex.afterBoard) === 1)
    expect(hasSingleAttacker).toBe(true)
  })
})
