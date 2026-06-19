import Board from "gameplay/board"
import Layout from "gameplay/layout"
import NotationResolver from "gameplay/notation_resolver"
import ReplayMoveInspector from "gameplay/replay_move_inspector"
import ReplayView, { buildReplayBoard } from "gameplay/replay_view"
import { cloneRecentMoveContext } from "gameplay/recent_move_context"
import { applyBoardOrientation } from "gameplay/board_orientation"
import Sound from "gameplay/sound"
import { emitReplayEvent } from "gameplay/utils/replayEvents"

class MatchReplayController {
  constructor({ rootElement, intervalMs = 1250 }) {
    this.rootElement = rootElement
    this.baseIntervalMs = intervalMs
    this.speedMultiplier = 1
    this.intervalMs = intervalMs
    this.view = new ReplayView({ rootElement })
    this.playButton = rootElement.querySelector('[data-match-replay-target="play-button"]')
    this.reverseButton = rootElement.querySelector('[data-match-replay-target="reverse-button"]')
    this.backButton = rootElement.querySelector('[data-match-replay-target="back-button"]')
    this.forwardButton = rootElement.querySelector('[data-match-replay-target="forward-button"]')
    this.startButton = rootElement.querySelector('[data-match-replay-target="start-button"]')
    this.topMovesToggle = rootElement.querySelector('[data-match-replay-target="top-moves-toggle"]')
    this.flipButton = rootElement.querySelector('[data-match-replay-target="flip-button"]')
    this.notationElement = rootElement.querySelector('[data-match-replay-target="notation"]')
    this.resultElement = rootElement.querySelector('[data-match-replay-target="result"]')
    this.boardElement = rootElement.querySelector('#chess-board')
    this.arenaEl = rootElement.querySelector('#arena')
    this.boardAreaEl = rootElement.querySelector('.replay-board-area')
    this.speedButtons = rootElement.querySelectorAll('[data-match-replay-target="speed-button"]')
    this.playButton?.addEventListener('click', () => { this.clearControlHints(); this.togglePlayback(1) })
    this.reverseButton?.addEventListener('click', () => this.togglePlayback(-1))
    this.backButton?.addEventListener('click', this.stepBackwardOnce.bind(this))
    this.forwardButton?.addEventListener('click', () => { this.clearControlHints(); this.stepForwardOnce() })
    this.startButton?.addEventListener('click', this.jumpToStart.bind(this))
    this.topMovesToggle?.addEventListener('click', this.toggleTopMoveHighlights.bind(this))
    this.flipButton?.addEventListener('click', this.toggleOrientation.bind(this))
    this.notationElement?.addEventListener('click', this.jumpToNotationMove.bind(this))
    this.resultElement?.addEventListener('click', this.handleResultClick.bind(this))
    this.boardElement?.addEventListener('click', this.handleBoardClick.bind(this))
    this.speedButtons.forEach(button => {
      button.addEventListener('click', () => this.setSpeed(Number(button.dataset.speedMultiplier)))
    })
    this.playButton?.classList.add('replay-control--hint')
    this.forwardButton?.classList.add('replay-control--hint')

    this.intervalId = null
    this.isPlaying = false
    this.playDirection = 1
    this.currentMoveIndex = -1
    this.warning = null
    this.spoilerRevealed = false
    this.notationResolver = new NotationResolver()

    this.finalLayout = JSON.parse(rootElement.dataset.finalLayout)
    this.movementNotation = JSON.parse(rootElement.dataset.movementNotation)
    this.result = rootElement.dataset.result
    this.currentUserId = Number(rootElement.dataset.currentUserId)
    this.whiteBotOwnerId = rootElement.dataset.whiteBotOwnerId ? Number(rootElement.dataset.whiteBotOwnerId) : null
    this.blackBotOwnerId = rootElement.dataset.blackBotOwnerId ? Number(rootElement.dataset.blackBotOwnerId) : null
    this.userBotTeam = this.deriveUserBotTeam()
    this.flipped = this.userBotTeam === Board.BLACK
    this.whiteCompiledProgramSnapshot = this.parseCompiledProgramSnapshot(rootElement.dataset.whiteCompiledProgramSnapshot)
    this.blackCompiledProgramSnapshot = this.parseCompiledProgramSnapshot(rootElement.dataset.blackCompiledProgramSnapshot)

    this.resolvedMoves = []
    this.frames = this.buildFrames()
    this.totalPlayableMoves = this.frames.length - 1
    this.movePairs = this.buildMovePairs()
    this.selectedStartPosition = null
    this.inspectedMoveKey = null
    this.muteTopMoveHighlights = false
    this._lastEmittedMoveIndex = null
    this.handleRequestPause = this.handleRequestPause.bind(this)
    this.handleTurboBeforeRender = this.destroy.bind(this)
    document.addEventListener('replay:request-pause', this.handleRequestPause)
    document.addEventListener('turbo:before-render', this.handleTurboBeforeRender, { once: true })
    this.applyOrientation()
    if (typeof ResizeObserver !== 'undefined' && this.boardAreaEl) {
      this.boardResizeObserver = new ResizeObserver(() => this.fitBoard())
      this.boardResizeObserver.observe(this.boardAreaEl)
    }
    this.renderCurrentFrame()
  }

