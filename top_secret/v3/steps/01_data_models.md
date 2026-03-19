# Step 01: Data Models

## Goal

Define immutable data models for Graph, Node, and Connection with client-side UUIDs. Also create utilities and constants.

## Files to Create

```
app/javascript/editorV2/
├── constants.js              # Shared constants (events, dimensions, colors)
├── utils/
│   ├── uuid.js               # UUID generation
│   ├── validators.js         # Input validation
│   └── errors.js             # Error display utilities
└── models/
    ├── Graph.js              # Graph container
    ├── Node.js               # Node model
    └── Connection.js         # Connection model
```

## Implementation

### uuid.js

Utility for generating RFC 4122 compliant UUIDs.

```javascript
// utils/uuid.js

/**
 * Generate a UUID v4
 * Uses crypto.randomUUID if available, falls back to Math.random
 * @returns {string} UUID string
 */
export function generateUUID() {
  // Modern browsers support crypto.randomUUID
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

export default generateUUID
```

### validators.js

Input validation for models. Used before creating/updating nodes and connections.

```javascript
// utils/validators.js

/**
 * Validate node data
 * @param {Object} params - { type, position, data }
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateNode({ type, position, data }) {
  const errors = []
  
  if (!['root', 'condition', 'action'].includes(type)) {
    errors.push(`Invalid node type: ${type}. Must be 'root', 'condition', or 'action'`)
  }
  
  if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
    errors.push('Position must have numeric x and y properties')
  }
  
  if (position && (isNaN(position.x) || isNaN(position.y))) {
    errors.push('Position x and y must be valid numbers')
  }
  
  return { valid: errors.length === 0, errors }
}

/**
 * Validate connection data
 * @param {Object} params - { sourceId, targetId }
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateConnection({ sourceId, targetId }) {
  const errors = []
  
  if (!sourceId || typeof sourceId !== 'string') {
    errors.push('sourceId must be a non-empty string')
  }
  
  if (!targetId || typeof targetId !== 'string') {
    errors.push('targetId must be a non-empty string')
  }
  
  if (sourceId === targetId) {
    errors.push('Cannot connect node to itself')
  }
  
  return { valid: errors.length === 0, errors }
}

export default { validateNode, validateConnection }
```

### errors.js

Shared error handling utility for consistent error display across modules.

```javascript
// utils/errors.js

/**
 * Display an error banner to the user
 * @param {string} message - Error message to display
 * @param {number} [duration=5000] - Duration in milliseconds before auto-dismiss
 */
export function showError(message, duration = 5000) {
  const banner = document.createElement('div')
  banner.className = 'editor-error-banner'
  banner.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #fee;
    border: 2px solid #c00;
    color: #c00;
    padding: 15px;
    border-radius: 5px;
    z-index: 10000;
    max-width: 400px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
  `
  
  // Use textContent for security (prevents XSS)
  banner.textContent = message
  
  document.body.appendChild(banner)
  
  // Auto-dismiss after duration
  setTimeout(() => {
    banner.remove()
  }, duration)
}

/**
 * Display an info banner to the user
 * @param {string} message - Info message to display
 * @param {number} [duration=3000] - Duration in milliseconds before auto-dismiss
 */
