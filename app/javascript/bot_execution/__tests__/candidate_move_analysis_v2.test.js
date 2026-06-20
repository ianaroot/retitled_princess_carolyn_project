import { describe, expect, it } from 'vitest'

import Board from 'gameplay/board'
import CandidateMoveAnalysisV2 from 'bot_execution/candidate_move_analysis_v2'

import { buildBoard, getMove, playMoveSequence, position, square } from 'gameplay/__tests__/helpers'
import { buildEnemyMoveContext } from 'bot_execution/__tests__/helpers'

function pairSquares(result) {
  return result.pairs
    .map(pair => [square(pair.subjectPosition), square(pair.targetPosition)])
    .sort((a, b) => a.join(':').localeCompare(b.join(':')))
}

function squaresFor(positions) {
  return positions.map(square).sort()
}

describe('CandidateMoveAnalysisV2', () => {
  describe('general unary subjects', () => {
    it('counts, values, and sums mobility for allied and enemy subjects', () => {
      const board = buildBoard({
        pieces: {
          e1: 'wK',
          e8: 'bK',
          d1: 'wQ',
          c3: 'wN',
          c6: 'bN',
          a7: 'bP',
          h2: 'wP'
        }
      })

      const moveObject = getMove('h2', 'h3', board)
      const analysis = new CandidateMoveAnalysisV2({ board, moveObject })

      expect(
        analysis.unaryTotal({
          actor: 'allied',
          filter: 'any',
          operator: 'count'
        })
      ).toBe(4)

      expect(
        analysis.unaryTotal({
          actor: 'enemy',
          filter: 'king',
          filterMode: 'exclude',
          operator: 'value'
        })
      ).toBe(4)

      expect(
        analysis.unaryTotal({
          actor: 'allied',
          filter: 'pawn',
          filterMode: 'exclude',
          operator: 'count'
        })
      ).toBe(3)

      expect(
        analysis.unaryTotal({
          actor: 'enemy',
          filter: 'knight',
          operator: 'mobility'
        })
      ).toBe(7)
    })

    it('supports major and minor filters for unary aggregate queries', () => {
      const board = buildBoard({
        pieces: {
          e1: 'wK',
          e8: 'bK',
          d1: 'wQ',
          a1: 'wR',
          c3: 'wN',
          f1: 'wB',
          h2: 'wP'
        }
      })

      const moveObject = getMove('h2', 'h3', board)
      const analysis = new CandidateMoveAnalysisV2({ board, moveObject })

      expect(
        analysis.unaryTotal({
          actor: 'allied',
          filter: 'major',
          operator: 'count'
        })
      ).toBe(2)

      expect(
        analysis.unaryTotal({
          actor: 'allied',
          filter: 'major',
          operator: 'value'
        })
      ).toBe(14)

      expect(
        analysis.unaryTotal({
          actor: 'allied',
          filter: 'minor',
          operator: 'count'
        })
      ).toBe(2)

      expect(
        analysis.unaryTotal({
          actor: 'allied',
          filter: 'minor',
          operator: 'value'
        })
      ).toBe(6)

      expect(
        analysis.unaryTotal({
          actor: 'allied',
          filter: 'major',
          filterMode: 'exclude',
          operator: 'count'
        })
      ).toBe(4)

      expect(
        analysis.unaryTotal({
          actor: 'allied',
          filter: 'minor',
          filterMode: 'exclude',
          operator: 'count'
        })
      ).toBe(4)
    })

    it('returns Infinity for a king-containing aggregate value total', () => {
      const board = buildBoard({
        pieces: {
          e1: 'wK',
          e8: 'bK',
          a1: 'wR',
          h2: 'wP'
        }
      })

      const moveObject = getMove('h2', 'h3', board)
      const analysis = new CandidateMoveAnalysisV2({ board, moveObject })

      expect(
        analysis.unaryTotal({
          actor: 'allied',
          filter: 'any',
          operator: 'value'
        })
      ).toBe(Infinity)
    })
  })

  describe('moved_piece', () => {
    it('resolves count, value, mobility, and prior-board comparison correctly for a promotion', () => {
      const board = buildBoard({
        pieces: {
          e1: 'wK',
          e8: 'bK',
          g7: 'wP'
        }
      })

      const moveObject = getMove('g7', 'g8', board, Board.QUEEN)
      const analysis = new CandidateMoveAnalysisV2({ board, moveObject })

      expect(
        analysis.unaryTotal({
          actor: 'moved_piece',
          filter: 'queen',
          operator: 'count'
        })
      ).toBe(1)

      expect(
        analysis.unaryTotal({
          actor: 'moved_piece',
          filter: 'any',
          operator: 'value'
        })
      ).toBe(9)

      expect(
        analysis.unaryTotal({
          actor: 'moved_piece',
          filter: 'any',
          operator: 'mobility'
        })
      ).toBe(17)

      expect(
        analysis.comparisonSourceTotal({
          comparisonSource: 'prior_board_state',
          subject: 'moved_piece',
          subjectFilter: 'any',
          operator: 'value'
        })
      ).toBe(1)

      expect(
        analysis.comparisonSourceTotal({
          comparisonSource: 'moved_piece',
          subject: 'moved_piece',
          subjectFilter: 'any',
          operator: 'value'
        })
      ).toBe(9)
    })
  })

  describe('captured_piece', () => {
    it('handles all unary verbs it supports on a normal capture', () => {
      const board = buildBoard({
        pieces: {
          e1: 'wK',
          e8: 'bK',
          e4: 'wP',
          d5: 'bN'
        }
      })

      const moveObject = getMove('e4', 'd5', board)
      const analysis = new CandidateMoveAnalysisV2({ board, moveObject })

      expect(
        analysis.unaryTotal({
          actor: 'captured_piece',
          filter: 'knight',
          operator: 'count'
        })
      ).toBe(1)

      expect(
        analysis.unaryTotal({
          actor: 'captured_piece',
          filter: 'any',
          operator: 'value'
        })
      ).toBe(3)

      expect(
        analysis.comparisonSourceTotal({
          comparisonSource: 'captured_piece',
          subject: 'captured_piece',
          subjectFilter: 'any',
          operator: 'value'
        })
      ).toBe(3)
    })

    it('resolves the captured pawn on en passant', () => {
      const board = buildBoard({
        allowedToMove: Board.WHITE,
        movementNotation: ['1. e4', 'h6', '2. e5', 'd5'],
        pieces: {
          e1: 'wK',
          e8: 'bK',
          e5: 'wP',
          d5: 'bP'
        }
      })

      const moveObject = getMove('e5', 'd6', board)
      const analysis = new CandidateMoveAnalysisV2({ board, moveObject })

      expect(
        analysis.unaryTotal({
          actor: 'captured_piece',
          filter: 'pawn',
          operator: 'count'
        })
      ).toBe(1)

      expect(
        analysis.unaryTotal({
          actor: 'captured_piece',
          filter: 'pawn',
          filterMode: 'exclude',
          operator: 'count'
        })
      ).toBe(0)
    })
  })

  describe('enemy_moved_piece', () => {
    it('resolves all unary verbs while the enemy moved piece is still on the board', () => {
      const board = buildBoard({
        pieces: {
          e1: 'wK',
          e8: 'bK',
          a2: 'wP',
          c6: 'bN'
        }
      })
      board.recentMoveContext = buildEnemyMoveContext()

      const moveObject = getMove('a2', 'a3', board)
      const analysis = new CandidateMoveAnalysisV2({ board, moveObject })

      expect(
        analysis.unaryTotal({
          actor: 'enemy_moved_piece',
          filter: 'knight',
          operator: 'count'
        })
      ).toBe(1)

      expect(
        analysis.unaryTotal({
          actor: 'enemy_moved_piece',
          filter: 'any',
          operator: 'value'
        })
      ).toBe(3)

      expect(
        analysis.unaryTotal({
          actor: 'enemy_moved_piece',
          filter: 'any',
          operator: 'mobility'
        })
      ).toBe(8)

      expect(
        analysis.comparisonSourceTotal({
          comparisonSource: 'enemy_moved_piece',
          subject: 'enemy_moved_piece',
          subjectFilter: 'any',
          operator: 'value'
        })
      ).toBe(3)
    })

    it('resolves all unary verbs when the current move captures the enemy moved piece from a real move sequence', () => {
      const board = buildBoard({
        pieces: {
          e1: 'wK',
          e8: 'bK',
          e2: 'wP',
          f7: 'bP'
        }
      })

      playMoveSequence(board, [
        { from: 'e2', to: 'e4' },
        { from: 'f7', to: 'f5' }
      ])

      const moveObject = getMove('e4', 'f5', board)
      const analysis = new CandidateMoveAnalysisV2({ board, moveObject })

      expect(
        analysis.unaryTotal({
          actor: 'enemy_moved_piece',
          filter: 'pawn',
          operator: 'count'
        })
      ).toBe(1)

      expect(
        analysis.unaryTotal({
          actor: 'enemy_moved_piece',
          filter: 'any',
          operator: 'value'
        })
      ).toBe(1)

      // Mobility returns 0 when the enemy moved piece was captured (presentOnBoard = false).
      // It is unclear whether 0 or null is more correct here:
      // - 0 treats capture as "mobility is zero because the piece has no squares" — allows
      //   conditions like "enemy moved piece mobility = 0" to match captures, which may be useful.
      // - null would treat the off-board piece as undefined — consistent with the absent-actor
      //   null semantics, and would make "mobility < X" conditions fail when the piece was taken.
      // Currently returns 0. If this causes vacuous-truth problems in practice, revisit.
      expect(
        analysis.unaryTotal({
          actor: 'enemy_moved_piece',
          filter: 'any',
          operator: 'mobility'
        })
      ).toBe(0)

      const priorMobilityTotal = analysis.comparisonSourceTotal({
        comparisonSource: 'prior_board_state',
        subject: 'enemy_moved_piece',
        subjectFilter: 'any',
        operator: 'mobility'
      })

      const afterMobility = analysis.unaryTotal({
        actor: 'enemy_moved_piece',
        filter: 'any',
        operator: 'mobility'
      })

      expect(priorMobilityTotal).toBe(2)
      expect(priorMobilityTotal).not.toBe(afterMobility)
    })
  })

  describe('enemy_captured_piece', () => {
    it('resolves the enemy captured piece from recent move context for unary queries and comparison sources', () => {
      const board = buildBoard({
        pieces: {
          e1: 'wK',
          e8: 'bK',
          a2: 'wP'
        }
      })
      board.recentMoveContext = buildEnemyMoveContext({
        moverSpecies: Board.QUEEN, moverFrom: 'h4', moverTo: 'e4',
        captured: { species: Board.BISHOP }
      })

      const moveObject = getMove('a2', 'a3', board)
      const analysis = new CandidateMoveAnalysisV2({ board, moveObject })

      expect(
        analysis.unaryTotal({
          actor: 'enemy_captured_piece',
          filter: 'bishop',
          operator: 'count'
        })
      ).toBe(1)

      expect(
        analysis.unaryTotal({
          actor: 'enemy_captured_piece',
          filter: 'any',
          operator: 'value'
        })
      ).toBe(3)

      expect(
        analysis.unaryTotal({
          actor: 'enemy_captured_piece',
          filter: 'bishop',
          filterMode: 'exclude',
          operator: 'count'
        })
      ).toBe(0)

      expect(
        analysis.comparisonSourceTotal({
          comparisonSource: 'enemy_captured_piece',
          subject: 'enemy_captured_piece',
          subjectFilter: 'any',
          operator: 'value'
        })
      ).toBe(3)
    })
  })

  describe('position', () => {
    it('filters allied positions on rank using moving team perspective (white moving)', () => {
      const board = buildBoard({
        pieces: {
          e1: 'wK',
          e8: 'bK',
          c5: 'wN',
          c2: 'wP',
          h2: 'wP'
        }
      })
      const moveObject = getMove('h2', 'h3', board)
      const analysis = new CandidateMoveAnalysisV2({ board, moveObject })

      expect(
        squaresFor(analysis.actorPositionsInRegion({
          actor: 'allied',
          positionAxis: 'rank',
          positionComparator: 'greater_than_or_equal_to',
          positionTarget: 5
        }))
      ).toEqual(['c5'])
    })

    it('filters allied positions on rank using moving team perspective (black moving)', () => {
      const board = buildBoard({
        pieces: {
          e1: 'wK',
          e8: 'bK',
          c4: 'bN',
          c7: 'bP',
          h7: 'bP'
        },
        allowedToMove: Board.BLACK
      })
      const moveObject = getMove('h7', 'h6', board)
      const analysis = new CandidateMoveAnalysisV2({ board, moveObject })

      expect(
        squaresFor(analysis.actorPositionsInRegion({
          actor: 'allied',
          positionAxis: 'rank',
          positionComparator: 'greater_than_or_equal_to',
          positionTarget: 5
        }))
      ).toEqual(['c4'])
    })

    it('filters enemy positions on rank using moving team perspective (white moving)', () => {
      const board = buildBoard({
        pieces: {
          e1: 'wK',
          e8: 'bK',
          c5: 'bN',
          c7: 'bP',
          h2: 'wP'
        }
      })
      const moveObject = getMove('h2', 'h3', board)
      const analysis = new CandidateMoveAnalysisV2({ board, moveObject })

      expect(
        squaresFor(analysis.actorPositionsInRegion({
          actor: 'enemy',
          positionAxis: 'rank',
          positionComparator: 'greater_than_or_equal_to',
          positionTarget: 4
        }))
      ).toEqual(['c5', 'c7', 'e8'])
    })

    it('filters enemy positions on rank using moving team perspective (black moving)', () => {
      const board = buildBoard({
        pieces: {
          e1: 'wK',
          e8: 'bK',
          c4: 'wN',
          c2: 'wP',
          h7: 'bP'
        },
        allowedToMove: Board.BLACK
      })
      const moveObject = getMove('h7', 'h6', board)
      const analysis = new CandidateMoveAnalysisV2({ board, moveObject })

      expect(
        squaresFor(analysis.actorPositionsInRegion({
          actor: 'enemy',
          positionAxis: 'rank',
          positionComparator: 'greater_than_or_equal_to',
          positionTarget: 4
        }))
      ).toEqual(['c2', 'c4', 'e1'])
    })

    it('filters allied positions on square using moving team perspective', () => {
      const board = buildBoard({
        pieces: {
          e1: 'wK',
          e8: 'bK',
          a1: 'wR',
          h2: 'wP'
        }
      })
      const moveObject = getMove('h2', 'h3', board)
      const analysis = new CandidateMoveAnalysisV2({ board, moveObject })

      expect(
        squaresFor(analysis.actorPositionsInRegion({
          actor: 'allied',
          positionAxis: 'square',
          positionComparator: 'equal_to',
          positionTarget: 0
        }))
      ).toEqual(['a1'])
    })

    it('filters enemy positions on square using moving team perspective', () => {
      const board = buildBoard({
        pieces: {
          e1: 'wK',
          e8: 'bK',
          a8: 'bR',
          h2: 'wP'
        }
      })
      const moveObject = getMove('h2', 'h3', board)
      const analysis = new CandidateMoveAnalysisV2({ board, moveObject })

      expect(
        squaresFor(analysis.actorPositionsInRegion({
          actor: 'enemy',
          positionAxis: 'square',
          positionComparator: 'equal_to',
          positionTarget: 56
        }))
      ).toEqual(['a8'])
    })

    it('filters by file axis independent of team perspective', () => {
      const board = buildBoard({
        pieces: {
          e1: 'wK',
          e8: 'bK',
          d4: 'wN',
          d6: 'bN',
          h2: 'wP'
        }
      })
      const moveObject = getMove('h2', 'h3', board)
      const analysis = new CandidateMoveAnalysisV2({ board, moveObject })

      expect(
        squaresFor(analysis.actorPositionsInRegion({
          actor: 'allied',
          positionAxis: 'file',
          positionComparator: 'equal_to',
          positionTarget: 4
        }))
      ).toEqual(['d4'])

      expect(
        squaresFor(analysis.actorPositionsInRegion({
          actor: 'enemy',
          positionAxis: 'file',
          positionComparator: 'equal_to',
          positionTarget: 4
        }))
      ).toEqual(['d6'])
    })

    it('returns moved piece after-position when it satisfies the axis condition', () => {
      const board = buildBoard({
        pieces: {
          e1: 'wK',
          e8: 'bK',
          e2: 'wP'
        }
      })
      const moveObject = getMove('e2', 'e4', board)
      const analysis = new CandidateMoveAnalysisV2({ board, moveObject })

      expect(
        squaresFor(analysis.actorPositionsInRegion({
          actor: 'moved_piece',
          positionAxis: 'rank',
          positionComparator: 'equal_to',
          positionTarget: 4
        }))
      ).toEqual(['e4'])
    })

    it('returns empty for moved piece when only the prior position matched the axis', () => {
      const board = buildBoard({
        pieces: {
          e1: 'wK',
          e8: 'bK',
          e2: 'wP'
        }
      })
      const moveObject = getMove('e2', 'e4', board)
      const analysis = new CandidateMoveAnalysisV2({ board, moveObject })

      expect(
        analysis.actorPositionsInRegion({
          actor: 'moved_piece',
          positionAxis: 'rank',
          positionComparator: 'equal_to',
          positionTarget: 2
        })
      ).toEqual([])
    })

    it('filters enemy_moved_piece on rank using moving team perspective', () => {
      const board = buildBoard({
        pieces: {
          e1: 'wK',
          e8: 'bK',
          a2: 'wP',
          c6: 'bN'
        }
      })
      board.recentMoveContext = buildEnemyMoveContext()

      const moveObject = getMove('a2', 'a3', board)
      const analysis = new CandidateMoveAnalysisV2({ board, moveObject })

      expect(
        squaresFor(analysis.actorPositionsInRegion({
          actor: 'enemy_moved_piece',
          positionAxis: 'rank',
          positionComparator: 'equal_to',
          positionTarget: 6
        }))
      ).toEqual(['c6'])
    })

    it('returns empty for enemy_moved_piece when current move captures it', () => {
      const board = buildBoard({
        pieces: {
          e1: 'wK',
          e8: 'bK',
          e2: 'wP',
          f7: 'bP'
        }
      })

      playMoveSequence(board, [
        { from: 'e2', to: 'e4' },
        { from: 'f7', to: 'f5' }
      ])

      const moveObject = getMove('e4', 'f5', board)
      const analysis = new CandidateMoveAnalysisV2({ board, moveObject })

      expect(
        analysis.actorPositionsInRegion({
          actor: 'enemy_moved_piece',
          positionAxis: 'rank',
          positionComparator: 'greater_than_or_equal_to',
          positionTarget: 1
        })
      ).toEqual([])
    })

    it('filters enemy_captured_piece on rank using moving team perspective (white moving)', () => {
      // Enemy black knight captured allied rook on d5 (absolute rank 5);
      // from white's moving perspective, that rank is 5.
      const board = buildBoard({
        pieces: { e1: 'wK', e8: 'bK', a2: 'wP', d5: 'bN' }
      })
      board.recentMoveContext = buildEnemyMoveContext({
        moverFrom: 'b6', moverTo: 'd5',
        captured: { species: Board.ROOK }
      })
      const moveObject = getMove('a2', 'a3', board)
      const analysis = new CandidateMoveAnalysisV2({ board, moveObject })

      expect(
        squaresFor(analysis.actorPositionsInRegion({
          actor: 'enemy_captured_piece',
          positionAxis: 'rank',
          positionComparator: 'equal_to',
          positionTarget: 5
        }))
      ).toEqual(['d5'])
    })

    it('filters enemy_captured_piece on rank using moving team perspective (black moving)', () => {
      // Enemy white knight captured allied (black) rook on d5 (absolute rank
      // 5); from black's moving perspective, that rank is 4 (9 - 5).
      const board = buildBoard({
        pieces: { e1: 'wK', e8: 'bK', a7: 'bP', d5: 'wN' }
      })
      board.recentMoveContext = buildEnemyMoveContext({
        enemyTeam: Board.WHITE,
        moverFrom: 'b4', moverTo: 'd5',
        captured: { species: Board.ROOK }
      })
      const moveObject = getMove('a7', 'a6', board)
      const analysis = new CandidateMoveAnalysisV2({ board, moveObject })

      expect(
        squaresFor(analysis.actorPositionsInRegion({
          actor: 'enemy_captured_piece',
          positionAxis: 'rank',
          positionComparator: 'equal_to',
          positionTarget: 4
        }))
      ).toEqual(['d5'])
    })

    it('computes count and value metrics over filtered positions', () => {
      const board = buildBoard({
        pieces: {
          e1: 'wK',
          e8: 'bK',
          d4: 'wQ',
          a4: 'wR',
          h2: 'wP'
        }
      })
      const moveObject = getMove('h2', 'h3', board)
      const analysis = new CandidateMoveAnalysisV2({ board, moveObject })

      const filterArgs = {
        actor: 'allied',
        positionAxis: 'rank',
        positionComparator: 'equal_to',
        positionTarget: 4
      }
      const positions = analysis.actorPositionsInRegion(filterArgs)

      expect(squaresFor(positions)).toEqual(['a4', 'd4'])
      expect(analysis.positionMetricTotal({ positions, operator: 'count' })).toBe(2)
      expect(analysis.positionMetricTotal({ positions, operator: 'value' })).toBe(14)
    })
  })

  describe('relational attack', () => {
    it('builds pairs and deduped side sets for allied rook attacks against enemy targets', () => {
      const board = buildBoard({
        pieces: {
          e1: 'wK',
          h8: 'bK',
          d4: 'wR',
          d7: 'bB',
          g4: 'bN',
          a2: 'wP'
        }
      })

      const moveObject = getMove('a2', 'a3', board)
      const analysis = new CandidateMoveAnalysisV2({ board, moveObject })
      const result = analysis.relationalResult({
        subject: 'allied',
        subjectFilter: 'rook',
        operator: 'attack',
        target: 'enemy',
        targetFilter: 'any'
      })

      expect(pairSquares(result)).toEqual([
        ['d4', 'd7'],
        ['d4', 'g4']
      ])
      expect(squaresFor(result.subjectPositions)).toEqual(['d4'])
      expect(squaresFor(result.targetPositions)).toEqual(['d7', 'g4'])
    })

    it('supports moved_piece and enemy_moved_piece as relational targets across after and prior board scopes', () => {
      const board = buildBoard({
        pieces: {
          e1: 'wK',
          e8: 'bK',
          e2: 'wP',
          h7: 'bB',
          f7: 'bP'
        }
      })

      playMoveSequence(board, [
        { from: 'e2', to: 'e4' },
        { from: 'f7', to: 'f5' }
      ])

      const moveObject = getMove('e4', 'f5', board)
      const analysis = new CandidateMoveAnalysisV2({ board, moveObject })

      const movedPieceTargetResult = analysis.relationalResult({
        subject: 'enemy',
        subjectFilter: 'bishop',
        operator: 'attack',
        target: 'moved_piece',
        targetFilter: 'any'
      })

      expect(pairSquares(movedPieceTargetResult)).toEqual([['h7', 'f5']])
      expect(squaresFor(movedPieceTargetResult.subjectPositions)).toEqual(['h7'])
      expect(squaresFor(movedPieceTargetResult.targetPositions)).toEqual(['f5'])

      const enemyMovedPiecePriorResult = analysis.relationalResult({
        subject: 'allied',
        subjectFilter: 'pawn',
        operator: 'attack',
        target: 'enemy_moved_piece',
        targetFilter: 'any',
        boardScope: 'prior'
      })

      expect(pairSquares(enemyMovedPiecePriorResult)).toEqual([['e4', 'f5']])
      expect(squaresFor(enemyMovedPiecePriorResult.subjectPositions)).toEqual(['e4'])
      expect(squaresFor(enemyMovedPiecePriorResult.targetPositions)).toEqual(['f5'])

      const enemyMovedPieceAfterResult = analysis.relationalResult({
        subject: 'allied',
        subjectFilter: 'pawn',
        operator: 'attack',
        target: 'enemy_moved_piece',
        targetFilter: 'any'
      })

      expect(pairSquares(enemyMovedPieceAfterResult)).toEqual([])
      expect(enemyMovedPieceAfterResult.subjectPositions).toEqual([])
      expect(enemyMovedPieceAfterResult.targetPositions).toEqual([])
    })

    it('supports major and minor filters for relational subjects and targets', () => {
      const board = buildBoard({
        pieces: {
          e1: 'wK',
          h8: 'bK',
          d4: 'wR',
          c4: 'wB',
          d7: 'bQ',
          g4: 'bN',
          a2: 'wP'
        }
      })

      const moveObject = getMove('a2', 'a3', board)
      const analysis = new CandidateMoveAnalysisV2({ board, moveObject })

      const majorTargetResult = analysis.relationalResult({
        subject: 'allied',
        subjectFilter: 'major',
        operator: 'attack',
        target: 'enemy',
        targetFilter: 'major'
      })

      expect(pairSquares(majorTargetResult)).toEqual([['d4', 'd7']])
      expect(squaresFor(majorTargetResult.subjectPositions)).toEqual(['d4'])
      expect(squaresFor(majorTargetResult.targetPositions)).toEqual(['d7'])

      const minorTargetResult = analysis.relationalResult({
        subject: 'allied',
        subjectFilter: 'major',
        operator: 'attack',
        target: 'enemy',
        targetFilter: 'minor'
      })

      expect(pairSquares(minorTargetResult)).toEqual([['d4', 'g4']])
      expect(squaresFor(minorTargetResult.subjectPositions)).toEqual(['d4'])
      expect(squaresFor(minorTargetResult.targetPositions)).toEqual(['g4'])
    })
  })

  describe('relational defend', () => {
    it('supports allied defenders targeting the moved piece', () => {
      const board = buildBoard({
        pieces: {
          e1: 'wK',
          e8: 'bK',
          e2: 'wP',
          f2: 'wN'
        }
      })

      const moveObject = getMove('e2', 'e4', board)
      const analysis = new CandidateMoveAnalysisV2({ board, moveObject })
      const result = analysis.relationalResult({
        subject: 'allied',
        subjectFilter: 'knight',
        operator: 'defend',
        target: 'moved_piece',
        targetFilter: 'any'
      })

      expect(pairSquares(result)).toEqual([['f2', 'e4']])
      expect(squaresFor(result.subjectPositions)).toEqual(['f2'])
      expect(squaresFor(result.targetPositions)).toEqual(['e4'])
    })
  })

  describe('relational adjacent', () => {
    it('supports enemy_moved_piece as a present-on-board subject', () => {
      const board = buildBoard({
        pieces: {
          e1: 'wK',
          e8: 'bK',
          b5: 'wB',
          c6: 'bN',
          a2: 'wP'
        }
      })
      board.recentMoveContext = buildEnemyMoveContext()

      const moveObject = getMove('a2', 'a3', board)
      const analysis = new CandidateMoveAnalysisV2({ board, moveObject })
      const result = analysis.relationalResult({
        subject: 'enemy_moved_piece',
        subjectFilter: 'any',
        operator: 'adjacent',
        target: 'allied',
        targetFilter: 'bishop'
      })

      expect(pairSquares(result)).toEqual([['c6', 'b5']])
      expect(squaresFor(result.subjectPositions)).toEqual(['c6'])
      expect(squaresFor(result.targetPositions)).toEqual(['b5'])
    })

    it('returns no after-board pairs and a prior-board pair when the enemy moved piece was captured', () => {
      const board = buildBoard({
        pieces: {
          e1: 'wK',
          e8: 'bK',
          e2: 'wP',
          f7: 'bP'
        }
      })

      playMoveSequence(board, [
        { from: 'e2', to: 'e4' },
        { from: 'f7', to: 'f5' }
      ])

      const moveObject = getMove('e4', 'f5', board)
      const analysis = new CandidateMoveAnalysisV2({ board, moveObject })

      const afterResult = analysis.relationalResult({
        subject: 'enemy_moved_piece',
        subjectFilter: 'any',
        operator: 'adjacent',
        target: 'allied',
        targetFilter: 'pawn'
      })

      expect(pairSquares(afterResult)).toEqual([])
      expect(afterResult.subjectPositions).toEqual([])
      expect(afterResult.targetPositions).toEqual([])

      const priorResult = analysis.relationalResult({
        subject: 'enemy_moved_piece',
        subjectFilter: 'any',
        operator: 'adjacent',
        target: 'allied',
        targetFilter: 'pawn',
        boardScope: 'prior'
      })

      expect(pairSquares(priorResult)).toEqual([['f5', 'e4']])
      expect(squaresFor(priorResult.subjectPositions)).toEqual(['f5'])
      expect(squaresFor(priorResult.targetPositions)).toEqual(['e4'])
    })
  })

  describe('relational shield', () => {
    it('treats the moved piece as shielding the allied king when it interposes on a slider line', () => {
      const board = buildBoard({
        pieces: {
          e1: 'wK',
          a8: 'bK',
          e8: 'bR',
          d3: 'wB'
        }
      })

      const moveObject = getMove('d3', 'e2', board)
      const analysis = new CandidateMoveAnalysisV2({ board, moveObject })
      const result = analysis.relationalResult({
        subject: 'moved_piece',
        subjectFilter: 'any',
        operator: 'shield',
        target: 'allied',
        targetFilter: 'king'
      })

      expect(pairSquares(result)).toEqual([['e2', 'e1']])
      expect(squaresFor(result.subjectPositions)).toEqual(['e2'])
      expect(squaresFor(result.targetPositions)).toEqual(['e1'])
    })

    it('does not treat a covered rook as shielded when an extra blocker breaks the shield line', () => {
      const board = buildBoard({
        pieces: {
          e1: 'wK',
          a8: 'bK',
          d4: 'wR',
          d5: 'wP',
          d6: 'wN',
          d8: 'bR',
          a2: 'wP'
        }
      })

      const moveObject = getMove('a2', 'a3', board)
      const analysis = new CandidateMoveAnalysisV2({ board, moveObject })

      const coverResult = analysis.relationalResult({
        subject: 'allied',
        subjectFilter: 'pawn',
        operator: 'cover',
        target: 'allied',
        targetFilter: 'rook'
      })

      expect(pairSquares(coverResult)).toEqual([['d5', 'd4']])
      expect(squaresFor(coverResult.subjectPositions)).toEqual(['d5'])
      expect(squaresFor(coverResult.targetPositions)).toEqual(['d4'])

      const shieldResult = analysis.relationalResult({
        subject: 'allied',
        subjectFilter: 'any',
        operator: 'shield',
        target: 'allied',
        targetFilter: 'rook'
      })

      expect(pairSquares(shieldResult)).toEqual([])
      expect(shieldResult.subjectPositions).toEqual([])
      expect(shieldResult.targetPositions).toEqual([])
    })
  })

  describe('null semantics for absent actors and empty groups', () => {
    describe('unaryTotal — empty group (no pieces match filter)', () => {
      let analysis

      beforeEach(() => {
        const board = buildBoard({ pieces: { e1: 'wK', e8: 'bK', h2: 'wP' } })
        const moveObject = getMove('h2', 'h3', board)
        analysis = new CandidateMoveAnalysisV2({ board, moveObject })
      })

      it('returns null for value', () => {
        expect(analysis.unaryTotal({ actor: 'enemy', filter: 'queen', operator: 'value' })).toBeNull()
      })

      it('returns null for mobility', () => {
        expect(analysis.unaryTotal({ actor: 'enemy', filter: 'queen', operator: 'mobility' })).toBeNull()
      })

      it('returns 0 for count', () => {
        expect(analysis.unaryTotal({ actor: 'enemy', filter: 'queen', operator: 'count' })).toBe(0)
      })
    })

    describe('positionMetricTotal — empty positions', () => {
      let analysis

      beforeEach(() => {
        const board = buildBoard({ pieces: { e1: 'wK', e8: 'bK', h2: 'wP' } })
        const moveObject = getMove('h2', 'h3', board)
        analysis = new CandidateMoveAnalysisV2({ board, moveObject })
      })

      it('returns null for value', () => {
        expect(analysis.positionMetricTotal({ positions: [], operator: 'value' })).toBeNull()
      })

      it('returns null for mobility', () => {
        expect(analysis.positionMetricTotal({ positions: [], operator: 'mobility' })).toBeNull()
      })

      it('returns 0 for count', () => {
        expect(analysis.positionMetricTotal({ positions: [], operator: 'count' })).toBe(0)
      })
    })

    describe('captured_piece — absent (non-capture move)', () => {
      let analysis

      beforeEach(() => {
        const board = buildBoard({ pieces: { e1: 'wK', e8: 'bK', h2: 'wP' } })
        const moveObject = getMove('h2', 'h3', board)
        analysis = new CandidateMoveAnalysisV2({ board, moveObject })
      })

      it('returns null for value', () => {
        expect(analysis.unaryTotal({ actor: 'captured_piece', filter: 'any', operator: 'value' })).toBeNull()
      })

      it('returns 0 for count', () => {
        expect(analysis.unaryTotal({ actor: 'captured_piece', filter: 'any', operator: 'count' })).toBe(0)
      })
    })

    describe('enemy_moved_piece — absent (no prior move context)', () => {
      let analysis

      beforeEach(() => {
        const board = buildBoard({ pieces: { e1: 'wK', e8: 'bK', h2: 'wP' } })
        const moveObject = getMove('h2', 'h3', board)
        analysis = new CandidateMoveAnalysisV2({ board, moveObject })
      })

      it('returns null for value', () => {
        expect(analysis.unaryTotal({ actor: 'enemy_moved_piece', filter: 'any', operator: 'value' })).toBeNull()
      })

      it('returns null for mobility', () => {
        expect(analysis.unaryTotal({ actor: 'enemy_moved_piece', filter: 'any', operator: 'mobility' })).toBeNull()
      })

      it('returns 0 for count', () => {
        expect(analysis.unaryTotal({ actor: 'enemy_moved_piece', filter: 'any', operator: 'count' })).toBe(0)
      })
    })

    describe('enemy_captured_piece — absent (enemy made no capture)', () => {
      let analysis

      beforeEach(() => {
        const board = buildBoard({ pieces: { e1: 'wK', e8: 'bK', a2: 'wP', c6: 'bN' } })
        board.recentMoveContext = buildEnemyMoveContext()
        const moveObject = getMove('a2', 'a3', board)
        analysis = new CandidateMoveAnalysisV2({ board, moveObject })
      })

      it('returns null for value', () => {
        expect(analysis.unaryTotal({ actor: 'enemy_captured_piece', filter: 'any', operator: 'value' })).toBeNull()
      })

      it('returns 0 for count', () => {
        expect(analysis.unaryTotal({ actor: 'enemy_captured_piece', filter: 'any', operator: 'count' })).toBe(0)
      })
    })

    describe('moved_piece — filter miss', () => {
      let analysis

      beforeEach(() => {
        const board = buildBoard({ pieces: { e1: 'wK', e8: 'bK', h2: 'wP' } })
        const moveObject = getMove('h2', 'h3', board)
        analysis = new CandidateMoveAnalysisV2({ board, moveObject })
      })

      it('returns null for value when the moved piece does not match the filter', () => {
        expect(analysis.unaryTotal({ actor: 'moved_piece', filter: 'queen', operator: 'value' })).toBeNull()
      })

      it('returns null for mobility when the moved piece does not match the filter', () => {
        expect(analysis.unaryTotal({ actor: 'moved_piece', filter: 'queen', operator: 'mobility' })).toBeNull()
      })

      it('returns 0 for count when the moved piece does not match the filter', () => {
        expect(analysis.unaryTotal({ actor: 'moved_piece', filter: 'queen', operator: 'count' })).toBe(0)
      })
    })

    describe('individualComparableValue', () => {
      let analysis

      beforeEach(() => {
        const board = buildBoard({ pieces: { e1: 'wK', e8: 'bK', h2: 'wP' } })
        const moveObject = getMove('h2', 'h3', board)
        analysis = new CandidateMoveAnalysisV2({ board, moveObject })
      })

      it('returns canonical material value for non-king species', () => {
        expect(analysis.individualComparableValue(Board.PAWN)).toBe(1)
        expect(analysis.individualComparableValue(Board.ROOK)).toBe(5)
        expect(analysis.individualComparableValue(Board.QUEEN)).toBe(9)
      })

      it('returns Infinity for the king', () => {
        expect(analysis.individualComparableValue(Board.KING)).toBe(Infinity)
      })
    })

    describe('singularActorValue — absent actor', () => {
      let analysis

      beforeEach(() => {
        const board = buildBoard({ pieces: { e1: 'wK', e8: 'bK', h2: 'wP' } })
        const moveObject = getMove('h2', 'h3', board)
        analysis = new CandidateMoveAnalysisV2({ board, moveObject })
      })

      it('returns null when no piece was captured', () => {
        expect(analysis.singularActorValue('captured_piece')).toBeNull()
      })

      it('returns null when there is no prior enemy move', () => {
        expect(analysis.singularActorValue('enemy_moved_piece')).toBeNull()
      })
    })
  })

  describe('relational cover', () => {
    it('treats a pawn as covering an allied rook when it blocks a live opposing slider route', () => {
      const board = buildBoard({
        pieces: {
          e1: 'wK',
          a8: 'bK',
          d4: 'wR',
          d5: 'wP',
          d8: 'bR',
          a2: 'wP'
        }
      })

      const moveObject = getMove('a2', 'a3', board)
      const analysis = new CandidateMoveAnalysisV2({ board, moveObject })
      const result = analysis.relationalResult({
        subject: 'allied',
        subjectFilter: 'pawn',
        operator: 'cover',
        target: 'allied',
        targetFilter: 'rook'
      })

      expect(pairSquares(result)).toEqual([['d5', 'd4']])
      expect(squaresFor(result.subjectPositions)).toEqual(['d5'])
      expect(squaresFor(result.targetPositions)).toEqual(['d4'])
    })

    it('does not count cover when no opposing slider can potentially align to the ray', () => {
      const board = buildBoard({
        pieces: {
          e1: 'wK',
          a8: 'bK',
          d4: 'wR',
          d5: 'wP',
          a2: 'wP'
        }
      })

      const moveObject = getMove('a2', 'a3', board)
      const analysis = new CandidateMoveAnalysisV2({ board, moveObject })
      const result = analysis.relationalResult({
        subject: 'allied',
        subjectFilter: 'pawn',
        operator: 'cover',
        target: 'allied',
        targetFilter: 'rook'
      })

      expect(pairSquares(result)).toEqual([])
      expect(result.subjectPositions).toEqual([])
      expect(result.targetPositions).toEqual([])
    })

    it('treats a pawn as covering an allied rook even when the opposing slider is not already on the ray', () => {
      const board = buildBoard({
        pieces: {
          e1: 'wK',
          a8: 'bK',
          d4: 'wR',
          d5: 'wP',
          g6: 'bR',
          a2: 'wP'
        }
      })

      const moveObject = getMove('a2', 'a3', board)
      const analysis = new CandidateMoveAnalysisV2({ board, moveObject })

      const coverResult = analysis.relationalResult({
        subject: 'allied',
        subjectFilter: 'pawn',
        operator: 'cover',
        target: 'allied',
        targetFilter: 'rook'
      })

      expect(pairSquares(coverResult)).toEqual([['d5', 'd4']])
      expect(squaresFor(coverResult.subjectPositions)).toEqual(['d5'])
      expect(squaresFor(coverResult.targetPositions)).toEqual(['d4'])

      const shieldResult = analysis.relationalResult({
        subject: 'allied',
        subjectFilter: 'pawn',
        operator: 'shield',
        target: 'allied',
        targetFilter: 'rook'
      })

      expect(pairSquares(shieldResult)).toEqual([])
      expect(shieldResult.subjectPositions).toEqual([])
      expect(shieldResult.targetPositions).toEqual([])
    })
  })
})
