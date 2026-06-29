import Board from 'gameplay/board'
import { controllingPositions, nextPositionOnRay } from 'gameplay/board_query_utils'
import { ALL_POSITIONS, buildBoardFromLayout, buildLayoutFromPieces, pieceCode, shuffled } from 'editorV2/panels/condition_preview/shared/board_utils'
import { attackerCandidatesFor } from 'editorV2/panels/condition_preview/shared/geometry_utils'
import { withPiece, teamHasKing, legalPlacementForSpecies, positionOfKing } from 'editorV2/panels/condition_preview/shared/piece_placement'
import { commitMovedPiece } from 'editorV2/panels/condition_preview/shared/singular_constraints'
import { respectsAllCaps } from 'editorV2/panels/condition_preview/forward_proposition/respect_caps'

const CHECK_ATTACKER_SPECIES = Object.freeze([
  Board.QUEEN, Board.ROOK, Board.BISHOP, Board.NIGHT, Board.PAWN
])

export function placeKingDeliberately(pieces, team, frame, ctx, random) {
  if (teamHasKing(pieces, team)) { return pieces }

  const requireOutOfCheck = team === teamThatJustMoved(frame, ctx)
  const candidates = shuffled(
    ALL_POSITIONS.filter(pos => !pieces.has(pos)),
    random
  )

  for (const pos of candidates) {
    if (!isLegalKingSquare({ pieces, pos, team, requireOutOfCheck, ctx })) { continue }
    const next = withPiece(pieces, pos, `${team}${Board.KING}`)
    if (next === null) { continue }
    return next
  }
  return null
}

// Place king on a ray from targetPos in `step` direction
export function placeKingOnRayThroughTarget({ pieces, team, frame, ctx, targetPos, step, random }) {
  const requireOutOfCheck = team === teamThatJustMoved(frame, ctx)
  const ourKingCode = `${team}${Board.KING}`
  const candidates = []
  let current = nextPositionOnRay(targetPos, step)
  while (current !== null) {
    const occupant = pieces.get(current)
    if (occupant) {
      if (occupant === ourKingCode) { return pieces }
      return null
    }
    candidates.push(current)
    current = nextPositionOnRay(current, step)
  }
  if (teamHasKing(pieces, team)) { return null }

  for (const pos of shuffled(candidates, random)) {
    if (!isLegalKingSquare({ pieces, pos, team, requireOutOfCheck, ctx })) { continue }
    const next = withPiece(pieces, pos, ourKingCode)
    if (next === null) { continue }
    return next
  }
  return null
}

function isLegalKingSquare({ pieces, pos, team, requireOutOfCheck, ctx }) {
  if (anyKingIsAdjacentTo(pieces, pos)) { return false }
  if (requireOutOfCheck && squareAttackedByEnemy(pieces, pos, team)) { return false }
  if (!respectsAllCaps(team, Board.KING, pos, ctx, pieces)) { return false }
  return true
}

function teamThatJustMoved(frame, ctx) {
  return frame === 'current' ? ctx.movingTeam : ctx.enemyTeam
}

function squareAttackedByEnemy(pieces, position, team) {
  const board = buildBoardFromLayout(buildLayoutFromPieces(pieces))
  const enemyTeam = Board.opposingTeam(team)
  return controllingPositions({ board, targetPosition: position, team: enemyTeam }).length > 0
}

// Place team's king on a square attacked by an enemy piece, placing the
// attacker too if needed
export function placeKingInCheck({ pieces, team, frame, ctx, random }) {
  const enemyTeam = Board.opposingTeam(team)
  const existingKingPos = positionOfKing(pieces, team)
  if (existingKingPos !== null) {
    return placeAttackerControlling({
      pieces, kingPos: existingKingPos, attackerTeam: enemyTeam, ctx, random
    })
  }

  const candidates = shuffled(
    ALL_POSITIONS.filter(pos => !pieces.has(pos)),
    random
  )
  for (const kingPos of candidates) {
    if (!isLegalKingSquare({ pieces, pos: kingPos, team, requireOutOfCheck: false, ctx })) { continue }
    const withKing = withPiece(pieces, kingPos, `${team}${Board.KING}`)
    if (withKing === null) { continue }
    const next = placeAttackerControlling({
      pieces: withKing, kingPos, attackerTeam: enemyTeam, ctx, random
    })
    if (next !== null) { return next }
  }
  return null
}

