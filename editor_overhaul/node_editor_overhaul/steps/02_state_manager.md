# Step 02: State Manager

## Goal

Create central state store with immutable updates and subscriber pattern.

## Files to Create

```
app/javascript/editorV2/
└── state/
    └── Store.js
```

## Dependencies

- Step 01: Data Models (Graph, Node, Connection)

## Implementation

### Store.js

Central state store with subscriber pattern for reactive updates.

```javascript
// state/Store.js

import Graph from '../models/Graph.js'

/**
 * Central state store for the node editor
 * Single source of truth for all application state
 */
class Store {
  constructor(initialGraph = null) {
    // Graph state (undo/redo eligible)
    this.graph = initialGraph || new Graph()
    
    // View state (not in history)
    this.viewState = {
      zoom: 1,
      pan: { x: 0, y: 0 },
      selectedNodeId: null,
      editingNodeId: null
    }
    
    // Subscribers for state changes
    this.subscribers = new Set()
  }
  
  // ===== Graph State Updates =====
  
  /**
   * Replace entire graph (used by history for undo/redo)
   * @param {Graph} newGraph - New graph instance
   */
  replaceGraph(newGraph) {
    this.graph = newGraph
    this.notify('graph:replace', { graph: newGraph })
  }
  
  /**
   * Add a node to the graph
   * @param {Node} node - Node instance
   */
  addNode(node) {
    const oldGraph = this.graph
    this.graph = this.graph.addNode(node)
    this.notify('node:add', { clientId: node.clientId, node })
  }
  
  /**
   * Remove a node from the graph
   * @param {string} clientId - Node clientId
   */
  removeNode(clientId) {
    const node = this.graph.getNode(clientId)
    if (!node) return
    
    this.graph = this.graph.removeNode(clientId)
    this.notify('node:remove', { clientId, node })
    
    // Clear selection if removed node was selected
    if (this.viewState.selectedNodeId === clientId) {
      this.viewState = { ...this.viewState, selectedNodeId: null }
    }
  }
  
  /**
   * Update a node
   * @param {string} clientId - Node clientId
   * @param {Object} updates - Properties to update
   */
  updateNode(clientId, updates) {
    const node = this.graph.getNode(clientId)
    if (!node) return
    
    this.graph = this.graph.updateNode(clientId, updates)
    this.notify('node:update', { clientId, updates, node: this.graph.getNode(clientId) })
  }
  
  /**
   * Add a connection to the graph
   * @param {Connection} connection - Connection instance
   */
  addConnection(connection) {
    const oldGraph = this.graph
    this.graph = this.graph.addConnection(connection)
    this.notify('connection:add', { clientId: connection.clientId, connection })
  }
  
  /**
   * Remove a connection from the graph
   * @param {string} clientId - Connection clientId
   */
  removeConnection(clientId) {
    const connection = this.graph.getConnection(clientId)
    if (!connection) return
    
    this.graph = this.graph.removeConnection(clientId)
    this.notify('connection:remove', { clientId, connection })
  }
  
  /**
   * Update a connection
   * @param {string} clientId - Connection clientId
   * @param {Object} updates - Properties to update
   */
  updateConnection(clientId, updates) {
    const connection = this.graph.getConnection(clientId)
    if (!connection) return
    
    this.graph = this.graph.updateConnection(clientId, updates)
    this.notify('connection:update', { clientId, updates, connection: this.graph.getConnection(clientId) })
  }
  
  // ===== View State Updates =====
  
  /**
   * Set zoom level
   * @param {number} zoom - Zoom level
   */
  setZoom(zoom) {
    this.viewState = { ...this.viewState, zoom }
    // Note: View state changes do NOT trigger notify (not in history)
  }
  
  /**
   * Set pan offset
   * @param {number} x - X offset
   * @param {number} y - Y offset
   */
  setPan(x, y) {
    this.viewState = { ...this.viewState, pan: { x, y } }
  }
  
  /**
   * Set selected node
   * @param {string|null} clientId - Node clientId or null to deselect
   */
  setSelectedNodeId(clientId) {
    this.viewState = { ...this.viewState, selectedNodeId: clientId }
  }
  
  /**
   * Set editing node (opens editor panel)
   * @param {string|null} clientId - Node clientId or null to close
   */
  setEditingNodeId(clientId) {
    this.viewState = { ...this.viewState, editingNodeId: clientId }
  }
  
  // ===== Queries =====
  
  /**
   * Get a node by clientId
   * @param {string} clientId - Node clientId
   * @returns {Node|undefined} Node instance
   */
  getNode(clientId) {
    return this.graph.getNode(clientId)
  }
  
  /**
   * Get a connection by clientId
   * @param {string} clientId - Connection clientId
   * @returns {Connection|undefined} Connection instance
   */
  getConnection(clientId) {
    return this.graph.getConnection(clientId)
  }
  
  /**
   * Get all nodes
   * @returns {Node[]} Array of all nodes
   */
  getNodes() {
    return Array.from(this.graph.nodes.values())
  }
  
  /**
   * Get all connections
   * @returns {Connection[]} Array of all connections
   */
  getConnections() {
    return Array.from(this.graph.connections.values())
  }
  
  /**
   * Check if history can undo
   * @returns {boolean} True if can undo
   */
  // Note: This will be wired to History instance in Step 03
  canUndo() {
    return this.history?.canUndo() || false
  }
  
  /**
   * Check if history can redo
   * @returns {boolean} True if can redo
   */
  canRedo() {
    return this.history?.canRedo() || false
  }
  
  // ===== Subscriber Pattern =====
  
  /**
   * Subscribe to state changes
   * @param {Function} callback - Callback function(event, data)
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    this.subscribers.add(callback)
    return () => this.subscribers.delete(callback)
  }
  
  /**
   * Notify all subscribers of state change
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  notify(event, data) {
    this.subscribers.forEach(callback => {
      try {
        callback(event, data)
      } catch (error) {
        console.error('Store subscriber error:', error)
      }
    })
  }
  
  // ===== Serialization =====
  
  /**
   * Get state for history snapshot
   * @returns {Object} JSON-compatible snapshot
   */
  getSnapshot() {
    return this.graph.toJSON()
  }
  
  /**
   * Restore state from history snapshot
   * @param {Object} snapshot - JSON snapshot
   */
  restoreSnapshot(snapshot) {
    this.graph = Graph.fromJSON(snapshot)
    this.notify('graph:restore', { snapshot })
  }
}

export default Store
```

