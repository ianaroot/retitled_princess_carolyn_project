import { findCombinatorialQualifyingKeys } from 'bot_execution/relational_qualifying'
import { shieldAttackerPositions } from 'editorV2/panels/condition_preview/shared/relational_utils'
import { relationSubjectRole, relationTargetRole } from 'editorV2/panels/condition_preview/shared/highlight_roles'
import {
  PRIOR_BOARD_COMPARISON_SOURCE,
  COUNT_COMPARISON_METRIC,
  AGGREGATE_VALUE_METRIC
} from 'editorV2/panels/condition_preview/plans/comparison_requirements'

function descriptorAllowsZeroPairs(descriptor) {
  const { comparator, source } = descriptor
  if (source === PRIOR_BOARD_COMPARISON_SOURCE) {
    return comparator === 'less_than' || comparator === 'less_than_or_equal_to' || comparator === 'equal_to'
  }
  const total = Number((descriptor.resolvedTotal ?? descriptor.total) || 0)
  switch (comparator) {
    case 'equal_to': return total === 0
    case 'less_than': return total > 0
    case 'less_than_or_equal_to': return total >= 0
    default: return false
  }
}

// ===== buildAggregatedResult =====

function combinatorialFilterArgs(plan) {
  const descriptors = plan.comparisonDescriptors ?? []
  const subjectDescriptor = descriptors.find(d => d.side === 'subject')
  const targetDescriptor = descriptors.find(d => d.side === 'target')

  const descriptorTotal = (descriptor) => Number((descriptor.resolvedTotal ?? descriptor.total) || 0)

  if (subjectDescriptor?.metric === COUNT_COMPARISON_METRIC && targetDescriptor?.metric === AGGREGATE_VALUE_METRIC) {
    return {
      groupBySide: 'subject', valueSide: 'target',
      valueComparator: targetDescriptor.comparator,
      valueReferenceTotal: descriptorTotal(targetDescriptor),
      countComparator: subjectDescriptor.comparator,
      countReferenceTotal: descriptorTotal(subjectDescriptor)
    }
  }

  if (subjectDescriptor?.metric === AGGREGATE_VALUE_METRIC && targetDescriptor?.metric === COUNT_COMPARISON_METRIC) {
    return {
      groupBySide: 'target', valueSide: 'subject',
      valueComparator: subjectDescriptor.comparator,
      valueReferenceTotal: descriptorTotal(subjectDescriptor),
      countComparator: targetDescriptor.comparator,
      countReferenceTotal: descriptorTotal(targetDescriptor)
    }
  }

  return null
}

function applyCombinatorialFilter(plan, result, analysis) {
  const args = combinatorialFilterArgs(plan)
  if (!args) { return result }

  const qualifyingKeys = findCombinatorialQualifyingKeys({
    pairs: result.pairs, board: analysis.afterBoard(), ...args
  })
  if (qualifyingKeys === null) { return result }

  const keySet = new Set(qualifyingKeys)
  const filteredPairs = result.pairs.filter(pair => {
    const key = args.groupBySide === 'subject' ? pair.subjectPosition : pair.targetPosition
    return keySet.has(key)
  })

  return {
    pairs: filteredPairs,
    subjectPositions: [...new Set(filteredPairs.map(p => p.subjectPosition))],
    targetPositions: [...new Set(filteredPairs.map(p => p.targetPosition))]
  }
}

function censusSubjectPositions(plan, analysis, boardScope = 'after') {
  if (plan.positionAxis) {
    return analysis.actorPositionsInRegion({
      actor: plan.subject,
      filter: plan.subjectFilter,
      filterMode: plan.subjectFilterMode,
      positionAxis: plan.positionAxis,
      positionComparator: plan.positionComparator,
      positionTarget: plan.positionTarget,
      boardScope
    })
  }
  return analysis.relationalActorPositions({
    actor: plan.subject,
    filter: plan.subjectFilter,
    filterMode: plan.subjectFilterMode,
    boardScope
  })
}

function comparesAgainstPriorBoard(plan) {
  return (plan.comparisonDescriptors ?? []).some(d => d.source === PRIOR_BOARD_COMPARISON_SOURCE)
}

