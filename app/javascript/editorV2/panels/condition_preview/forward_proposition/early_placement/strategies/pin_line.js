import Board from 'gameplay/board'
import { QUEEN_RAY_STEPS } from 'gameplay/board_query_utils'
import { ALL_POSITIONS, shuffled, pieceCode, pickWeightedSpecies } from 'editorV2/panels/condition_preview/shared/board_utils'
import { withPiece, legalPlacementForSpecies } from 'editorV2/panels/condition_preview/shared/piece_placement'
import { placeKingOnRayThroughTarget } from 'editorV2/panels/condition_preview/shared/king_placement'
import { placeSliderBeyondTarget } from 'editorV2/panels/condition_preview/forward_proposition/pin_geometry'
import { respectsAllCaps } from 'editorV2/panels/condition_preview/forward_proposition/respect_caps'
import { commitSingularRegion } from 'editorV2/panels/condition_preview/shared/singular_constraints'

// Pin-line strategy: places the mobility-constrained target piece on a ray,
// with own king on one side (the pin anchor) and an enemy slider on the
// other side (the pinning attacker). Caps simultaneous pins via ctx.pinState
export const pinLineStrategy = {
  name: 'pin-line',
  constraintKind: 'mobility',

  appliesTo(constraint, ctx, pieces, pool) {
    if (ctx.pinState.count >= ctx.pinState.max) { return false }
    if (constraint.region.kind === 'related-to') { return false }
    if (!hasNonKingSpecies(constraint.species_set)) { return false }
    return true
  },

  apply(constraint, ctx, pieces, pool, random) {
    if (ctx.pinState.count >= ctx.pinState.max) { return null }

    const candidates = filterPoolForConstraint(pool, constraint)
    for (const entry of shuffled(candidates, random)) {
      const next = tryPinLineForEntry(entry, constraint, ctx, pieces, random)
      if (next !== null) {
        ctx.pinState.count += 1
        return next
      }
    }
    return null
  }
}

function hasNonKingSpecies(speciesSet) {
  for (const s of speciesSet) {
    if (s !== Board.KING && s !== null) { return true }
  }
  return false
}

function filterPoolForConstraint(pool, constraint) {
  if (constraint.boundSingularActor) {
    return pool.filter(entry =>
      entry.source === 'singular' && entry.actorKey === constraint.boundSingularActor
    )
  }
  return pool.filter(entry => {
    if (entry.team !== constraint.team) { return false }
    return speciesOverlap(entry.speciesOptions, constraint.species_set)
  })
}

function speciesOverlap(a, b) {
  for (const species of a) {
    if (species === null || species === Board.KING) { continue }
    if (b.has(species)) { return true }
  }
  return false
}

function tryPinLineForEntry(entry, constraint, ctx, pieces, random) {
  const targetSquares = candidateTargetSquares(constraint)
  for (const targetPos of shuffled(targetSquares, random)) {
    if (pieces.has(targetPos)) { continue }
    for (const step of shuffled(QUEEN_RAY_STEPS, random)) {
      const next = tryAtTargetAndStep(entry, constraint, targetPos, step, ctx, pieces, random)
      if (next !== null) { return next }
    }
  }
  return null
}

function candidateTargetSquares(constraint) {
  if (constraint.region.kind === 'all') { return [...ALL_POSITIONS] }
  if (constraint.region.kind === 'set') { return [...constraint.region.squares] }
  return []
}

function tryAtTargetAndStep(entry, constraint, targetPos, step, ctx, pieces, random) {
  const targetSpecies = pickTargetSpecies(entry, constraint, targetPos, random)
  if (targetSpecies === null) { return null }
  if (!respectsAllCaps(constraint.team, targetSpecies, targetPos, ctx, pieces)) { return null }

  let next = withPiece(pieces, targetPos, pieceCode(constraint.team, targetSpecies))
  if (next === null) { return null }

  next = placeKingOnRayThroughTarget({
    pieces: next, team: constraint.team, frame: 'current', ctx,
    targetPos, step: -step, random
  })
  if (next === null) { return null }

  next = placeSliderBeyondTarget({
    pieces: next, attackerTeam: Board.opposingTeam(constraint.team),
    targetPos, step, ctx, random
  })
  if (next === null) { return null }

  if (entry.source === 'singular') {
    const narrowed = commitSingularRegion(ctx.singulars[entry.actorKey], targetPos)
    if (!narrowed) { return null }
  }
  return next
}

function pickTargetSpecies(entry, constraint, targetPos, random) {
  const eligible = new Set()
  for (const species of entry.speciesOptions) {
    if (species === null || species === Board.KING) { continue }
    if (!constraint.species_set.has(species)) { continue }
    if (!legalPlacementForSpecies(targetPos, species)) { continue }
    eligible.add(species)
  }
  if (eligible.size === 0) { return null }
  return pickWeightedSpecies(eligible, random)
}
