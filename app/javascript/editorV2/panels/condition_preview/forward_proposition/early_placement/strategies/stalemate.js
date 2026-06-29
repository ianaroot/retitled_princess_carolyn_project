import { ALL_POSITIONS, buildBoardFromLayout, buildLayoutFromPieces, pieceCode, shuffled } from 'editorV2/panels/condition_preview/shared/board_utils'
import { materialValue } from 'gameplay/board_query_utils'
import { mobilityAt } from 'gameplay/mobility'
import { valueComparisonEntryPasses } from 'editorV2/panels/condition_preview/forward_proposition/singulars'
import { originCandidatesForSpecies } from 'editorV2/panels/condition_preview/shared/geometry_utils'
import { withPiece, legalPlacementForSpecies } from 'editorV2/panels/condition_preview/shared/piece_placement'
import { placeKingInStalemate } from 'editorV2/panels/condition_preview/shared/king_placement'
import { respectsAllCaps } from 'editorV2/panels/condition_preview/forward_proposition/respect_caps'
import {
  commitSingular, commitMovedPiece,
  canCommitSingular, canCommitMovedPiece
} from 'editorV2/panels/condition_preview/shared/singular_constraints'

// Shares ctx.checkState with checkRestriction (one mobility-restricting king arrangement per team).
export const stalemateStrategy = {
  name: 'stalemate',
  constraintKind: 'mobility',

  appliesTo(constraint, ctx, pieces, pool) {
    if (ctx.checkState.count >= ctx.checkState.max) { return false }
    if (constraint.region.kind === 'related-to') { return false }
    if (constraint.team === teamThatJustMoved(constraint.frame, ctx)) { return false }
    return true
  },

  apply(constraint, ctx, pieces, pool, random) {
    if (ctx.checkState.count >= ctx.checkState.max) { return null }
    let next = placeKingInStalemate({
      pieces, team: constraint.team, frame: constraint.frame, ctx, random
    })
    if (next === null) { return null }

    next = handleEnemyMovedPiece(next, ctx, random)
    if (next === null) { return null }

    ctx.checkState.count += 1
    return next
  }
}

function teamThatJustMoved(frame, ctx) {
  return frame === 'current' ? ctx.movingTeam : ctx.enemyTeam
}

function handleEnemyMovedPiece(pieces, ctx, random) {
  const enemyMoved = ctx.singulars.enemy_moved_piece
  if (!enemyMoved) { return pieces }
  const candidates = shuffled(
    [...enemyMoved.species_set].filter(s => s !== null && s !== undefined),
    random
  )
  for (const species of candidates) {
    const tryPos = pickPlacementCandidate(pieces, species, random)
    if (tryPos === null) { continue }
    const candidate = withPiece(pieces, tryPos, pieceCode(enemyMoved.team, species))
    if (candidate === null) { continue }
    const board = buildBoardFromLayout(buildLayoutFromPieces(candidate))
    if (mobilityAt(board, tryPos) !== 0) { continue }
    if (!commitSingular(enemyMoved, species, tryPos)) { continue }
    return candidate
  }
  return arrangeCapture(pieces, ctx, random)
}

function pickPlacementCandidate(pieces, species, random) {
  for (const pos of shuffled(ALL_POSITIONS, random)) {
    if (pieces.has(pos)) { continue }
    if (!legalPlacementForSpecies(pos, species)) { continue }
    return pos
  }
  return null
}

function arrangeCapture(pieces, ctx, random) {
  const moved = ctx.singulars.moved_piece
  const enemyMoved = ctx.singulars.enemy_moved_piece
  const captured = ctx.singulars.captured_piece
  const movedCandidates = shuffled(
    [...moved.species_set].filter(s => s !== null && s !== undefined),
    random
  )
  const enemyCandidates = shuffled(
    [...enemyMoved.species_set].filter(s => s !== null && s !== undefined),
    random
  )

  for (const movedSpecies of movedCandidates) {
    for (const enemySpecies of enemyCandidates) {
      if (!captured.species_set.has(enemySpecies)) { continue }
      if (!valueComparisonsPass(captured, 'moved_piece', enemySpecies, movedSpecies)) { continue }
      for (const x of shuffled(ALL_POSITIONS, random)) {
        if (pieces.has(x)) { continue }
        if (!legalPlacementForSpecies(x, movedSpecies)) { continue }
        if (!legalPlacementForSpecies(x, enemySpecies)) { continue }
        const origins = originCandidatesForSpecies(x, movedSpecies, moved.team)
          .filter(o => !pieces.has(o) && o !== x)
        if (origins.length === 0) { continue }
        if (!respectsAllCaps(moved.team, movedSpecies, x, ctx, pieces)) { continue }
        if (!canCommitSingular(moved, movedSpecies, x)) { continue }
        if (!canCommitMovedPiece(ctx, movedSpecies, x)) { continue }
        if (!canCommitSingular(enemyMoved, enemySpecies, x)) { continue }
        // All checks passed — atomic commit.
        commitMovedPiece(ctx, movedSpecies, x)
        commitSingular(enemyMoved, enemySpecies, x)
        ctx.singulars.captured_piece = enemyMoved
        return pieces
      }
    }
  }
  return null
}

function valueComparisonsPass(singular, otherActorKey, mySpecies, otherSpecies) {
  const myValue = materialValue(mySpecies)
  const otherValue = materialValue(otherSpecies)
  for (const entry of singular.valueComparisonsToAnchors ?? []) {
    if (entry.otherActor !== otherActorKey) { continue }
    if (!valueComparisonEntryPasses(entry, myValue, otherValue)) { return false }
  }
  return true
}