function placeAttackerControlling({ pieces, kingPos, attackerTeam, ctx, random }) {
  const board = buildBoardFromLayout(buildLayoutFromPieces(pieces))
  for (const species of shuffled(CHECK_ATTACKER_SPECIES, random)) {
    const candidates = shuffled(
      attackerCandidatesFor(kingPos, species, attackerTeam, board).filter(pos => !pieces.has(pos)),
      random
    )
    for (const pos of candidates) {
      if (!legalPlacementForSpecies(pos, species)) { continue }
      if (!respectsAllCaps(attackerTeam, species, pos, ctx, pieces)) { continue }
      const next = withPiece(pieces, pos, pieceCode(attackerTeam, species))
      if (next !== null) { return next }
    }
  }
  return null
}

// Place team's king in stalemate: not in check, no escape squares legal
export function placeKingInStalemate({ pieces, team, frame, ctx, random }) {
  if (positionOfKing(pieces, team) !== null) { return null }
  if (positionOfKing(pieces, Board.opposingTeam(team)) !== null) { return null }

  const enemyTeam = Board.opposingTeam(team)
  const kingCandidates = shuffled(stalemateKingCandidates(pieces), random)

  for (const kingPos of kingCandidates) {
    if (!isLegalKingSquare({ pieces, pos: kingPos, team, requireOutOfCheck: false, ctx })) { continue }
    const withConstrainedKing = withPiece(pieces, kingPos, `${team}${Board.KING}`)
    if (withConstrainedKing === null) { continue }

    const enemyKingCandidates = shuffled(
      ALL_POSITIONS.filter(p => !withConstrainedKing.has(p) && !isAdjacent(p, kingPos)),
      random
    )
    for (const enemyKingPos of enemyKingCandidates) {
      const withBothKings = withPiece(withConstrainedKing, enemyKingPos, `${enemyTeam}${Board.KING}`)
      if (withBothKings === null) { continue }

      const sealed = sealEscapeSquares({
        pieces: withBothKings, team, kingPos, enemyKingPos, ctx, random
      })
      if (sealed === null) { continue }
      if (!isStalemate({ pieces: sealed, team, kingPos })) { continue }
      return sealed
    }
  }
  return null
}

function stalemateKingCandidates(pieces) {
  const empties = ALL_POSITIONS.filter(pos => !pieces.has(pos))
  const corners = empties.filter(isCorner)
  const edges = empties.filter(p => !isCorner(p) && isEdge(p))
  const interior = empties.filter(p => !isEdge(p))
  return [...corners, ...edges, ...interior]
}

function isCorner(pos) {
  return pos === 0 || pos === 7 || pos === 56 || pos === 63
}

function isEdge(pos) {
  const file = pos % 8
  const rank = Math.floor(pos / 8)
  return file === 0 || file === 7 || rank === 0 || rank === 7
}

function isAdjacent(a, b) {
  if (a === b) { return false }
  const fileDiff = Math.abs((a % 8) - (b % 8))
  const rankDiff = Math.abs(Math.floor(a / 8) - Math.floor(b / 8))
  return fileDiff <= 1 && rankDiff <= 1
}

// For each king-adjacent escape square, ensure it's blocked: occupied,
// adjacent to enemy king, or attacked by an enemy piece (not the king).
function sealEscapeSquares({ pieces, team, kingPos, enemyKingPos, ctx, random }) {
  const enemyTeam = Board.opposingTeam(team)
  const escapeSquares = adjacentSquares(kingPos)
  let next = pieces

  for (const escape of escapeSquares) {
    if (squareIsBlocked({ pieces: next, escape, team, enemyKingPos })) { continue }
    next = placeBlockerForEscape({ pieces: next, escape, team, enemyTeam, ctx, random })
    if (next === null) { return null }
  }
  return next
}

function adjacentSquares(pos) {
  const file = pos % 8
  const rank = Math.floor(pos / 8)
  const out = []
  for (let df = -1; df <= 1; df += 1) {
    for (let dr = -1; dr <= 1; dr += 1) {
      if (df === 0 && dr === 0) { continue }
      const f = file + df
      const r = rank + dr
      if (f < 0 || f > 7 || r < 0 || r > 7) { continue }
      out.push(r * 8 + f)
    }
  }
  return out
}