export function showInfo(message, duration = 3000) {
  const banner = document.createElement('div')
  banner.className = 'editor-info-banner'
  banner.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #e8f5e9;
    border: 2px solid #4CAF50;
    color: #2e7d32;
    padding: 15px;
    border-radius: 5px;
    z-index: 10000;
    max-width: 400px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
  `
  
  banner.textContent = message
  
  document.body.appendChild(banner)
  
  setTimeout(() => {
    banner.remove()
  }, duration)
}

export default { showError, showInfo }
```

## Usage

```javascript
// In any module
import { showError } from '../utils/errors.js'

// Display error to user
showError('Failed to create node: Invalid type')

// Display info to user
showInfo('Bot saved successfully')
```

### Node.js

Pure data model for nodes. Immutable - create new instances for updates.

```javascript
// models/Node.js

/**
 * Node model - pure data, no side effects
 * @property {string} clientId - UUID, stable identifier (never changes)
 * @property {number|null} serverId - Database ID (null for new nodes until synced)
 * @property {string} type - Node type: 'root', 'condition', 'action'
 * @property {Object} position - { x: number, y: number } in pixels
 * @property {Object} data - Node-specific data (direction, distance, context, etc.)
 */
class Node {
  constructor({ clientId, type, position, data = {}, serverId = null }) {
    this.clientId = clientId
    this.serverId = serverId
    this.type = type
    this.position = { ...position }
    this.data = { ...data }
    Object.freeze(this)
    Object.freeze(this.position)
    Object.freeze(this.data)
  }
  
  /**
   * Create a copy with updated properties
   * @param {Object} updates - Properties to update
   * @returns {Node} New Node instance
   */
  update(updates) {
    return new Node({
      clientId: this.clientId,
      serverId: updates.serverId !== undefined ? updates.serverId : this.serverId,
      type: updates.type !== undefined ? updates.type : this.type,
      position: updates.position !== undefined ? { ...updates.position } : { ...this.position },
      data: updates.data !== undefined ? { ...updates.data } : { ...this.data }
    })
  }
  
  /**
   * Serialize to JSON-compatible object
   * @returns {Object} JSON-compatible object
   */
  toJSON() {
    return {
      clientId: this.clientId,
      serverId: this.serverId,
      type: this.type,
      position: { ...this.position },
      data: { ...this.data }
    }
  }
  
  /**
   * Deserialize from JSON
   * @param {Object} json - JSON object
   * @returns {Node} New Node instance
   */
  static fromJSON(json) {
    return new Node({
      clientId: json.clientId,
      serverId: json.serverId,
      type: json.type,
      position: json.position,
      data: json.data
    })
  }
}

export default Node
```

### Connection.js

Pure data model for connections. Immutable - create new instances for updates.

```javascript
// models/Connection.js

/**
 * Connection model - pure data, no side effects
 * @property {string} clientId - UUID, stable identifier (never changes)
 * @property {number|null} serverId - Database ID (null for new connections until synced)
 * @property {string} sourceId - Source node clientId
 * @property {string} targetId - Target node clientId
 */
class Connection {
  constructor({ clientId, sourceId, targetId, serverId = null }) {
    this.clientId = clientId
    this.serverId = serverId
    this.sourceId = sourceId
    this.targetId = targetId
    Object.freeze(this)
  }
  
  /**
   * Create a copy with updated properties
   * @param {Object} updates - Properties to update
   * @returns {Connection} New Connection instance
   */
  update(updates) {
    return new Connection({
      clientId: this.clientId,
      serverId: updates.serverId !== undefined ? updates.serverId : this.serverId,
      sourceId: updates.sourceId !== undefined ? updates.sourceId : this.sourceId,
      targetId: updates.targetId !== undefined ? updates.targetId : this.targetId
    })
  }
  
  /**
   * Serialize to JSON-compatible object
   * @returns {Object} JSON-compatible object
   */
  toJSON() {
    return {
      clientId: this.clientId,
      serverId: this.serverId,
      sourceId: this.sourceId,
      targetId: this.targetId
    }
  }
  
  /**
   * Deserialize from JSON
   * @param {Object} json - JSON object
   * @returns {Connection} New Connection instance
   */
  static fromJSON(json) {
    return new Connection({
      clientId: json.clientId,
      serverId: json.serverId,
      sourceId: json.sourceId,
      targetId: json.targetId
    })
  }
}

export default Connection
```

### Graph.js

Container for nodes and connections. Provides methods for manipulation and queries.

```javascript
// models/Graph.js

import Node from './Node.js'
import Connection from './Connection.js'

/**
 * Graph model - container for nodes and connections
 * Pure data, no DOM or API dependencies
 */
class Graph {
  constructor(nodes = [], connections = []) {
    this.nodes = new Map()      // clientId → Node
    this.connections = new Map() // clientId → Connection
    
    nodes.forEach(node => {
      this.nodes.set(node.clientId, node)
    })
    
    connections.forEach(conn => {
      this.connections.set(conn.clientId, conn)
    })
  }
  
  // ===== Node Operations =====
  
  /**
   * Add a node to the graph
   * @param {Node} node - Node instance
   * @returns {Graph} New Graph with node added
   */
  addNode(node) {
    const newGraph = this.clone()
    newGraph.nodes.set(node.clientId, node)
    return newGraph
  }
  
  /**
   * Remove a node from the graph
   * @param {string} clientId - Node clientId
   * @returns {Graph} New Graph with node removed
   */
  removeNode(clientId) {
    const newGraph = this.clone()
    newGraph.nodes.delete(clientId)
    // Cascade: remove connections involving this node
    newGraph.connections.forEach((conn, connClientId) => {
      if (conn.sourceId === clientId || conn.targetId === clientId) {
        newGraph.connections.delete(connClientId)
      }
    })
    return newGraph
  }
  
  /**
   * Update a node
   * @param {string} clientId - Node clientId
   * @param {Object} updates - Properties to update
   * @returns {Graph} New Graph with updated node
   */
  updateNode(clientId, updates) {
    const node = this.nodes.get(clientId)
    if (!node) return this
    
    const newGraph = this.clone()
    const newNode = node.update(updates)
    newGraph.nodes.set(clientId, newNode)
    return newGraph
  }
  
  /**
   * Get a node by clientId
   * @param {string} clientId - Node clientId
   * @returns {Node|undefined} Node instance or undefined
   */
  getNode(clientId) {
    return this.nodes.get(clientId)
  }
  
  /**
   * Get all nodes of a specific type
   * @param {string} type - Node type
   * @returns {Node[]} Array of nodes
   */
  getNodesByType(type) {
    const result = []
    this.nodes.forEach(node => {
      if (node.type === type) {
        result.push(node)
      }
    })
    return result
  }
  
  // ===== Connection Operations =====
  
  /**
   * Add a connection to the graph
   * @param {Connection} connection - Connection instance
   * @returns {Graph} New Graph with connection added
   */
  addConnection(connection) {
    const newGraph = this.clone()
    newGraph.connections.set(connection.clientId, connection)
    return newGraph
  }
  
  /**
   * Remove a connection from the graph
   * @param {string} clientId - Connection clientId
   * @returns {Graph} New Graph with connection removed
   */
  removeConnection(clientId) {
    const newGraph = this.clone()
    newGraph.connections.delete(clientId)
    return newGraph
  }
  
  /**
   * Update a connection
   * @param {string} clientId - Connection clientId
   * @param {Object} updates - Properties to update
   * @returns {Graph} New Graph with updated connection
   */
  updateConnection(clientId, updates) {
    const connection = this.connections.get(clientId)
    if (!connection) return this
    
    const newGraph = this.clone()
    const newConnection = connection.update(updates)
    newGraph.connections.set(clientId, newConnection)
    return newGraph
  }
  
  /**
   * Get a connection by clientId
   * @param {string} clientId - Connection clientId
   * @returns {Connection|undefined} Connection instance or undefined
   */
  getConnection(clientId) {
    return this.connections.get(clientId)
  }
  
  /**
   * Get all connections for a node (incoming and outgoing)
   * @param {string} nodeId - Node clientId
   * @returns {Connection[]} Array of connections
   */
  getConnectionsForNode(nodeId) {
    const result = []
    this.connections.forEach(conn => {
      if (conn.sourceId === nodeId || conn.targetId === nodeId) {
        result.push(conn)
      }
    })
    return result
  }
  
  /**
   * Get outgoing connections from a node
   * @param {string} nodeId - Node clientId
   * @returns {Connection[]} Array of outgoing connections
   */
  getOutgoingConnections(nodeId) {
    const result = []
    this.connections.forEach(conn => {
      if (conn.sourceId === nodeId) {
        result.push(conn)
      }
    })
    return result
  }
  
  /**
   * Get incoming connections to a node
   * @param {string} nodeId - Node clientId
   * @returns {Connection[]} Array of incoming connections
   */
  getIncomingConnections(nodeId) {
    const result = []
    this.connections.forEach(conn => {
      if (conn.targetId === nodeId) {
        result.push(conn)
      }
    })
    return result
  }
  
  // ===== Serialization =====
  
  /**
   * Clone the graph (creates new Map references)
   * @returns {Graph} New Graph instance with same data
   */
  clone() {
    const nodes = Array.from(this.nodes.values())
    const connections = Array.from(this.connections.values())
    return new Graph(nodes, connections)
  }
  
  /**
   * Serialize to JSON-compatible object
   * @returns {Object} JSON-compatible object
   */
  toJSON() {
    return {
      nodes: Array.from(this.nodes.values()).map(n => n.toJSON()),
      connections: Array.from(this.connections.values()).map(c => c.toJSON())
    }
  }
  
  /**
   * Deserialize from JSON
   * @param {Object} json - JSON object
   * @returns {Graph} New Graph instance
   */
  static fromJSON(json) {
    const nodes = (json.nodes || []).map(n => Node.fromJSON(n))
    const connections = (json.connections || []).map(c => Connection.fromJSON(c))
    return new Graph(nodes, connections)
  }
}

export default Graph
```

## Key Design Decisions

### Immutable Models

All models use `Object.freeze()` and return new instances on update.

```javascript
const node = new Node({ clientId: 'uuid', type: 'condition', position: { x: 100, y: 200 } })
const updatedNode = node.update({ position: { x: 150, y: 200 } })

// node.position.x still 100
// updatedNode.position.x is 150
```

**Why:**
- Enables snapshot-based undo/redo
- Prevents accidental mutations
- Clear data flow
- Easy to track changes

### Dual IDs

Each entity has `clientId` (UUID) and `serverId` (database ID).

```javascript
// New node (not yet synced)
const newNode = new Node({ clientId: generateUUID(), type: 'condition', position: { x: 100, y: 200 } })
// serverId is null

// After sync
const syncedNode = newNode.update({ serverId: 123 })
// serverId is 123
```

**Why:**
- `clientId` never changes - stable for undo/redo
- `serverId` maps to database - secondary identifier
- No backend changes needed

### Graph Methods Return New Instances

All mutation methods return new Graph instances.

```javascript
const graph = new Graph([node1, node2], [conn1])
const newGraph = graph.addNode(node3)

// graph still has 2 nodes
// newGraph has 3 nodes
```

**Why:**
- Enables snapshot history
- Store can replace graph reference
- Clear when state changes

## Testing

Each model should have unit tests:

```javascript
// models/__tests__/Node.test.js
import Node from '../Node.js'

describe('Node', () => {
  it('creates immutable node', () => {
    const node = new Node({ clientId: 'abc', type: 'condition', position: { x: 100, y: 200 } })
    expect(node.clientId).toBe('abc')
    expect(() => node.type = 'action').toThrow()
  })
  
  it('updates return new instance', () => {
    const node = new Node({ clientId: 'abc', type: 'condition', position: { x: 100, y: 200 } })
    const updated = node.update({ position: { x: 150, y: 200 } })
    expect(updated.position.x).toBe(150)
    expect(node.position.x).toBe(100)
    expect(updated).not.toBe(node)
  })
  
  it('serializes to JSON', () => {
    const node = new Node({ clientId: 'abc', serverId: 123, type: 'condition', position: { x: 100, y: 200 }, data: { foo: 'bar' } })
    const json = node.toJSON()
    expect(json.clientId).toBe('abc')
    expect(json.serverId).toBe(123)
    
    const restored = Node.fromJSON(json)
    expect(restored.clientId).toBe('abc')
    expect(restored.serverId).toBe(123)
  })
})
```

### constants.js

Shared constants used across all modules. This file should be created in Step 01.

```javascript
// constants.js

// Node dimensions
export const NODE_WIDTH = 100
export const NODE_HEIGHT = 60
export const CONNECTOR_SIZE = 14

// Connection styling
export const CONNECTION_COLOR = '#4CAF50'
export const CONNECTION_STROKE_WIDTH = 2
export const CONNECTION_HITAREA_WIDTH = 20

// History
export const MAX_HISTORY = 50

// Node type colors (for reference)
export const NODE_COLORS = {
  root: '#FFD700',
  condition: '#e94560',
  action: '#4CAF50',
  connector: '#9C27B0'
}

// Event names for Store subscriber pattern
// Use these constants to prevent typos and enable IDE autocomplete
export const EVENTS = {
  NODE_ADD: 'node:add',
  NODE_UPDATE: 'node:update',
  NODE_REMOVE: 'node:remove',
  CONNECTION_ADD: 'connection:add',
  CONNECTION_UPDATE: 'connection:update',
  CONNECTION_REMOVE: 'connection:remove',
  GRAPH_REPLACE: 'graph:replace',
  GRAPH_RESTORE: 'graph:restore'
}
```

**Why use constants:**
- Prevents typos (`EVENTS.NODE_ADD` vs `'node:add'`)
- IDE autocompletion
- Single source of truth for configuration
- Easy to change values in one place

## Completion Checklist

- [ ] `uuid.js` created with fallback
- [ ] `validators.js` created with validation functions
- [ ] `errors.js` created with showError/showInfo
- [ ] `constants.js` created with EVENTS and config values
- [ ] `Node.js` created with immutable pattern
- [ ] `Connection.js` created with immutable pattern
- [ ] `Graph.js` created with all operations
- [ ] Unit tests pass for all models
- [ ] JSON serialization/deserialization works
- [ ] All models frozen (immutable)