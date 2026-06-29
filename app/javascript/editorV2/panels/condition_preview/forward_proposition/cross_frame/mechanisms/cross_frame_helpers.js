import { pieceCode, pickPlaceableSpecies } from 'editorV2/panels/condition_preview/shared/board_utils'
import { withPiece } from 'editorV2/panels/condition_preview/shared/piece_placement'
import { intersectRegions } from 'editorV2/panels/condition_preview/forward_proposition/region'
import { respectsAllCaps } from 'editorV2/panels/condition_preview/forward_proposition/respect_caps'

// Returns the proposition on the side OPPOSITE moved_piece's role.
// Falls back to currentProposition (which, for related-to entries, IS
// the opposite side by construction).
export function otherSidePropositionFor(entry, role) {
  const candidate = role === 'subject' ? entry.targetProposition : entry.subjectProposition
  return candidate ?? entry.currentProposition ?? null
}

// True when the entry's measured subject is moved_piece — bound singular on a
// unary/census proposition, or a relational side whose region points back at it.
export function entryConcernsMovedPiece(entry) {
  if (entry.currentProposition?.boundSingularActor === 'moved_piece') { return true }
  if (entry.subjectProposition === null && regionPointsToMovedPiece(entry.targetProposition?.region)) { return true }
  if (entry.targetProposition === null && regionPointsToMovedPiece(entry.subjectProposition?.region)) { return true }
  return false
}

function regionPointsToMovedPiece(region) {
  return region?.kind === 'related-to' && region?.actor === 'moved_piece'
}

export function singularSquare(singular) {
  if (singular.region.kind !== 'set') { return null }
  if (singular.region.squares.size !== 1) { return null }
  return [...singular.region.squares][0]
}

export function firstSquareOf(region) {
  if (!region) { return null }
  if (region.kind !== 'set') { return null }
  if (region.squares.size === 0) { return null }
  return [...region.squares][0]
}

export function compareWithDirection(after, prior, direction) {
  if (direction === '+') { return after > prior }
  if (direction === '-') { return after < prior }
  if (direction === '=') { return after === prior }
  return false
}

export function placeableSpecies(speciesSet) {
  const result = []
  for (const s of speciesSet) {
    if (s === null) { continue }
    result.push(s)
  }
  return result
}

// Rate at which mechanisms reject reusing an existing-fitting piece in favor
// of trying a different position with fresh placement (diversity-driven).
// Tunable.
const EXISTING_REUSE_REJECTION_RATE = 0.25

// Ensures the given square holds a piece compatible with (team, speciesSet).
// If a compatible piece already exists, returns pieces unchanged most of the
// time; rejects (returns null) at EXISTING_REUSE_REJECTION_RATE so the
// caller's iteration tries a different position. Otherwise places a new one,
// validating respectsAllCaps. Returns null if no placement is possible.
export function ensureRolePieceAt({ pieces, pos, team, speciesSet, ctx, random }) {
  const existing = pieces.get(pos)
  if (existing) {
    if (random() < EXISTING_REUSE_REJECTION_RATE) { return null }
    return pieces
  }
  const species = pickPlaceableSpecies(speciesSet, pos, random)
  if (species === null) { return null }
  if (!respectsAllCaps(team, species, pos, ctx, pieces)) { return null }
  return withPiece(pieces, pos, pieceCode(team, species))
}

// Narrows moved_piece.priorRegion by intersecting with `candidates`. Returns
// `pieces` (mutating ctx's priorRegion) when the intersection is non-empty,
// or null when the narrowing leaves no valid origin.
export function commitPriorRegion(ctx, candidates, pieces) {
  const proposed = { kind: 'set', squares: new Set(candidates) }
  const moved = ctx.singulars.moved_piece
  const intersected = intersectRegions(moved.priorRegion, proposed)
  if (intersected.kind === 'set' && intersected.squares.size === 0) { return null }
  moved.priorRegion = intersected
  return pieces
}
