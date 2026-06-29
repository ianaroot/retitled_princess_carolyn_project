import { buildBoardFromLayout, buildLayoutFromPieces, pieceCode } from 'editorV2/panels/condition_preview/shared/board_utils'
import { withPiece, teamHasKing } from 'editorV2/panels/condition_preview/shared/piece_placement'
import {
  originCandidatesForSpecies, sliderPathClear
} from 'editorV2/panels/condition_preview/shared/geometry_utils'
import { placeKingDeliberately } from 'editorV2/panels/condition_preview/shared/king_placement'
import { mobilityAt } from 'gameplay/mobility'

// Origin candidates for moved_piece moving to `destination`: same-species
// reachability, not already occupied, and a clear path on the pieces map.
export function legalOriginCandidates(pieces, destination, team, species) {
  return originCandidatesForSpecies(destination, species, team)
    .filter(p => p !== destination && !pieces.has(p))
    .filter(p => sliderPathClear(pieces, p, destination, species))
}

// Returns a new pieces map with moved_piece relocated from `fromSquare` to
// `toSquare`. Returns null if the relocation would be an illegal placement.
export function piecesWithMovedAt(pieces, fromSquare, toSquare, team, species) {
  const result = new Map(pieces)
  result.delete(fromSquare)
  return withPiece(result, toSquare, pieceCode(team, species))
}

// Mobility-at-queryPos on a hypothetical board where moved_piece has been
// moved from `fromSquare` to `toSquare`. Returns null if the hypothetical
// placement is illegal.
export function hypotheticalMobilityAt(pieces, fromSquare, toSquare, team, species, queryPos = toSquare) {
  const hypo = piecesWithMovedAt(pieces, fromSquare, toSquare, team, species)
  if (hypo === null) { return null }
  const board = buildBoardFromLayout(buildLayoutFromPieces(hypo))
  return mobilityAt(board, queryPos)
}

export function directionSatisfied(direction, afterMobility, priorMobility) {
  if (afterMobility === null || priorMobility === null) { return false }
  if (direction === '+') { return afterMobility > priorMobility }
  if (direction === '-') { return afterMobility < priorMobility }
  if (direction === '=') { return afterMobility === priorMobility }
  return false
}

export function ensureEnemyKingPlaced(pieces, ctx, random) {
  if (teamHasKing(pieces, ctx.enemyTeam)) { return pieces }
  return placeKingDeliberately(pieces, ctx.enemyTeam, 'current', ctx, random)
}
