import { beforeEach, describe, expect, it, vi } from 'vitest'

import Board from 'gameplay/board'
import Layout from 'gameplay/layout'
import MatchReplayController from 'gameplay/match_replay_controller'
import NotationResolver from 'gameplay/notation_resolver'

function buildRoot({ finalLayout, movementNotation }) {
  const root = document.createElement('div')
  root.dataset.finalLayout = JSON.stringify(finalLayout)
  root.dataset.movementNotation = JSON.stringify(movementNotation)
  root.dataset.result = 'threefold_repetition'
  root.dataset.currentUserId = '1'
  root.dataset.whiteBotOwnerId = ''
  root.dataset.blackBotOwnerId = ''
  root.dataset.whiteCompiledProgramSnapshot = ''
  root.dataset.blackCompiledProgramSnapshot = ''
  root.innerHTML = `
    <button data-match-replay-target="play-button"></button>
    <button data-match-replay-target="reverse-button"></button>
    <button data-match-replay-target="back-button"></button>
    <button data-match-replay-target="forward-button"></button>
    <button data-match-replay-target="start-button"></button>
    <button data-match-replay-target="top-moves-toggle"></button>
    <div data-match-replay-target="result"></div>
    <ol data-match-replay-target="notation"></ol>
    <div data-match-replay-target="warning"></div>
    <div data-match-replay-target="trace-panel"></div>
    <div data-match-replay-target="trace-summary"></div>
    <div data-match-replay-target="trace-branches"></div>
  `

  return root
}

function boardAfter(movementNotation) {
  const board = new Board({
    layOut: Layout.default(),
    capturedPieces: [],
    allowedToMove: Board.WHITE,
    movementNotation: []
  })
  const notationResolver = new NotationResolver()
  movementNotation.forEach(notation => {
    board._officiallyMovePiece(notationResolver.resolve({ board, notation }))
  })
  return board
}

