import { buildBoardFromLayout, buildLayoutFromPieces, pieceCode, shuffled, ALL_POSITIONS } from 'editorV2/panels/condition_preview/shared/board_utils'
import { placeKingDeliberately } from 'editorV2/panels/condition_preview/shared/king_placement'
import { withPiece, legalPlacementForSpecies, teamHasKing } from 'editorV2/panels/condition_preview/shared/piece_placement'
import { mobilityAt } from 'gameplay/mobility'
import { respectsAllCaps } from 'editorV2/panels/condition_preview/forward_proposition/respect_caps'
import { singularSquare, commitPriorRegion, entryConcernsMovedPiece, placeableSpecies } from 'editorV2/panels/condition_preview/forward_proposition/cross_frame/mechanisms/cross_frame_helpers'
import {
  legalOriginCandidates, hypotheticalMobilityAt, directionSatisfied
} from 'editorV2/panels/condition_preview/forward_proposition/cross_frame/mechanisms/shifts_mobility_helpers'
import { committedSpecies } from 'editorV2/panels/condition_preview/shared/singular_constraints'

// Patch 2 of mobility cross-frame: allied non-moved-piece mobility shift.
//
// The mobility-target is an allied piece X that is NOT moved_piece. The only
// thing that differs between prior and after boards is moved_piece's
// position, so the engineering lever is moved_piece's origin selection: pick
// an origin that blocks X's reach to a square on one frame but not the other.
//
// Natural pass: iterate (existing X, origin) pairs; commit priorRegion when
// hypothetical prior-mobility for X satisfies direction relative to after.
// Fresh-X pass: if no existing X works, try placing a fresh X (respecting
// caps) where moved_piece blocks it asymmetrically across frames.
export const movedPieceShiftsAlliedMobility = {
  name: 'moved-piece-shifts-allied-mobility',

  appliesTo(entry, ctx, pieces) {
    if (entry.metric !== 'aggregate_mobility') { return false }
    if (entryConcernsMovedPiece(entry)) { return false }
    if (entry.currentProposition?.team !== ctx.movingTeam) { return false }
    return true
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

    const natural = findNaturalShiftForExistingX(entry, ctx, pieces, random, moved, destination, movedSpecies)
    if (natural !== null) { return natural }

    return placeFreshXAndCommit(entry, ctx, pieces, random, moved, destination, movedSpecies)
  }
}

function findNaturalShiftForExistingX(entry, ctx, pieces, random, moved, destination, movedSpecies) {
  const team = entry.currentProposition.team
  const speciesSet = entry.currentProposition.species_set
  const existingTargets = existingTargetPieces(pieces, team, speciesSet, destination)
  const origins = legalOriginCandidates(pieces, destination, moved.team, movedSpecies)

  for (const xPos of shuffled(existingTargets, random)) {
    for (const origin of shuffled(origins, random)) {
      if (deltaSatisfiedForTarget(entry.direction, pieces, destination, origin, moved.team, movedSpecies, xPos)) {
        const result = commitPriorRegion(ctx, [origin], pieces)
        if (result !== null) { return result }
      }
    }
  }
  return null
}

function placeFreshXAndCommit(entry, ctx, pieces, random, moved, destination, movedSpecies) {
  const team = entry.currentProposition.team
  const speciesSet = entry.currentProposition.species_set
  const origins = legalOriginCandidates(pieces, destination, moved.team, movedSpecies)
  const emptySquares = ALL_POSITIONS.filter(p => !pieces.has(p) && p !== destination)

  for (const xPos of shuffled(emptySquares, random)) {
    for (const species of shuffled(placeableSpecies(speciesSet), random)) {
      if (!legalPlacementForSpecies(xPos, species)) { continue }
      if (!respectsAllCaps(team, species, xPos, ctx, pieces)) { continue }
      const withX = withPiece(pieces, xPos, pieceCode(team, species))
      if (withX === null) { continue }

      for (const origin of shuffled(origins, random)) {
        if (deltaSatisfiedForTarget(entry.direction, withX, destination, origin, moved.team, movedSpecies, xPos)) {
          const result = commitPriorRegion(ctx, [origin], withX)
          if (result !== null) { return result }
        }
      }
    }
  }
  return null
}

function existingTargetPieces(pieces, team, speciesSet, excludeSquare) {
  const result = []
  for (const [pos, piece] of pieces) {
    if (pos === excludeSquare) { continue }
    if (piece.charAt(0) !== team) { continue }
    if (!speciesSet.has(piece.slice(1))) { continue }
    result.push(pos)
  }
  return result
}

function deltaSatisfiedForTarget(direction, piecesMap, destination, origin, movedTeam, movedSpecies, targetPos) {
  const afterBoard = buildBoardFromLayout(buildLayoutFromPieces(piecesMap))
  const afterMobility = mobilityAt(afterBoard, targetPos)
  const priorMobility = hypotheticalMobilityAt(piecesMap, destination, origin, movedTeam, movedSpecies, targetPos)
  return directionSatisfied(direction, afterMobility, priorMobility)
}
