import { swatch, passIcon, failIcon, scoreIcon, organizerIcon, arrowIcon } from 'tour/icons'

const LOCKED_CLASS = 'tour-locked'
const FORWARD_BUTTON = '[data-match-replay-target="forward-button"]'

const LOCKED_SELECTORS = [
  '[data-match-replay-target="play-button"]',
  '[data-match-replay-target="reverse-button"]',
  '[data-match-replay-target="top-moves-toggle"]',
  '[data-match-replay-target="flip-button"]',
  FORWARD_BUTTON,
  '.btn-rematch'
]

const setLocked = (selectors, locked) => {
  selectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((el) => {
      el.classList.toggle(LOCKED_CLASS, locked)
    })
  })
}

const TRACE_PANEL_FALLBACK = '[data-match-replay-target="trace-panel"]'

const withFallback = ({ primarySelector, title, copyHtml, trailerHtml = '' }) => ({
  target: () => document.querySelector(primarySelector) || document.querySelector(TRACE_PANEL_FALLBACK),
  title,
  body: () => {
    const suffix = document.querySelector(primarySelector) ? '' : ' (None visible in this trace.)'
    return `<p>${copyHtml}${suffix}</p>${trailerHtml}`
  },
  advanceOn: 'next'
})

const STEPS = [
  {
    target: null,
    placement: 'center',
    title: "Reading your bot's match",
    body: `<p>How to understand your bot's decision making.</p>`,
    advanceOn: 'next'
  },
  {
    target: ['.match-replay-controls', '.match-replay-speed'],
    title: 'Replay controls',
    body: `
      <ul>
        <li><strong>Back</strong> / <strong>Forward</strong> — one move at a time.</li>
        <li><strong>Play</strong> / <strong>Reverse</strong> — auto-step in either direction.</li>
        <li><strong>Restart</strong> — jump back to move 0.</li>
        <li><strong>0.5×</strong>–<strong>8×</strong> set auto-play pace.</li>
      </ul>
    `,
    advanceOn: 'next'
  },
  {
    target: '[data-match-replay-target="forward-button"]',
    title: 'Get into the match',
    body: `<p>Click <strong>Forward</strong> a few times to get into the meat of the match.</p>`,
    beforeEnter: () => setLocked([FORWARD_BUTTON], false),
    advanceOn: {
      event: 'replay:frame-changed',
      when: (frame) => frame.moveIndex >= 2 && frame.allowedToMove === frame.userBotTeam
    }
  },
  {
    target: '[data-match-replay-target="trace-summary"]',
    title: 'Top of the panel',
    body: `
      <ul>
        <li>The move's score.</li>
        <li>Board coordinates of the move evaluated below.</li>
        <li>A count of moves tied for top score (if you don't see this, then the bot was decisive about which move is best on this turn).</li>
      </ul>
    `,
    beforeEnter: () => {
      document.dispatchEvent(new CustomEvent('replay:request-pause'))
      setLocked([FORWARD_BUTTON], true)
    },
    advanceOn: 'next'
  },
  withFallback({
    primarySelector: '.trace-tree-node--passed',
    title: 'Passed condition',
    copyHtml: `A <strong>green check</strong> ${passIcon} means this condition was true on the resulting board.`
  }),
  withFallback({
    primarySelector: '.trace-tree-node--failed',
    title: 'Failed condition',
    copyHtml: `A <strong>red ×</strong> ${failIcon} means this condition was false.`
  }),
  withFallback({
    primarySelector: '.trace-tree-node__score',
    title: 'Score impact',
    copyHtml: `Score nodes that were reached show their impact on the move's score.`,
    trailerHtml: scoreIcon
  }),
  withFallback({
    primarySelector: '.trace-tree-organizer__summary',
    title: 'Organizer titles',
    copyHtml: `Organizer titles from your bot ${organizerIcon} appear as labels for their branch.`
  }),
  withFallback({
    primarySelector: '.trace-tree-organizer__summary',
    title: 'Expand, collapse',
    copyHtml: `Each branch has a small arrow ${arrowIcon} on its header — click it to collapse or expand.`
  }),
  {
    target: '#chess-board',
    title: 'The highlighted moves',
    body: `
      <p>The bot's chosen move is highlighted here ${swatch('--match-replay-chosen-move')}.</p>
      <p>The <strong>tied top moves</strong> are highlighted here ${swatch('--match-replay-tied-move')}.</p>
      <p>Your opponent's last move is highlighted here ${swatch('--match-replay-last-move-end')}.</p>
    `,
    advanceOn: 'next'
  },
  {
    target: '#chess-board',
    title: 'Click in to inspect',
    body: `
      <p>Click one of your pieces. Its legal moves get highlighted as candidates ${swatch('--match-replay-candidate-move')}.</p>
      <p>Now click one of the ${swatch('--match-replay-candidate-move')} moves to update the trace panel with that move's evaluation.</p>
    `,
    advanceOn: { event: 'replay:move-inspected' }
  },
  {
    target: '[data-match-replay-target="trace-panel"]',
    title: 'Now showing the selected move',
    body: `
      <p>The clicked move's highlight is now this color ${swatch('--match-replay-inspected-move')}.</p>
      <p>The panel updated — it's now showing the evaluation of the ${swatch('--match-replay-inspected-move')} move.</p>
      <p>Scroll if your bot's tree is tall enough to overflow.</p>
    `,
    advanceOn: 'next'
  },
  {
    target: '#chess-board',
    title: 'Reset to defaults',
    body: `<p>Click an empty tile (no piece, no highlight) to reset the panel back to the bot's chosen move.</p>`,
    advanceOn: 'next'
  },
  {
    target: '[data-match-replay-target="top-moves-toggle"]',
    title: 'Mute top moves',
    body: `<p>Hides highlights for tied top moves.</p>
    <p>Cleaner board, but you lose evidence of an unopinionated bot.</p>`,
    advanceOn: 'next'
  },
  {
    target: '.match-replay-notation',
    title: 'Game notation',
    body: `<p>Game notation is listed here. Click any entry to jump straight to that position.</p>`,
    advanceOn: 'next'
  },
  {
    target: () => document.querySelector('.board-player-name--active'),
    title: 'Whose move is it?',
    body: `<p>Above and below the board, the player whose turn it is gets highlighted.</p>`,
    advanceOn: 'next'
  },
  {
    target: '.btn-rematch',
    title: 'Rematch',
    body: `<p>If you want a rematch, the button is right here.</p>`,
    advanceOn: 'next'
  },
  {
    target: null,
    placement: 'center',
    title: 'Improve your bot',
    body: `<p>Use this feature to learn how to improve your bot.</p>`,
    advanceOn: 'next'
  }
]

export default {
  steps: STEPS,
  onStart: () => setLocked(LOCKED_SELECTORS, true),
  onClose: () => setLocked(LOCKED_SELECTORS, false)
}
