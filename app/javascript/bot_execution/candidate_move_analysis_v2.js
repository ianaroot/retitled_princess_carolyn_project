import Board from "gameplay/board"
import profileCollector from "gameplay/profile_collector"
import Rules from "gameplay/rules"
import { materialValue } from "gameplay/board_query_utils"
import { mobilityFromMoveObjects } from "gameplay/mobility"
import { unaryTotal, priorComparisonSourceTotal } from "bot_execution/unary_analysis"
import {
  samePiece,
  relationalResult,
  relationalActorPositions,
  metricForPositions,
  comparisonSourceTotal
} from "bot_execution/relational_analysis"
import { actorPositionsInRegion, positionMetricTotal } from "bot_execution/position_analysis"
import { combinatorialQualifyingExists } from "bot_execution/relational_qualifying"
import { SINGULAR_ACTORS, RELATIONAL_SINGULAR_ACTORS } from "bot_execution/actors"
import { compareTotals } from "bot_execution/utils"

const AFTER_BOARD = "after"
const PRIOR_BOARD = "prior"

const identityCoerce = (value) => value


class CandidateMoveAnalysisV2 {
  constructor({ board, moveObject }) {
    this.board = board
    this.moveObject = moveObject
    this._afterBoard = null
    this._caches = {
      availableMoves: new Map(),
      positionMobility: new Map(),
      relationalResult: new Map(),
      relationalActorPositions: new Map(),
      relatedTargetPositions: new Map(),
      boardQuery: {}
    }
  }

  _memoize(cacheName, key, fn) {
    const cache = this._caches[cacheName]
    if (cache.has(key)) { return cache.get(key) }
    const value = fn()
    cache.set(key, value)
    return value
  }

  cachedRelationalResult(key, fn) {
    return this._memoize('relationalResult', key, fn)
  }

  cachedRelationalActorPositions(key, fn) {
    return this._memoize('relationalActorPositions', key, fn)
  }

  cachedRelatedTargetPositions(key, fn) {
    return this._memoize('relatedTargetPositions', key, fn)
  }

  boardQueryCache() {
    return this._caches.boardQuery
  }

  afterBoard() {
    return profileCollector.measure('cma.v2.after_board', () => {
      if (!this._afterBoard) {
        const nextBoard = this.board.lightClone()
        nextBoard._hypotheticallyMovePiece(this.moveObject)
        this._afterBoard = nextBoard
      }
      return this._afterBoard
    })
  }

  boardForScope(boardScope = AFTER_BOARD) {
    return boardScope === PRIOR_BOARD ? this.board : this.afterBoard()
  }

  movedPieceTeam() {
    return this.board.teamAt(this.moveObject.startPosition)
  }

  enemyTeam() {
    return Board.opposingTeam(this.movedPieceTeam())
  }

  availableMovesFrom(position, boardScope = AFTER_BOARD) {
    return profileCollector.measure('cma.v2.available_moves_from', () => {
      return this._memoize('availableMoves', `${boardScope}:${position}`, () => {
        const board = this.boardForScope(boardScope)
        return Rules.availableMovesFrom({ board, startPosition: position })
      })
    })
  }

  positionMobility(position, boardScope = AFTER_BOARD) {
    return profileCollector.measure('cma.v2.position_mobility', () => {
      return this._memoize('positionMobility', `${boardScope}:${position}`, () => {
        const board = this.boardForScope(boardScope)
        return mobilityFromMoveObjects(
          board.pieceTypeAt(position),
          this.availableMovesFrom(position, boardScope)
        )
      })
    })
  }

  individualComparableValue(species) {
    return materialValue(species)
  }

  singularActorValue(actor, boardScope = AFTER_BOARD) {
    const species = this.singularActorSpecies(actor, boardScope)
    return species === null ? null : this.individualComparableValue(species)
  }

  resolvedMovedPiece(boardScope = AFTER_BOARD) {
    if (boardScope === PRIOR_BOARD) {
      return {
        species: this.board.pieceTypeAt(this.moveObject.startPosition),
        position: this.moveObject.startPosition
      }
    } else {
      return {
        species: this.afterBoard().pieceTypeAt(this.moveObject.endPosition),
        position: this.moveObject.endPosition
      }
    }
  }