## Key Design Decisions

### Single Source of Truth

All state lives in the Store. No state scattered across multiple objects.

```javascript
// Good: All state in one place
const store = new Store()
store.addNode(node)
store.updateNode(clientId, { position: { x: 150, y: 200 } })

// Bad: State scattered
nodeEditor.nodes.set(clientId, node)  // In one object
connectionManager.connections.set(...) // In another object
document.querySelector(...).style.left = ... // In DOM
```

**Why:**
- Clear data flow: Action → Store → Subscribers
- Easy to debug (single source to inspect)
- Enables snapshot-based undo/redo
- Subscriber pattern enables reactive UI

### Immutable Updates Return New Graph

Each mutation creates a new Graph instance.

```javascript
addNode(node) {
  this.graph = this.graph.addNode(node)  // New Graph instance
  this.notify('node:add', { clientId: node.clientId, node })
}
```

**Why:**
- Store can hold reference to current graph
- History can store snapshots by reference
- No deep cloning needed
- Easy to track when graph changes

### View State Separation

`viewState` is separate from `graph` and not included in history.

```javascript
// Graph state changes trigger notify (undo/redo eligible)
updateNode(clientId, updates) {
  this.graph = this.graph.updateNode(clientId, updates)
  this.notify('node:update', { clientId, updates })
}

// View state changes do NOT trigger notify (not in history)
setZoom(zoom) {
  this.viewState = { ...this.viewState, zoom }
  // No notify call
}
```

