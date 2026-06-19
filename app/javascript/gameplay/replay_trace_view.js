import Board from "gameplay/board"
import { renderConditionSentence } from "editorV2/utils/conditionPreviewFormatter"

const FLIPPED_FILE_CHAR_SUM = "a".charCodeAt(0) + "h".charCodeAt(0)

// Rotate an algebraic square 180° so it reads from the moving team's side of the
// board (black's back rank becomes rank 1), independent of how the board is oriented.
function orientSquare(square, mirrored) {
  if (!mirrored || typeof square !== "string" || square.length < 2) { return square }
  const file = String.fromCharCode(FLIPPED_FILE_CHAR_SUM - square.charCodeAt(0))
  const rank = 9 - Number(square.slice(1))
  return `${file}${rank}`
}

class ReplayTraceView {
  constructor({ tracePanelElement, traceSummaryElement, traceBranchesElement }) {
    this.tracePanelElement = tracePanelElement
    this.traceSummaryElement = traceSummaryElement
    this.traceBranchesElement = traceBranchesElement
  }

  render(inspection, movingTeam = null) {
    if (!this.tracePanelElement || !this.traceSummaryElement || !this.traceBranchesElement) { return }
    if (inspection?.unavailableMessage) {
      this.tracePanelElement.hidden = false
      this.traceSummaryElement.innerHTML = ""
      this.traceBranchesElement.innerHTML = ""

      const message = document.createElement("p")
      message.className = "match-replay-trace-empty-state"
      message.textContent = inspection.unavailableMessage
      this.traceBranchesElement.appendChild(message)
      return
    }

    if (!inspection?.enabled || !inspection.result?.inspectedTrace) {
      this.tracePanelElement.hidden = true
      this.traceSummaryElement.innerHTML = ""
      this.traceBranchesElement.innerHTML = ""
      return
    }
    this.tracePanelElement.hidden = false
    this.renderSummary(inspection, movingTeam)
    this.renderTree(inspection)
  }

  renderSummary(inspection, movingTeam = null) {
    const { result } = inspection
    const mirrored = movingTeam === Board.BLACK
    const inspectedMove = result.inspectedMove?.moveObject
    const inspectedNotation = inspectedMove ? orientSquare(Board.gridCalculator(inspectedMove.endPosition), mirrored) : "none"
    const tiedTopCount = result.tiedTopMoveKeys.length
    const inspectedTied = result.inspectedMoveKey && result.tiedTopMoveKeys.includes(result.inspectedMoveKey)
    this.traceSummaryElement.innerHTML = ""
    const summaryRow = document.createElement("div")
    summaryRow.className = "match-replay-trace-summary-row"
    const heading = document.createElement("span")
    heading.className = "match-replay-trace-heading"
    heading.innerText = "why this move"
    summaryRow.appendChild(heading)
    const score = document.createElement("span")
    score.className = "match-replay-trace-score"
    score.innerText = `score ${result.inspectedTrace.score}`
    summaryRow.appendChild(score)
    const moveSummary = document.createElement("span")
    moveSummary.className = "match-replay-trace-meta"
    moveSummary.innerText = result.explicitInspectedMoveKey
      ? `inspected move: ${orientSquare(Board.gridCalculator(inspectedMove.startPosition), mirrored)} to ${inspectedNotation}`
      : `current choice: ${orientSquare(Board.gridCalculator(inspectedMove.startPosition), mirrored)} to ${inspectedNotation}`
    summaryRow.appendChild(moveSummary)
    if (tiedTopCount > 1 && inspectedTied) {
      const tieSummary = document.createElement("span")
      tieSummary.className = "match-replay-trace-meta"
      tieSummary.innerText = `tied top moves: ${tiedTopCount}`
      summaryRow.appendChild(tieSummary)
    }
    this.traceSummaryElement.appendChild(summaryRow)
  }

