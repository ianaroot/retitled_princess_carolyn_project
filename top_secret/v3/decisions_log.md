# Node Editor Overhaul - Decisions Log

This document tracks architectural decisions made during the overhaul, along with context and rationale.

## Decision 1: Client-Side UUIDs

**Date:** 2026-03-13

**Context:**
The original editor uses database IDs for nodes and connections. During undo/redo operations, nodes are recreated when IDs don't match, causing cascading failures with connection references.

**Decision:**
All nodes and connections will have a `clientId` (UUID) generated on the client that never changes. Database IDs will be stored as `serverId` and treated as secondary identifiers.

**Alternatives Considered:**
1. **Persist database IDs through recreations** - Would require backend changes and complex state tracking
2. **ID mapping tables** - Current approach, proven fragile with edge cases
3. **Composite keys** - Would complicate lookups and still have reference issues

**Rationale:**
- UUIDs are stable across all operations
- No server changes required
- Clean separation between identity (clientId) and persistence (serverId)
- Maps well to existing backend (no database schema changes)

**Consequences:**
- Need to maintain bidirectional Map: clientId ↔ serverId
- Loading existing bots requires assigning clientIds
- New nodes have null serverId until synced

---

## Decision 2: Plain JavaScript Objects (No Immer)

**Date:** 2026-03-13

**Context:**
State management requires immutable updates. Libraries like Immer.js provide ergonomic APIs for immutable state changes.

**Decision:**
Use plain JavaScript objects with spread operators for immutable updates. No external state management library.

**Alternatives Considered:**
1. **Immer.js** - Popular, ergonomic API, automatic immutability
2. **Redux** - Established patterns, middleware ecosystem
3. **MobX** - Observable state, automatic UI updates

**Rationale:**
- Project scope is manageable with plain objects
- Spread operators are sufficient for our state shape
- Zero dependencies = simpler build and debugging
- Easy to understand for all team members
- Performance is acceptable for our use case (hundreds of nodes, not thousands)

**Consequences:**
- Manual spread operators required for deep updates
- Need to be careful about reference equality
- No middleware ecosystem
- State updates are explicit and traceable

**Code Pattern:**
```javascript
class History {
  constructor(store) {
    this.batchDepth = 0
    this.autoPush = true
  }
  
  startBatch() {
    if (this.batchDepth === 0) {
      this.autoPush = false
    }
    this.batchDepth++
  }
  
  endBatch(description) {
    this.batchDepth--
    if (this.batchDepth < 0) {
      this.batchDepth = 0
      this.autoPush = true
      throw new Error('endBatch() without matching startBatch()')
    }
    if (this.batchDepth === 0) {
      this.autoPush = true
      this.push(description)
    }
  }
  
  batch(description, fn) {
    this.startBatch()
    try {
      fn()
    } finally {
      this.endBatch(description)
    }
  }
  
  resetBatch() {
    this.batchDepth = 0
    this.autoPush = true
  }
}
```

---

## Decision 3: Snapshot-Based Undo/Redo

**Date:** 2026-03-13

**Context:**
The original undo manager uses complex state comparison (`restoreFullState()`) that compares node IDs, recreating elements that don't match. This causes ID instability.

**Decision:**
Store entire graph state as JSON snapshot on each operation. Undo/redo replaces entire graph state. View state (zoom, pan, selection) is not stored in history.

**Alternatives Considered:**
1. **Operation-based undo** - Store operations (create, update, delete) and reverse them
2. **Delta-based undo** - Store only changed fields
3. **Immer patches** - Use Immer's patch system for minimal state storage

**Rationale:**
- Snapshot is simplest to implement correctly
- No complex diffing logic
- Client IDs preserved naturally (same snapshot format)
- Easy to debug (can log entire state at each step)
- Memory is not a concern (50 snapshots max, JSON compresses well)

**Consequences:**
- More memory usage than delta-based
- Undoing unrelated operations still necessary (e.g., position change before connection change)
- Max history depth of 50 snapshots recommended

**Snapshot Format:**
```json
{
  "nodes": [
    {
      "clientId": "uuid-1",
      "serverId": 123,
      "type": "condition",
      "position": { "x": 100, "y": 200 },
      "data": { "context": "enemies" }
    }
  ],
  "connections": [
    {
      "clientId": "uuid-2",
      "serverId": 456,
      "sourceId": "uuid-1",
      "targetId": "uuid-3"
    }
  ]
}
```

