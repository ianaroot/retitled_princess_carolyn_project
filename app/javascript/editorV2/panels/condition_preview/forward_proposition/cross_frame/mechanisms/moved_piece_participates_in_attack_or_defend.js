import { pieceControlsSquare } from 'gameplay/board_query_utils'
import {
  buildBoardFromLayout, buildLayoutFromPieces, pieceCode, shuffled
} from 'editorV2/panels/condition_preview/shared/board_utils'
import {
  attackerCandidatesFor, controlledSquaresForPieceAt, originCandidatesForSpecies
} from 'editorV2/panels/condition_preview/shared/geometry_utils'
import { withPiece } from 'editorV2/panels/condition_preview/shared/piece_placement'
import {
  singularSquare, placeableSpecies, ensureRolePieceAt, commitPriorRegion,
  otherSidePropositionFor
} from 'editorV2/panels/condition_preview/forward_proposition/cross_frame/mechanisms/cross_frame_helpers'
import { roleForPlan } from 'editorV2/panels/condition_preview/forward_proposition/moved_binding'
import { committedSpecies } from 'editorV2/panels/condition_preview/shared/singular_constraints'

const RELEVANT_OPERATORS = new Set(['attack', 'defend'])

export const movedPieceParticipatesInAttackOrDefend = {
  name: 'moved-piece-participates-in-attack-or-defend',

  appliesTo(entry, ctx, pieces) {
    if (entry.source !== 'relational') { return false }
    if (!RELEVANT_OPERATORS.has(entry.operator)) { return false }
    return roleForPlan(ctx, entry.sourcePlan) !== null
  },

  apply(entry, ctx, pieces, random) {
    const role = roleForPlan(ctx, entry.sourcePlan)
    if (role === null) { return null }
    const otherProposition = otherSidePropositionFor(entry, role)
    if (otherProposition === null) { return null }
    if (entry.direction === '+') { return applyPlus(role, otherProposition, ctx, pieces, random) }
    if (entry.direction === '-') { return applyMinus(role, otherProposition, ctx, pieces, random) }
    return null
  }
}

function applyPlus(role, otherProposition, ctx, pieces, random) {
  if (role === 'target') { return applyPlusRoleTarget(otherProposition, ctx, pieces, random) }
  if (role === 'subject') { return applyPlusRoleSubject(otherProposition, ctx, pieces, random) }
  return null
}

function applyMinus(role, otherProposition, ctx, pieces, random) {
  if (role === 'target') { return applyMinusRoleTarget(otherProposition, ctx, pieces, random) }
  if (role === 'subject') { return applyMinusRoleSubject(otherProposition, ctx, pieces, random) }
  return null
}

// moved_piece is the relation's target; we place a piece (attacker/defender)
// that controls moved_piece's destination. priorRegion narrows to origin
// candidates the new piece does not control — so the count holds on after but
// not on prior, satisfying the '+' delta.
function applyPlusRoleTarget(otherProposition, ctx, pieces, random) {
  const moved = ctx.singulars.moved_piece
  const destination = singularSquare(moved)
  if (destination === null) { return null }

  const team = otherProposition.team
  const speciesPool = placeableSpecies(otherProposition.species_set)
  if (speciesPool.length === 0) { return null }

  const board = buildBoardFromLayout(buildLayoutFromPieces(pieces))
  for (const species of shuffled(speciesPool, random)) {
    const candidates = shuffled(attackerCandidatesFor(destination, species, team, board), random)
    for (const placement of candidates) {
      if (pieces.has(placement)) { continue }
      const result = commitWithPlacement({ placement, species, placerTeam: team, ctx, pieces, destination, random })
      if (result !== null) { return result }
    }
  }
  return null
}

