import CandidateMoveAnalysisV2 from 'bot_execution/candidate_move_analysis_v2'
import ConditionEvaluatorV2 from 'bot_execution/condition_evaluator_v2'
import Board from 'gameplay/board'
import Rules from 'gameplay/rules'
import { shuffled, legalEnrichmentSpecies, ALL_POSITIONS } from 'editorV2/panels/condition_preview/shared/board_utils'
import { legalPlacementForSpecies } from 'editorV2/panels/condition_preview/shared/piece_placement'
import {
  moveKindForMoveObject, soundForMove, legalPriorTurnState,
  MOVE_KIND_CASTLE, MOVE_KIND_EN_PASSANT
} from 'editorV2/panels/condition_preview/shared/example_utils'
import { buildAggregatedResult, buildAggregatedHighlights } from 'editorV2/panels/condition_preview/shared/move_collection'
import { safeEvaluate } from 'editorV2/panels/condition_preview/shared/safe_evaluate'

const MAX_ENRICHED_EXTRA_PIECES = 10
const ENRICHMENT_END_POSITION_WEIGHT = 4

function movePathSquares(priorBoard, moveObject) {
  const start = moveObject.startPosition
  const end = moveObject.endPosition
  const species = priorBoard.pieceTypeAt(start)
  const squares = new Set([start, end])

  if ([Board.ROOK, Board.BISHOP, Board.QUEEN].includes(species)) {
    const fileDelta = Board.fileIndex(end) - Board.fileIndex(start)
    const rankDelta = Board.rankIndex(end) - Board.rankIndex(start)
    const stepFile = Math.sign(fileDelta)
    const stepRank = Math.sign(rankDelta)
    let file = Board.fileIndex(start) + stepFile
    let rank = Board.rankIndex(start) + stepRank

    while (file !== Board.fileIndex(end) || rank !== Board.rankIndex(end)) {
      squares.add(rank * 8 + file)
      file += stepFile
      rank += stepRank
    }
  } else if (species === Board.PAWN && Math.abs(end - start) === 16) {
    squares.add((start + end) / 2)
  }

  return squares
}

function forbiddenSquaresForEnrichment(example) {
  const squares = new Set(movePathSquares(example.priorBoard, example.moveObject))

  example.priorBoard.layOut.forEach((piece, position) => {
    if (piece !== Board.EMPTY_SQUARE) { squares.add(position) }
  })
  example.afterBoard.layOut.forEach((piece, position) => {
    if (piece !== Board.EMPTY_SQUARE) { squares.add(position) }
  })

  return squares
}

function weightedEnrichmentCandidateSquares(example, random) {
  const forbidden = forbiddenSquaresForEnrichment(example)
  const endPositionIsSpecial = example.moveKind !== MOVE_KIND_CASTLE && example.moveKind !== MOVE_KIND_EN_PASSANT

  const candidates = ALL_POSITIONS.filter(position => {
    if (endPositionIsSpecial && position === example.moveObject.endPosition) { return true }
    return !forbidden.has(position)
  })

  const weighted = []
  candidates.forEach(position => {
    const weight = endPositionIsSpecial && position === example.moveObject.endPosition
      ? ENRICHMENT_END_POSITION_WEIGHT
      : 1
    for (let i = 0; i < weight; i++) { weighted.push(position) }
  })

  return shuffled(weighted, random)
}

function buildEnrichmentPlacementPolicy(example, random) {
  const candidates = weightedEnrichmentCandidateSquares(example, random)
  const usedPositions = new Set()
  const movedPieceTeam = example.priorBoard.teamAt(example.moveObject.startPosition)
  const endPositionIsSpecial = example.moveKind !== MOVE_KIND_CASTLE && example.moveKind !== MOVE_KIND_EN_PASSANT

  const currentPieces = new Map()
  example.priorBoard.layOut.forEach((piece, pos) => {
    if (piece !== Board.EMPTY_SQUARE) { currentPieces.set(pos, piece) }
  })

  return {
    nextPlacement() {
      let position
      while (candidates.length > 0) {
        const candidate = candidates.shift()
        if (usedPositions.has(candidate)) { continue }
        usedPositions.add(candidate)
        position = candidate
        break
      }
      if (position === undefined) { return null }

      const team = endPositionIsSpecial && position === example.moveObject.endPosition
        ? Board.opposingTeam(movedPieceTeam)
        : (random() < 0.5 ? Board.WHITE : Board.BLACK)

      const speciesPool = legalEnrichmentSpecies(currentPieces, team)
      if (speciesPool.length === 0) { return this.nextPlacement() }
      const species = speciesPool[Math.floor(random() * speciesPool.length)]

      if (!legalPlacementForSpecies(position, species)) { return this.nextPlacement() }

      currentPieces.set(position, `${team}${species}`)
      return { position, team, species }
    }
  }
}

function deriveVerifiedExample({ combinedPlan, priorBoard, moveObject, baseExample }) {
  let recomputedMoveObject
  try {
    recomputedMoveObject = Rules.getMoveObject(moveObject.startPosition, moveObject.endPosition, priorBoard)
  } catch {
    return null
  }
  if (recomputedMoveObject.illegal) { return null }
  if (moveKindForMoveObject(recomputedMoveObject) !== baseExample.moveKind) { return null }
  if (!legalPriorTurnState(priorBoard, recomputedMoveObject)) { return null }

  const evaluator = new ConditionEvaluatorV2()
  const input = { board: priorBoard, moveObject: recomputedMoveObject }
  if (!combinedPlan.evaluationPayloads.every(payload => safeEvaluate(evaluator, payload, input))) { return null }

  const analysis = new CandidateMoveAnalysisV2(input)
  const aggregatedResult = buildAggregatedResult(combinedPlan, analysis)
  if (!aggregatedResult) { return null }

  const afterBoard = priorBoard.lightClone()
  afterBoard._hypotheticallyMovePiece(recomputedMoveObject)
  const movedPieceInRelation = (
    aggregatedResult.subjectPositions.includes(recomputedMoveObject.endPosition) ||
    aggregatedResult.targetPositions.includes(recomputedMoveObject.endPosition)
  )

  return {
    priorBoard,
    afterBoard,
    moveObject: recomputedMoveObject,
    result: aggregatedResult,
    highlights: buildAggregatedHighlights(combinedPlan, recomputedMoveObject, aggregatedResult, priorBoard, afterBoard),
    variantType: movedPieceInRelation ? 'involved' : 'separate',
    movedPieceInRelation,
    moveKind: baseExample.moveKind,
    sound: soundForMove(priorBoard, afterBoard, recomputedMoveObject),
    generationPath: baseExample.generationPath,
    enriched: true
  }
}

export function enrichExample(example, combinedPlan, random) {
  const policy = buildEnrichmentPlacementPolicy(example, random)
  let basePriorBoard = example.priorBoard.lightClone()
  let bestExample = example
  let addedCount = 0

  while (addedCount < MAX_ENRICHED_EXTRA_PIECES) {
    const placement = policy.nextPlacement()
    if (!placement) { break }

    const trialPriorBoard = basePriorBoard.lightClone()
    trialPriorBoard._placePiece({
      position: placement.position,
      pieceObject: `${placement.team}${placement.species}`
    })
    const derived = deriveVerifiedExample({
      combinedPlan,
      priorBoard: trialPriorBoard,
      moveObject: example.moveObject,
      baseExample: example
    })

    if (!derived) { break }

    bestExample = derived
    basePriorBoard = trialPriorBoard
    addedCount += 1
  }

  return addedCount > 0 ? bestExample : null
}

