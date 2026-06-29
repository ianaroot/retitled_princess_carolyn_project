import Board from 'gameplay/board'
import {
  buildBoardFromLayout, buildLayoutFromPieces, pieceCode, shuffled
} from 'editorV2/panels/condition_preview/shared/board_utils'
import { adjacentNeighborPositions, attackerCandidatesFor } from 'editorV2/panels/condition_preview/shared/geometry_utils'
import { withPiece } from 'editorV2/panels/condition_preview/shared/piece_placement'
import { respectsAllCaps } from 'editorV2/panels/condition_preview/forward_proposition/respect_caps'

const ENEMY_ATTACKER_SPECIES = Object.freeze([
  Board.QUEEN, Board.ROOK, Board.BISHOP, Board.NIGHT, Board.PAWN
])

export const kingAdjacentControlMechanism = {
  name: 'king_adjacent_control',

  appliesTo(target, ctx, frame, pieces) {
    return target.species === Board.KING
  },

  apply(target, ctx, frame, pieces, random) {
    const enemyTeam = Board.opposingTeam(target.team)
    const board = buildBoardFromLayout(buildLayoutFromPieces(pieces))
    const adjacents = shuffled(adjacentNeighborPositions(target.position), random)
    for (const adjacentSquare of adjacents) {
      const occupant = pieces.get(adjacentSquare)
      if (occupant && occupant.charAt(0) === target.team) { continue }
      const result = tryPlaceEnemyAttacker(adjacentSquare, target.position, enemyTeam, board, ctx, pieces, random)
      if (result !== null) { return result }
    }
    return null
  }
}

function tryPlaceEnemyAttacker(targetSquare, kingPosition, enemyTeam, board, ctx, pieces, random) {
  for (const species of shuffled(ENEMY_ATTACKER_SPECIES, random)) {
    // Reject placements that would also attack the king's own square. Without
    // this filter a slider on the same line as the king (e.g. rook at a4 to
    // cover c4 of a king at d4) puts the king in check on the after-board,
    // illegal since the moving team just moved.
    const kingAttackerSet = new Set(attackerCandidatesFor(kingPosition, species, enemyTeam, board))
    const attackerPositions = shuffled(
      attackerCandidatesFor(targetSquare, species, enemyTeam, board),
      random
    )
    for (const attackerPos of attackerPositions) {
      if (kingAttackerSet.has(attackerPos)) { continue }
      if (!respectsAllCaps(enemyTeam, species, attackerPos, ctx, pieces)) { continue }
      const next = withPiece(pieces, attackerPos, pieceCode(enemyTeam, species))
      if (next !== null) { return next }
    }
  }
  return null
}