export function buildAggregatedResult(combinedPlan, analysis) {
  let subjectPositions = []
  let targetPositions = []
  let pairs = []
  const contributions = []

  for (const plan of combinedPlan.plans) {
    if (plan.kind === 'relational') {
      // same_piece bypasses pair-aggregation — both actors resolve to the same
      // square (the captured piece's prior position).
      if (plan.operator === 'same_piece') {
        const capturedPos = analysis.capturedPiecePosition()
        if (capturedPos !== null && capturedPos !== undefined) {
          subjectPositions.push(capturedPos)
          targetPositions.push(capturedPos)
          pairs.push({ subject: capturedPos, target: capturedPos })
          contributions.push({
            operator: 'same_piece',
            subjectActor: null,
            targetActor: null,
            subjectPositions: [capturedPos],
            targetPositions: [capturedPos],
            pairs: []
          })
        }
        continue
      }
      const rawResult = analysis.relationalResult(plan.relationParams)
      if (rawResult.pairs.length === 0 && !plan.comparisonDescriptors?.some(descriptorAllowsZeroPairs)) { return null }
      const result = applyCombinatorialFilter(plan, rawResult, analysis)
      subjectPositions = [...subjectPositions, ...result.subjectPositions]
      targetPositions = [...targetPositions, ...result.targetPositions]
      pairs = [...pairs, ...result.pairs]
      const contribution = {
        operator: plan.operator,
        subjectActor: plan.subject,
        targetActor: plan.target,
        subjectPositions: result.subjectPositions,
        targetPositions: result.targetPositions,
        pairs: result.pairs
      }
      if (comparesAgainstPriorBoard(plan)) {
        // Unfiltered on purpose — we want the literal prior relationships, not
        // the combinatorial-filtered view (which is an after-board projection).
        const priorRaw = analysis.relationalResult({ ...plan.relationParams, boardScope: 'prior' })
        contribution.priorSubjectPositions = priorRaw.subjectPositions
        contribution.priorTargetPositions = priorRaw.targetPositions
        contribution.priorPairs = priorRaw.pairs
      }
      contributions.push(contribution)
    } else if (plan.kind === 'census') {
      // Kept out of the subjectPositions union so movedPieceInRelation /
      // variantType (in example_factory + enrichment) stays relational-only.
      const positions = censusSubjectPositions(plan, analysis)
      const contribution = {
        kind: 'census',
        subjectActor: plan.subject,
        subjectPositions: positions,
        positionAxis: plan.positionAxis ?? null
      }
      if (comparesAgainstPriorBoard(plan)) {
        contribution.priorSubjectPositions = censusSubjectPositions(plan, analysis, 'prior')
      }
      contributions.push(contribution)
    }
  }

  return {
    subjectPositions: [...new Set(subjectPositions)],
    targetPositions: [...new Set(targetPositions)],
    pairs,
    contributions
  }
}

// ===== buildAggregatedHighlights =====

function addRole(map, key, positions) {
  if (!positions || positions.length === 0) { return }
  const set = map[key] || (map[key] = new Set())
  positions.forEach(p => set.add(p))
}

function rolesToArrays(map) {
  const out = {}
  for (const key of Object.keys(map)) { out[key] = [...map[key]] }
  return out
}

export function buildAggregatedHighlights(combinedPlan, moveObject, aggregatedResult, priorBoard, afterBoard) {
  const start = moveObject.startPosition
  const end = moveObject.endPosition
  const prior = {}
  const after = {}

  for (const c of aggregatedResult.contributions) {
    if (c.kind === 'census') {
      if (!c.positionAxis) { continue }
      const priorPos = c.priorSubjectPositions
        ?? (c.subjectActor === 'moved_piece' ? [start] : c.subjectPositions)
      addRole(prior, 'positionSubject', priorPos)
      addRole(after, 'positionSubject', c.subjectPositions)
      continue
    }

    const subjectRole = relationSubjectRole(c.operator)
    const targetRole = relationTargetRole(c.operator)

    addRole(after, subjectRole, c.subjectPositions)
    addRole(after, targetRole, c.targetPositions)
    let afterAttackers = null
    if (c.operator === 'shield' && c.pairs.length > 0) {
      afterAttackers = shieldAttackerPositions(c.pairs, afterBoard)
      addRole(after, 'attacker', afterAttackers)
    }

    if (c.priorPairs) {
      addRole(prior, subjectRole, c.priorSubjectPositions)
      addRole(prior, targetRole, c.priorTargetPositions)
      if (c.operator === 'shield' && c.priorPairs.length > 0) {
        addRole(prior, 'attacker', shieldAttackerPositions(c.priorPairs, priorBoard))
      }
    } else {
      addRole(prior, subjectRole, c.subjectActor === 'moved_piece' ? [start] : c.subjectPositions)
      addRole(prior, targetRole, c.targetActor === 'moved_piece' ? [start] : c.targetPositions)
      // Non-PBS shield: relationship holds on both boards, so reuse the after attacker.
      if (afterAttackers) { addRole(prior, 'attacker', afterAttackers) }
    }
  }

  return {
    prior: { roles: rolesToArrays(prior), movedStartPosition: start, movedEndPosition: end },
    after: { roles: rolesToArrays(after), movedStartPosition: start, movedEndPosition: end }
  }
}
