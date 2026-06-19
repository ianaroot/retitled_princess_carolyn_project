import { describe, expect, it } from 'vitest'

import Board from 'gameplay/board'
import ReplayTraceView from 'gameplay/replay_trace_view'

// The summary line is written with .innerText, which jsdom stores but does not
// reflect into textContent — so read it back off the span directly.
function moveLabelFor({ start, end, movingTeam }) {
  const tracePanelElement = document.createElement('div')
  const traceSummaryElement = document.createElement('div')
  const traceBranchesElement = document.createElement('div')
  const view = new ReplayTraceView({ tracePanelElement, traceSummaryElement, traceBranchesElement })

  view.render({
    enabled: true,
    result: {
      inspectedMove: { moveObject: {
        startPosition: Board.gridCalculatorReverse(start),
        endPosition: Board.gridCalculatorReverse(end)
      } },
      inspectedMoveKey: null,
      explicitInspectedMoveKey: null,
      tiedTopMoveKeys: [],
      inspectedTrace: { score: 0, trace: [] }
    }
  }, movingTeam)

  return traceSummaryElement.querySelector('.match-replay-trace-meta').innerText
}

describe('ReplayTraceView move coordinates', () => {
  it('reads a white move from white\'s back rank (rank 1)', () => {
    expect(moveLabelFor({ start: 'e2', end: 'e4', movingTeam: Board.WHITE })).toContain('e2 to e4')
  })

  it('reads a black move from black\'s back rank, 180° from absolute', () => {
    // a7-a5 in absolute terms is h2-h4 seen from black's side of the board
    expect(moveLabelFor({ start: 'a7', end: 'a5', movingTeam: Board.BLACK })).toContain('h2 to h4')
  })
})
