# Step 04: Sync Layer

## Goal

Handle server synchronization with optimistic updates and rollback.

## Files to Create

```
app/javascript/editorV2/
└── sync/
    └── SyncManager.js
```

**IMPORTANT:** SyncManager uses the API class from `api.js` for all HTTP requests. The API class handles CSRF tokens and client/server ID translation. SyncManager orchestrates state changes and history pushes.

## Architecture

```
SyncManager (orchestrates state + history)
    ↓
API (handles HTTP + ID translation)
    ↓
Rails Backend
```

## Dependencies

- Step 02: State Manager (Store)
- Step 03: History (for history.push after successful sync)
- api.js: HTTP client with ID mapping (imported separately)

## Implementation

### SyncManager.js

Manages all server communication with optimistic updates.

**IMPORTANT: SyncManager owns ALL history.push() calls. Handlers never push directly.**

```javascript
// sync/SyncManager.js

import Node from '../models/Node.js'
import Connection from '../models/Connection.js'
import { generateUUID } from '../utils/uuid.js'
import { validateNode, validateConnection } from '../utils/validators.js'
import { showError } from '../utils/errors.js'

/**
 * Handles server synchronization with optimistic updates
 * - Updates UI immediately (optimistic)
 * - Syncs with server in background
 * - Rolls back on failure
 * - Pushes to history AFTER successful sync
 * 
 * CRITICAL: SyncManager owns ALL history.push() calls.
 * Handlers (DragHandler, ConnectionHandler, etc.) should NEVER
 * call history.push() directly. This ensures history only contains
 * successfully synced operations.
 */
class SyncManager {
  constructor(store, history, api) {
    this.store = store
    this.history = history
    this.api = api  // API class handles HTTP + ID mapping
  }
  
  // ===== Node Operations =====
  
  /**
   * Create a new node (optimistic)
   * @param {string} type - Node type: 'root', 'condition', 'action'
   * @param {Object} position - { x, y } position
   * @param {Object} data - Node-specific data
   * @returns {Promise<string>} Client ID of created node
   */
  async createNode(type, position, data = {}) {
    const validation = validateNode({ type, position, data })
    if (!validation.valid) {
      showError(validation.errors.join(', '))
      return null
    }
    
    const clientId = generateUUID()
    
    // 1. Optimistic: Add to store immediately
    const node = new Node({ clientId, type, position, data })
    this.store.addNode(node)
    
    try {
      // 2. Sync with server
      const response = await this.api.createNode({ type, position, data }, clientId)
      
      // 3. Update server ID (API handles mapping internally)
      this.store.updateNode(clientId, { serverId: response.id })
      
      // 4. Push to history ONLY after success
      this.history.push(`Create ${type} node`)
      
      return clientId
      
    } catch (error) {
      // 5. Rollback on failure (no history entry created)
      this.store.removeNode(clientId)
      showError(error.message)
      throw error
    }
  }
  
  /**
   * Update a node (optimistic)
   * Used for position changes, data updates, etc.
   * @param {string} clientId - Node client ID
   * @param {Object} updates - Properties to update
   */
  async updateNode(clientId, updates) {
    const node = this.store.getNode(clientId)
    if (!node) return
    
    // Save previous state for rollback
    const previousState = {
      position: { ...node.position },
      data: { ...node.data }
    }
    
    // 1. Optimistic: Update immediately
    this.store.updateNode(clientId, updates)
    
    try {
      // 2. Sync with server
      await this.api.updateNode(clientId, updates)
      
      // 3. Push to history ONLY after success
      this.history.push('Update node')
      
    } catch (error) {
      // 4. Rollback on failure
      this.store.updateNode(clientId, previousState)
      showError(error.message)
      throw error
    }
  }
  
  /**
   * Update node position (convenience method)
   * Called by DragHandler after drag ends
   * @param {string} clientId - Node client ID
   * @param {number} x - New X position
   * @param {number} y - New Y position
   */
  async updateNodePosition(clientId, x, y) {
    return this.updateNode(clientId, { position: { x, y } })
  }
  
  /**
   * Delete a node (optimistic)
   * @param {string} clientId - Node client ID
   */
  async deleteNode(clientId) {
    const node = this.store.getNode(clientId)
    if (!node) return
    
    // Store connections that will be cascade-deleted
    const connections = this.store.graph.getConnectionsForNode(clientId)
    
    // 1. Optimistic: Remove from store (cascade removes connections)
    this.store.removeNode(clientId)
    
    try {
      // 2. Sync with server (API handles ID mapping)
      await this.api.deleteNode(clientId)
      
      // 3. Push to history ONLY after success
      this.history.push('Delete node')
      
    } catch (error) {
      // 4. Rollback on failure
      this.store.addNode(node)
      connections.forEach(conn => this.store.addConnection(conn))
      showError(error.message)
      throw error
    }
  }
  
  // ===== Connection Operations =====
  
  /**
   * Create a connection (optimistic)
   * @param {string} sourceClientId - Source node client ID
   * @param {string} targetClientId - Target node client ID
   * @returns {Promise<string>} Client ID of created connection
   */
  async createConnection(sourceClientId, targetClientId) {
    const validation = validateConnection({ sourceId: sourceClientId, targetId: targetClientId })
    if (!validation.valid) {
      showError(validation.errors.join(', '))
      return null
    }
    
    const clientId = generateUUID()
    
    // 1. Optimistic: Add to store immediately
    const connection = new Connection({
      clientId,
      sourceId: sourceClientId,
      targetId: targetClientId
    })
    this.store.addConnection(connection)
    
    try {
      // 2. Sync with server (API handles ID mapping)
      const response = await this.api.createConnection(sourceClientId, targetClientId, clientId)
      
      // 3. Update server ID
      this.store.updateConnection(clientId, { serverId: response.id })
      
      // 4. Push to history ONLY after success
      this.history.push('Create connection')
      
      return clientId
      
    } catch (error) {
      // 5. Rollback on failure
      this.store.removeConnection(clientId)
      showError(error.message)
      throw error
    }
  }
  
  /**
   * Delete a connection (optimistic)
   * @param {string} clientId - Connection client ID
   */
  async deleteConnection(clientId) {
    const connection = this.store.getConnection(clientId)
    if (!connection) return
    
    // 1. Optimistic: Remove from store
    this.store.removeConnection(clientId)
    
    try {
      // 2. Sync with server (API handles ID mapping)
      await this.api.deleteConnection(clientId, connection.sourceId)
      
      // 3. Push to history ONLY after success
      this.history.push('Delete connection')
      
    } catch (error) {
      // 4. Rollback on failure
      this.store.addConnection(connection)
      showError(error.message)
      throw error
    }
  }
}

export default SyncManager
```