  resolvedCapturedPiece() {
    const position = this.capturedPiecePosition()
    if (position === null) return null
    const species = this.board.pieceTypeAt(position)
    if (species === null) return null
    return { species, position }
  }

  resolvedEnemyMovedPiece(boardScope = AFTER_BOARD) {
    const recentMove = this.board.recentMoveContext
    if (!recentMove) return null
    const board = this.boardForScope(boardScope)
    const position = recentMove.movedPieceEndPosition
    const presentOnBoard =
      board.teamAt(position) === recentMove.movingTeam &&
      board.pieceTypeAt(position) === recentMove.movedPieceSpeciesAfterMove
    return {
      species: recentMove.movedPieceSpeciesAfterMove,
      position: presentOnBoard ? position : null,
      presentOnBoard
    }
  }

  resolvedEnemyCapturedPiece() {
    const recentMove = this.board.recentMoveContext
    if (!recentMove || recentMove.capturedPieceSpecies === null) return null
    return {
      species: recentMove.capturedPieceSpecies,
      position: recentMove.capturedPiecePosition ?? null
    }
  }

  singularActorSpecies(actor, boardScope = AFTER_BOARD) {
    switch (actor) {
      case "moved_piece":
        return this.resolvedMovedPiece(boardScope).species
      case "enemy_moved_piece": {
        const resolved = this.resolvedEnemyMovedPiece(boardScope)
        return resolved ? resolved.species : null
      }
      case "captured_piece": {
        const resolved = this.resolvedCapturedPiece()
        return resolved ? resolved.species : null
      }
      case "enemy_captured_piece": {
        const resolved = this.resolvedEnemyCapturedPiece()
        return resolved ? resolved.species : null
      }
      default:
        return null
    }
  }

  singularActorMatchesFilter({ actor, filter = "any", filterMode = null, boardScope = AFTER_BOARD }) {
    return this.matchesFilter({
      species: this.singularActorSpecies(actor, boardScope),
      filter,
      filterMode
    })
  }

  singularActorPresentForMobility({ actor, filter = "any", filterMode = null, boardScope = AFTER_BOARD }) {
    switch (actor) {
      case "moved_piece": {
        const resolved = this.resolvedMovedPiece(boardScope)
        return this.matchesFilter({ species: resolved.species, filter, filterMode })
      }
      case "enemy_moved_piece": {
        const resolved = this.resolvedEnemyMovedPiece(boardScope)
        return Boolean(resolved?.presentOnBoard) && this.matchesFilter({ species: resolved.species, filter, filterMode })
      }
      default:
        return false
    }
  }

  relationalSingularActorResolves({ actor, filter = "any", filterMode = null, boardScope = AFTER_BOARD }) {
    if (!RELATIONAL_SINGULAR_ACTORS.has(actor)) { return true }
    return relationalActorPositions(this, { actor, filter, filterMode, boardScope }).length > 0
  }

  capturedPiecePosition() {
    const startPosition = this.moveObject.startPosition
    const endPosition = this.moveObject.endPosition
    const movedPieceType = this.board.pieceTypeAt(startPosition)
    if (this.board.teamAt(endPosition) !== Board.EMPTY) { return endPosition }
    const changedFiles = Board.fileLabel(startPosition) !== Board.fileLabel(endPosition)
    if (movedPieceType === Board.PAWN && changedFiles) {
      return this.movedPieceTeam() === Board.WHITE
        ? endPosition - 8
        : endPosition + 8
    }
    return null
  }

  capturedPieceSpecies() {
    const position = this.capturedPiecePosition()
    if (position === null) return null
    return this.board.pieceTypeAt(position)
  }

  normalizedFilterMode(filter, filterMode) {
    return filter === "any" ? "include" : (filterMode || "include")
  }

