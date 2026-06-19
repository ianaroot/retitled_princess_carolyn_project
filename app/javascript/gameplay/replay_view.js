import Board from "gameplay/board"
import ReplayTraceView from "gameplay/replay_trace_view"
import {
  clearAlerts,
  displayAlerts,
  renderBoardPieces,
  updateCaptures,
  updateTeamAllowedToMove
} from "gameplay/view_utils"

class ReplayView {
  constructor({ rootElement }) {
    this.rootElement = rootElement
    this.playButton = rootElement.querySelector('[data-match-replay-target="play-button"]')
    this.reverseButton = rootElement.querySelector('[data-match-replay-target="reverse-button"]')
    this.backButton = rootElement.querySelector('[data-match-replay-target="back-button"]')
    this.forwardButton = rootElement.querySelector('[data-match-replay-target="forward-button"]')
    this.startButton = rootElement.querySelector('[data-match-replay-target="start-button"]')
    this.topMovesToggle = rootElement.querySelector('[data-match-replay-target="top-moves-toggle"]')
    this.speedButtons = rootElement.querySelectorAll('[data-match-replay-target="speed-button"]')
    this.resultElement = rootElement.querySelector('[data-match-replay-target="result"]')
    this.notationElement = rootElement.querySelector('[data-match-replay-target="notation"]')
    this.warningElement = rootElement.querySelector('[data-match-replay-target="warning"]')
    this.tracePanelElement = rootElement.querySelector('[data-match-replay-target="trace-panel"]')
    this.traceSummaryElement = rootElement.querySelector('[data-match-replay-target="trace-summary"]')
    this.traceBranchesElement = rootElement.querySelector('[data-match-replay-target="trace-branches"]')
    this.traceView = new ReplayTraceView({
      tracePanelElement: this.tracePanelElement,
      traceSummaryElement: this.traceSummaryElement,
      traceBranchesElement: this.traceBranchesElement
    })
  }

  renderFrame({ board, currentMoveIndex, isPlaying, playDirection, speedMultiplier, movePairs, result, totalMoves, spoilerRevealed, lastMove, warning, inspection, muteTopMoveHighlights }) {
    renderBoardPieces(board)
    updateCaptures(board)
    clearAlerts()
    updateTeamAllowedToMove(board)
    displayAlerts("")
    this.renderBoardHighlights({ inspection, muteTopMoveHighlights, lastMove })
    this.renderControls({ isPlaying, playDirection, speedMultiplier, currentMoveIndex, totalMoves, muteTopMoveHighlights })
    this.renderResult({ result, spoilerRevealed })
    this.renderWarning(warning)
    this.renderNotation({ movePairs, currentMoveIndex })
    this.traceView.render(inspection, board.allowedToMove)
  }

  renderBoardHighlights({ inspection, muteTopMoveHighlights, lastMove }) {
    document.querySelectorAll('.chess-tile').forEach(tile => {
      tile.classList.remove(
        'match-replay-square--selected-piece',
        'match-replay-square--chosen-move',
        'match-replay-square--inspected-move',
        'match-replay-square--tied-move',
        'match-replay-square--candidate-move',
        'match-replay-square--last-move-start',
        'match-replay-square--last-move-end'
      )
    })

    if (lastMove) {
      document.getElementById(Board.gridCalculator(lastMove.startPosition))
        ?.classList.add('match-replay-square--last-move-start')
      document.getElementById(Board.gridCalculator(lastMove.endPosition))
        ?.classList.add('match-replay-square--last-move-end')
    }

    if (!inspection?.enabled || !inspection.result) { return }

    const selectedPieceTile = inspection.selectedStartSquare
      ? document.getElementById(inspection.selectedStartSquare)
      : null
    selectedPieceTile?.classList.add('match-replay-square--selected-piece')

    const chosenMove = inspection.result.currentChoiceMove?.moveObject || null
    const chosenMoveTile = chosenMove
      ? document.getElementById(Board.gridCalculator(chosenMove.endPosition))
      : null
    const chosenMoveStartTile = chosenMove
      ? document.getElementById(Board.gridCalculator(chosenMove.startPosition))
      : null
    const userSelectedDifferentPiece = inspection.selectedStartSquare &&
      chosenMove &&
      Board.gridCalculator(chosenMove.startPosition) !== inspection.selectedStartSquare
    if (!muteTopMoveHighlights && !userSelectedDifferentPiece) {
      chosenMoveTile?.classList.add('match-replay-square--chosen-move')
      chosenMoveStartTile?.classList.add('match-replay-square--chosen-move')
    }

    const inspectedMove = inspection.result.explicitInspectedMoveKey
      ? inspection.result.inspectedMove?.moveObject || null
      : null
    const inspectedMoveTile = inspectedMove
      ? document.getElementById(Board.gridCalculator(inspectedMove.endPosition))
      : null
    if (inspectedMoveTile) {
      inspectedMoveTile?.classList.add('match-replay-square--inspected-move')
    }

    const visibleMoves = inspection.result.visibleMoves || []
    visibleMoves.forEach(result => {
      const destinationId = Board.gridCalculator(result.moveObject.endPosition)
      const tile = document.getElementById(destinationId)
      if (!tile) { return }
      if (result.key === inspection.result.currentChoiceKey) { return }
      if (result.key === inspection.result.explicitInspectedMoveKey) { return }
      if (tile.classList.contains('match-replay-square--chosen-move')) { return }
      if (tile.classList.contains('match-replay-square--inspected-move')) { return }
      if (!muteTopMoveHighlights && inspection.result.tiedTopMoveKeys.includes(result.key)) {
        tile.classList.add('match-replay-square--tied-move')
      } else if (inspection.selectedStartSquare) {
        tile.classList.add('match-replay-square--candidate-move')
      }
    })
  }

