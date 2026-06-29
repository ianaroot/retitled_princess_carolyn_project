import { materialValue } from "gameplay/board_query_utils"
import profileCollector from "gameplay/profile_collector"
import { actorTeam } from "bot_execution/actor_teams"
import { aggregateOrNull } from "bot_execution/utils"

const AFTER_BOARD = "after"
const PRIOR_BOARD = "prior"

export function unaryTotal(analysis, { actor, filter = "any", filterMode = null, operator, boardScope = AFTER_BOARD }) {
  switch (actor) {
    case "allied":
    case "enemy":
      return generalSubjectUnaryTotal(analysis, { actor, filter, filterMode, operator, boardScope })
    case "moved_piece":
      return movedPieceUnaryTotal(analysis, { filter, filterMode, operator, boardScope })
    case "enemy_moved_piece":
      return enemyMovedPieceUnaryTotal(analysis, { filter, filterMode, operator, boardScope })
    case "captured_piece":
    case "enemy_captured_piece":
      return capturedActorUnaryTotal(analysis, { actor, filter, filterMode, operator })
    default:
      throw new Error(`Unsupported V2 unary actor: ${actor}`)
  }
}

export function priorComparisonSourceTotal(analysis, { subject, subjectFilter, subjectFilterMode, operator }) {
  return unaryTotal(analysis, { actor: subject, filter: subjectFilter, filterMode: subjectFilterMode, operator, boardScope: PRIOR_BOARD })
}

function generalSubjectUnaryTotal(analysis, { actor, filter = "any", filterMode = null, operator, boardScope = AFTER_BOARD }) {
  return profileCollector.measure('cma.v2.general_subject_unary_total', () => {
    const team = actorTeam(actor, analysis.movedPieceTeam())
    const board = analysis.boardForScope(boardScope)
    const positions = board._positionsOccupiedByTeam(team).filter(position => {
      return analysis.matchesFilter({ species: board.pieceTypeAt(position), filter, filterMode })
    })

    switch (operator) {
      case "count":
        return positions.length
      case "value":
        return profileCollector.measure('cma.v2.general_subject_unary_total.value', () => {
          return aggregateOrNull(positions, position => materialValue(board.pieceTypeAt(position)))
        })
      case "mobility":
        return profileCollector.measure('cma.v2.general_subject_unary_total.mobility', () => {
          return aggregateOrNull(positions, position => analysis.positionMobility(position, boardScope))
        })
      default:
        throw new Error(`Unsupported V2 unary operator for ${actor}: ${operator}`)
    }
  })
}

function movedPieceUnaryTotal(analysis, { filter = "any", filterMode = null, operator, boardScope = AFTER_BOARD }) {
  return profileCollector.measure('cma.v2.moved_piece_unary_total', () => {
    const resolved = analysis.resolvedMovedPiece(boardScope)
    if (!analysis.matchesFilter({ species: resolved.species, filter, filterMode })) { return operator === 'count' ? 0 : null }
    switch (operator) {
      case "count":
        return 1
      case "value":
        return analysis.individualComparableValue(resolved.species)
      case "mobility":
        return analysis.positionMobility(resolved.position, boardScope)
      default:
        throw new Error(`Unsupported V2 unary operator for moved_piece: ${operator}`)
    }
  })
}

function capturedActorUnaryTotal(analysis, { actor, filter = "any", filterMode = null, operator }) {
  const resolved = actor === "captured_piece" ? analysis.resolvedCapturedPiece() : analysis.resolvedEnemyCapturedPiece()
  if (!resolved || !analysis.matchesFilter({ species: resolved.species, filter, filterMode })) { return operator === 'count' ? 0 : null }
  switch (operator) {
    case "count":
      return 1
    case "value":
      return analysis.individualComparableValue(resolved.species)
    default:
      throw new Error(`Unsupported V2 unary operator for ${actor}: ${operator}`)
  }
}

function enemyMovedPieceUnaryTotal(analysis, { filter = "any", filterMode = null, operator, boardScope = AFTER_BOARD }) {
  return profileCollector.measure('cma.v2.enemy_moved_piece_unary_total', () => {
    const resolved = analysis.resolvedEnemyMovedPiece(boardScope)
    if (!resolved) { return operator === 'count' ? 0 : null }
    if (!analysis.matchesFilter({ species: resolved.species, filter, filterMode })) { return operator === 'count' ? 0 : null }
    switch (operator) {
      case "count":
        return 1
      case "value":
        return analysis.individualComparableValue(resolved.species)
      case "mobility":
        // Unclear whether 0 or null is correct when the piece was captured (presentOnBoard = false).
        // 0 allows "enemy moved piece mobility = 0" to match captures (potentially useful);
        // null would treat off-board as undefined and make "mobility < X" fail for captured pieces
        // (consistent with absent-actor null semantics). Currently 0 — revisit if vacuous-truth
        // problems emerge from this path.
        if (!resolved.presentOnBoard) {
          return 0
        } else {
          return analysis.positionMobility(resolved.position, boardScope)
        }
      default:
        throw new Error(`Unsupported V2 unary operator for enemy_moved_piece: ${operator}`)
    }
  })
}