  matchesFilter({ species, filter = "any", filterMode = null }) {
    if (species === null) return false
    if (filter === "any") return true
    const normalizedFilterMode = this.normalizedFilterMode(filter, filterMode)
    const baseMatch = this.matchesSpeciesFilter({ species, filter })
    return normalizedFilterMode === "exclude" ? !baseMatch : baseMatch
  }

  matchesSpeciesFilter({ species, filter }) {
    switch (filter) {
      case "king":   return species === Board.KING
      case "queen":  return species === Board.QUEEN
      case "rook":   return species === Board.ROOK
      case "bishop": return species === Board.BISHOP
      case "knight": return species === Board.NIGHT
      case "pawn":   return species === Board.PAWN
      case "major":  return species === Board.QUEEN || species === Board.ROOK
      case "minor":  return species === Board.BISHOP || species === Board.NIGHT
      default:
        throw new Error(`Unknown V2 filter: ${filter}`)
    }
  }

  uniquePositions(positions) {
    return Array.from(new Set(positions))
  }

  // ===== Value metric evaluation =====

  evaluateRelationalValueMetrics(args) {
    const { subjectMetric, targetMetric } = args
    if (!targetMetric) { return this.dispatchSingleSubjectMetric(args) }
    if (!subjectMetric) { return this.dispatchSingleTargetMetric(args) }
    return this.dispatchBothSideMetrics(args)
  }

  dispatchSingleSubjectMetric({ pairs, subjectMetric, subjectComparator, subjectReference, subjectCoerce = identityCoerce }) {
    if (subjectMetric === "individual_value") {
      return this.relationalFilterPairsByValue(pairs, "subject", subjectComparator, subjectReference).length > 0
    }
    if (subjectMetric === "aggregate_value") {
      return compareTotals(subjectComparator, subjectCoerce(this.relationalAggregateValueFromPairs(pairs, "subject")), subjectReference)
    }
    throw new Error(`Unsupported single-subject value metric: ${subjectMetric}`)
  }

  dispatchSingleTargetMetric({ pairs, targetMetric, targetComparator, targetReference, targetCoerce = identityCoerce }) {
    if (targetMetric === "individual_value") {
      return this.relationalFilterPairsByValue(pairs, "target", targetComparator, targetReference).length > 0
    }
    if (targetMetric === "aggregate_value") {
      return compareTotals(targetComparator, targetCoerce(this.relationalAggregateValueFromPairs(pairs, "target")), targetReference)
    }
    throw new Error(`Unsupported single-target value metric: ${targetMetric}`)
  }

  dispatchBothSideMetrics({
    pairs,
    subjectMetric, subjectComparator, subjectReference, subjectCoerce = identityCoerce,
    targetMetric, targetComparator, targetReference, targetCoerce = identityCoerce
  }) {
    if (subjectMetric === "count" && targetMetric === "individual_value") {
      const filtered = this.relationalFilterPairsByValue(pairs, "target", targetComparator, targetReference)
      return compareTotals(subjectComparator, this.uniquePositions(filtered.map(p => p.subjectPosition)).length, subjectReference)
    }
    if (subjectMetric === "individual_value" && targetMetric === "count") {
      const filtered = this.relationalFilterPairsByValue(pairs, "subject", subjectComparator, subjectReference)
      return compareTotals(targetComparator, this.uniquePositions(filtered.map(p => p.targetPosition)).length, targetReference)
    }
    if (subjectMetric === "count" && targetMetric === "aggregate_value") {
      return this.relationalCombinatorial({ pairs, groupBySide: "subject", valueSide: "target", valueComparator: targetComparator, valueReferenceTotal: targetReference, countComparator: subjectComparator, countReferenceTotal: subjectReference })
    }
    if (subjectMetric === "aggregate_value" && targetMetric === "count") {
      return this.relationalCombinatorial({ pairs, groupBySide: "target", valueSide: "subject", valueComparator: subjectComparator, valueReferenceTotal: subjectReference, countComparator: targetComparator, countReferenceTotal: targetReference })
    }
    if (subjectMetric === "individual_value" && targetMetric === "individual_value") {
      const subjectFiltered = this.relationalFilterPairsByValue(pairs, "subject", subjectComparator, subjectReference)
      return this.relationalFilterPairsByValue(subjectFiltered, "target", targetComparator, targetReference).length > 0
    }
    if (subjectMetric === "individual_value" && targetMetric === "aggregate_value") {
      const filtered = this.relationalFilterPairsByValue(pairs, "subject", subjectComparator, subjectReference)
      return compareTotals(targetComparator, targetCoerce(this.relationalAggregateValueFromPairs(filtered, "target")), targetReference)
    }
    if (subjectMetric === "aggregate_value" && targetMetric === "individual_value") {
      const filtered = this.relationalFilterPairsByValue(pairs, "target", targetComparator, targetReference)
      return compareTotals(subjectComparator, subjectCoerce(this.relationalAggregateValueFromPairs(filtered, "subject")), subjectReference)
    }
    throw new Error(`Unsupported two-side value metric combination: ${subjectMetric} / ${targetMetric}`)
  }