  renderControls({ isPlaying, playDirection, speedMultiplier, currentMoveIndex, totalMoves, muteTopMoveHighlights = false }) {
    if (this.playButton) {
      this.playButton.innerText = isPlaying && playDirection === 1 ? "Pause" : "Play"
    }
    if (this.reverseButton) {
      this.reverseButton.innerText = isPlaying && playDirection === -1 ? "Pause" : "Reverse"
    }
    if (this.startButton) {
      this.startButton.disabled = currentMoveIndex === -1
    }
    if (this.backButton) {
      this.backButton.disabled = currentMoveIndex === -1
    }
    if (this.forwardButton) {
      this.forwardButton.disabled = currentMoveIndex >= totalMoves - 1
    }
    if (this.playButton) {
      this.playButton.disabled = currentMoveIndex >= totalMoves - 1
    }
    if (this.reverseButton) {
      this.reverseButton.disabled = currentMoveIndex === -1
    }
    if (this.topMovesToggle) {
      this.topMovesToggle.innerText = muteTopMoveHighlights ? "Show top moves" : "Mute top moves"
      this.topMovesToggle.classList.toggle('match-replay-toggle-button--active', muteTopMoveHighlights)
    }
    this.speedButtons.forEach(button => {
      button.classList.toggle('match-replay-speed-button--active', Number(button.dataset.speedMultiplier) === speedMultiplier)
    })
  }

  renderResult({ result, spoilerRevealed }) {
    if (!this.resultElement) { return }
    this.resultElement.innerHTML = ""

    if (spoilerRevealed) {
      this.resultElement.textContent = result.replaceAll('_', ' ')
      return
    }

    this.resultElement.append(
      document.createTextNode('Result hidden to avoid spoilers. '),
      this.buildSpoilerRevealButton()
    )
  }

  buildSpoilerRevealButton() {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.matchReplaySpoilerReveal = 'true'
    button.className = 'match-replay-spoiler-reveal'
    button.textContent = 'Reveal'
    return button
  }

  renderWarning(warning) {
    if (!this.warningElement) { return }

    this.warningElement.innerText = warning || ""
    this.warningElement.hidden = !warning
  }

  renderNotation({ movePairs, currentMoveIndex }) {
    if (!this.notationElement) { return }
    this.notationElement.innerHTML = ""
    let currentMoveRow = null
    for (let i = 0; i < movePairs.length; i++) {
      const [whiteMove, blackMove] = movePairs[i]
      const row = document.createElement("li")
      row.className = "match-replay-notation-row"
      const whiteSpan = document.createElement("button")
      whiteSpan.type = "button"
      whiteSpan.className = "match-replay-move"
      whiteSpan.dataset.moveIndex = i * 2
      whiteSpan.innerText = whiteMove
      if (currentMoveIndex === i * 2) {
        whiteSpan.classList.add("match-replay-move--current")
        currentMoveRow = row
      }
      row.appendChild(whiteSpan)

      if (blackMove) {
        const blackSpan = document.createElement("button")
        blackSpan.type = "button"
        blackSpan.className = "match-replay-move"
        blackSpan.dataset.moveIndex = i * 2 + 1
        blackSpan.innerText = blackMove
        if (currentMoveIndex === i * 2 + 1) {
          blackSpan.classList.add("match-replay-move--current")
          currentMoveRow = row
        }
        row.appendChild(blackSpan)
      }

      this.notationElement.appendChild(row)
    }

    this.scrollNotationToCurrentMove({ currentMoveIndex, currentMoveRow })
  }

  scrollNotationToCurrentMove({ currentMoveIndex, currentMoveRow }) {
    if (!this.notationElement) { return }
    if (currentMoveIndex === -1) {
      this.notationElement.scrollTop = 0
      return
    }
    if (!currentMoveRow) { return }
    const containerRect = this.notationElement.getBoundingClientRect()
    const rowRect = currentMoveRow.getBoundingClientRect()
    const upperBand = containerRect.top + (containerRect.height * 0.2)
    const lowerBand = containerRect.top + (containerRect.height * 0.7)
    if (rowRect.bottom > lowerBand) {
      this.notationElement.scrollTop += rowRect.bottom - lowerBand
      return
    }

    if (rowRect.top < upperBand) {
      this.notationElement.scrollTop -= upperBand - rowRect.top
    }
  }

}

export function buildReplayBoard({
  layout,
  capturedPieces,
  allowedToMove,
  movementNotation = [],
  recentMoveContext = null,
  halfmoveClock = 0,
  positionKeys = []
}) {
  return new Board({
    layOut: layout,
    capturedPieces,
    allowedToMove,
    movementNotation,
    recentMoveContext,
    halfmoveClock,
    positionKeys
  })
}

export default ReplayView