---

## Decision 4: Optimistic UI Updates

**Date:** 2026-03-13

**Context:**
Original editor waits for server response before updating UI, causing sluggish feel.

**Decision:**
UI updates immediately on user interaction. Server sync happens in background. On failure, UI rolls back to previous state and shows error.

**Alternatives Considered:**
1. **Pessimistic updates** - Wait for server (current approach)
2. **Offline-first** - Queue all operations, sync when connected
3. **Server reconciliation** - Let server dictate state

**Rationale:**
- Responsive UX critical for visual editor
- Most operations succeed (optimistic assumption holds)
- Rollback provides safety net
- Error banners inform user of issues

**Consequences:**
- Need to handle rollback gracefully
- Temporary state may differ from server state
- Error handling must be comprehensive

**Implementation Pattern:**
```javascript
async createNode(clientId, type, position, data) {
  const node = new Node({ clientId, type, position, data })
  const previousState = null // For new node, no previous state
  
  // 1. Optimistic: add to graph immediately
  this.store.addNode(node)
  
  // 2. Background: sync with server
  try {
    const response = await this.api.createNode(...)
    this.store.updateNode(clientId, { serverId: response.id })
  } catch (error) {
    this.store.removeNode(clientId)
    this.showError(error)
  }
}
```

---

## Decision 5: Parallel Implementation (editorV2/)

**Date:** 2026-03-13

**Context:**
Need to rebuild editor while maintaining existing functionality. Could modify existing code or build new version.

**Decision:**
Build new editor in parallel `app/javascript/editorV2/` folder. After completion, swap Rails view to use new entry point. Remove old editor after verification.

**Alternatives Considered:**
1. **In-place refactoring** - Modify existing files incrementally
2. **Feature flags** - Toggle between old/new in same codebase
3. **New route** - Deploy to different URL for testing

**Rationale:**
- Parallel development allows testing without breaking existing
- Clean break from old architecture
- Easy to revert if issues (single file change)
- Can run both versions for comparison

**Consequences:**
- More files during development
- Need to maintain two versions temporarily
- Must ensure feature parity before switchover

**Switchover:**
Single line change in Rails view:
```erb
<%# OLD %>
<%= javascript_include_tag 'editor' %>

<%# NEW %>
<%= javascript_include_tag 'editorV2' %>
```

---

## Decision 6: In-Memory Map for Connection Tracking

**Date:** 2026-03-13

**Context:**
Original editor used DOM queries to find connections, then switched to Map keyed by `${sourceId}-${targetId}`. When node IDs change, connection keys become invalid.

**Decision:**
Track connections in Map keyed by `clientId`. Connection has its own stable UUID that never changes. Referenced by `clientId` from renderers and handlers.

**Alternatives Considered:**
1. **DOM queries** - Original approach, slow and fragile
2. **Array of connections** - O(n) lookups
3. **Two Maps** - One by clientId, one by source/target

**Rationale:**
- O(1) lookup by clientId
- Key remains stable across undo/redo
- Can still query by source/target using graph methods
- Aligns with node tracking approach

**Consequences:**
- Need to iterate when finding connections for a specific node
- No change from current Map approach, just different key

**Code Pattern:**
```javascript
class ConnectionRenderer {
  elements = new Map() // clientId → { line, hitarea }
  
  handleStateChange(event, data) {
    if (event === 'connection:add') {
      this.renderConnection(this.store.getConnection(data.clientId))
    }
  }
}
```

---

## Decision 7: Single Store Pattern

**Date:** 2026-03-13

**Context:**
Original editor has state scattered across multiple objects: `nodeEditor.nodes`, `connectionManager.connections`, `undoManager.history`, DOM elements, etc.

**Decision:**
Single `Store` class holds all state. All renderers and handlers subscribe to the same Store instance.

**Alternatives Considered:**
1. **Multiple state objects** - Current approach, proven messy
2. **Redux store** - Overkill for this scope
3. **Observable objects** - Each model observable separately

**Rationale:**
- Single source of truth eliminates synchronization issues
- Subscriber pattern enables reactive UI updates
- Easy to debug (can log entire state)
- Clear data flow: Action → Store → Renderers

