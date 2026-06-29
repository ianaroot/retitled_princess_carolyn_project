import Board from 'gameplay/board'
import Rules from 'gameplay/rules'
import { originCandidatesForSpecies } from 'editorV2/panels/condition_preview/shared/geometry_utils'
import { pieceCode, shuffled, HOME_RANK } from 'editorV2/panels/condition_preview/shared/board_utils'
import { withPiece } from 'editorV2/panels/condition_preview/shared/piece_placement'
import { committedSpecies } from 'editorV2/panels/condition_preview/shared/singular_constraints'

export const MOVE_KIND_STANDARD = 'standard'
export const MOVE_KIND_CASTLE = 'castle'
export const MOVE_KIND_PROMOTION = 'promotion'
export const MOVE_KIND_EN_PASSANT = 'en_passant'

const DISPLAY_SPECIES = Object.freeze([Board.PAWN, Board.NIGHT, Board.BISHOP, Board.ROOK, Board.QUEEN, Board.KING])

function speciesMatchesFilter(species, filter = 'any', filterMode = null) {
  if (filter === 'any') { return true }

  let matches
  switch (filter) {
    case 'king':
      matches = species === Board.KING
      break
    case 'queen':
      matches = species === Board.QUEEN
      break
    case 'rook':
      matches = species === Board.ROOK
      break
    case 'bishop':
      matches = species === Board.BISHOP
      break
    case 'knight':
      matches = species === Board.NIGHT
      break
    case 'pawn':
      matches = species === Board.PAWN
      break
    case 'major':
      matches = species === Board.ROOK || species === Board.QUEEN
      break
    case 'minor':
      matches = species === Board.NIGHT || species === Board.BISHOP
      break
    default:
      matches = false
  }

  return filterMode === 'exclude' ? !matches : matches
}

export function candidateSpecies(filter = 'any', filterMode = null) {
  const pool = (filter === 'king' && filterMode !== 'exclude') ? [Board.KING] : [...DISPLAY_SPECIES]
  return pool.filter(species => speciesMatchesFilter(species, filter, filterMode))
}


// Returns null on illegal reverse placement; callers handle per their own semantics.
export function buildPriorBoard({ pieces, singulars, origin, endPos, pieceNotation, team, promotionPiece, capturedPiecePosition }) {
  const moved = singulars.moved_piece
  const movedSpecies = committedSpecies(moved)
  let priorPieces = new Map(pieces)
  priorPieces.delete(endPos)
  const originSpecies = promotionPiece ? Board.PAWN : movedSpecies
  priorPieces = withPiece(priorPieces, origin, pieceCode(moved.team, originSpecies))
  if (priorPieces === null) { return null }

  if (pieceNotation === 'O-O' || pieceNotation === 'O-O-O') {
    const homeRankStart = HOME_RANK[team] * 8
    const [rookAfterFile, rookPriorFile] = pieceNotation === 'O-O' ? [5, 7] : [3, 0]
    priorPieces.delete(homeRankStart + rookAfterFile)
    priorPieces = withPiece(priorPieces, homeRankStart + rookPriorFile, pieceCode(team, Board.ROOK))
    if (priorPieces === null) { return null }
    return priorPieces
  }

  const captured = singulars.captured_piece
  const capturedSpecies = committedSpecies(captured)
  if (capturedSpecies !== null) {
    priorPieces = withPiece(priorPieces, capturedPiecePosition ?? endPos, pieceCode(captured.team, capturedSpecies))
    if (priorPieces === null) { return null }
  }
  return priorPieces
}

export function legalPriorTurnState(priorBoard, moveObject) {
  const movedTeam = priorBoard.teamAt(moveObject.startPosition)
  if (!movedTeam) { return false }

  const opposingTeam = Board.opposingTeam(movedTeam)
  return !Rules.checkQuery({ board: priorBoard, teamString: opposingTeam })
}

export function synthesizeEnemyMoveContext({ team, species = Board.PAWN, endPosition = null, capturedSpecies = null, random }) {
  const finalEnd = endPosition ?? Math.floor(random() * 64)
  const candidates = shuffled(
    originCandidatesForSpecies(finalEnd, species, team).filter(p => p !== finalEnd),
    random
  )
  const startPosition = candidates[0] ?? finalEnd
  const isCapture = capturedSpecies !== null && capturedSpecies !== undefined
  return {
    moveObject: { startPosition, endPosition: finalEnd },
    movingTeam: team,
    movedPieceStartPosition: startPosition,
    movedPieceEndPosition: finalEnd,
    movedPieceSpeciesBeforeMove: species,
    movedPieceSpeciesAfterMove: species,
    capturedPiecePosition: isCapture ? finalEnd : null,
    capturedPieceTeam: isCapture ? Board.opposingTeam(team) : null,
    capturedPieceSpecies: isCapture ? capturedSpecies : null
  }
}

export function moveKindForMoveObject(moveObject) {
  if (/^O-O/.test(moveObject.pieceNotation || '')) { return MOVE_KIND_CASTLE }
  if (moveObject.promotionPiece) { return MOVE_KIND_PROMOTION }
  if (moveObject.additionalActions) { return MOVE_KIND_EN_PASSANT }
  return MOVE_KIND_STANDARD
}

export function soundForMove(priorBoard, afterBoard, moveObject) {
  const movedTeam = priorBoard.teamAt(moveObject.startPosition)
  const opposingTeam = Board.opposingTeam(movedTeam)
  if (Rules.checkQuery({ board: afterBoard, teamString: opposingTeam })) { return 'check' }
  if (priorBoard.layOut[moveObject.endPosition] !== Board.EMPTY_SQUARE) { return 'capture' }
  return 'move'
}

export function exampleFingerprint(example) {
  if (example.result === null) {
    return [
      example.moveKind || MOVE_KIND_STANDARD,
      example.moveObject.startPosition,
      example.moveObject.endPosition,
      example.afterBoard.layOut.join('')
    ].join(':')
  }
  const subjectSig = example.result.subjectPositions?.map(p => example.afterBoard.pieceTypeAt(p)).join(',') ?? ''
  const targetSig = example.result.targetPositions?.map(p => example.afterBoard.pieceTypeAt(p)).join(',') ?? ''
  return [
    example.moveKind || MOVE_KIND_STANDARD,
    example.moveObject.startPosition,
    example.moveObject.endPosition,
    subjectSig,
    targetSig,
    example.variantType ?? ''
  ].join(':')
}
