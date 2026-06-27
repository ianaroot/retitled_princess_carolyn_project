import { enrichExample } from 'editorV2/panels/condition_preview/shared/enrichment'
import { selectDiverseExamples, uniqueExamples } from 'editorV2/panels/condition_preview/shared/diversity_selection'
import {
  exampleFingerprint,
  MOVE_KIND_CASTLE, MOVE_KIND_PROMOTION, MOVE_KIND_EN_PASSANT
} from 'editorV2/panels/condition_preview/shared/example_utils'
import { shuffled } from 'editorV2/panels/condition_preview/shared/board_utils'

const ENRICHMENT_PROBABILITY = 0.5
const SPECIAL_DISPLAY_CEILING = 12

// Order is a gap-fill tiebreak, not a priority — don't reorder for precedence.
const SPECIAL_GROUPS = Object.freeze([
  { key: 'en_passant', moveKind: MOVE_KIND_EN_PASSANT },
  { key: 'castle', moveKind: MOVE_KIND_CASTLE },
  { key: 'promotion', moveKind: MOVE_KIND_PROMOTION }
])

function finalizeExamples(baseExamples, combinedPlan, maxExamples, random) {
  const enrichedCandidates = []
  baseExamples.forEach(example => {
    if (random() >= ENRICHMENT_PROBABILITY) { return }
    const enriched = enrichExample(example, combinedPlan, random)
    if (enriched) { enrichedCandidates.push(enriched) }
  })
  if (enrichedCandidates.length === 0) {
    return selectDiverseExamples(shuffled(baseExamples, random), maxExamples)
  }
  const desiredEnrichedCount = Math.min(
    enrichedCandidates.length,
    Math.max(1, Math.round(maxExamples * ENRICHMENT_PROBABILITY))
  )
  const selectedEnriched = selectDiverseExamples(uniqueExamples(enrichedCandidates), desiredEnrichedCount)
  const selectedEnrichedIds = new Set(selectedEnriched.map(exampleFingerprint))
  const remainingBase = baseExamples.filter(example => !selectedEnrichedIds.has(exampleFingerprint(example)))
  const selectedBase = selectDiverseExamples(shuffled(remainingBase, random), Math.max(0, maxExamples - selectedEnriched.length))
  const combined = shuffled(uniqueExamples([...selectedBase, ...selectedEnriched]), random)
  if (combined.length >= maxExamples) {
    return selectDiverseExamples(combined, maxExamples)
  }
  const fallbackPool = shuffled(uniqueExamples([...combined, ...baseExamples, ...enrichedCandidates]), random)
  return selectDiverseExamples(fallbackPool, maxExamples)
}

// A short special group's slots go to standard, never to other special
// groups; special exceeds the ceiling only to cover a standard shortfall.
export function planSpecialQuota({ standardCount, groupCounts, maxExamples, ceiling = SPECIAL_DISPLAY_CEILING }) {
  const perGroupBase = groupCounts.length > 0 ? Math.floor(ceiling / groupCounts.length) : 0

  const groupTakes = {}
  let specialBaseTotal = 0
  for (const { key, count } of groupCounts) {
    groupTakes[key] = Math.min(perGroupBase, count)
    specialBaseTotal += groupTakes[key]
  }

  const standardTake = Math.min(standardCount, Math.max(0, maxExamples - specialBaseTotal))
  let deficit = maxExamples - specialBaseTotal - standardTake

  const survivors = groupCounts.filter(g => g.count > 0)
  let progressed = true
  while (deficit > 0 && progressed) {
    progressed = false
    for (const { key, count } of survivors) {
      if (deficit === 0) { break }
      if (groupTakes[key] < count) {
        groupTakes[key] += 1
        deficit -= 1
        progressed = true
      }
    }
  }

  return { standardTake, groupTakes }
}

export function assembleWithSpecialQuota({ examples, combinedPlan, maxExamples, random }) {
  const standardPool = []
  const groups = {}
  for (const group of SPECIAL_GROUPS) { groups[group.key] = [] }

  for (const example of examples) {
    const group = SPECIAL_GROUPS.find(g => g.moveKind === example.moveKind)
    if (group) { groups[group.key].push(example) }
    else { standardPool.push(example) }
  }

  // Order each partition once; base + gap-fill slice the same diverse stream.
  const orderedStandard = finalizeExamples(
    standardPool, combinedPlan, Math.min(standardPool.length, maxExamples), random
  )
  const orderedGroups = {}
  for (const group of SPECIAL_GROUPS) {
    const pool = groups[group.key]
    orderedGroups[group.key] = finalizeExamples(
      pool, combinedPlan, Math.min(pool.length, maxExamples), random
    )
  }

  const { standardTake, groupTakes } = planSpecialQuota({
    standardCount: orderedStandard.length,
    groupCounts: SPECIAL_GROUPS.map(g => ({ key: g.key, count: orderedGroups[g.key].length })),
    maxExamples
  })

  const selected = orderedStandard.slice(0, standardTake)
  for (const group of SPECIAL_GROUPS) {
    selected.push(...orderedGroups[group.key].slice(0, groupTakes[group.key]))
  }

  return shuffled(uniqueExamples(selected), random)
}
