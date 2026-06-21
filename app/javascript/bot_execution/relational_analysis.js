import {
  adjacentPositions,
  cachedControlledSquares,
  coveredPositions,
  materialValue,
  shieldedPositions
} from "gameplay/board_query_utils"
import profileCollector from "gameplay/profile_collector"
import { unaryTotal } from "bot_execution/unary_analysis"
import { relationalActorPositions as baseRelationalActorPositions } from "bot_execution/actor_positions"
import { actorTeam } from "bot_execution/actor_teams"

const AFTER_BOARD = "after"
const PRIOR_BOARD = "prior"

export function samePiece(analysis, { subject, target, subjectFilter = "any", subjectFilterMode = null }) {
  if (
    (subject === "enemy_moved_piece" && target === "captured_piece") ||
    (subject === "captured_piece" && target === "enemy_moved_piece")
  ) {
    return enemyMovedPieceMatchesCapturedPiece(analysis, { subjectFilter, subjectFilterMode })
  } else {
    throw new Error(`Unsupported V2 samePiece comparison: ${subject} vs ${target}`)
  }
}

function enemyMovedPieceMatchesCapturedPiece(analysis, { subjectFilter = "any", subjectFilterMode = null } = {}) {
  const recentMove = analysis.board.recentMoveContext
  const capturedPiecePosition = analysis.capturedPiecePosition()
  const capturedPieceSpecies = analysis.capturedPieceSpecies()
  if (!recentMove || capturedPiecePosition === null || capturedPieceSpecies === null) {
    return false
  }
  return (
    recentMove.movedPieceEndPosition === capturedPiecePosition &&
    recentMove.movedPieceSpeciesAfterMove === capturedPieceSpecies &&
    analysis.matchesFilter({ species: capturedPieceSpecies, filter: subjectFilter, filterMode: subjectFilterMode })
  )
}

export function relationalResult(analysis, { subject, subjectFilter = "any", subjectFilterMode = null,
  operator,
  target, targetFilter = "any", targetFilterMode = null, boardScope = AFTER_BOARD
}) {
  const cacheKey = [
    boardScope,
    subject,
    subjectFilter,
    subjectFilterMode || "include",
    operator,
    target,
    targetFilter,
    targetFilterMode || "include"
  ].join(":")

  return analysis.cachedRelationalResult(cacheKey, () => {
    return profileCollector.measure('cma.v2.relational_result', () => {
      const candidateSubjectPositions = relationalActorPositions(analysis, { actor: subject, filter: subjectFilter, filterMode: subjectFilterMode, boardScope })
      const candidateTargetPositions = relationalActorPositions(analysis, { actor: target, filter: targetFilter, filterMode: targetFilterMode, boardScope })
      const candidateTargetPositionSet = profileCollector.measure('cma.v2.relational_result.target_set', () => new Set(candidateTargetPositions))
      const pairs = []
      candidateSubjectPositions.forEach((subjectPosition) => {
        const relatedTargetPositions = relatedTargetPositionsForSubject(analysis, { operator, subjectPosition, target, boardScope })
        relatedTargetPositions.forEach((targetPosition) => {
          if (!candidateTargetPositionSet.has(targetPosition)) { return }
          pairs.push({ subjectPosition, targetPosition })
        })
      })
      return {
        pairs,
        subjectPositions: analysis.uniquePositions(pairs.map(pair => pair.subjectPosition)),
        targetPositions: analysis.uniquePositions(pairs.map(pair => pair.targetPosition))
      }
    })
  })
}

export function relationalActorPositions(analysis, { actor, filter = "any", filterMode = null, boardScope = AFTER_BOARD }) {
  const cacheKey = `${boardScope}:${actor}:${filter}:${filterMode || "include"}`

  return analysis.cachedRelationalActorPositions(cacheKey, () => {
    return profileCollector.measure('cma.v2.relational_actor_positions', () => {
      return baseRelationalActorPositions(analysis, { actor, filter, filterMode, boardScope })
    })
  })
}


function relatedTargetPositionsForSubject(analysis, { operator, subjectPosition, target, boardScope = AFTER_BOARD }) {
  const cacheKey = `${boardScope}:${operator}:${subjectPosition}:${target}`

  return analysis.cachedRelatedTargetPositions(cacheKey, () => {
    return profileCollector.measure('cma.v2.related_target_positions_for_subject', () => {
      const board = analysis.boardForScope(boardScope)
      const targetTeam = actorTeam(target, analysis.movedPieceTeam())
      const boardQueryCache = analysis.boardQueryCache()
      let positions
      switch (operator) {
        case "attack":
        case "defend": {
          const subjectTeam = board.teamAt(subjectPosition)
          const sameTeam = operator === "defend"
          positions = cachedControlledSquares({
            board,
            attackerPosition: subjectPosition,
            cache: boardQueryCache,
            cacheScope: boardScope
          }).filter((targetPosition) => {
            const occupantOnTargetTeam = board.teamAt(targetPosition) === targetTeam
            return occupantOnTargetTeam && (sameTeam ? targetTeam === subjectTeam : targetTeam !== subjectTeam)
          })
          break
        }
        case "adjacent":
          positions = adjacentPositions({ board, targetPosition: subjectPosition, team: targetTeam })
          break
        case "shield":
          positions = shieldedPositions({ board, sourcePosition: subjectPosition, team: targetTeam })
          break
        case "cover":
          positions = coveredPositions({
            board,
            sourcePosition: subjectPosition,
            team: targetTeam,
            cache: boardQueryCache,
            cacheScope: boardScope
          })
          break
        default:
          throw new Error(`Unsupported V2 relational operator: ${operator}`)
      }
      return positions
    })
  })
}

export function metricForPositions(analysis, { metric, positions, boardScope = AFTER_BOARD }) {
  return profileCollector.measure('cma.v2.metric_for_positions', () => {
    switch (metric) {
      case "count":
        return positions.length
      case "individual_value":
      case "aggregate_value":
        return valueOfPositions(analysis, positions, boardScope)
      default:
        throw new Error(`Unsupported V2 relational metric: ${metric}`)
    }
  })
}

function valueOfPositions(analysis, positions, boardScope = AFTER_BOARD) {
  if (positions.length === 0) { return null }
  const board = analysis.boardForScope(boardScope)
  return positions.reduce((sum, position) => {
    return sum + materialValue(board.pieceTypeAt(position))
  }, 0)
}

export function comparisonSourceTotal(analysis, { comparisonSource, subject, subjectFilter = "any", subjectFilterMode = null, operator }) {
  return profileCollector.measure('cma.v2.comparison_source_total', () => {
    switch (comparisonSource) {
      case "moved_piece":
      case "enemy_moved_piece":
      case "captured_piece":
      case "enemy_captured_piece":
        return analysis.singularActorValue(comparisonSource)
      case "prior_board_state":
        return priorRelationalComparisonSourceTotal(analysis, { subject, subjectFilter, subjectFilterMode, operator })
      default:
        throw new Error(`Unsupported V2 comparison source: ${comparisonSource}`)
    }
  })
}

function priorRelationalComparisonSourceTotal(analysis, { subject, subjectFilter, subjectFilterMode, operator }) {
  return unaryTotal(analysis, { actor: subject, filter: subjectFilter, filterMode: subjectFilterMode, operator, boardScope: PRIOR_BOARD })
}
