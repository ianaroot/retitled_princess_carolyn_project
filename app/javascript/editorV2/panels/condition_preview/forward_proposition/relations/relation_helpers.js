import { ALL_POSITIONS, WEIGHTED_SPECIES_DISTRIBUTION, pieceCode } from 'editorV2/panels/condition_preview/shared/board_utils'
import { materialValue } from 'gameplay/board_query_utils'
import { withPiece, legalPlacementForSpecies } from 'editorV2/panels/condition_preview/shared/piece_placement'
import { respectsAllCaps } from 'editorV2/panels/condition_preview/forward_proposition/respect_caps'
import { regionPossiblyContains } from 'editorV2/panels/condition_preview/forward_proposition/region'

export { regionPossiblyContains }

// Cap on iterations for relation satisfiers' count/value loops. Covers count_range
// up to ~10 and aggregate_value up to ~30 (worst-case low-value species).
// Relation satisfiers do NOT enforce count_range.max or aggregate_value_range.max
// — only mins. Max enforcement is deferred.
export const MAX_SATISFY_ITERATIONS = 30

export function requirementsMet({ subjectSide, targetSide, activeSubjects, activeTargets, pieces }) {
  if (activeSubjects.size < subjectSide.count_range.min) { return false }
  if (activeTargets.size  < targetSide.count_range.min)  { return false }
  if (sumValues(activeSubjects, pieces) < subjectSide.aggregate_value_range.min) { return false }
  if (sumValues(activeTargets,  pieces) < targetSide.aggregate_value_range.min)  { return false }
  return true
}

function sumValues(positions, pieces) {
  let total = 0
  for (const pos of positions) {
    const piece = pieces.get(pos)
    if (piece) { total += materialValue(piece.slice(1)) }
  }
  return total
}

export function matchesSide(piece, side) {
  if (!piece) { return false }
  return piece.charAt(0) === side.team && side.species_set.has(piece.slice(1))
}

export function candidatesForSide(side, pieces) {
  const candidates = []
  for (const [pos, piece] of pieces) {
    if (matchesSide(piece, side)) {
      candidates.push({ kind: 'existing', position: pos, species: piece.slice(1) })
    }
  }
  for (const species of WEIGHTED_SPECIES_DISTRIBUTION) {
    if (!side.species_set.has(species)) { continue }
    for (const pos of ALL_POSITIONS) {
      if (pieces.has(pos)) { continue }
      if (!legalPlacementForSpecies(pos, species)) { continue }
      if (!regionPossiblyContains(side.region, pos)) { continue }
      candidates.push({ kind: 'fresh', position: pos, species, team: side.team })
    }
  }
  return candidates
}

export function applyOne(pieces, candidate, ctx, options = {}) {
  if (candidate.kind === 'existing') { return pieces }
  if (!respectsAllCaps(candidate.team, candidate.species, candidate.position, ctx, pieces, options)) { return null }
  return withPiece(pieces, candidate.position, pieceCode(candidate.team, candidate.species))
}

export function singularPosition(ctx, actorKey) {
  if (!actorKey) { return null }
  const singular = ctx?.singulars?.[actorKey]
  if (!singular) { return null }
  if (singular.region.kind !== 'set' || singular.region.squares.size !== 1) { return null }
  return [...singular.region.squares][0]
}

export function boundSingularInActiveSet(sideObj, activeSet, ctx) {
  if (!sideObj.boundSingularActor) { return true }
  const pos = singularPosition(ctx, sideObj.boundSingularActor)
  if (pos === null) { return false }
  return activeSet.has(pos)
}

export function sideAllowsPos(side, pos) {
  if (side.region?.kind !== 'set') { return true }
  return side.region.squares.has(pos)
}
