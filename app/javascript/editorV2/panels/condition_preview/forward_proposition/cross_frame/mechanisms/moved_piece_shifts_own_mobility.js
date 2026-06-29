import { buildBoardFromLayout, buildLayoutFromPieces, shuffled, pieceCode, pickBlockerTeam, orderedBlockerSpeciesFor } from 'editorV2/panels/condition_preview/shared/board_utils'
import { placeKingDeliberately } from 'editorV2/panels/condition_preview/shared/king_placement'
import { withPiece, teamHasKing } from 'editorV2/panels/condition_preview/shared/piece_placement'
import {
  sliderPathClear, walkRay, stepsForSliderSpecies, SLIDER_SPECIES
} from 'editorV2/panels/condition_preview/shared/geometry_utils'
import { sliderStep } from 'gameplay/board_query_utils'
import { placeWithCaps } from 'editorV2/panels/condition_preview/forward_proposition/respect_caps'
import { mobilityDeltaForOrigin } from 'editorV2/panels/condition_preview/forward_proposition/cross_frame/mobility_delta'
import { mobilityAt } from 'gameplay/mobility'
import { blockersMechanism } from 'editorV2/panels/condition_preview/forward_proposition/mobility/blockers'
import { kingAdjacentControlMechanism } from 'editorV2/panels/condition_preview/forward_proposition/mobility/king_adjacent_control'
import { pinsMechanism } from 'editorV2/panels/condition_preview/forward_proposition/mobility/pins'
import { singularSquare, commitPriorRegion, entryConcernsMovedPiece } from 'editorV2/panels/condition_preview/forward_proposition/cross_frame/mechanisms/cross_frame_helpers'
import {
  legalOriginCandidates, piecesWithMovedAt, hypotheticalMobilityAt, directionSatisfied
} from 'editorV2/panels/condition_preview/forward_proposition/cross_frame/mechanisms/shifts_mobility_helpers'
import { committedSpecies } from 'editorV2/panels/condition_preview/shared/singular_constraints'

const ACTIVE_MECHANISMS = Object.freeze([blockersMechanism, kingAdjacentControlMechanism, pinsMechanism])


// First pass looks for an origin whose hypothetical mobility already differs
// from destination's in the right direction (no piece placement needed).
// Second pass engineers the delta by running the existing mobility mechanisms
// (blockers/king_adjacent_control/pins) with frame='prior' against an origin,
// then verifies the delta on the modified board.
export const movedPieceShiftsOwnMobility = {
  name: 'moved-piece-shifts-own-mobility',

  appliesTo(entry, ctx, pieces) {
    if (entry.metric !== 'aggregate_mobility') { return false }
    return entryConcernsMovedPiece(entry)
  },

  apply(entry, ctx, pieces, random) {
    const moved = ctx.singulars.moved_piece
    const destination = singularSquare(moved)
    if (destination === null) { return null }
    const movedSpecies = committedSpecies(moved)
    if (movedSpecies === null) { return null }
    if (!teamHasKing(pieces, moved.team)) {
      const placed = placeKingDeliberately(pieces, moved.team, 'current', ctx, random)
      if (placed === null) { return null }
      pieces = placed
    }

    const naturalResult = findOriginWithNaturalDelta(entry, ctx, pieces, random, moved, destination, movedSpecies)
    if (naturalResult !== null) { return naturalResult }

    const constructed = engineerSliderPerpendicularDelta(entry, ctx, pieces, random, moved, destination, movedSpecies)
    if (constructed !== null) { return constructed }

    return engineerOriginMobility(entry, ctx, pieces, random, moved, destination, movedSpecies)
  }
}

// '+' chokes origin's perpendicular arms, '-' chokes destination; '=' → natural pass.
function engineerSliderPerpendicularDelta(entry, ctx, pieces, random, moved, destination, movedSpecies) {
  if (entry.direction !== '+' && entry.direction !== '-') { return null }
  if (!SLIDER_SPECIES.has(movedSpecies)) { return null }

  for (const origin of shuffled(legalOriginCandidates(pieces, destination, moved.team, movedSpecies), random)) {
    const moveStep = sliderStep(origin, destination)
    if (moveStep === null) { continue }
    const nonMoveSteps = stepsForSliderSpecies(movedSpecies)
      .filter(step => step !== moveStep && step !== -moveStep)
    const chokeAt = entry.direction === '+' ? origin : destination

    let candidate = pieces
    for (const step of shuffled([...nonMoveSteps], random)) {
      candidate = chokeArm(candidate, chokeAt, step, moved, movedSpecies, ctx, random)
    }
    if (candidate === pieces) { continue }
    if (!sliderPathClear(candidate, origin, destination, movedSpecies)) { continue }
    if (!mobilityDeltaForOrigin(entry, ctx, candidate, origin, destination)) { continue }

    const result = commitPriorRegion(ctx, [origin], candidate)
    if (result !== null) { return result }
  }
  return null
}

