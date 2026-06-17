import { describe, expect, it } from 'vitest'

import { defaultNodeData, normalizeNodeData } from '../utils/nodeDefaults.js'

describe('nodeDefaults condition default', () => {
  const expected = {
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
  }

  it('seeds a new condition as moved piece attacking more enemies than the prior board state', () => {
    expect(defaultNodeData('condition')).toEqual(expected)
  })

  it('normalizes empty condition data to that same default', () => {
    expect(normalizeNodeData('condition', {})).toEqual(expected)
  })
})
