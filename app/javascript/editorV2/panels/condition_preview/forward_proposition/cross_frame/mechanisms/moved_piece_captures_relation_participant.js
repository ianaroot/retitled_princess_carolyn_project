import { materialValue } from 'gameplay/board_query_utils'
import { mobilityAt } from 'gameplay/mobility'
import {
  buildBoardFromLayout, buildLayoutFromPieces, pieceCode, shuffled
} from 'editorV2/panels/condition_preview/shared/board_utils'
import { withPiece } from 'editorV2/panels/condition_preview/shared/piece_placement'
import { activeAttackOrDefendSets } from 'editorV2/panels/condition_preview/forward_proposition/relations/attack_or_defend'
import { activeAdjacentSets } from 'editorV2/panels/condition_preview/forward_proposition/relations/adjacent'
import { activeShieldSets } from 'editorV2/panels/condition_preview/forward_proposition/relations/shield'
import { singularPosition } from 'editorV2/panels/condition_preview/forward_proposition/relations/relation_helpers'
import { singularSquare, commitPriorRegion } from 'editorV2/panels/condition_preview/forward_proposition/cross_frame/mechanisms/cross_frame_helpers'
import { legalOriginCandidates } from 'editorV2/panels/condition_preview/forward_proposition/cross_frame/mechanisms/shifts_mobility_helpers'
import { committedSpecies } from 'editorV2/panels/condition_preview/shared/singular_constraints'

// Cross-frame mechanism: engineer a relational PBS direction "-" delta by
// arranging for captured_piece to have been a relation participant on the
// prior board, which is removed by the capture on the after board. The chain
// counts one fewer participant on after than on prior, satisfying "-".
//
// Captured_piece is always enemy. The mechanism applies when the relation has
// at least one side on enemyTeam (captured could fill that role) — or for
// shield, where the geometry includes an implicit attacker that captured can
// fill regardless of the named sides' teams.
//
// This mechanism is commit-only: it doesn't place pieces. The capture
// materializes via synthesize_move's buildPriorBoard once captured species and
// moved_piece priorRegion are committed. A future extension could place the
// "other side" of the relation when it isn't already on the board.

const RELATIONAL_METRICS = new Set(['count', 'aggregate_value', 'aggregate_mobility'])
const SUPPORTED_OPERATORS = new Set(['attack', 'defend', 'adjacent', 'shield'])

export const movedPieceCapturesRelationParticipant = {
  name: 'moved-piece-captures-relation-participant',

  appliesTo(entry, ctx, _pieces) {
    if (entry.source !== 'relational') { return false }
    if (entry.direction !== '-') { return false }
    if (!RELATIONAL_METRICS.has(entry.metric)) { return false }
    if (!SUPPORTED_OPERATORS.has(entry.operator)) { return false }
    if (!teamGateMatches(entry, ctx)) { return false }
    return capturedHasNonNullSpecies(ctx)
  },

  apply(entry, ctx, pieces, random) {
    const moved = ctx.singulars.moved_piece
    const captured = ctx.singulars.captured_piece
    const destination = singularSquare(moved)
    const captureSquare = singularPosition(ctx, 'captured_piece')
    const movedSpecies = committedSpecies(moved)
    const capturedSpecies = nonNullSpecies(captured.species_set)
    if (destination === null || captureSquare === null || movedSpecies === null || capturedSpecies === null) { return null }

    const afterCount = pbsCountForFrame(entry, pieces, moved, destination, ctx)

    for (const origin of shuffled(legalOriginCandidates(pieces, destination, moved.team, movedSpecies), random)) {
      const priorPieces = priorPiecesWithCapture({
        pieces, destination, origin, captureSquare,
        movedTeam: moved.team, movedSpecies,
        capturedTeam: captured.team, capturedSpecies
      })
      if (priorPieces === null) { continue }
      const priorCount = pbsCountForFrame(entry, priorPieces, moved, origin, ctx)
      if (priorCount > afterCount) {
        return commitPriorRegion(ctx, [origin], pieces)
      }
    }
    return null
  }
}