**Consequences:**
- Store class becomes central dependency
- Need to be careful about subscriber cleanup
- State shape needs to be well-documented

**Store Shape:**
```javascript
{
  graph: {
    nodes: Map<clientId, Node>,
    connections: Map<clientId, Connection>
  },
  viewState: {
    zoom: number,
    pan: { x, y },
    selectedNodeId: clientId | null,
    editingNodeId: clientId | null
  }
}
```

---

## Decision 8: Separate View State from Graph State

**Date:** 2026-03-13

**Context:**
Undo/redo history should track graph changes (nodes, connections, positions) but not view changes (zoom, pan, selection).

**Decision:**
`Store` contains both `graph` and `viewState`. Only `graph` is included in history snapshots. View state changes do not trigger history push.

**Alternatives Considered:**
1. **All state in history** - Zoom/pan changes would be undoable (bad UX)
2. **Separate stores** - More complex subscription management
3. **Implicit view state** - Keep in DOM elements (hard to manage)

**Rationale:**
- Graph changes are meaningful (create node, connect nodes)
- View changes are ephemeral (zoom, selection)
- Aligns with user mental model
- Simplifies history management

**Consequences:**
- Undo/redo doesn't restore zoom/pan position
- View state preserved across history navigation
- Different handlers for different state types

**Implementation:**
```javascript
// Graph state change - push to history
updateNode(clientId, updates) {
  this.store.updateNode(clientId, updates)
  this.history.push('Update node')
}

// View state change - don't push to history
setZoom(zoom) {
  this.store.setZoom(zoom)
  // No history.push()
}
```

---

## Decision 11: No Circular Dependencies (Store ↔ History)

**Date:** 2026-03-13

**Context:**
Originally, Store held a reference to History (`store.history`) so that `store.canUndo()` and `store.canRedo()` methods could delegate to History. This created a circular dependency.

**Decision:**
Remove the history reference from Store. Components that need to check `canUndo()`/`canRedo()` receive History explicitly in their constructor.

**Rationale:**
- Cleaner dependency graph
- Easier to test components in isolation
- Single responsibility principle
- Explicit dependencies are more maintainable

**Consequences:**
- `KeyboardHandler` receives `(store, history, syncManager)` instead of just `(store, syncManager)`
- UI buttons that check undo/redo state receive history directly
- Store is simpler and has fewer responsibilities

**Code Pattern:**
```javascript
// BAD: Circular dependency
class Store {
  canUndo() { return this.history?.canUndo() || false }
}

// GOOD: Pass history explicitly
const store = new Store()
const history = new History(store)
const keyboardHandler = new KeyboardHandler(store, history, syncManager)

// To check canUndo, call history directly:
if (history.canUndo()) {
  history.undo()
}
```

---

## Decision 12: Pre-bound Event Handlers

**Date:** 2026-03-13

**Context:**
Event handlers that use `.bind(this)` in `addEventListener` create a new function reference each time. When `removeEventListener` is called with another `.bind(this)`, it doesn't match the original listener.

**Decision:**
Pre-bind handlers in the constructor and store the bound references. Use the same references for both add and remove.

**Rationale:**
- Fixes memory leaks from unremoved event listeners
- Ensures cleanup works correctly
- Standard pattern for class-based event handlers

**Code Pattern:**
```javascript
class DragHandler {
  constructor(store, syncManager, history) {
    this.store = store
    this.syncManager = syncManager
    this.history = history
    
    // Pre-bind handlers once
    this.boundHandleMouseMove = this.handleMouseMove.bind(this)
    this.boundHandleMouseUp = this.handleMouseUp.bind(this)
  }
  
  handleMouseDown(event, clientId) {
    // Add pre-bound handlers
    document.addEventListener('mousemove', this.boundHandleMouseMove)
    document.addEventListener('mouseup', this.boundHandleMouseUp)
  }
  
  handleMouseUp(event) {
    // Remove with same references
    document.removeEventListener('mousemove', this.boundHandleMouseMove)
    document.removeEventListener('mouseup', this.boundHandleMouseUp)
  }
  
  destroy() {
    // Clean up any remaining listeners
    document.removeEventListener('mousemove', this.boundHandleMouseMove)
    document.removeEventListener('mouseup', this.boundHandleMouseUp)
  }
}
```

---

