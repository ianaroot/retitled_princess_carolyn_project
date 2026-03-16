# Step 03: Undo/Redo Manager

## Goal

Implement snapshot-based undo/redo with client ID stability.

## Files to Create

```
app/javascript/editorV2/
└── state/
    └── History.js
```

**Note:** Import constants for max history:
```javascript
import { MAX_HISTORY } from '../constants.js'
```

## Dependencies

- Step 02: State Manager (Store, Graph)

## Implementation

### History.js

Snapshot-based undo/redo that preserves client IDs across operations.

```javascript
// state/History.js

import { MAX_HISTORY } from '../constants.js'

/**
 * Manages undo/redo history with snapshots
 * Preserves client IDs across undo/redo operations
 */
class History {
  constructor(store, maxHistory = MAX_HISTORY) {
    this.store = store
    this.maxHistory = maxHistory
    this.stack = []
    this.currentIndex = -1
    
    // Wire up history push on store changes
    this.autoPush = true
  }
  
  // ===== History Operations =====
  
  /**
   * Push current state to history
   * Called after each user operation
   * @param {string} description - Human-readable description
   */
  push(description) {
    if (!this.autoPush) return
    
    // Get snapshot of current graph state
    const snapshot = this.store.getSnapshot()
    
    // If we're in the middle of history, trim future
    if (this.currentIndex < this.stack.length - 1) {
      this.stack = this.stack.slice(0, this.currentIndex + 1)
    }
    
    // Add snapshot to stack
    this.stack.push({
      description,
      snapshot,
      timestamp: Date.now()
    })
    
    // Trim to max history
    if (this.stack.length > this.maxHistory) {
      this.stack.shift()
    } else {
      this.currentIndex++
    }
    
    this.updateUI()
  }
  
  /**
   * Undo the last operation
   * Restores previous snapshot, preserving client IDs
   */
  undo() {
    if (!this.canUndo()) return
    
    this.currentIndex--
    this.restore()
    this.updateUI()
  }
  
  /**
   * Redo the next operation
   * Restores next snapshot, preserving client IDs
   */
  redo() {
    if (!this.canRedo()) return
    
    this.currentIndex++
    this.restore()
    this.updateUI()
  }
  
  /**
   * Restore current snapshot
   * Called internally after undo/redo
   */
  restore() {
    const entry = this.stack[this.currentIndex]
    if (!entry) return
    
    // Restore graph state - client IDs preserved!
    this.store.restoreSnapshot(entry.snapshot)
  }
  
  // ===== Status Queries =====
  
  /**
   * Check if undo is available
   * @returns {boolean} True if can undo
   */
  canUndo() {
    return this.currentIndex > 0
  }
  
  /**
   * Check if redo is available
   * @returns {boolean} True if can redo
   */
  canRedo() {
    return this.currentIndex < this.stack.length - 1
  }
  
  /**
   * Get current position display
   * @returns {string} Position string like "(3/50)"
   */
  getHistoryDisplay() {
    if (this.currentIndex === -1) return '(0/' + this.maxHistory + ')'
    return '(' + (this.currentIndex + 1) + '/' + this.maxHistory + ')'
  }
  
  /**
   * Get history entries for UI (e.g., history dropdown)
   * @returns {Array} Array of { description, timestamp }
   */
  getHistoryList() {
    return this.stack.map((entry, index) => ({
      description: entry.description,
      timestamp: entry.timestamp,
      isCurrent: index === this.currentIndex
    }))
  }
  
  // ===== Batch Operations =====
  
  /**
   * Start a batch of operations
   * All operations between startBatch() and endBatch() 
   * are combined into a single history entry
   */
  startBatch() {
    this.autoPush = false
    this.batchStartSnapshot = this.store.getSnapshot()
  }
  
  /**
   * End a batch of operations
   * Pushes a single history entry for the entire batch
   * @param {string} description - Human-readable description
   */
  endBatch(description) {
    this.autoPush = true
    if (this.batchStartSnapshot) {
      this.push(description)
      this.batchStartSnapshot = null
    }
  }
  
  /**
   * Execute a function as a single undoable operation
   * @param {string} description - Description for history
   * @param {Function} fn - Function to execute
   */
  batch(description, fn) {
    this.startBatch()
    fn()
    this.endBatch(description)
  }
  
  // ===== Utility Methods =====
  
  /**
   * Clear all history
   */
  clear() {
    this.stack = []
    this.currentIndex = -1
    this.updateUI()
  }
  
  /**
   * Update UI elements (undo/redo buttons)
   * Override this method to wire to actual UI
   */
  updateUI() {
    // Default implementation - override in actual implementation
    const undoBtn = document.querySelector('.btn-undo')
    const redoBtn = document.querySelector('.btn-redo')
    const countDisplay = document.querySelector('.undo-count')
    
    if (undoBtn) {
      undoBtn.disabled = !this.canUndo()
    }
    if (redoBtn) {
      redoBtn.disabled = !this.canRedo()
    }
    if (countDisplay) {
      countDisplay.textContent = this.getHistoryDisplay()
    }
  }
}

export default History
```