**Why:**
- Zoom/pan/selection changes should NOT be undoable
- Reduces history size
- Aligns with user mental model
- Separate event handlers for view vs. graph changes

### Subscriber Pattern

Subscribers register callbacks for state changes.

```javascript
// Renderer subscribes to state changes
const unsubscribe = store.subscribe((event, data) => {
  switch (event) {
    case 'node:add':
      this.renderNode(data.node)
      break
    case 'node:update':
      this.updateNodeElement(data.clientId)
      break
    case 'node:remove':
      this.removeNodeElement(data.clientId)
      break
  }
})

// Later: cleanup
unsubscribe()
```

**Why:**
- Enables reactive UI updates
- Decoupled: Store doesn't know about renderers
- Multiple subscribers can react to same event
- Easy to debug with event logging

### Event Types

| Event | Description | Data |
|-------|-------------|------|
| `node:add` | Node created | `{ clientId, node }` |
| `node:update` | Node updated | `{ clientId, updates, node }` |
| `node:remove` | Node deleted | `{ clientId, node }` |
| `connection:add` | Connection created | `{ clientId, connection }` |
| `connection:remove` | Connection deleted | `{ clientId, connection }` |
| `graph:replace` | Entire graph replaced | `{ graph }` |
| `graph:restore` | Restored from snapshot | `{ snapshot }` |

## Integration with History

The Store will be wired to History in Step 03:

```javascript
// Step 03: History will call Store methods
class History {
  constructor(store, maxHistory = 50) {
    this.store = store
    // ...
  }
  
  push(description) {
    const snapshot = this.store.getSnapshot()
    // Push snapshot to stack
  }
  
  restore() {
    const { snapshot } = this.stack[this.currentIndex]
    this.store.restoreSnapshot(snapshot)
  }
}
```

## Testing

```javascript
// state/__tests__/Store.test.js
import Store from '../Store.js'
import Node from '../../models/Node.js'
import { generateUUID } from '../../utils/uuid.js'

describe('Store', () => {
  let store
  
  beforeEach(() => {
    store = new Store()
  })
  
  it('adds nodes', () => {
    const node = new Node({ clientId: generateUUID(), type: 'condition', position: { x: 100, y: 200 } })
    store.addNode(node)
    expect(store.getNode(node.clientId)).toBe(node)
  })
  
  it('notifies subscribers on add', () => {
    const callback = jest.fn()
    store.subscribe(callback)
    
    const node = new Node({ clientId: generateUUID(), type: 'condition', position: { x: 100, y: 200 } })
    store.addNode(node)
    
    expect(callback).toHaveBeenCalledWith('node:add', expect.objectContaining({ clientId: node.clientId }))
  })
  
  it('does not notify on view state changes', () => {
    const callback = jest.fn()
    store.subscribe(callback)
    
    store.setZoom(2)
    store.setPan(100, 200)
    
    expect(callback).not.toHaveBeenCalled()
  })
  
  it('returns immutable graph', () => {
    const node1 = new Node({ clientId: generateUUID(), type: 'condition', position: { x: 100, y: 200 } })
    store.addNode(node1)
    
    const nodes1 = store.getNodes()
    const node2 = new Node({ clientId: generateUUID(), type: 'action', position: { x: 200, y: 300 } })
    store.addNode(node2)
    
    const nodes2 = store.getNodes()
    
    expect(nodes1.length).toBe(1)
    expect(nodes2.length).toBe(2)
  })
})
```

## Completion Checklist

- [ ] `Store.js` created
- [ ] Graph mutations create new graph instances
- [ ] Subscriber pattern implemented
- [ ] View state separate from graph state
- [ ] View state changes don't trigger notify
- [ ] `getSnapshot()` and `restoreSnapshot()` implemented
- [ ] Unit tests pass