// moved_piece is the relation's subject; we place a target piece (of the
// other team) on a square moved_piece's destination controls. priorRegion
// narrows to origin candidates from which moved_piece does NOT control that
// target square.
function applyPlusRoleSubject(otherProposition, ctx, pieces, random) {
  const moved = ctx.singulars.moved_piece
  const destination = singularSquare(moved)
  if (destination === null) { return null }

  const team = otherProposition.team
  const speciesPool = placeableSpecies(otherProposition.species_set)
  if (speciesPool.length === 0) { return null }

  const board = buildBoardFromLayout(buildLayoutFromPieces(pieces))
  const reachable = shuffled(controlledSquaresForPieceAt(destination, board), random)
  for (const placement of reachable) {
    if (pieces.has(placement)) { continue }
    for (const species of shuffled(speciesPool, random)) {
      const result = commitWithPlacement({ placement, species, placerTeam: team, ctx, pieces, destination, random })
      if (result !== null) { return result }
    }
  }
  return null
}

// moved_piece is the target. Direction '-' means count of attackers on
// moved_piece went down. If moved_piece's destination is already
// uncontrolled by relevant attackers, commit priorRegion to origin candidates
// either (a) already controlled by an existing attacker (read-only path), or
// (b) controllable by a new attacker we place such that it does not also
// control destination (place-extension path).
function applyMinusRoleTarget(otherProposition, ctx, pieces, random) {
  const moved = ctx.singulars.moved_piece
  const destination = singularSquare(moved)
  if (destination === null) { return null }
  const team = otherProposition.team
  const speciesSet = otherProposition.species_set

  const board = buildBoardFromLayout(buildLayoutFromPieces(pieces))
  if (anyTeamPieceControls({ board, pieces, team, speciesSet, square: destination })) { return null }

  const movedSpecies = committedSpecies(moved)
  const allOrigins = originCandidatesForSpecies(destination, movedSpecies, moved.team)
    .filter(p => p !== destination && !pieces.has(p))

  const readOnlyOrigins = allOrigins
    .filter(origin => anyTeamPieceControls({ board, pieces, team, speciesSet, square: origin }))
  if (readOnlyOrigins.length > 0) {
    return commitPriorRegion(ctx, readOnlyOrigins, pieces)
  }

  const speciesPool = placeableSpecies(speciesSet)
  const placementCandidates = []
  for (const origin of allOrigins) {
    for (const species of speciesPool) {
      for (const placement of attackerCandidatesFor(origin, species, team, board)) {
        if (placement === destination) { continue }
        if (pieces.has(placement)) { continue }
        placementCandidates.push({ origin, placement, species })
      }
    }
  }

  for (const { origin, placement, species } of shuffled(placementCandidates, random)) {
    const placed = ensureRolePieceAt({ pieces, pos: placement, team, speciesSet: new Set([species]), ctx, random })
    if (placed === null || placed === pieces) { continue }
    const newBoard = buildBoardFromLayout(buildLayoutFromPieces(placed))
    if (pieceControlsSquare({ board: newBoard, attackerPosition: placement, targetPosition: destination })) { continue }
    if (!pieceControlsSquare({ board: newBoard, attackerPosition: placement, targetPosition: origin })) { continue }
    const committed = commitPriorRegion(ctx, [origin], placed)
    if (committed !== null) { return committed }
  }
  return null
}