function chokeArm(pieces, square, step, moved, movedSpecies, ctx, random) {
  const blockerTeam = pickBlockerTeam({ team: moved.team, species: movedSpecies }, random)
  for (const pos of walkRay(square, step)) {
    if (pieces.has(pos)) { return pieces }
    for (const species of orderedBlockerSpeciesFor(pos, random)) {
      const next = placeWithCaps(pieces, pos, pieceCode(blockerTeam, species), ctx)
      if (next !== null) { return next }
    }
  }
  return pieces
}

function findOriginWithNaturalDelta(entry, ctx, pieces, random, moved, destination, movedSpecies) {
  const afterBoard = buildBoardFromLayout(buildLayoutFromPieces(pieces))
  const afterMobility = mobilityAt(afterBoard, destination)

  for (const origin of shuffled(legalOriginCandidates(pieces, destination, moved.team, movedSpecies), random)) {
    const priorMobility = hypotheticalMobilityAt(pieces, destination, origin, moved.team, movedSpecies)
    if (directionSatisfied(entry.direction, afterMobility, priorMobility)) {
      const result = commitPriorRegion(ctx, [origin], pieces)
      if (result !== null) { return result }
    }
  }
  return null
}

// Engineering widens the prior↔after mobility delta by placing blockers on
// whichever frame's mobility we want to reduce:
//   direction '+': reduce mobility-from-origin (prior frame). Place moved_piece
//     at origin in a hypothetical board, run mobility mechanisms with
//     frame='prior'. Extract engineered blockers and apply to the original
//     pieces (moved_piece at destination + new blockers around origin).
//   direction '-': reduce mobility-from-destination (current frame). moved_piece
//     is already at destination, so the existing mobility mechanisms run as-is
//     with frame='current' against the actual board.
function engineerOriginMobility(entry, ctx, pieces, random, moved, destination, movedSpecies) {
  if (entry.direction === '+') {
    return engineerLowerPriorMobility(entry, ctx, pieces, random, moved, destination, movedSpecies)
  }
  if (entry.direction === '-') {
    return engineerLowerCurrentMobility(entry, ctx, pieces, random, moved, destination, movedSpecies)
  }
  return null
}

function engineerLowerPriorMobility(entry, ctx, pieces, random, moved, destination, movedSpecies) {
  for (const origin of shuffled(legalOriginCandidates(pieces, destination, moved.team, movedSpecies), random)) {
    const hypotheticalPieces = piecesWithMovedAt(pieces, destination, origin, moved.team, movedSpecies)
    if (hypotheticalPieces === null) { continue }
    const target = { position: origin, team: moved.team, species: movedSpecies }

    for (const mechanism of shuffled([...ACTIVE_MECHANISMS], random)) {
      if (!mechanism.appliesTo(target, ctx, 'prior', hypotheticalPieces)) { continue }
      const mechResult = mechanism.apply(target, ctx, 'prior', hypotheticalPieces, random)
      if (mechResult === null || mechResult === hypotheticalPieces) { continue }

      const finalPieces = applyEngineeredBlockers(pieces, hypotheticalPieces, mechResult, destination)
      if (!sliderPathClear(finalPieces, origin, destination, movedSpecies)) { continue }

      if (!deltaSatisfied(entry.direction, finalPieces, destination, origin, moved.team, movedSpecies)) { continue }

      const result = commitPriorRegion(ctx, [origin], finalPieces)
      if (result !== null) { return result }
    }
  }
  return null
}

function engineerLowerCurrentMobility(entry, ctx, pieces, random, moved, destination, movedSpecies) {
  const target = { position: destination, team: moved.team, species: movedSpecies }
  for (const mechanism of shuffled([...ACTIVE_MECHANISMS], random)) {
    if (!mechanism.appliesTo(target, ctx, 'current', pieces)) { continue }
    const mechResult = mechanism.apply(target, ctx, 'current', pieces, random)
    if (mechResult === null || mechResult === pieces) { continue }

    for (const origin of shuffled(legalOriginCandidates(mechResult, destination, moved.team, movedSpecies), random)) {
      if (!deltaSatisfied(entry.direction, mechResult, destination, origin, moved.team, movedSpecies)) { continue }
      const result = commitPriorRegion(ctx, [origin], mechResult)
      if (result !== null) { return result }
    }
  }
  return null
}

function deltaSatisfied(direction, piecesMap, destination, origin, team, species) {
  const afterBoard = buildBoardFromLayout(buildLayoutFromPieces(piecesMap))
  const afterMobility = mobilityAt(afterBoard, destination)
  const priorMobility = hypotheticalMobilityAt(piecesMap, destination, origin, team, species)
  return directionSatisfied(direction, afterMobility, priorMobility)
}


function applyEngineeredBlockers(originalPieces, hypothetical, mechanismResult, destination) {
  let final = new Map(originalPieces)
  for (const [pos, piece] of mechanismResult) {
    if (hypothetical.has(pos)) { continue }
    if (pos === destination) { continue }
    if (final.has(pos)) { continue }
    const next = withPiece(final, pos, piece)
    if (next === null) { continue }
    final = next
  }
  return final
}

