const WALK_DIAGRAM = `
  <svg class="bot-intro-diagram" viewBox="0 0 420 232" role="img" aria-label="Counterclockwise sibling order: the leftmost child and its descendant are visited first">
    <defs>
      <marker id="tour-walk-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
        <path d="M0,0 L7,3.5 L0,7 z" class="bid-arrow-head" />
      </marker>
    </defs>
    <rect class="bid-box bid-box--root" x="176" y="12" width="68" height="32" rx="6" />
    <text class="bid-label" x="210" y="28">Root</text>
    <line class="bid-edge" x1="210" y1="44" x2="82" y2="104" marker-end="url(#tour-walk-arrow)" />
    <line class="bid-edge" x1="210" y1="44" x2="210" y2="104" marker-end="url(#tour-walk-arrow)" />
    <line class="bid-edge" x1="210" y1="44" x2="338" y2="104" marker-end="url(#tour-walk-arrow)" />
    <rect class="bid-box" x="40" y="104" width="84" height="32" rx="6" />
    <text class="bid-label" x="82" y="120">1st</text>
    <rect class="bid-box" x="168" y="104" width="84" height="32" rx="6" />
    <text class="bid-label" x="210" y="120">3rd</text>
    <rect class="bid-box" x="296" y="104" width="84" height="32" rx="6" />
    <text class="bid-label" x="338" y="120">4th</text>
    <line class="bid-edge" x1="82" y1="136" x2="82" y2="176" marker-end="url(#tour-walk-arrow)" />
    <rect class="bid-box bid-box--accent" x="40" y="176" width="84" height="32" rx="6" />
    <text class="bid-label" x="82" y="192">2nd</text>
    <path class="bid-orbit" d="M82 54 Q 210 140 338 54" marker-end="url(#tour-walk-arrow)" />
    <text class="bid-caption" x="210" y="222">depth-first; siblings counterclockwise from midnight</text>
  </svg>
`

const lockNodeDrag = () => document.body.classList.add('editor-drag-locked')
const unlockNodeDrag = () => document.body.classList.remove('editor-drag-locked')