## Circular Dependency Note

The Store and History classes have a circular dependency:

```javascript
// In index.js during initialization:
const store = new Store()
const history = new History(store)  // History needs Store for getSnapshot()
store.history = history               // Store needs History for canUndo()/canRedo()
```

**Why this exists:**
- `History` needs `Store` to call `getSnapshot()` and `restoreSnapshot()`
- `Store` needs `History` to expose `canUndo()` and `canRedo()` methods

**Current approach (Option A):** Accept the circular dependency with clear documentation.

**Future refactor (Option C):** Remove the circular dependency by passing History explicitly where needed:

```javascript
// Refactored approach - no circular dependency:
// Store doesn't hold history reference
// Components that need history receive it directly:
const keyboardHandler = new KeyboardHandler(store, history, syncManager)

// Store removes canUndo()/canRedo() methods
// Call history.canUndo() directly instead of store.canUndo()
```

**Benefits of Option C:**
- Cleaner dependency graph
- Easier to test components in isolation
- Single responsibility principle

**Drawbacks of Option C:**
- More constructor parameters to pass around
- History not accessible from Store methods
- Requires moderate refactoring across multiple files

For MVP, we use Option A with clear documentation.

## Integration with Store

The History class needs to be wired to the Store in the main entry point:

```javascript
// index.js (Step 10)
import Store from './state/Store.js'
import History from './state/History.js'

export async function initEditor(botId, container) {
  const store = new Store()
  const history = new History(store, 50)
  
  // Wire history to store
  store.history = history
  
  // Subscribe to state changes for auto-push
  // Note: We only want to push for user-initiated changes,
  // not for undo/redo restores
  let isUndoing = false
  
  store.subscribe((event, data) => {
    // Skip push during undo/redo restore
    if (isUndoing) return
    
    // Skip view state changes
    if (event === 'view:update') return
    
    // Push to history on graph changes
    if (event.startsWith('node:') || event.startsWith('connection:')) {
      history.push(event)
    }
  })
  
  // Intercept undo/redo to set flag
  const originalUndo = history.undo.bind(history)
  const originalRedo = history.redo.bind(history)
  
  history.undo = () => {
    isUndoing = true
    originalUndo()
    isUndoing = false
  }
  
  history.redo = () => {
    isUndoing = true
    originalRedo()
    isUndoing = false
  }
  
  return { store, history }
}
```

## Alternative: Explicit History Push

Instead of auto-push, require explicit history push for each operation:

```javascript
// Explicit mode - more control, more verbose
class SyncManager {
  async createNode(type, position, data) {
    const clientId = generateUUID()
    const node = new Node({ clientId, type, position, data })
    
    // Update state
    this.store.addNode(node)
    
    // Push to history explicitly
    this.history.push('Create ' + type + ' node')
    
    // Sync with server
    await this.syncCreateNode(clientId)
  }
  
  async deleteNode(clientId) {
    const node = this.store.getNode(clientId)
    
    // Update state
    this.store.removeNode(clientId)
    
    // Push to history explicitly
    this.history.push('Delete node')
    
    // Sync with server
    await this.syncDeleteNode(clientId)
  }
}
```

## Key Design Decisions

### Snapshot-Based vs. Operation-Based

**Chosen:** Snapshot-based (stores entire graph state)

**Alternatives:**
1. **Operation-based:** Store inverse operations (create vs. delete, original position vs. new position)
2. **Delta-based:** Store only changed fields

**Rationale:**
- Simpler to implement
- Client IDs preserved naturally (same snapshot format)
- No complex inverse logic
- Easy to debug (can log entire state)
- Memory acceptable (50 snapshots max, JSON compresses well)

### View State Excluded

History snapshots only contain graph state, not view state.

```javascript
getSnapshot() {
  return this.graph.toJSON()  // Only graph, not viewState
}
```

**Why:**
- Zoom/pan/selection changes shouldn't be undoable
- Aligns with user mental model
- Reduces history size

### Client IDs Preserved Across Undo/Redo

The key innovation: client IDs never change.

```javascript
// Original state
{ nodes: [{ clientId: 'uuid-1', serverId: 123, ... }] }

// After undo (restore to original)
{ nodes: [{ clientId: 'uuid-1', serverId: 123, ... }] }

// Client ID is identical!
// No ID mapping needed
// Connections still reference 'uuid-1'
```