  renderTree(inspection) {
    this.traceBranchesElement.innerHTML = ""
    const { compiledProgram, result } = inspection
    const trace = result.inspectedTrace.trace
    if (!compiledProgram?.nodes || !compiledProgram.root) { return }

    const queues = {}
    const totalHits = {}
    for (const entry of trace) {
      if (!queues[entry.nodeId]) queues[entry.nodeId] = []
      queues[entry.nodeId].push(entry)
      totalHits[entry.nodeId] = (totalHits[entry.nodeId] || 0) + 1
    }

    const sharedNodeIds = this.findSharedNodeIds(compiledProgram)
    const rootNode = compiledProgram.nodes[compiledProgram.root]

    for (const childId of (rootNode?.children || [])) {
      const el = this.renderNode(childId, compiledProgram, queues, sharedNodeIds, totalHits)
      if (el) this.traceBranchesElement.appendChild(el)
    }
  }

  findSharedNodeIds(compiledProgram) {
    const parentCount = {}
    for (const node of Object.values(compiledProgram.nodes)) {
      for (const childId of (node.children || [])) {
        parentCount[childId] = (parentCount[childId] || 0) + 1
      }
    }
    return new Set(
      Object.entries(parentCount).filter(([, c]) => c > 1).map(([id]) => id)
    )
  }

  renderNode(nodeId, compiledProgram, queues, sharedNodeIds, totalHits) {
    const node = compiledProgram.nodes[nodeId]
    if (!node) { return null }

    const isShared = sharedNodeIds.has(nodeId)

    switch (node.type) {
      case 'organizer':
        return this.renderOrganizer(node, compiledProgram, queues, sharedNodeIds, totalHits)
      case 'condition': {
        const entry = queues[nodeId]?.shift() ?? null
        const executionIndex = entry !== null
          ? (totalHits[nodeId] || 0) - (queues[nodeId]?.length ?? 0)
          : null
        return this.renderCondition(node, entry, isShared, executionIndex, compiledProgram, queues, sharedNodeIds, totalHits)
      }
      case 'score': {
        const entry = queues[nodeId]?.shift() ?? null
        const executionIndex = entry !== null
          ? (totalHits[nodeId] || 0) - (queues[nodeId]?.length ?? 0)
          : null
        return this.renderScore(node, entry, isShared, executionIndex)
      }
      default:
        return null
    }
  }

  renderChildren(childIds, compiledProgram, queues, sharedNodeIds, totalHits) {
    const el = document.createElement('div')
    el.className = 'trace-tree-children replay-stack'
    for (const childId of childIds) {
      const child = this.renderNode(childId, compiledProgram, queues, sharedNodeIds, totalHits)
      if (child) el.appendChild(child)
    }
    return el
  }

  renderOrganizer(node, compiledProgram, queues, sharedNodeIds, totalHits) {
    const details = document.createElement('details')
    details.className = 'trace-tree-organizer'
    details.open = true

    const summary = document.createElement('summary')
    summary.className = 'trace-tree-organizer__summary'
    const titleText = document.createElement('span')
    titleText.innerText = node.data?.title || 'branch'
    summary.appendChild(titleText)
    details.appendChild(summary)

    const body = this.renderChildren(node.children || [], compiledProgram, queues, sharedNodeIds, totalHits)
    body.classList.add('trace-tree-organizer__body', 'replay-stack')
    details.appendChild(body)
    return details
  }

  renderCondition(node, entry, isShared, executionIndex, compiledProgram, queues, sharedNodeIds, totalHits) {
    const passed = entry ? entry.passed : null
    const childIds = node.children || []

    const header = document.createElement('div')
    header.className = 'trace-tree-node__header'

    if (passed === true) {
      header.appendChild(this.pill('pass', '✓'))
    } else if (passed === false) {
      header.appendChild(this.pill('fail', '✗'))
    } else {
      header.appendChild(this.pill('skip', '—'))
    }

    const text = document.createElement('span')
    text.className = 'trace-tree-node__text'
    if (Number(node.data?.version || 1) === 2) {
      renderConditionSentence(text, node.data)
    } else {
      text.innerText = this.conditionSummary(node.data)
    }
    header.appendChild(text)

    if (isShared && executionIndex !== null) header.appendChild(this.hitBadge(executionIndex))

    if (passed === true) {
      const wrapper = document.createElement('div')
      wrapper.className = 'trace-tree-node trace-tree-node--condition trace-tree-node--passed replay-stack'
      wrapper.appendChild(header)
      if (childIds.length > 0) {
        wrapper.appendChild(this.renderChildren(childIds, compiledProgram, queues, sharedNodeIds, totalHits))
      }
      return wrapper
    }

    const details = document.createElement('details')
    details.className = `trace-tree-node trace-tree-node--condition ${passed === false ? 'trace-tree-node--failed' : 'trace-tree-node--not-reached'} replay-stack`

    const summary = document.createElement('summary')
    summary.className = 'trace-tree-node__summary'
    summary.appendChild(header)
    details.appendChild(summary)

    if (childIds.length > 0) {
      const children = this.renderChildren(childIds, compiledProgram, {}, sharedNodeIds, totalHits)
      children.classList.add('trace-tree-children--not-executed')
      details.appendChild(children)
    }
    return details
  }