## Key Design Decisions

### SyncManager Owns All History Pushes

**CRITICAL:** Only SyncManager calls `history.push()`. Handlers never do.

```javascript
// CORRECT: SyncManager pushes after successful sync
class SyncManager {
  async createNode(...) {
    this.store.addNode(node)
    
    try {
      await this.api.createNode(...)
      this.history.push('Create node')  // ← SyncManager pushes
    } catch (error) {
      this.store.removeNode(clientId)  // Rollback, no history entry
    }
  }
}

// WRONG: Handler pushes before sync
class DragHandler {
  handleMouseUp() {
    this.history.push('Drag node')  // ← DON'T DO THIS
    this.syncManager.updateNodePosition(...)
  }
}
```

**Why:**
- History only contains successfully synced operations
- Failed server calls don't leave orphaned history entries
- Rollback is clean: just restore store, no history manipulation needed
- Single source of truth for when history is updated

### Optimistic Updates with Rollback

UI updates immediately, server syncs in background, rollback on failure.

```javascript
async createNode(type, position, data) {
  // 1. Optimistic: Update UI immediately
  this.store.addNode(node)
  
  try {
    // 2. Sync with server (API handles HTTP and ID mapping)
    const response = await this.api.createNode(...)
    
    // 3. Update server ID
    this.store.updateNode(clientId, { serverId: response.id })
    
    // 4. Push to history ONLY after success
    this.history.push('Create node')
    
  } catch (error) {
    // 5. Rollback on failure
    this.store.removeNode(clientId)
    showError(error.message)
    throw error
  }
}
```

**Why:**
- Responsive UX (no waiting for server)
- Most operations succeed
- Rollback provides safety net
- Error banners inform user
- History stays clean (no failed operations)

### API Class Handles ID Mapping

SyncManager delegates HTTP and ID translation to the API class.

```javascript
// SyncManager doesn't know about server IDs
async updateNode(clientId, updates) {
  this.store.updateNode(clientId, updates)
  
  // API translates clientId to serverId internally
  await this.api.updateNode(clientId, updates)
}

// API class handles translation
class API {
  async updateNode(clientId, updates) {
    const serverId = this.clientToServer.get(clientId)  // API owns mapping
    await fetch(`/nodes/${serverId}`, { method: 'PATCH', body: ... })
  }
}
```

**Why:**
- SyncManager is simpler (no ID mapping logic)
- API class is reusable for other components
- Clear separation of concerns
- Easier to test