**Contrast with old approach:**
```javascript
// Old: Database IDs change on restore
{ nodes: [{ id: 123 }] }  // Original
{ nodes: [{ id: 456 }] }  // After undo (recreated!)
// Connections break because they reference 123
```

### Batch Operations

Group multiple operations into single history entry.

```javascript
// User drags multiple nodes at once
history.startBatch()
nodes.forEach(node => {
  store.updateNode(node.clientId, { position: newPosition })
})
history.endBatch('Drag nodes')  // Single entry
```

**Why:**
- Some operations naturally involve multiple changes
- Undo should revert entire batch
- Matches user mental model

### UI Update Callback

History calls `updateUI()` after each operation.

```javascript
updateUI() {
  // Enable/disable buttons
  undoBtn.disabled = !this.canUndo()
  redoBtn.disabled = !this.canRedo()
  
  // Update count display
  countDisplay.textContent = this.getHistoryDisplay()
}
```

**Why:**
- Separates history logic from UI
- Can override for custom UI
- Keeps UI in sync with history state

## Comparison with Old UndoManager

| Old UndoManager | New History |
|----------------|-------------|
| Compares node IDs, recreates nodes | Stores snapshots, restores directly |
| Complex `restoreFullState()` with API calls | Simple `restoreSnapshot()` |
| Mixed concerns (sync + DOM) | Single concern: history management |
| ID mapping tables (`idMapping`) | No ID mapping needed |
| Separate drag state handling | Unified snapshot approach |
| DOM recreation on every undo | Store handles restoration, renderers update |

After loading a bot, push the initial state to history:

```javascript
// In index.js (Step 10), after loadBot:
const initialGraph = await api.loadBot()
store.replaceGraph(initialGraph)

// Push initial state to history
history.push('Initial state')
```

This ensures the first undo goes back to the initial loaded state, not an empty graph.

## Testing

```javascript
// state/__tests__/History.test.js
import Store from '../Store.js'
import History from '../History.js'
import Node from '../../models/Node.js'
import { generateUUID } from '../../utils/uuid.js'

describe('History', () => {
  let store, history
  
  beforeEach(() => {
    store = new Store()
    history = new History(store)
    store.history = history
  })
  
  it('pushes state to history', () => {
    const node = new Node({ clientId: generateUUID(), type: 'condition', position: { x: 100, y: 200 } })
    store.addNode(node)
    history.push('Add node')
    
    expect(history.stack.length).toBe(1)
    expect(history.currentIndex).toBe(0)
  })
  
  it('undoes state change', () => {
    const node1 = new Node({ clientId: generateUUID(), type: 'condition', position: { x: 100, y: 200 } })
    store.addNode(node1)
    history.push('Add node 1')
    
    const node2 = new Node({ clientId: generateUUID(), type: 'action', position: { x: 200, y: 300 } })
    store.addNode(node2)
    history.push('Add node 2')
    
    expect(store.getNodes().length).toBe(2)
    
    history.undo()
    
    expect(store.getNodes().length).toBe(1)
    expect(store.getNodes()[0].clientId).toBe(node1.clientId)
  })
  
  it('redoes state change', () => {
    const node1 = new Node({ clientId: generateUUID(), type: 'condition', position: { x: 100, y: 200 } })
    store.addNode(node1)
    history.push('Add node 1')
    
    const node2 = new Node({ clientId: generateUUID(), type: 'action', position: { x: 200, y: 300 } })
    store.addNode(node2)
    history.push('Add node 2')
    
    history.undo()
    expect(store.getNodes().length).toBe(1)
    
    history.redo()
    expect(store.getNodes().length).toBe(2)
    expect(store.getNodes()[1].clientId).toBe(node2.clientId)
  })
  
  it('preserves client IDs across undo/redo', () => {
    const clientId = generateUUID()
    const node = new Node({ clientId, type: 'condition', position: { x: 100, y: 200 } })
    
    store.addNode(node)
    history.push('Add node')
    
    store.updateNode(clientId, { position: { x: 150, y: 200 } })
    history.push('Move node')
    
    history.undo()
    
    const restoredNode = store.getNode(clientId)
    expect(restoredNode.clientId).toBe(clientId)  // Same client ID!
    expect(restoredNode.position.x).toBe(100)  // Original position
  })
})
```

## Completion Checklist

- [ ] `History.js` created
- [ ] Snapshot storage and restoration implemented
- [ ] `canUndo()` and `canRedo()` work correctly
- [ ] `push()`, `undo()`, `redo()` implemented
- [ ] Client IDs preserved across undo/redo
- [ ] View state NOT included in snapshots
- [ ] Batch operations implemented
- [ ] UI update callback works
- [ ] Unit tests pass