describe('MatchReplayController', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('rehydrates current boards with replay history for trace inspection', () => {
    const movementNotation = ['1. e4', 'a5']
    const finalBoard = boardAfter(movementNotation)
    const root = buildRoot({
      finalLayout: finalBoard.layOut,
      movementNotation
    })
    document.body.appendChild(root)

    const controller = new MatchReplayController({ rootElement: root })
    controller.currentMoveIndex = 1

    const board = controller.currentBoard()
    expect(board.movementNotation).toEqual(movementNotation)
    expect(board.recentMoveContext).toMatchObject({
      movingTeam: Board.BLACK,
      movedPieceStartPosition: 48,
      movedPieceEndPosition: 32,
      movedPieceSpeciesBeforeMove: Board.PAWN,
      movedPieceSpeciesAfterMove: Board.PAWN
    })
    expect(board.history.halfmoveClock).toBe(finalBoard.history.halfmoveClock)
    expect(board.history.positionKeys).toEqual(finalBoard.history.positionKeys)
  })

  it('distinguishes human players from other users\' bots when condition tracing is unavailable', () => {
    const root = buildRoot({
      finalLayout: Layout.default(),
      movementNotation: []
    })
    document.body.appendChild(root)

    const controller = new MatchReplayController({ rootElement: root })
    controller.currentMoveIndex = 0
    controller.totalPlayableMoves = 2

    const humanBoard = new Board({
      layOut: Layout.default(),
      capturedPieces: [],
      allowedToMove: Board.WHITE,
      movementNotation: []
    })
    controller.whiteBotOwnerId = null
    const humanInspection = controller.inspectionContextForBoard(humanBoard)
    expect(humanInspection.unavailableMessage).toBe('condition trace unavailable for human players')

    const botBoard = new Board({
      layOut: Layout.default(),
      capturedPieces: [],
      allowedToMove: Board.BLACK,
      movementNotation: []
    })
    controller.blackBotOwnerId = 2
    const botInspection = controller.inspectionContextForBoard(botBoard)
    expect(botInspection.unavailableMessage).toBe("condition trace unavailable for other players' bots")
  })

  it('hints the play and forward buttons until forward or play is used', () => {
    const root = buildRoot({ finalLayout: Layout.default(), movementNotation: [] })
    document.body.appendChild(root)

    new MatchReplayController({ rootElement: root })
    const play = root.querySelector('[data-match-replay-target="play-button"]')
    const forward = root.querySelector('[data-match-replay-target="forward-button"]')

    expect(play.classList.contains('replay-control--hint')).toBe(true)
    expect(forward.classList.contains('replay-control--hint')).toBe(true)

    forward.dispatchEvent(new Event('click'))

    expect(play.classList.contains('replay-control--hint')).toBe(false)
    expect(forward.classList.contains('replay-control--hint')).toBe(false)
  })

  describe('replay:move-inspected event', () => {
    const VISIBLE_END_POSITION = 36

    function buildController() {
      const root = buildRoot({ finalLayout: Layout.default(), movementNotation: [] })
      document.body.appendChild(root)
      const controller = new MatchReplayController({ rootElement: root })
      controller.renderCurrentFrame = vi.fn()
      controller.currentBoard = vi.fn().mockReturnValue({ teamAt: () => null })
      controller.inspectionContextForBoard = vi.fn().mockReturnValue({
        enabled: true,
        team: Board.WHITE,
        result: {
          visibleMoves: [{ moveObject: { endPosition: VISIBLE_END_POSITION }, key: 'move-1' }]
        }
      })
      return controller
    }

    function clickTile(square) {
      const tile = document.createElement('div')
      tile.className = 'chess-tile'
      tile.id = square
      document.body.appendChild(tile)
      return tile
    }

    function listen() {
      const handler = vi.fn()
      document.addEventListener('replay:move-inspected', handler)
      return {
        handler,
        cleanup: () => document.removeEventListener('replay:move-inspected', handler)
      }
    }

    it('fires when the user clicks a visible-move destination after selecting a piece', () => {
      const controller = buildController()
      controller.selectedStartPosition = 8
      const square = Board.gridCalculator(VISIBLE_END_POSITION)
      const tile = clickTile(square)
      const { handler, cleanup } = listen()

      controller.handleBoardClick({ target: tile })

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler.mock.calls[0][0].detail).toEqual({ square, inspectedMoveKey: 'move-1' })
      cleanup()
    })

    it('does not fire on a visible-move destination when no piece is selected', () => {
      const controller = buildController()
      const square = Board.gridCalculator(VISIBLE_END_POSITION)
      const tile = clickTile(square)
      const { handler, cleanup } = listen()

      controller.handleBoardClick({ target: tile })

      expect(handler).not.toHaveBeenCalled()
      cleanup()
    })

    it('does not fire when the user clicks a start-position square', () => {
      const controller = buildController()
      controller.currentBoard = vi.fn().mockReturnValue({ teamAt: () => Board.WHITE })
      const otherSquare = Board.gridCalculator(8)
      const tile = clickTile(otherSquare)
      const { handler, cleanup } = listen()

      controller.handleBoardClick({ target: tile })

      expect(handler).not.toHaveBeenCalled()
      cleanup()
    })

    it('does not fire when the user clicks a background square', () => {
      const controller = buildController()
      controller.currentBoard = vi.fn().mockReturnValue({ teamAt: () => Board.BLACK })
      const otherSquare = Board.gridCalculator(8)
      const tile = clickTile(otherSquare)
      const { handler, cleanup } = listen()

      controller.handleBoardClick({ target: tile })

      expect(handler).not.toHaveBeenCalled()
      cleanup()
    })

    it('does not fire while the replay is playing', () => {
      const controller = buildController()
      controller.isPlaying = true
      const square = Board.gridCalculator(VISIBLE_END_POSITION)
      const tile = clickTile(square)
      const { handler, cleanup } = listen()

      controller.handleBoardClick({ target: tile })

      expect(handler).not.toHaveBeenCalled()
      cleanup()
    })
  })

  it('flips the board to the viewer when they own the black bot', () => {
    const root = buildRoot({ finalLayout: Layout.default(), movementNotation: [] })
    root.dataset.blackBotOwnerId = '1'
    root.dataset.whiteName = 'Alice'
    root.dataset.blackName = 'Bob'
    document.body.appendChild(root)

    const controller = new MatchReplayController({ rootElement: root })
    root.insertAdjacentHTML('beforeend', `
      <div id="arena">
        <div class="board-player-name" data-board-name="top"></div>
        <table id="chess-board"></table>
        <div class="board-player-name" data-board-name="bottom"></div>
      </div>
    `)
    controller.applyOrientation()

    expect(root.querySelector('#chess-board').classList.contains('flipped')).toBe(true)
    expect(root.querySelector('[data-board-name="bottom"]').textContent).toBe('Bob')
    expect(root.querySelector('[data-board-name="bottom"]').dataset.team).toBe('B')
  })

  it('defaults to white POV when the viewer owns both bots', () => {
    const root = buildRoot({ finalLayout: Layout.default(), movementNotation: [] })
    root.dataset.whiteBotOwnerId = '1'
    root.dataset.blackBotOwnerId = '1'
    document.body.appendChild(root)

    const controller = new MatchReplayController({ rootElement: root })
    root.insertAdjacentHTML('beforeend', `
      <div id="arena">
        <div class="board-player-name" data-board-name="top"></div>
        <table id="chess-board"></table>
        <div class="board-player-name" data-board-name="bottom"></div>
      </div>
    `)
    controller.applyOrientation()

    expect(root.querySelector('#chess-board').classList.contains('flipped')).toBe(false)
  })

  it('flips the board orientation when the flip button is clicked', () => {
    const root = buildRoot({ finalLayout: Layout.default(), movementNotation: [] })
    root.insertAdjacentHTML('beforeend', '<button data-match-replay-target="flip-button"></button>')
    document.body.appendChild(root)

    const controller = new MatchReplayController({ rootElement: root })
    root.insertAdjacentHTML('beforeend', `
      <div id="arena">
        <div class="board-player-name" data-board-name="top"></div>
        <table id="chess-board"></table>
        <div class="board-player-name" data-board-name="bottom"></div>
      </div>
    `)
    vi.spyOn(controller, 'renderCurrentFrame').mockImplementation(() => {})

    expect(controller.flipped).toBe(false)
    controller.flipButton.click()

    expect(controller.flipped).toBe(true)
    expect(root.querySelector('#chess-board').classList.contains('flipped')).toBe(true)
    expect(controller.renderCurrentFrame).toHaveBeenCalled()
  })

  describe('userBotTeam', () => {
    function setup({ whiteOwner, blackOwner, currentUser = '1' } = {}) {
      const root = buildRoot({ finalLayout: Layout.default(), movementNotation: [] })
      root.dataset.currentUserId = currentUser
      if (whiteOwner !== undefined) { root.dataset.whiteBotOwnerId = whiteOwner }
      if (blackOwner !== undefined) { root.dataset.blackBotOwnerId = blackOwner }
      document.body.appendChild(root)
      return new MatchReplayController({ rootElement: root })
    }

    it('is Board.WHITE when the user owns the white bot', () => {
      expect(setup({ whiteOwner: '1' }).userBotTeam).toBe(Board.WHITE)
    })

    it('is Board.BLACK when the user owns the black bot', () => {
      expect(setup({ blackOwner: '1' }).userBotTeam).toBe(Board.BLACK)
    })

    it('is null when the user owns neither bot', () => {
      expect(setup({ whiteOwner: '2', blackOwner: '3' }).userBotTeam).toBeNull()
    })
  })

  describe('replay:frame-changed event', () => {
    function setupAndListen({ whiteOwner = '1' } = {}) {
      const root = buildRoot({ finalLayout: Layout.default(), movementNotation: ['1. e4', 'a5'] })
      root.dataset.currentUserId = '1'
      root.dataset.whiteBotOwnerId = whiteOwner
      document.body.appendChild(root)
      const handler = vi.fn()
      document.addEventListener('replay:frame-changed', handler)
      const controller = new MatchReplayController({ rootElement: root })
      handler.mockClear()
      return { controller, handler, cleanup: () => document.removeEventListener('replay:frame-changed', handler) }
    }

    it('fires when the user steps forward', () => {
      const { controller, handler, cleanup } = setupAndListen()
      controller.stepForwardOnce()
      expect(handler).toHaveBeenCalledTimes(1)
      cleanup()
    })

    it('carries moveIndex, allowedToMove, and userBotTeam', () => {
      const { controller, handler, cleanup } = setupAndListen({ whiteOwner: '1' })
      controller.stepForwardOnce()
      const detail = handler.mock.calls[0][0].detail
      expect(detail.moveIndex).toBe(0)
      expect(detail.allowedToMove).toBe(Board.BLACK)
      expect(detail.userBotTeam).toBe(Board.WHITE)
      cleanup()
    })

    it('does not fire on a render where moveIndex did not change', () => {
      const { controller, handler, cleanup } = setupAndListen()
      controller.renderCurrentFrame()
      expect(handler).not.toHaveBeenCalled()
      cleanup()
    })

    it('fires when stepping back to a different moveIndex', () => {
      const { controller, handler, cleanup } = setupAndListen()
      controller.stepForwardOnce()
      handler.mockClear()
      controller.stepBackwardOnce()
      expect(handler).toHaveBeenCalledTimes(1)
      cleanup()
    })
  })

  describe('replay:request-pause', () => {
    it('pauses playback when playing', () => {
      const root = buildRoot({ finalLayout: Layout.default(), movementNotation: ['1. e4', 'a5'] })
      document.body.appendChild(root)
      const controller = new MatchReplayController({ rootElement: root })
      controller.play(1)
      expect(controller.isPlaying).toBe(true)

      document.dispatchEvent(new CustomEvent('replay:request-pause'))

      expect(controller.isPlaying).toBe(false)
    })

    it('is a no-op when not playing', () => {
      const root = buildRoot({ finalLayout: Layout.default(), movementNotation: ['1. e4', 'a5'] })
      document.body.appendChild(root)
      const controller = new MatchReplayController({ rootElement: root })
      expect(controller.isPlaying).toBe(false)

      expect(() => document.dispatchEvent(new CustomEvent('replay:request-pause'))).not.toThrow()
      expect(controller.isPlaying).toBe(false)
    })

    it('is a no-op after the controller is destroyed', () => {
      const root = buildRoot({ finalLayout: Layout.default(), movementNotation: ['1. e4', 'a5'] })
      document.body.appendChild(root)
      const controller = new MatchReplayController({ rootElement: root })
      controller.play(1)
      expect(controller.isPlaying).toBe(true)

      controller.destroy()
      document.dispatchEvent(new CustomEvent('replay:request-pause'))

      expect(controller.isPlaying).toBe(true)
    })

    it('turbo:before-render destroys the controller so subsequent pauses are ignored', () => {
      const root = buildRoot({ finalLayout: Layout.default(), movementNotation: ['1. e4', 'a5'] })
      document.body.appendChild(root)
      const controller = new MatchReplayController({ rootElement: root })
      controller.play(1)
      expect(controller.isPlaying).toBe(true)

      document.dispatchEvent(new CustomEvent('turbo:before-render'))
      document.dispatchEvent(new CustomEvent('replay:request-pause'))

      expect(controller.isPlaying).toBe(true)
    })
  })
})
