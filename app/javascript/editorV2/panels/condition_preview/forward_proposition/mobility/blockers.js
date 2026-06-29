import Rules from 'gameplay/rules'
import { buildBoardFromLayout, buildLayoutFromPieces, pieceCode, shuffled, pickBlockerTeam, orderedBlockerSpeciesFor } from 'editorV2/panels/condition_preview/shared/board_utils'
import { withPiece, teamHasKing } from 'editorV2/panels/condition_preview/shared/piece_placement'
import { placeKingDeliberately } from 'editorV2/panels/condition_preview/shared/king_placement'
import { respectsAllCaps } from 'editorV2/panels/condition_preview/forward_proposition/respect_caps'

export const blockersMechanism = {
  name: 'blockers',

  appliesTo(target, ctx, frame, pieces) { return true },

  apply(target, ctx, frame, pieces, random) {
    if (!teamHasKing(pieces, target.team)) {
      const next = placeKingDeliberately(pieces, target.team, frame, ctx, random)
      if (next === null) { return null }
      pieces = next
    }
    const blockerTeam = pickBlockerTeam(target, random)
    const candidates = shuffled(emptyReachableSquares(target, pieces), random)
    for (const square of candidates) {
      for (const species of orderedBlockerSpeciesFor(square, random)) {
        if (!respectsAllCaps(blockerTeam, species, square, ctx, pieces)) { continue }
        const next = withPiece(pieces, square, pieceCode(blockerTeam, species))
        if (next !== null) { return next }
      }
    }
    return null
  }
}

function emptyReachableSquares(target, pieces) {
  const board = buildBoardFromLayout(buildLayoutFromPieces(pieces))
  const moves = Rules.availableMovesFrom({ board, startPosition: target.position })
  const unique = []
  const seen = new Set()
  for (const move of moves) {
    if (seen.has(move.endPosition)) { continue }
    seen.add(move.endPosition)
    if (pieces.has(move.endPosition)) { continue }
    unique.push(move.endPosition)
  }
  return unique
}

