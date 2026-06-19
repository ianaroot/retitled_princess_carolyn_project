export const DEFAULT_CONDITION_DATA = Object.freeze({
  version: 2,
  kind: 'relational',
  subject: 'moved_piece',
  subjectFilter: 'any',
  operator: 'attack',
  target: 'enemy',
  targetFilter: 'any',
  targetComparisonMetric: 'count',
  targetComparator: 'greater_than',
  targetComparisonSource: 'prior_board_state',
})

export const DEFAULT_ACTION_DATA = Object.freeze({
  actionType: 'add',
  value: 1
})

export const DEFAULT_ORGANIZER_DATA = Object.freeze({
  title: 'Organizer',
  notes: ''
})

export const ACTION_DATA_KEYS = Object.freeze([
  'actionType',
  'value'
])

export const ORGANIZER_DATA_KEYS = Object.freeze([
  'title',
  'notes'
])

export function defaultNodeData(type) {
  switch (type) {
    case 'condition':
      return { ...DEFAULT_CONDITION_DATA }
    case 'score':
      return { ...DEFAULT_ACTION_DATA }
    case 'organizer':
      return { ...DEFAULT_ORGANIZER_DATA }
    default:
      return {}
  }
}

export function normalizeNodeData(type, data = {}) {
  if (Object.keys(data).length === 0) {
    return defaultNodeData(type)
  }

  switch (type) {
    case 'condition':
      if (data.kind === 'relational') {
        return { ...data }
      }
      return { ...DEFAULT_CONDITION_DATA, ...data }
    case 'score':
      return { ...DEFAULT_ACTION_DATA, ...data }
    case 'organizer':
      return { ...DEFAULT_ORGANIZER_DATA, ...data }
    default:
      return { ...data }
  }
}
