import Board from 'gameplay/board'
import { legalPlacementForSpecies, pawnCount, PAWN_CAP_PER_TEAM } from 'editorV2/panels/condition_preview/shared/piece_placement'

export const HOME_RANK = Object.freeze({ [Board.WHITE]: 0, [Board.BLACK]: 7 })

export function pieceCode(team, species) {
  return `${team}${species}`
}

export function unique(values) {
  return Array.from(new Set(values))
}

export const WEIGHTED_SPECIES_DISTRIBUTION = Object.freeze([
  Board.PAWN, Board.PAWN, Board.PAWN, Board.PAWN,
  Board.PAWN, Board.PAWN, Board.PAWN, Board.PAWN,
  Board.ROOK, Board.ROOK,
  Board.NIGHT, Board.NIGHT,
  Board.BISHOP, Board.BISHOP,
  Board.QUEEN,
  Board.KING
])

export const ALL_POSITIONS = Object.freeze(Array.from({ length: 64 }, (_, i) => i))

export function shuffled(values, random) {
  const copy = [...values]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const current = copy[index]
    copy[index] = copy[swapIndex]
    copy[swapIndex] = current
  }
  return copy
}

// Picks one species from speciesSet, weighted by WEIGHTED_SPECIES_DISTRIBUTION.
// Returns null when the intersection is empty.
export function pickWeightedSpecies(speciesSet, random) {
  const pool = WEIGHTED_SPECIES_DISTRIBUTION.filter(s => speciesSet.has(s))
  if (pool.length === 0) { return null }
  return pool[Math.floor(random() * pool.length)]
}

export function pickPlaceableSpecies(speciesSet, position, random) {
  const placeable = new Set()
  for (const species of speciesSet) {
    if (species === null) { continue }
    if (!legalPlacementForSpecies(position, species)) { continue }
    placeable.add(species)
  }
  if (placeable.size === 0) { return null }
  return pickWeightedSpecies(placeable, random)
}

// Returns the unique species in speciesSet ordered by weighted-random.
// Higher-weight species (e.g. pawns) tend to come earlier.
export function weightedShuffleSpecies(speciesSet, random) {
  const pool = WEIGHTED_SPECIES_DISTRIBUTION.filter(s => speciesSet.has(s))
  const shuffledPool = shuffled(pool, random)
  const seen = new Set()
  const result = []
  for (const s of shuffledPool) {
    if (seen.has(s)) { continue }
    seen.add(s)
    result.push(s)
  }
  return result
}

export function pickBlockerTeam(target, random) {
  if (target.species === Board.NIGHT || target.species === Board.KING) {
    return target.team
  }
  return random() < 0.5 ? target.team : Board.opposingTeam(target.team)
}

function blockerSpeciesFor(position) {
  return WEIGHTED_SPECIES_DISTRIBUTION.filter(
    s => s !== Board.KING && legalPlacementForSpecies(position, s)
  )
}

export function orderedBlockerSpeciesFor(position, random) {
  return weightedShuffleSpecies(new Set(blockerSpeciesFor(position)), random)
}

export function buildLayoutFromPieces(pieces) {
  const layout = Array(64).fill(Board.EMPTY_SQUARE)
  pieces.forEach((piece, position) => {
    layout[position] = piece
  })
  return layout
}

export function buildBoardFromLayout(layout, recentMoveContext = null, allowedToMove = Board.WHITE) {
  return new Board({
    layOut: layout,
    capturedPieces: [],
    allowedToMove,
    movementNotation: [],
    recentMoveContext
  })
}

export function layoutsMatch(left, right) {
  if (left.length !== right.length) { return false }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) { return false }
  }
  return true
}

export function doublePushSkippedSquare(start, end) {
  const sameFile = Board.fileIndex(start) === Board.fileIndex(end)
  const twoRanks = Math.abs(Board.rankIndex(end) - Board.rankIndex(start)) === 2
  return sameFile && twoRanks ? (start + end) / 2 : null
}

export function legalEnrichmentSpecies(pieces, team) {
  const excludePawns = pawnCount(pieces, team) >= PAWN_CAP_PER_TEAM
  return WEIGHTED_SPECIES_DISTRIBUTION.filter(species => {
    if (species === Board.KING) { return false }
    if (species === Board.PAWN && excludePawns) { return false }
    return true
  })
}