function squareIsBlocked({ pieces, escape, team, enemyKingPos }) {
  if (pieces.has(escape)) { return true }
  if (isAdjacent(escape, enemyKingPos)) { return true }
  const board = buildBoardFromLayout(buildLayoutFromPieces(pieces))
  const enemyTeam = Board.opposingTeam(team)
  return controllingPositions({ board, targetPosition: escape, team: enemyTeam }).length > 0
}

function placeBlockerForEscape({ pieces, escape, team, enemyTeam, ctx, random }) {
  // Try ally on the escape first, then enemy attacker controlling it.
  if (random() < 0.5) {
    const next = tryPlaceAlly({ pieces, escape, team, ctx, random })
    if (next !== null) { return next }
  }
  return tryPlaceEnemyAttacker({ pieces, escape, enemyTeam, ctx, random })
}

function tryPlaceAlly({ pieces, escape, team, ctx, random }) {
  const species = [Board.PAWN, Board.NIGHT, Board.BISHOP, Board.ROOK, Board.QUEEN]
  for (const s of shuffled(species, random)) {
    if (!legalPlacementForSpecies(escape, s)) { continue }
    if (!respectsAllCaps(team, s, escape, ctx, pieces)) { continue }
    const next = withPiece(pieces, escape, pieceCode(team, s))
    if (next !== null) { return next }
  }
  return null
}

function tryPlaceEnemyAttacker({ pieces, escape, enemyTeam, ctx, random }) {
  const board = buildBoardFromLayout(buildLayoutFromPieces(pieces))
  for (const species of shuffled(CHECK_ATTACKER_SPECIES, random)) {
    const candidates = shuffled(
      attackerCandidatesFor(escape, species, enemyTeam, board).filter(p => !pieces.has(p)),
      random
    )
    for (const pos of candidates) {
      if (!legalPlacementForSpecies(pos, species)) { continue }
      if (!respectsAllCaps(enemyTeam, species, pos, ctx, pieces)) { continue }
      const next = withPiece(pieces, pos, pieceCode(enemyTeam, species))
      if (next !== null) { return next }
    }
  }
  return null
}

function isStalemate({ pieces, team, kingPos }) {
  const board = buildBoardFromLayout(buildLayoutFromPieces(pieces))
  const enemyTeam = Board.opposingTeam(team)
  if (controllingPositions({ board, targetPosition: kingPos, team: enemyTeam }).length > 0) {
    return false
  }
  for (const escape of adjacentSquares(kingPos)) {
    if (escapeIsLegal({ pieces, escape, team, kingPos })) { return false }
  }
  return true
}

function escapeIsLegal({ pieces, escape, team, kingPos }) {
  const occupant = pieces.get(escape)
  if (occupant && occupant.charAt(0) === team) { return false }
  if (anyKingIsAdjacentTo(new Map([...pieces].filter(([p]) => p !== kingPos)), escape)) { return false }
  const candidate = new Map(pieces)
  candidate.delete(kingPos)
  candidate.set(escape, `${team}${Board.KING}`)
  const board = buildBoardFromLayout(buildLayoutFromPieces(candidate))
  const enemyTeam = Board.opposingTeam(team)
  return controllingPositions({ board, targetPosition: escape, team: enemyTeam }).length === 0
}

export function placeKingInCheckmate({ pieces, team, frame, ctx, random }) {
  if (positionOfKing(pieces, team) !== null) { return null }
  const patterns = shuffled([placeSmotherMate, placeBackRankMate, placeQueenMate], random)
  for (const pattern of patterns) {
    const next = pattern({ pieces, team, ctx, random })
    if (next !== null) { return next }
  }
  return null
}