  renderScore(node, entry, isShared, executionIndex) {
    const executed = entry !== null
    const halted = executed && entry.halted

    const wrapper = document.createElement('div')
    wrapper.className = [
      'trace-tree-node',
      'trace-tree-node--score',
      executed ? (halted ? 'trace-tree-node--score-halted' : 'trace-tree-node--score-applied') : 'trace-tree-node--not-reached',
      'replay-stack'
    ].join(' ')

    const header = document.createElement('div')
    header.className = 'trace-tree-node__header'

    if (executed) header.appendChild(this.pill('score', halted ? 'halt' : 'applied'))

    const text = document.createElement('span')
    text.className = 'trace-tree-node__text'
    text.innerText = `${node.data.actionType} ${node.data.value}`
    header.appendChild(text)

    if (isShared && executionIndex !== null) header.appendChild(this.hitBadge(executionIndex))

    if (executed) {
      const score = document.createElement('span')
      score.className = 'trace-tree-node__score'
      score.innerText = `${entry.scoreBefore} → ${entry.scoreAfter}`
      header.appendChild(score)
    }

    wrapper.appendChild(header)
    return wrapper
  }

  pill(type, text) {
    const el = document.createElement('span')
    el.className = `match-replay-trace-pill match-replay-trace-pill--${type}`
    el.innerText = text
    return el
  }

  hitBadge(executionIndex) {
    const el = document.createElement('span')
    el.className = 'trace-tree-hit-badge'
    el.innerText = `hit ${executionIndex}`
    return el
  }

  conditionSummary(data) {
    const relationLabel = this.relationLabel(data.relation)
    const relationSpecifier = data.relationSpecifier && data.relationSpecifier !== 'any'
      ? ` ${this.specifierSummary(data.relationSpecifier, data.relationSpecifierMode)}`
      : ''
    const subjectSpecifier = data.subjectSpecifier && data.subjectSpecifier !== 'any'
      ? ` ${this.specifierSummary(data.subjectSpecifier, data.subjectSpecifierMode)}`
      : ''
    const comparisonValue = typeof data.comparisonValue === 'number'
      ? data.comparisonValue
      : this.prettyToken(data.comparisonValue)
    const operator = {
      equal_to: '=',
      greater_than: '>',
      less_than: '<'
    }[data.comparison] || data.comparison
    return `${this.prettyToken(data.subject)}${subjectSpecifier} ${relationLabel}${relationSpecifier} ${operator} ${comparisonValue}`
  }

  relationLabel(relation) {
    return {
      attacker: 'is ATTACKED by',
      attacked: 'makes ATTACKS against',
      defender: 'is DEFENDED by',
      defended: 'provides DEFENSE for',
      shielder: 'is SHIELDED by',
      shielded: 'provides SHIELDING for',
      coverer: 'is COVERED by',
      covered: 'provides COVER for'
    }[relation] || this.prettyToken(relation)
  }

  prettyToken(value) {
    return String(value).replaceAll('_', ' ')
  }

  specifierSummary(specifier, mode) {
    const label = this.prettyToken(specifier)
    return mode === 'exclude' ? `non-${label}` : label
  }
}

export default ReplayTraceView