## Decision 13: AbortController for Async Operations

**Date:** 2026-03-13

**Context:**
When fetching node preview HTML, the node might be deleted before the fetch completes. The DOM element could be null, causing errors.

**Decision:**
Use AbortController to cancel pending fetches when nodes are removed. Check if elements still exist before updating DOM.

**Rationale:**
- Prevents race conditions
- Avoids "element is null" errors
- Cleans up network requests properly
- Standard Web API pattern

**Code Pattern:**
```javascript
class NodeRenderer {
  constructor(container, store, api) {
    this.pendingFetches = new Map()  // clientId → AbortController
  }
  
  async fetchPreview(clientId, element) {
    // Cancel previous fetch for this node
    this.cancelPendingFetch(clientId)
    
    const abortController = new AbortController()
    this.pendingFetches.set(clientId, abortController)
    
    try {
      const response = await fetch(url, { signal: abortController.signal })
      
      // Check if element still exists
      if (!element.isConnected) return
      
      // Update DOM
    } catch (error) {
      if (error.name === 'AbortError') return  // Expected
      console.warn('Preview fetch failed:', error)
    } finally {
      this.pendingFetches.delete(clientId)
    }
  }
  
  cancelPendingFetch(clientId) {
    const controller = this.pendingFetches.get(clientId)
    if (controller) {
      controller.abort()
      this.pendingFetches.delete(clientId)
    }
  }
}
```

---

## Decision 14: Batch Depth Tracking

**Date:** 2026-03-13

**Context:**
History's `startBatch()` and `endBatch()` could become unbalanced if `endBatch()` is called without matching `startBatch()`, leaving `autoPush = false` permanently.

**Decision:**
Track `batchDepth` counter and throw error on unbalanced calls. Provide `batch(description, fn)` wrapper for safe automatic cleanup.

**Rationale:**
- Prevents orphaned batch state
- Makes debugging easier with clear error message
- Safe wrapper handles cleanup in finally block

**Code Pattern:**
```javascript
class History {
  constructor(store) {
    this.batchDepth = 0
    this.autoPush = true
  }
  
  startBatch() {
    if (this.batchDepth === 0) {
      this.autoPush = false
    }
    this.batchDepth++
  }
  
  endBatch(description) {
    this.batchDepth--
    if (this.batchDepth < 0) {
      this.batchDepth = 0
      this.autoPush = true
      throw new Error('endBatch() without matching startBatch()')
    }
    if (this.batchDepth === 0) {
      this.autoPush = true
      this.push(description)
    }
  }
  
  batch(description, fn) {
    this.startBatch()
    try {
      fn()
    } finally {
      this.endBatch(description)
    }
  }
}
```

---

## Decision 15: History Push After Successful Sync

**Date:** 2026-03-13

**Context:**
Previously, history.push() was called immediately after optimistic store update, before server sync completed. This could leave history in inconsistent state if server fails.

**Decision:**
Push to history ONLY after successful server sync. If sync fails, roll back store without affecting history.

**Rationale:**
- History always represents successfully synced states
- Simpler rollback logic
- No orphaned history entries
- Clearer mental model: history = "what was saved"

**Code Pattern:**
```javascript
async createNode(type, position, data) {
  // 1. Optimistic: Add to store immediately
  this.store.addNode(node)
  
  try {
    // 2. Sync with server
    const response = await this.api.createNode(...)
    
    // 3. Update server ID
    this.store.updateNode(clientId, { serverId: response.id })
    
    // 4. Push to history ONLY after success
    this.history.push('Create node')
    
  } catch (error) {
    // 5. Rollback store (history was never touched)
    this.store.removeNode(clientId)
    throw error
  }
}
```

---

## Decision 16: Event Name Constants

**Date:** 2026-03-13

**Context:**
Event names like `'node:add'`, `'connection:add'` were string literals scattered throughout the codebase. Typos would be hard to debug.

**Decision:**
Define event names as constants in `constants.js` and use throughout.

**Rationale:**
- IDE autocomplete/autofill support
- Typos caught at compile time
- Easy to rename events globally
- Self-documenting code