const STEPS = [
  {
    target: null,
    placement: 'center',
    title: 'Welcome to the bot editor',
    body: `
      <ul>
        <li>Your bot follows a <strong>rulebook you build</strong>.</li>
        <li>Each turn, every legal move gets evaluated against your entire rule set.</li>
        <li>The highest scored move is chosen.</li>
        <li>When scores tie, the bot picks <strong>randomly from the top-scoring moves</strong>.</li>
        <li>Let's build your first rule.</li>
      </ul>
    `,
    advanceOn: 'next'
  },
  // {
  //   target: '#canvas-workspace',
  //   title: 'Your graph lives here',
  //   body: `
  //   <ul>
  //     <li>This is your <strong>bot graph</strong>.</li>
  //     <li>The <strong>Root</strong> at the top is where every move's evaluation starts.</li>
  //     <li>Rules flow down from it.</li>
  //   </ul>`,
  //   advanceOn: 'next'
  // },
  {
    target: '.btn-open-templates',
    title: 'Start with a template',
    body: `
      <p>Templates are pre-built rules — common patterns you can drop in.</p>
      <p>Click <strong>Templates</strong> to open the picker.</p>`,
    advanceOn: 'click'
  },
  {
    target: '.template-picker__category[data-category="king_pressure"]',
    title: 'Browse to King Pressure',
    body: `<p>Click the <strong>King Pressure</strong> category — templates that pursue or punish the opposing king.</p>`,
    advanceOn: 'click'
  },
  {
    target: '.template-picker__card[data-template-id="checkmate"]',
    title: 'The Checkmate template',
    body: `<p><strong>Checkmate</strong> lets your bot recognize checkmate.</p>`,
    advanceOn: 'next'
  },
  {
    target: '[data-template-picker-insert]',
    title: 'Insert it',
    body: `<p>Click <strong>Insert Template</strong> to drop it onto your canvas.</p>`,
    advanceOn: 'click'
  },
  {
    target: '#zoom-out',
    title: 'Zoom out to see it',
    body: `<p>Click <strong>-</strong> to zoom out and see the whole template.</p>`,
    advanceOn: 'click'
  },
  {
    target: () => document.querySelector('.node.organizer'),
    title: 'What an Organizer node does',
    body: `<p>The blue square at the top is an <strong>Organizer</strong>. It labels this chunk of graph but doesn't affect scoring.</p>`,
    advanceOn: 'next'
  },
  {
    target: '#canvas-workspace',
    title: 'Connect it to Root',
    body: `
      <p>For the template to run, connect it to Root.</p>
      <p><strong>Drag from Root's output dot</strong> (bottom) <strong>to the Organizer</strong> (top).</p>
    `,
    advanceOn: { event: 'editor:connection-created' }
  },
  {
    target: '#canvas-workspace',
    title: 'How the bot walks the graph',
    body: `
      <p>For each move, the bot walks from Root.</p>

      <p>Branches are evaluated depth-first.</p>

      <p>When one node has multiple children, the branches are traversed <strong>counterclockwise</strong> starting from midnight.</p>

      <p>When a condition <strong>passes</strong> — it's true of the board after the move — the branch continues.</p>

      <p>If it <strong>fails</strong>, the bot backtracks to the next branch.</p>

      <p>Conditions chained together - like the two conditions in the checkmate template - act as an <strong>AND</strong> — every condition above a score node must pass for that score to apply.</p>

      ${WALK_DIAGRAM}
    `,
    advanceOn: 'next'
  },
  {
    target: '.btn-add-node[data-type="condition"]',
    title: 'Add your own condition',
    body: `<p>Now build one from scratch. Click <strong>+ Condition</strong>.</p>`,
    advanceOn: { event: 'editor:node-added', when: (nodeInfo) => nodeInfo.type === 'condition' }
  },
  {
    target: (ctx) => {
      const id = ctx.lastAdvanceDetail?.clientId
      return id ? document.querySelector(`.node[data-client-id="${id}"]`) : null
    },
    title: 'Open it to edit',
    body: `<p><strong>Click your new condition</strong> to open the editor on the right.</p>`,
    beforeEnter: lockNodeDrag,
    onExit: unlockNodeDrag,
    advanceOn: { event: 'editor:node-editing-started', when: (nodeInfo) => nodeInfo.type === 'condition' }
  },
  {
    target: '.condition-form-mode-picker',
    placement: 'left',
    title: 'Pick a question kind',
    body: `
      <p>A condition asks one yes/no question.</p>
      <p>There are 3 different kinds.</p>
      <br>
      <p>Start by clicking <strong>Positions</strong></p>
    `,
    advanceOn: { event: 'click', selector: '#cond-mode-census' }
  },
  {
    target: '.condition-form-mode-picker',
    placement: 'left',
    title: 'Positions mode',
    body: `
      <p>This mode measures pieces on the board, or a specific region.</p>
      <strong>Mobility</strong> comparisons can be used to look for forcing moves, or moves that increases a piece's activity</p>
      <br>
      <p>Now click <strong>Captures</strong></p>
    `,
    advanceOn: { event: 'click', selector: '#cond-mode-captures' }
  },
  {
    target: '.condition-form-mode-picker',
    placement: 'left',
    title: 'Captures mode',
    body: `
      <p>Captured piece is the piece your move captures (if any).</p>
      <p>Enemy captured piece is the piece your opponent captured on their prior turn (if any).</p>
      <br>
      <p>Now click <strong>Attack/Defend</strong></p>
    `,
    advanceOn: { event: 'click', selector: '#cond-mode-relational' }
  },
  {
    target: '#cond-left-subject',
    placement: 'left',
    title: 'Who is the question about?',
    body: `
      <p>The <strong>Subject</strong> picks the piece in question:</p>
      <ul>
        <li><strong>Moved Piece</strong> — the piece making this move.</li>
        <li><strong>My Pieces</strong>, <strong>Enemy Pieces</strong> — any piece on the relevant team.</li>
        <li><strong>Enemy Moved Piece</strong> — the enemy piece from their last move.</li>
      </ul>
    `,
    advanceOn: 'next'
  },
  {
    target: '#cond-left-subject',
    placement: 'left',
    title: 'Moved Piece is powerful',
    body: `
      <p><em>Moved Piece</em> is powerful because it narrows the question to <em>this turn's mover</em>.</p>
      <p>Compare:</p>
      <ul>
        <li><strong>My Pieces</strong> attacks the enemy queen — doesn't care which piece actually moved.</li>
        <li><strong>Moved Piece</strong> attacks the enemy queen — only scores when this turn's mover IS the attacker.</li>
      </ul>
    `,
    advanceOn: 'next'
  },
  {
    target: '#cond-left-filter-row',
    placement: 'left',
    title: 'Filter the subject',
    body: `
      <p>The <strong>filter</strong> below narrows the subject to a piece type.</p>
      <p><strong>Non-</strong> inverts it — e.g. <em>Non-King</em> matches everything except the king.</p>
    `,
    advanceOn: 'next'
  },
  {
    target: '#cond-relational-operator',
    placement: 'left',
    title: 'Operator',
    body: `
      <p>The <strong>Operator</strong> chooses the relationship between subject and target:</p>
      <ul>
        <li><strong>Targets</strong> — subject attacks the target's square.</li>
        <li><strong>Shield</strong> — subject stands between an enemy attacker and a same-team target.</li>
        <li><strong>Adjacent</strong> — subject sits next to the target.</li>
      </ul>
      <br>
      <p>Change the selected operator to see examples of each on the board below</p>
    `,
    advanceOn: 'next'
  },
  {
    target: '#cond-left-comparison-section',
    placement: 'left',
    title: 'Compare piece stats',
    body: `
      <p>This block asks about the subject's <strong>count</strong> or <strong>value</strong>:</p>
      <ul>
        <li><strong>Count</strong> — how many pieces satisfy the relation.</li>
        <li><strong>Value</strong> — the value of an <em>individual</em> piece satisfying the relation.</li>
      </ul>
      <br>
      <p><strong>Count at least 1</strong> is usually a safe default.</p>
    `,
    advanceOn: 'next'
  },
  {
    target: '#cond-left-comparison-section',
    placement: 'left',
    title: 'Comparator and source',
    body: `
      <p>Pick a <strong>comparator</strong>: <em>greater than / at least / equals / at most / less than</em>.</p>
      <p>Then pick what to compare against. The <strong>source</strong> can be:</p>
      <ul>
        <li>A fixed <strong>Integer</strong>.</li>
        <li><strong>Prior Board State</strong> — the same metric measured before this move.</li>
        <li>Another piece type (value only).</li>
      </ul>
    `,
    advanceOn: 'next'
  },
  {
    target: '#cond-left-comparison-section',
    placement: 'left',
    title: 'Prior Board State examples',
    body: `
      <p>Comparing against <strong>Prior Board State</strong> catches what the move changed:</p>
      <ul>
        <li>Count of attackers <em>greater than</em> Prior Board State — makes sure that a move creates new attacks.</li>
        <li>Moved Piece value <em>greater than</em> Prior Board State — detects promotion (the value just went up).</li>
      </ul>
    `,
    advanceOn: 'next'
  },
  {
    target: '#cond-formulation-preview',
    placement: 'left',
    title: 'Read your condition',
    body: `
      <ul>
        <li>This line is your condition in plain English.</li>
        <li>It updates as you change the form, so you can verify you've built the question you meant to.</li>
        <li>Prefer terse chunks over sentences? Toggle <strong>Sentences: on/off</strong> in the toolbar.</li>
      </ul>
    `,
    advanceOn: 'next'
  },
  {
    target: '#board-state-preview-wrap',
    title: 'See it on real boards',
    body: `
      <p>This shows real boards where your condition is TRUE.</p>
      <p>Use it to verify you've built the question you meant to.</p>
    `,
    advanceOn: 'next'
  },
  {
    target: '#board-state-preview-wrap',
    title: 'Cycle through examples',
    body: `
      <ul>
        <li>Cycle the examples with <kbd>←Prev</kbd> / <kbd>Next →</kbd></li>
        <li>or the <kbd>←</kbd>/<kbd>→</kbd> arrow keys).</li>
        <li>Press <kbd>P</kbd> to hide the preview.</li>
      </ul>
    `,
    advanceOn: 'next'
  },
  {
    target: '#save-node',
    title: 'Save it',
    body: `<p>When the Current Condition reads the way you want, click <strong>Save</strong>.</p>`,
    advanceOn: { event: 'editor:node-saved', when: (nodeInfo) => nodeInfo.type === 'condition' }
  },
  {
    target: '#canvas-workspace',
    title: 'Connect it to Root',
    body: `
      <p>Your condition won't do anything until you connect it to the rest of the node graph.</p>
      <p><strong>Drag from Root's output dot to your condition's input dot.</strong></p>
    `,
    advanceOn: { event: 'editor:connection-created' }
  },
  {
    target: '.btn-add-node[data-type="score"]',
    title: 'Add a score node',
    body: `<p>A condition by itself doesn't change anything. To reward (or punish) moves, add a <strong>+ Score</strong> node.</p>`,
    advanceOn: { event: 'editor:node-added', when: (nodeInfo) => nodeInfo.type === 'score' }
  },
  {
    target: (ctx) => {
      const id = ctx.lastAdvanceDetail?.clientId
      return id ? document.querySelector(`.node[data-client-id="${id}"]`) : null
    },
    title: 'Open your new score',
    body: `<p><strong>Click your new score node</strong> to open the editor.</p>`,
    beforeEnter: lockNodeDrag,
    onExit: unlockNodeDrag,
    advanceOn: { event: 'editor:node-editing-started', when: (nodeInfo) => nodeInfo.type === 'score' }
  },
  {
    target: '#node-form-panel',
    placement: 'left',
    title: 'Configure the score',
    body: `
      <p>Score:</p>
      <ul>
        <li><em>Add</em> — raises the move's score to incentivize it.</li>
        <li><em>Subtract</em> — drops the move's score to discourage it (e.g. "my Moved Piece is undefended AND attacked").</li>
        <li><em>Set</em> — replaces the current score at that point in evaluation.</li>
        <li><em>Return</em> — sets the score and <strong>stops evaluating</strong> this move immediately.</li>
        <li>Change the value to reflect the importance of the rule you made.</li>
      </ul>
      <br>
      <p>Save when you're done.</p>
    `,
    advanceOn: { event: 'editor:node-saved', when: (nodeInfo) => nodeInfo.type === 'score' }
  },
  {
    target: '#canvas-workspace',
    title: 'Connect the score to your condition',
    body: `
      <p>Drag from your condition's output dot to the score's input dot.</p>
      <p>The score now applies only when the condition above it passes.</p>
    `,
    advanceOn: { event: 'editor:connection-created' }
  },
  {
    target: '#canvas-workspace',
    title: 'Preview a chain of conditions',
    body: `
      <p>To see a board where every condition in the chain holds.</p>
      <p><strong>Shift-click</strong> two or more connected conditions.</p>
      <p>Press <kbd>P</kbd></p>
    `,
    advanceOn: { event: 'editor:preview-shown', when: (preview) => preview.mode === 'selection' && preview.hasChain }
  },
  {
    target: '.board-state-preview__chain',
    title: 'Read the chain',
    body: `
      <p>Each condition in the chain appears as a sentence — in order.</p>
      <p>Now you are previewing moves on which each condition in the chain is simultaneously TRUE.</p>
    `,
    advanceOn: 'next'
  },
  {
    target: '#canvas-workspace',
    title: 'Removing a connection',
    body: `<p>To delete a connection, hover it — a small <strong>×</strong> appears. Click it to remove the line.</p>`,
    advanceOn: 'next'
  },
  {
    target: '.btn-delete-node',
    title: 'Deleting a node',
    body: `<p>Select a node and press <kbd>Delete</kbd> or <kbd>Backspace</kbd>, or click the <strong>Delete</strong> button in the toolbar. Deleting a node also removes its connections.</p>`,
    advanceOn: 'next'
  },
  {
    target: '#canvas-workspace',
    title: 'Inspect a node up close',
    body: `
      <p>Press <kbd>I</kbd>, then hover any node for a blown-up preview. <kbd>I</kbd> or <kbd>Esc</kbd> turns it off.</p>
    `,
    advanceOn: 'next'
  },
  {
    target: '.btn-tips-toggle',
    title: 'Tips & shortcuts live here',
    body: `
      <p>Every gesture and shortcut lives behind this <kbd>?</kbd> — plus the <strong>Bot Guide</strong>.</p>
    `,
    advanceOn: 'next'
  },
  {
    target: '#compile-and-exit-link',
    title: 'Compile your bot',
    body: `<p>When you're ready, click <strong>Compile</strong>. That bakes your graph into a runnable bot.</p>`,
    advanceOn: 'next'
  },
  {
    target: () => Array.from(document.querySelectorAll('.sidebar__link')).find((el) => el.textContent.trim() === 'Play Match'),
    title: 'Play your bot',
    body: `<p>After you finish, head to <strong>Play Match</strong> in the side nav to test your bot against another.</p>`,
    advanceOn: 'next'
  }
]

export default { steps: STEPS }