// moved_piece is the subject. Direction '-' means moved_piece attacks fewer
// targets on after than prior. Either (a) commit priorRegion to origin
// candidates from which moved_piece-at-origin already controls more relevant
// targets than from destination (read-only path), or (b) place a new target T
// in (controlled-from-origin minus controlled-from-destination) to bridge the
// gap (place-extension path).
function applyMinusRoleSubject(otherProposition, ctx, pieces, random) {
  const moved = ctx.singulars.moved_piece
  const destination = singularSquare(moved)
  if (destination === null) { return null }
  const movedSpecies = committedSpecies(moved)
  const team = otherProposition.team
  const speciesSet = otherProposition.species_set

  const board = buildBoardFromLayout(buildLayoutFromPieces(pieces))
  const targetsFromDestination = relevantControlledTargets(board, pieces, destination, team, speciesSet)
  const controlledFromDestination = new Set(controlledSquaresForPieceAt(destination, board))

  const allOrigins = originCandidatesForSpecies(destination, movedSpecies, moved.team)
    .filter(p => p !== destination && !pieces.has(p))

  const readOnlyOrigins = allOrigins.filter(origin => {
    const probe = withMovedAt(pieces, destination, origin, moved.team, movedSpecies)
    if (probe === null) { return false }
    const probeBoard = buildBoardFromLayout(buildLayoutFromPieces(probe))
    const targetsFromOrigin = relevantControlledTargets(probeBoard, probe, origin, team, speciesSet)
    return targetsFromOrigin > targetsFromDestination
  })

  if (readOnlyOrigins.length > 0) {
    return commitPriorRegion(ctx, readOnlyOrigins, pieces)
  }

  const speciesPool = placeableSpecies(speciesSet)
  const placementCandidates = []
  for (const origin of allOrigins) {
    const probe = withMovedAt(pieces, destination, origin, moved.team, movedSpecies)
    if (probe === null) { continue }
    const probeBoard = buildBoardFromLayout(buildLayoutFromPieces(probe))
    const targetsFromOrigin = relevantControlledTargets(probeBoard, probe, origin, team, speciesSet)
    // Need targetsFromOrigin + 1 (from new T) > targetsFromDestination.
    if (targetsFromOrigin < targetsFromDestination) { continue }
    for (const tSquare of controlledSquaresForPieceAt(origin, probeBoard)) {
      if (tSquare === destination) { continue }
      if (pieces.has(tSquare)) { continue }
      if (controlledFromDestination.has(tSquare)) { continue }
      for (const species of speciesPool) {
        placementCandidates.push({ origin, tSquare, species })
      }
    }
  }

  for (const { origin, tSquare, species } of shuffled(placementCandidates, random)) {
    const placed = ensureRolePieceAt({ pieces, pos: tSquare, team, speciesSet: new Set([species]), ctx, random })
    if (placed === null || placed === pieces) { continue }
    const probe = withMovedAt(placed, destination, origin, moved.team, movedSpecies)
    if (probe === null) { continue }
    const probeBoard = buildBoardFromLayout(buildLayoutFromPieces(probe))
    const targetsFromOriginAfter = relevantControlledTargets(probeBoard, probe, origin, team, speciesSet)
    const afterBoard = buildBoardFromLayout(buildLayoutFromPieces(placed))
    const targetsFromDestinationAfter = relevantControlledTargets(afterBoard, placed, destination, team, speciesSet)
    if (targetsFromOriginAfter <= targetsFromDestinationAfter) { continue }
    const committed = commitPriorRegion(ctx, [origin], placed)
    if (committed !== null) { return committed }
  }
  return null
}

function anyTeamPieceControls({ board, pieces, team, speciesSet, square }) {
  for (const [pos, piece] of pieces) {
    if (piece.charAt(0) !== team) { continue }
    if (!speciesSet.has(piece.slice(1))) { continue }
    if (pieceControlsSquare({ board, attackerPosition: pos, targetPosition: square })) { return true }
  }
  return false
}

function relevantControlledTargets(board, pieces, attackerPosition, targetTeam, speciesSet) {
  const controlled = controlledSquaresForPieceAt(attackerPosition, board)
  let count = 0
  for (const sq of controlled) {
    const occupant = pieces.get(sq)
    if (!occupant) { continue }
    if (occupant.charAt(0) !== targetTeam) { continue }
    if (!speciesSet.has(occupant.slice(1))) { continue }
    count += 1
  }
  return count
}

function withMovedAt(pieces, fromSquare, toSquare, team, species) {
  const next = new Map(pieces)
  next.delete(fromSquare)
  return withPiece(next, toSquare, pieceCode(team, species))
}

function commitWithPlacement({ placement, species, placerTeam, ctx, pieces, destination, random }) {
  const next = ensureRolePieceAt({
    pieces, pos: placement, team: placerTeam, speciesSet: new Set([species]), ctx, random
  })
  if (next === null || next === pieces) { return null }

  const hypotheticalBoard = buildBoardFromLayout(buildLayoutFromPieces(next))
  const moved = ctx.singulars.moved_piece
  const movedSpecies = committedSpecies(moved)
  const validOrigins = originCandidatesForSpecies(destination, movedSpecies, moved.team)
    .filter(p => p !== destination && !next.has(p))
    .filter(origin => !pieceControlsSquare({
      board: hypotheticalBoard,
      attackerPosition: placement,
      targetPosition: origin
    }))

  return commitPriorRegion(ctx, validOrigins, next)
}
