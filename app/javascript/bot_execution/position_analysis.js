import Board from "gameplay/board"
import { materialValue, relativeRankLabel, relativeToAbsolutePosition } from "gameplay/board_query_utils"
import profileCollector from "gameplay/profile_collector"
import { relationalActorPositions } from "bot_execution/actor_positions"
import { aggregateOrNull, compareValues } from "bot_execution/utils"

const AFTER_BOARD = "after"

export function positionFilteredPositions(analysis, { actor, filter = "any", filterMode = null, positionAxis, positionComparator, positionTarget, boardScope = AFTER_BOARD }) {
  return profileCollector.measure('cma.v2.position_filtered_positions', () => {
    const team = analysis.movedPieceTeam()
    const candidates = relationalActorPositions(analysis, { actor, filter, filterMode, boardScope })
    return candidates.filter(position => positionSatisfied(position, team, { positionAxis, positionComparator, positionTarget }))
  })
}

export function positionMetricTotal(analysis, { positions, operator, boardScope = AFTER_BOARD }) {
  return profileCollector.measure('cma.v2.position_metric_total', () => {
    const board = analysis.boardForScope(boardScope)
    switch (operator) {
      case "count":
        return positions.length
      case "value":
        return aggregateOrNull(positions, position => materialValue(board.pieceTypeAt(position)))
      case "mobility":
        return aggregateOrNull(positions, position => analysis.positionMobility(position, boardScope))
      default:
        throw new Error(`Unsupported position metric operator: ${operator}`)
    }
  })
}


function positionSatisfied(position, team, { positionAxis, positionComparator, positionTarget }) {
  switch (positionAxis) {
    case "rank": {
      const rank = relativeRankLabel(position, team)
      return compareValues(rank, positionComparator, positionTarget)
    }
    case "file": {
      const file = Board.fileIndex(position) + 1
      return compareValues(file, positionComparator, positionTarget)
    }
    case "square": {
      const absoluteTarget = relativeToAbsolutePosition(positionTarget, team)
      return position === absoluteTarget
    }
    default:
      throw new Error(`Unsupported position axis: ${positionAxis}`)
  }
}