  handleRequestPause() {
    if (this.isPlaying) { this.pause() }
  }

  destroy() {
    document.removeEventListener('replay:request-pause', this.handleRequestPause)
    document.removeEventListener('turbo:before-render', this.handleTurboBeforeRender)
    this.boardResizeObserver?.disconnect()
  }

  fitBoard() {
    if (!this.boardAreaEl || !this.arenaEl) { return }
    const availableWidth = this.boardAreaEl.clientWidth
    const availableHeight = this.boardAreaEl.clientHeight
    if (!availableWidth || !availableHeight) { return }
    this.arenaEl.style.transform = 'none'
    const naturalWidth = this.arenaEl.offsetWidth
    const naturalHeight = this.arenaEl.offsetHeight
    if (!naturalWidth || !naturalHeight) { return }
    const scale = Math.min(availableWidth / naturalWidth, availableHeight / naturalHeight, 1)
    this.arenaEl.style.transform = `scale(${scale})`
  }

  clearControlHints() {
    this.playButton?.classList.remove('replay-control--hint')
    this.forwardButton?.classList.remove('replay-control--hint')
  }

  applyOrientation() {
    applyBoardOrientation(this.rootElement.querySelector('#arena'), {
      flipped: this.flipped,
      whiteName: this.rootElement.dataset.whiteName,
      blackName: this.rootElement.dataset.blackName
    })
  }

  toggleOrientation() {
    this.flipped = !this.flipped
    this.applyOrientation()
    this.renderCurrentFrame()
  }

  parseCompiledProgramSnapshot(snapshotJson) {
    if (!snapshotJson) { return null }
    return JSON.parse(snapshotJson)
  }

  deriveUserBotTeam() {
    if (!Number.isInteger(this.currentUserId)) { return null }
    if (this.whiteBotOwnerId === this.currentUserId) { return Board.WHITE }
    if (this.blackBotOwnerId === this.currentUserId) { return Board.BLACK }
    return null
  }

  buildFrames() {
    const board = new Board({
      layOut: Layout.default(),
      capturedPieces: [],
      allowedToMove: Board.WHITE,
      movementNotation: []
    })
    const frames = [this.snapshotBoard(board)]
    const resolvedMoves = []
    for (const notation of this.movementNotation) {
      try {
        const moveObject = this.notationResolver.resolve({ board, notation })
        board._officiallyMovePiece(moveObject)
        resolvedMoves.push(moveObject)
        frames.push(this.snapshotBoard(board))
      } catch (error) {
        this.warning = `Replay stopped at ${notation}: ${error.message}`
        console.warn(this.warning)
        break
      }
    }
    this.resolvedMoves = resolvedMoves

    if (frames.length > 0 && JSON.stringify(frames.at(-1).layout) !== JSON.stringify(this.finalLayout)) {
      this.warning = this.warning || 'Replay reconstruction did not match the persisted final layout.'
      console.warn(this.warning)
    }

    return frames
  }

  snapshotBoard(board) {
    return {
      layout: Board._deepCopy(board.layOut),
      capturedPieces: Board._deepCopy(board.capturedPieces),
      allowedToMove: board.allowedToMove,
      movementNotation: [...board.movementNotation],
      recentMoveContext: cloneRecentMoveContext(board.recentMoveContext),
      halfmoveClock: board.history.halfmoveClock,
      positionKeys: [...board.history.positionKeys]
    }
  }