// Smother mate: BK in corner, 3 own pieces blocking escapes, WN giving check
// from an L-distance square BK can't capture.
function placeSmotherMate({ pieces, team, ctx, random }) {
  const enemyTeam = Board.opposingTeam(team)
  const corners = shuffled(team === Board.BLACK ? [56, 63] : [0, 7], random)
  for (const cornerPos of corners) {
    if (pieces.has(cornerPos)) { continue }
    if (!isLegalKingSquare({ pieces, pos: cornerPos, team, requireOutOfCheck: false, ctx })) { continue }
    const escape = adjacentSquares(cornerPos)
    for (const knightPos of shuffled(knightSquaresAttacking(cornerPos), random)) {
      if (pieces.has(knightPos)) { continue }
      const enemyKingCandidates = shuffled(
        ALL_POSITIONS.filter(p =>
          !pieces.has(p) && p !== cornerPos && p !== knightPos &&
          !isAdjacent(p, cornerPos) && !isAdjacent(p, knightPos) &&
          !escape.includes(p)
        ),
        random
      )
      for (const enemyKingPos of enemyKingCandidates) {
        let next = withPiece(pieces, cornerPos, `${team}${Board.KING}`)
        if (next === null) { continue }
        next = withPiece(next, enemyKingPos, `${enemyTeam}${Board.KING}`)
        if (next === null) { continue }
        let smotheredOk = true
        for (const e of escape) {
          const placed = placeOwnBlocker({ pieces: next, pos: e, team, ctx, random })
          if (placed === null) { smotheredOk = false; break }
          next = placed
        }
        if (!smotheredOk) { continue }
        if (!respectsAllCaps(enemyTeam, Board.NIGHT, knightPos, ctx, next)) { continue }
        next = withPiece(next, knightPos, pieceCode(enemyTeam, Board.NIGHT))
        if (next === null) { continue }
        if (!isCheckmate({ pieces: next, team, kingPos: cornerPos })) { continue }
        const committed = commitMovedPiece(ctx, Board.NIGHT, knightPos)
        if (!committed) { continue }
        return next
      }
    }
  }
  return null
}

// Back-rank mate: BK on its back rank (rank 0 for white-team, rank 7 for
// black-team — but since "team" here is the constrained team, we use whichever
// side row the king starts on. For a B king on rank 7, WR on the same rank
// gives check, B's own pieces in rank 6 block escape.
function placeBackRankMate({ pieces, team, ctx, random }) {
  const enemyTeam = Board.opposingTeam(team)
  // Pick a back-rank square for BK.
  const backRank = team === Board.BLACK ? 7 : 0
  const escapeRank = team === Board.BLACK ? 6 : 5  // rank in front of king
  const escapeRankFwd = team === Board.BLACK ? -8 : 8

  for (const file of shuffled([0,1,2,3,4,5,6,7], random)) {
    const kingPos = backRank * 8 + file
    if (pieces.has(kingPos)) { continue }
    if (!isLegalKingSquare({ pieces, pos: kingPos, team, requireOutOfCheck: false, ctx })) { continue }
    // 3 escape squares on adjacent files / forward rank
    const escapes = adjacentSquares(kingPos).filter(e => !pieces.has(e))
    if (escapes.length === 0) { continue }

    // Place WR on king's back rank for check.
    const rookCandidates = shuffled(
      [...Array(8).keys()].map(f => backRank * 8 + f).filter(p => p !== kingPos && !pieces.has(p)),
      random
    )
    for (const rookPos of rookCandidates) {
      const enemyKingCandidates = shuffled(
        ALL_POSITIONS.filter(p =>
          !pieces.has(p) && p !== kingPos && p !== rookPos &&
          !isAdjacent(p, kingPos) && !isAdjacent(p, rookPos) &&
          !escapes.includes(p)
        ),
        random
      )
      for (const enemyKingPos of enemyKingCandidates) {
        let next = withPiece(pieces, kingPos, `${team}${Board.KING}`)
        if (next === null) { continue }
        next = withPiece(next, enemyKingPos, `${enemyTeam}${Board.KING}`)
        if (next === null) { continue }
        // Block forward-rank escapes with own pieces.
        let blocksOk = true
        for (const e of escapes) {
          // Only block escape squares NOT on the rook's rank (those are blocked by the rook itself).
          if (Math.floor(e / 8) === backRank) { continue }
          const placed = placeOwnBlocker({ pieces: next, pos: e, team, ctx, random })
          if (placed === null) { blocksOk = false; break }
          next = placed
        }
        if (!blocksOk) { continue }
        if (!respectsAllCaps(enemyTeam, Board.ROOK, rookPos, ctx, next)) { continue }
        next = withPiece(next, rookPos, pieceCode(enemyTeam, Board.ROOK))
        if (next === null) { continue }
        if (!isCheckmate({ pieces: next, team, kingPos })) { continue }
        const committed = commitMovedPiece(ctx, Board.ROOK, rookPos)
        if (!committed) { continue }
        return next
      }
    }
  }
  return null
}