### Batch Position Updates

Drag operations can move multiple nodes at once (cascade drag).

```javascript
// In SyncManager:
async batchUpdatePositions(positions) {
  // 1. Optimistic: Update all positions
  positions.forEach(({ clientId, x, y }) => {
    this.store.updateNode(clientId, { position: { x, y } })
  })
  
  // 2. Sync all positions in parallel
  await Promise.all(
    positions.map(({ clientId, x, y }) => 
      this.api.updateNodePosition(clientId, x, y)
    )
  )
  
  // 3. Push single history entry for entire batch
  this.history.push('Move nodes')
}
```

**Why:**
- Single history entry for entire drag operation
- Parallel network requests for efficiency
- Atomic rollback (restore all positions)

## Integration with API Class

SyncManager uses the API class for all HTTP operations:

```javascript
// index.js
import API from './api.js'
import SyncManager from './sync/SyncManager.js'

const api = new API(botId)
const syncManager = new SyncManager(store, history, api)

// SyncManager delegates to API
await syncManager.createNode(...)  // → api.createNode(...)
await syncManager.updateNode(...)   // → api.updateNode(...)
```

See Step 09 for API class implementation details.
```

**Why:**
- Drag operations involve multiple nodes
- One undo should revert entire drag
- Parallel sync for performance

### Rollback Strategy

Different rollback strategies for different operations.

**Create Node:**
```javascript
try {
  this.store.addNode(node)
  await fetch(...)
} catch (error) {
  this.store.removeNode(clientId)  // Simple rollback
}
```

**Delete Node:**
```javascript
try {
  const node = this.store.getNode(clientId)
  const connections = this.store.graph.getConnectionsForNode(clientId)
  
  this.store.removeNode(clientId)  // Cascade removes connections
  
  await fetch(...)
} catch (error) {
  this.store.addNode(node)
  connections.forEach(conn => this.store.addConnection(conn))  // Restore cascade
}
```

**Why:**
- Delete has cascade effects (connections removed)
- Must restore all affected entities
- Create is simpler (just remove what was added)

### Error Handling

User-friendly error banners with auto-dismiss.

**Why:**
- Users need to know about sync failures
- Errors should be dismissible
- Auto-dismiss prevents banner buildup
- Allows user to take screenshot

## Testing

```javascript
// sync/__tests__/SyncManager.test.js
import Store from '../../state/Store.js'
import History from '../../state/History.js'
import SyncManager from '../SyncManager.js'

describe('SyncManager', () => {
  let store, history, syncManager
  
  beforeEach(() => {
    store = new Store()
    history = new History(store)
    syncManager = new SyncManager(store, history, '/bots/1')
    global.fetch = jest.fn()
  })
  
  it('creates node optimistically', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 123 })
    })
    
    const clientId = await syncManager.createNode('condition', { x: 100, y: 200 })
    
    // Node added immediately
    expect(store.getNode(clientId)).toBeDefined()
    
    // Server ID mapped
    expect(syncManager.clientToServer.get(clientId)).toBe(123)
  })
  
  it('rolls back on create failure', async () => {
    fetch.mockResolvedValue({ ok: false, status: 500 })
    
    await expect(
      syncManager.createNode('condition', { x: 100, y: 200 })
    ).rejects.toThrow()
    
    // Node removed after failure
    expect(store.getNodes().length).toBe(0)
  })
  
  it('loads bot and assigns client IDs', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        nodes: [
          { id: 10, node_type: 'condition', position_x: 100, position_y: 200, data: {} }
        ],
        connections: [
          { id: 20, source_node_id: 10, target_node_id: 11 }
        ]
      })
    })
    
    const graph = await syncManager.loadBot(1)
    
    // Client IDs assigned
    expect(graph.nodes.size).toBe(1)
    const node = graph.getNode(Array.from(graph.nodes.keys())[0])
    expect(node.serverId).toBe(10)
    
    // Mapping created
    expect(syncManager.serverToClient.get(10)).toBe(node.clientId)
  })
})
```

## Completion Checklist

- [ ] `SyncManager.js` created
- [ ] `createNode()` with optimistic update and rollback
- [ ] `updateNode()` with optimistic update and rollback
- [ ] `deleteNode()` with cascade rollback
- [ ] `createConnection()` with optimistic update
- [ ] `deleteConnection()` with rollback
- [ ] `batchUpdatePositions()` for drag operations
- [ ] `loadBot()` with client ID assignment
- [ ] Client ID mapping maintained
- [ ] Error handling with user notifications
- [ ] Unit tests pass