  buildMovePairs() {
    const movePairs = []
    for (let i = 0; i < this.movementNotation.length; i += 2) {
      movePairs.push([this.movementNotation[i], this.movementNotation[i + 1] || null])
    }
    return movePairs
  }

  atStart() {
    return this.currentMoveIndex <= -1
  }

  atEnd() {
    return this.currentMoveIndex >= this.totalPlayableMoves - 1
  }

  setIntervalMs() {
    this.intervalMs = Math.round(this.baseIntervalMs / this.speedMultiplier)
  }

  setSpeed(multiplier) {
    this.speedMultiplier = multiplier
    this.setIntervalMs()
    if (this.isPlaying) {
      this.restartPlayback()
      return
    }
    this.renderCurrentFrame()
  }

  togglePlayback(direction) {
    if (this.isPlaying && this.playDirection === direction) {
      this.pause()
    } else {
      this.play(direction)
    }
  }

  play(direction = 1) {
    if ((direction === 1 && this.atEnd()) || (direction === -1 && this.atStart())) { return }
    this.isPlaying = true
    this.playDirection = direction
    this.renderCurrentFrame()
    this.startPlayback()
  }

  startPlayback() {
    this.stopPlaybackTimer()
    this.intervalId = window.setInterval(() => this.stepByDirection(), this.intervalMs)
  }

  restartPlayback() {
    if (!this.isPlaying) { return }
    this.startPlayback()
  }