function teamGateMatches(entry, ctx) {
  if (entry.operator === 'shield') { return true }
  return sideHasEnemyTeam(entry.subjectProposition, ctx) ||
         sideHasEnemyTeam(entry.targetProposition, ctx)
}

function sideHasEnemyTeam(proposition, ctx) {
  return proposition?.team === ctx.enemyTeam
}

function capturedHasNonNullSpecies(ctx) {
  const captured = ctx.singulars?.captured_piece
  if (!captured) { return false }
  return nonNullSpecies(captured.species_set) !== null
}

function nonNullSpecies(speciesSet) {
  for (const species of speciesSet) {
    if (species !== null) { return species }
  }
  return null
}

function priorPiecesWithCapture({ pieces, destination, origin, captureSquare, movedTeam, movedSpecies, capturedTeam, capturedSpecies }) {
  let result = new Map(pieces)
  result.delete(destination)
  result = withPiece(result, origin, pieceCode(movedTeam, movedSpecies))
  if (result === null) { return null }
  result = withPiece(result, captureSquare, pieceCode(capturedTeam, capturedSpecies))
  return result
}

function pbsCountForFrame(entry, pieces, moved, movedPos, ctx) {
  const relation = buildRelationForFrame(entry, moved, movedPos, ctx)
  const sets = activeSetsForOperator(entry.operator, relation, pieces)
  const activeSet = pbsActiveSet(entry, sets)
  return sumMetric(entry.metric, activeSet, pieces)
}

function buildRelationForFrame(entry, moved, movedPos, ctx) {
  return {
    operator: entry.operator,
    subjectSide: entry.subjectProposition !== null
      ? sideFromProposition(entry.subjectProposition, ctx)
      : sideFromMoved(moved, movedPos),
    targetSide: entry.targetProposition !== null
      ? sideFromProposition(entry.targetProposition, ctx)
      : sideFromMoved(moved, movedPos)
  }
}

function sideFromProposition(proposition, ctx) {
  const region = { kind: 'all' }
  if (proposition.boundSingularActor && proposition.boundSingularActor !== 'moved_piece') {
    const pos = singularPosition(ctx, proposition.boundSingularActor)
    if (pos !== null) {
      region.kind = 'set'
      region.squares = new Set([pos])
    }
  }
  return {
    team: proposition.team,
    species_set: proposition.species_set,
    region,
    boundSingularActor: proposition.boundSingularActor ?? null,
    count_range: { min: 0, max: Infinity }
  }
}

function sideFromMoved(moved, movedPos) {
  return {
    team: moved.team,
    species_set: new Set([...moved.species_set]),
    region: { kind: 'set', squares: new Set([movedPos]) },
    count_range: { min: 0, max: Infinity }
  }
}

function activeSetsForOperator(operator, relation, pieces) {
  if (operator === 'attack' || operator === 'defend') { return activeAttackOrDefendSets(relation, pieces) }
  if (operator === 'adjacent') { return activeAdjacentSets(relation, pieces) }
  if (operator === 'shield') { return activeShieldSets(relation, pieces) }
  return { activeSubjects: new Set(), activeTargets: new Set() }
}

function pbsActiveSet(entry, sets) {
  if (entry.subjectProposition === entry.currentProposition) { return sets.activeSubjects }
  if (entry.targetProposition === entry.currentProposition) { return sets.activeTargets }
  return sets.activeSubjects
}

function sumMetric(metric, activeSet, pieces) {
  if (metric === 'count') { return activeSet.size }
  if (metric === 'aggregate_value') {
    let total = 0
    for (const pos of activeSet) { total += materialValue(pieces.get(pos)) }
    return total
  }
  if (metric === 'aggregate_mobility') {
    const board = buildBoardFromLayout(buildLayoutFromPieces(pieces))
    let total = 0
    for (const pos of activeSet) { total += mobilityAt(board, pos) }
    return total
  }
  return 0
}