**Code Pattern:**
```javascript
// constants.js
export const EVENTS = {
  NODE_ADD: 'node:add',
  NODE_UPDATE: 'node:update',
  NODE_REMOVE: 'node:remove',
  CONNECTION_ADD: 'connection:add',
  CONNECTION_REMOVE: 'connection:remove',
  GRAPH_REPLACE: 'graph:replace',
  GRAPH_RESTORE: 'graph:restore'
}

// Usage
import { EVENTS } from '../constants.js'

store.subscribe((event, data) => {
  if (event === EVENTS.NODE_ADD) {
    this.renderNode(data.node)
  }
})
```

---

## Decision 17: SyncManager Owns All History Pushes

**Date:** 2026-03-14

**Context:**
Handlers (DragHandler, ConnectionHandler, KeyboardHandler) could push to history directly, but this creates issues when server sync fails. History would contain operations that never persisted.

**Decision:**
Only SyncManager calls `history.push()`. Handlers never push directly. History is pushed only AFTER successful server sync.

**Rationale:**
- History represents successfully synced state
- Failed operations don't leave orphaned history entries
- Clean rollback: restore store, no history manipulation needed
- Single source of truth for when history updates

**Code Pattern:**
```javascript
// CORRECT: SyncManager pushes after successful sync
class SyncManager {
  async createNode(...) {
    this.store.addNode(node)
    
    try {
      await this.api.createNode(...)
      this.history.push('Create node')  // Only after success
    } catch (error) {
      this.store.removeNode(clientId)  // Rollback, no history entry
      throw error
    }
  }
}

// WRONG: Handler pushes before sync
class DragHandler {
  handleMouseUp() {
    this.history.push('Drag node')  // DON'T DO THIS
    this.syncManager.updateNodePosition(...)
  }
}

// CORRECT: Handler just calls SyncManager
class DragHandler {
  handleMouseUp() {
    // No history.push here - SyncManager handles it
    this.syncManager.updateNodePosition(clientId, x, y)
  }
}
```

**Consequences:**
- Handlers are simpler (no history management)
- History is always consistent with server
- Undo/redo only affects saved state
- Clear mental model: history = "what was saved"

---

## Future Decisions

Decisions that may need to be revisited:

1. **Offline support** - Queue operations when offline, sync when connected
2. **Collaborative editing** - How to handle simultaneous edits
3. **Large graphs** - Performance with thousands of nodes
4. **Undo/redo limits** - Memory usage with 100+ operations
5. **State persistence** - Should we persist state to localStorage for recovery?

These will be tracked as separate decisions if needed.

---

## Decision 9: XSS Prevention with Input Escaping

**Date:** 2026-03-13

**Context:**
User input (node data, error messages) could contain malicious HTML/JavaScript that would be executed if inserted into the DOM via `innerHTML`.

**Decision:**
- Escape all user data when inserting into HTML strings
- Use `textContent` instead of `innerHTML` for error messages and dynamic text
- Never trust user input for HTML construction

**Alternatives Considered:**
1. **Content Security Policy (CSP)** - Prevents script execution but doesn't prevent visual corruption
2. **DOM building instead of HTML strings** - Safer but more verbose
3. **Sanitization library** - Adds dependency

**Rationale:**
- Simple escape function covers most cases
- `textContent` is safer for error messages
- CSP is an additional layer but not a replacement

**Consequences:**
- Slightly more code for escaping
- Error messages display as plain text (feature, not bug)
- User content like `node.data.context` is safely escaped

**Code Pattern:**
```javascript
// Escape function for HTML strings
escapeHtml(unsafe) {
  if (unsafe == null) return ''
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// Use textContent for error messages (prevents XSS)
const banner = document.createElement('div')
const message = document.createElement('span')
message.textContent = error.message  // Safe - treated as text
banner.appendChild(message)
```

---

## Decision 10: Initial History State After Bot Load

**Date:** 2026-03-13

**Context:**
After loading a bot, the history stack is empty. The first undo would go to "no state" rather than the initial loaded state.

**Decision:**
Push initial state to history immediately after loading bot.

**Rationale:**
- Users expect undo to return to initial state
- Matches mental model of "restore to just loaded"
- Consistent with most undo/redo implementations

**Consequences:**
- History position after load is 1 (not 0)
- First undo returns to initial load state
- Redo returns to current state

**Code Pattern:**
```javascript
// In initEditor:
const initialGraph = await api.loadBot()
store.replaceGraph(initialGraph)

// Push initial state
history.push('Initial state')
```