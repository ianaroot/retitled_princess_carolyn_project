import Rules from 'gameplay/rules'
import Board from 'gameplay/board'
import profileCollector from 'gameplay/profile_collector'
import {
  buildBoardFromLayout, buildLayoutFromPieces, shuffled,
  pieceCode, orderedBlockerSpeciesFor
} from 'editorV2/panels/condition_preview/shared/board_utils'
import { controllingPositions, positionsBetween } from 'gameplay/board_query_utils'
import { originCandidatesForSpecies } from 'editorV2/panels/condition_preview/shared/geometry_utils'
import { buildPriorBoard, synthesizeEnemyMoveContext, legalPriorTurnState } from 'editorV2/panels/condition_preview/shared/example_utils'
import { placeWithCaps } from 'editorV2/panels/condition_preview/forward_proposition/respect_caps'
import { positionOfKing } from 'editorV2/panels/condition_preview/shared/piece_placement'
import { regionPossiblyContains } from 'editorV2/panels/condition_preview/forward_proposition/region'
import { standardScenario } from 'editorV2/panels/condition_preview/forward_proposition/scenarios/standard'
import { committedSpecies } from 'editorV2/panels/condition_preview/shared/singular_constraints'

export function synthesizeMove(ctx, pieces, random, scenario = standardScenario) {
  const bump = r => profileCollector.increment(`forward_proposition.synthesize_move.${r}`)
  const moved = ctx.singulars.moved_piece
  const species = committedSpecies(moved)
  const team = moved.team
  const overrides = scenario.resolveMoveObjectOverrides?.(ctx, pieces) ?? {}

  const endPos = overrides.endPosition ?? [...moved.region.squares][0]
  const origins = overrides.startPosition !== undefined
    ? [overrides.startPosition]
    : shuffled(
        originCandidatesForSpecies(endPos, species, team)
          .filter(p => p !== endPos && !pieces.has(p) && regionPossiblyContains(moved.priorRegion, p)),
        random
      )
  const recentMoveContext = scenario.resolveRecentMoveContext?.(ctx, random) ?? recentMoveContextForEnemy(ctx, random)

  if (origins.length === 0) { bump('no_origins'); return null }

  const rescuable = []
  for (const origin of origins) {
    const priorPieces = buildPriorBoard({
      pieces, singulars: ctx.singulars, origin, endPos,
      pieceNotation: overrides.pieceNotation,
      team,
      promotionPiece: overrides.promotionPiece,
      capturedPiecePosition: overrides.capturedPiecePosition
    })
    if (priorPieces === null) { bump('prior_board_null'); continue }
    const priorBoard = buildBoardFromLayout(buildLayoutFromPieces(priorPieces), recentMoveContext, team)
    let moveObject
    try { moveObject = Rules.getMoveObject(origin, endPos, priorBoard) } catch { bump('catch_hits'); continue }
    if (moveObject.illegal) {
      if (moveObject.endPosition !== endPos) {
        bump('illegal_move.no_pseudo_move')
      } else if (Rules.checkQuery({ board: priorBoard, teamString: team })) {
        bump('illegal_move.self_check.existing_check')
        rescuable.push({ priorPieces, priorBoard, origin, kingTeam: team, attackerTeam: Board.opposingTeam(team), kind: 'existing_check' })
      } else {
        bump('illegal_move.self_check.pin')
        rescuable.push({ priorPieces, origin, kind: 'pin' })
      }
      continue
    }
    if (!legalPriorTurnState(priorBoard, moveObject)) {
      bump('illegal_prior_turn')
      rescuable.push({ priorPieces, priorBoard, origin, kingTeam: Board.opposingTeam(team), attackerTeam: team, kind: 'prior_turn' })
      continue
    }
    return { priorBoard, moveObject, priorPieces }
  }

  for (const r of rescuable) {
    const attempt = { priorPieces: r.priorPieces, ctx, origin: r.origin, endPos, recentMoveContext, moverTeam: team, random }
    const fixed = r.kind === 'pin'
      ? interposePin(attempt)
      : interposeCheck(attempt, r.priorBoard, r.kingTeam, r.attackerTeam)
    if (fixed !== null) {
      bump(`interpose_resolved.${r.kind}`)
      return fixed
    }
  }
  bump('all_origins_failed')
  return null
}