  stopPlaybackTimer() {
    if (this.intervalId) {
      window.clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  pause() {
    this.isPlaying = false
    this.stopPlaybackTimer()
    this.renderCurrentFrame()
  }

  stepByDirection() {
    if (this.playDirection === -1) {
      this.stepBackward()
      return
    }
    this.stepForward()
  }

  stepForward() {
    if (this.atEnd()) {
      this.pause()
      return
    }
    this.currentMoveIndex += 1
    this.resetInspectionSelection()
    this.playReplaySound(this.movementNotation[this.currentMoveIndex])
    if (this.atEnd()) { this.spoilerRevealed = true }
    this.renderCurrentFrame()
    if (this.atEnd()) {
      this.pause()
    }
  }

  stepBackward() {
    if (this.atStart()) {
      this.pause()
      return
    }
    this.playReplaySound(this.movementNotation[this.currentMoveIndex])
    this.currentMoveIndex -= 1
    this.resetInspectionSelection()
    this.renderCurrentFrame()
    if (this.atStart()) {
      this.pause()
    }
  }

  stepBackwardOnce() {
    if (this.isPlaying) { this.pause() }
    this.stepBackward()
  }

  stepForwardOnce() {
    if (this.isPlaying) { this.pause() }
    this.stepForward()
  }

  toggleTopMoveHighlights() {
    this.muteTopMoveHighlights = !this.muteTopMoveHighlights
    this.renderCurrentFrame()
  }

  jumpToStart() {
    if (this.isPlaying) { this.pause() }
    this.currentMoveIndex = -1
    this.resetInspectionSelection()
    this.renderCurrentFrame()
  }

  jumpToNotationMove(event) {
    const moveButton = event.target.closest('[data-move-index]')
    if (!moveButton) { return }
    if (this.isPlaying) { this.pause() }
    this.currentMoveIndex = Number(moveButton.dataset.moveIndex)
    this.resetInspectionSelection()
    this.renderCurrentFrame()
  }

  handleResultClick(event) {
    const revealButton = event.target.closest('[data-match-replay-spoiler-reveal]')
    if (!revealButton) { return }
    this.spoilerRevealed = true
    this.renderCurrentFrame()
  }

  handleBoardClick(event) {
    if (this.isPlaying) { return }
    const tile = event.target.closest('.chess-tile')
    if (!tile) { return }
    const board = this.currentBoard()
    const inspection = this.inspectionContextForBoard(board)
    if (!inspection.enabled || !inspection.result) { return }
    const square = tile.id
    const position = Board.gridCalculatorReverse(square)
    if (this.selectedStartPosition !== null) {
      const clickedVisibleMove = inspection.result.visibleMoves.find(result => (
        Board.gridCalculator(result.moveObject.endPosition) === square
      ))
      if (clickedVisibleMove) {
        this.inspectedMoveKey = clickedVisibleMove.key
        this.renderCurrentFrame()
        emitReplayEvent('move-inspected', { square, inspectedMoveKey: clickedVisibleMove.key })
        return
      }
    }
    if (board.teamAt(position) === inspection.team) {
      this.selectedStartPosition = this.selectedStartPosition === position ? null : position
      this.inspectedMoveKey = null
      this.renderCurrentFrame()
      return
    }
    this.selectedStartPosition = null
    this.inspectedMoveKey = null
    this.renderCurrentFrame()
  }

  resetInspectionSelection() {
    this.selectedStartPosition = null
    this.inspectedMoveKey = null
  }

  currentBoard() {
    const frameIndex = this.currentMoveIndex + 1
    const frame = this.frames[frameIndex]
    return buildReplayBoard({
      layout: frame.layout,
      capturedPieces: frame.capturedPieces,
      allowedToMove: frame.allowedToMove,
      movementNotation: frame.movementNotation,
      recentMoveContext: frame.recentMoveContext,
      halfmoveClock: frame.halfmoveClock,
      positionKeys: frame.positionKeys
    })
  }

  inspectionContextForBoard(board) {
    const team = board.allowedToMove
    const ownerId = team === Board.WHITE ? this.whiteBotOwnerId : this.blackBotOwnerId
    const compiledProgram = team === Board.WHITE ? this.whiteCompiledProgramSnapshot : this.blackCompiledProgramSnapshot
    if (this.atEnd()) {
      return {
        enabled: false,
        team,
        compiledProgram: null,
        result: null,
        selectedStartSquare: null,
        unavailableMessage: null
      }
    }
    if (ownerId === null) {
      return {
        enabled: false,
        team,
        compiledProgram: null,
        result: null,
        selectedStartSquare: null,
        unavailableMessage: 'condition trace unavailable for human players'
      }
    }
    if (ownerId !== this.currentUserId || !compiledProgram) {
      return {
        enabled: false,
        team,
        compiledProgram: null,
        result: null,
        selectedStartSquare: null,
        unavailableMessage: "condition trace unavailable for other players' bots"
      }
    }
    const inspector = new ReplayMoveInspector({ compiledProgram })
    const result = inspector.inspectPosition({
      board,
      actualMoveNotation: this.movementNotation[this.currentMoveIndex + 1] || null,
      inspectedMoveKey: this.inspectedMoveKey,
      restrictToStartPosition: this.selectedStartPosition,
      autoSelectVisibleMove: !(this.selectedStartPosition && this.inspectedMoveKey === null)
    })
    if (this.inspectedMoveKey !== result.explicitInspectedMoveKey) {
      this.inspectedMoveKey = result.explicitInspectedMoveKey
    }
    return {
      enabled: true,
      team,
      compiledProgram,
      result,
      selectedStartSquare: this.selectedStartPosition === null
        ? null
        : Board.gridCalculator(this.selectedStartPosition)
    }
  }

  renderCurrentFrame() {
    const board = this.currentBoard()
    const inspection = this.inspectionContextForBoard(board)
    const lastMove = this.currentMoveIndex === -1
      ? null
      : this.resolvedMoves[this.currentMoveIndex] || null
    this.view.renderFrame({
      board,
      currentMoveIndex: this.currentMoveIndex,
      isPlaying: this.isPlaying,
      playDirection: this.playDirection,
      speedMultiplier: this.speedMultiplier,
      movePairs: this.movePairs,
      result: this.result,
      totalMoves: this.totalPlayableMoves,
      spoilerRevealed: this.spoilerRevealed,
      lastMove,
      warning: this.warning,
      inspection,
      muteTopMoveHighlights: this.muteTopMoveHighlights
    })
    if (this.currentMoveIndex !== this._lastEmittedMoveIndex) {
      this._lastEmittedMoveIndex = this.currentMoveIndex
      emitReplayEvent('frame-changed', {
        moveIndex: this.currentMoveIndex,
        allowedToMove: board.allowedToMove,
        userBotTeam: this.userBotTeam
      })
    }
    this.fitBoard()
  }

  playReplaySound(notation) {
    Sound.playSoundForNotation(notation)
  }
}

export default MatchReplayController