  relationalFilterPairsByValue(pairs, side, comparator, referenceTotal) {
    const board = this.afterBoard()
    return pairs.filter(pair => {
      const position = side === "subject" ? pair.subjectPosition : pair.targetPosition
      const value = this.individualComparableValue(board.pieceTypeAt(position))
      if (value === null) { return false }
      return compareTotals(comparator, value, referenceTotal)
    })
  }

  relationalAggregateValueFromPairs(pairs, side) {
    if (pairs.length === 0) { return null }
    const board = this.afterBoard()
    const positionKey = side === "subject" ? "subjectPosition" : "targetPosition"
    const uniquePositions = new Set(pairs.map(pair => pair[positionKey]))
    let sum = 0
    for (const position of uniquePositions) {
      sum += materialValue(board.pieceTypeAt(position))
    }
    return sum
  }

  relationalCombinatorial(args) {
    return combinatorialQualifyingExists({ ...args, board: this.afterBoard() })
  }

  // ===== Delegates =====

  samePiece({ subject, target, subjectFilter, subjectFilterMode }) {
    return samePiece(this, { subject, target, subjectFilter, subjectFilterMode })
  }

  unaryTotal({ actor, filter = "any", filterMode = null, operator, boardScope = AFTER_BOARD }) {
    return unaryTotal(this, { actor, filter, filterMode, operator, boardScope })
  }

  priorComparisonSourceTotal({ subject, subjectFilter, subjectFilterMode, operator }) {
    return priorComparisonSourceTotal(this, { subject, subjectFilter, subjectFilterMode, operator })
  }

  relationalResult({ subject, subjectFilter = "any", subjectFilterMode = null, operator, target, targetFilter = "any", targetFilterMode = null, boardScope = AFTER_BOARD }) {
    return relationalResult(this, { subject, subjectFilter, subjectFilterMode, operator, target, targetFilter, targetFilterMode, boardScope })
  }

  relationalActorPositions({ actor, filter = "any", filterMode = null, boardScope = AFTER_BOARD }) {
    return relationalActorPositions(this, { actor, filter, filterMode, boardScope })
  }

  metricForPositions({ metric, positions, boardScope = AFTER_BOARD }) {
    return metricForPositions(this, { metric, positions, boardScope })
  }

  comparisonSourceTotal({ comparisonSource, subject, subjectFilter = "any", subjectFilterMode = null, operator }) {
    return comparisonSourceTotal(this, { comparisonSource, subject, subjectFilter, subjectFilterMode, operator })
  }

  actorPositionsInRegion({ actor, filter = "any", filterMode = null, positionAxis, positionComparator, positionTarget, boardScope = AFTER_BOARD }) {
    return actorPositionsInRegion(this, { actor, filter, filterMode, positionAxis, positionComparator, positionTarget, boardScope })
  }

  positionMetricTotal({ positions, operator, boardScope = AFTER_BOARD }) {
    return positionMetricTotal(this, { positions, operator, boardScope })
  }
}

export default CandidateMoveAnalysisV2