const NO_EXCLUSIONS = new Set()

function placeBlockerAndRetry(attempt, between, kingTeam, excluded) {
  const { priorPieces, ctx, origin, endPos, recentMoveContext, moverTeam, random } = attempt
  const enemyTeam = Board.opposingTeam(kingTeam)
  for (const sq of between) {
    if (excluded.has(sq) || priorPieces.has(sq)) { continue }
    for (const team of shuffled([kingTeam, enemyTeam], random)) {
      for (const sp of orderedBlockerSpeciesFor(sq, random)) {
        const withBlock = placeWithCaps(priorPieces, sq, pieceCode(team, sp), ctx)
        if (withBlock === null) { continue }
        const pb = buildBoardFromLayout(buildLayoutFromPieces(withBlock), recentMoveContext, moverTeam)
        if (team === enemyTeam && Rules.checkQuery({ board: pb, teamString: kingTeam })) { continue }
        let mo
        try { mo = Rules.getMoveObject(origin, endPos, pb) } catch { continue }
        if (mo.illegal) { continue }
        if (!legalPriorTurnState(pb, mo)) { continue }
        return { priorBoard: pb, moveObject: mo, priorPieces: withBlock }
      }
    }
  }
  return null
}

// priorBoard has `kingTeam`'s king actively checked by `attackerTeam`.
function interposeCheck(attempt, priorBoard, kingTeam, attackerTeam) {
  const kingPos = positionOfKing(attempt.priorPieces, kingTeam)
  if (kingPos === null) { return null }
  const checkers = controllingPositions({ board: priorBoard, targetPosition: kingPos, team: attackerTeam })
  if (checkers.length !== 1) { return null }
  const between = positionsBetween(checkers[0], kingPos)
  if (between.length === 0) { return null }
  return placeBlockerAndRetry(attempt, between, kingTeam, NO_EXCLUSIONS)
}

// Moving the piece off `origin` would expose moverTeam's king (pin). Build the
// after position so the latent pin reads as an active check, then interpose.
function interposePin(attempt) {
  const { priorPieces, origin, endPos, recentMoveContext, moverTeam } = attempt
  const moving = priorPieces.get(origin)
  if (moving === undefined) { return null }
  const afterPieces = new Map(priorPieces)
  afterPieces.delete(origin)
  afterPieces.set(endPos, moving)
  const afterBoard = buildBoardFromLayout(buildLayoutFromPieces(afterPieces), recentMoveContext, moverTeam)
  const kingPos = positionOfKing(afterPieces, moverTeam)
  if (kingPos === null) { return null }
  const checkers = controllingPositions({ board: afterBoard, targetPosition: kingPos, team: Board.opposingTeam(moverTeam) })
  if (checkers.length !== 1) { return null }
  const between = positionsBetween(checkers[0], kingPos)
  if (between.length === 0) { return null }
  return placeBlockerAndRetry(attempt, between, moverTeam, new Set([origin, endPos]))
}

function recentMoveContextForEnemy(ctx, random) {
  const enemyMoved = ctx.singulars?.enemy_moved_piece
  if (!enemyMoved) { return null }
  if (enemyMoved.region.kind !== 'set' || enemyMoved.region.squares.size !== 1) { return null }
  const species = committedSpecies(enemyMoved)
  if (species === null || species === undefined) { return null }

  const enemyCaptured = ctx.singulars?.enemy_captured_piece
  const capturedSpecies = enemyCaptured && enemyCaptured.species_set
    ? [...enemyCaptured.species_set].find(s => s !== null) ?? null
    : null

  return synthesizeEnemyMoveContext({
    team: enemyMoved.team,
    species,
    endPosition: [...enemyMoved.region.squares][0],
    capturedSpecies,
    random
  })
}