// King-and-queen mate: BK on edge, WQ adjacent giving check, WK supports WQ
// so WQ can't be captured.
function placeQueenMate({ pieces, team, ctx, random }) {
  const enemyTeam = Board.opposingTeam(team)
  const edgePositions = ALL_POSITIONS.filter(p => {
    const f = p % 8, r = Math.floor(p / 8)
    return f === 0 || f === 7 || r === 0 || r === 7
  })
  for (const kingPos of shuffled(edgePositions, random)) {
    if (pieces.has(kingPos)) { continue }
    if (!isLegalKingSquare({ pieces, pos: kingPos, team, requireOutOfCheck: false, ctx })) { continue }

    const queenCandidates = shuffled(adjacentSquares(kingPos), random)
    for (const queenPos of queenCandidates) {
      if (pieces.has(queenPos)) { continue }
      // Enemy king must support queen (be adjacent to queenPos) but not adjacent to BK.
      const enemyKingCandidates = shuffled(
        adjacentSquares(queenPos).filter(p =>
          !pieces.has(p) && p !== kingPos && !isAdjacent(p, kingPos)
        ),
        random
      )
      for (const enemyKingPos of enemyKingCandidates) {
        let next = withPiece(pieces, kingPos, `${team}${Board.KING}`)
        if (next === null) { continue }
        next = withPiece(next, enemyKingPos, `${enemyTeam}${Board.KING}`)
        if (next === null) { continue }
        if (!respectsAllCaps(enemyTeam, Board.QUEEN, queenPos, ctx, next)) { continue }
        next = withPiece(next, queenPos, pieceCode(enemyTeam, Board.QUEEN))
        if (next === null) { continue }
        if (!isCheckmate({ pieces: next, team, kingPos })) { continue }
        const committed = commitMovedPiece(ctx, Board.QUEEN, queenPos)
        if (!committed) { continue }
        return next
      }
    }
  }
  return null
}

function placeOwnBlocker({ pieces, pos, team, ctx, random }) {
  const species = [Board.PAWN, Board.NIGHT, Board.BISHOP, Board.ROOK, Board.QUEEN]
  for (const s of shuffled(species, random)) {
    if (!legalPlacementForSpecies(pos, s)) { continue }
    if (!respectsAllCaps(team, s, pos, ctx, pieces)) { continue }
    const placed = withPiece(pieces, pos, pieceCode(team, s))
    if (placed !== null) { return placed }
  }
  return null
}

function knightSquaresAttacking(pos) {
  const file = pos % 8
  const rank = Math.floor(pos / 8)
  const offsets = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]
  const out = []
  for (const [df, dr] of offsets) {
    const f = file + df
    const r = rank + dr
    if (f < 0 || f > 7 || r < 0 || r > 7) { continue }
    out.push(r * 8 + f)
  }
  return out
}

function isCheckmate({ pieces, team, kingPos }) {
  const board = buildBoardFromLayout(buildLayoutFromPieces(pieces))
  const enemyTeam = Board.opposingTeam(team)
  if (controllingPositions({ board, targetPosition: kingPos, team: enemyTeam }).length === 0) {
    return false
  }
  for (const escape of adjacentSquares(kingPos)) {
    if (escapeIsLegal({ pieces, escape, team, kingPos })) { return false }
  }
  return true
}

function squaresAreAdjacent(a, b) {
  return (
    Math.abs(Board.rankIndex(a) - Board.rankIndex(b)) <= 1 &&
    Math.abs(Board.fileIndex(a) - Board.fileIndex(b)) <= 1 &&
    a !== b
  )
}

function anyKingIsAdjacentTo(pieces, position) {
  for (const [sq, piece] of pieces.entries()) {
    if (
      (piece === Board.WHITE_KING || piece === Board.BLACK_KING) &&
      squaresAreAdjacent(sq, position)
    ) {
      return true
    }
  }
  return false
}

export function placeKingsIfAbsent(pieces, random, ctx = { propositions: [] }) {
  let result = pieces

  for (const team of [Board.WHITE, Board.BLACK]) {
    if (teamHasKing(result, team)) { continue }

    const candidates = shuffled(
      ALL_POSITIONS.filter(pos => !result.has(pos)),
      random
    )

    let placed = false
    for (const pos of candidates) {
      if (anyKingIsAdjacentTo(result, pos)) { continue }
      if (!respectsAllCaps(team, Board.KING, pos, ctx, result)) { continue }
      const next = withPiece(result, pos, `${team}${Board.KING}`)
      if (next === null) { continue }
      result = next
      placed = true
      break
    }
    if (!placed) { return null }
  }

  return result
}
