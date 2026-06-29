import { pieceCode } from 'editorV2/panels/condition_preview/shared/board_utils'
import { withPiece } from 'editorV2/panels/condition_preview/shared/piece_placement'
import { committedSpecies } from 'editorV2/panels/condition_preview/shared/singular_constraints'

export function placeSingulars(singulars, initialPieces = new Map()) {
  let pieces = placeIfNotAlready(singulars.moved_piece, initialPieces)
  if (pieces === null) { return null }
  if (singulars.enemy_moved_piece !== singulars.captured_piece) {
    pieces = placeIfNotAlready(singulars.enemy_moved_piece, pieces)
    if (pieces === null) { return null }
  }
  return pieces
}

function placeIfNotAlready(singular, pieces) {
  const species = committedSpecies(singular)
  if (species === null) { return pieces }
  if (singular.region.kind !== 'set') { return pieces }
  const squareCount = singular.region.squares.size
  if (squareCount === 0) { return null }
  if (squareCount !== 1) { return pieces }
  const position = [...singular.region.squares][0]
  const expectedCode = pieceCode(singular.team, species)
  if (pieces.has(position)) {
    return pieces.get(position) === expectedCode ? pieces : null
  }
  return withPiece(pieces, position, expectedCode)
}
