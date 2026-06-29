import Board from 'gameplay/board'

export const PAWN_CAP_PER_TEAM = 8

export function legalPlacementForSpecies(position, species) {
  if (species !== Board.PAWN) { return true }
  const rank = Board.rankIndex(position)
  return rank !== 0 && rank !== 7
}

export function teamHasKing(pieces, team) {
  const code = `${team}${Board.KING}`
  for (const piece of pieces.values()) {
    if (piece === code) { return true }
  }
  return false
}

export function positionOfKing(pieces, team) {
  const code = `${team}${Board.KING}`
  for (const [pos, piece] of pieces) {
    if (piece === code) { return pos }
  }
  return null
}

export function pawnCount(pieces, team) {
  const code = `${team}${Board.PAWN}`
  let count = 0
  for (const piece of pieces.values()) {
    if (piece === code) { count += 1 }
  }
  return count
}

function teamOf(piece) { return piece.charAt(0) }
function speciesOf(piece) { return piece.slice(1) }

export function withPiece(pieces, position, piece) {
  if (pieces.has(position)) { return null }
  const species = speciesOf(piece)
  const team = teamOf(piece)

  if (!legalPlacementForSpecies(position, species)) { return null }
  if (species === Board.KING && teamHasKing(pieces, team)) { return null }
  if (species === Board.PAWN && pawnCount(pieces, team) >= PAWN_CAP_PER_TEAM) { return null }

  const result = new Map(pieces)
  result.set(position, piece)
  return result
}

