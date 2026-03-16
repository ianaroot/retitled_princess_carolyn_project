# Step 04: Sync Layer

## Goal

Handle server synchronization with optimistic updates and rollback.

## Files to Create

```
app/javascript/editorV2/
└── sync/
    └── SyncManager.js
```

**IMPORTANT:** This file shows embedded fetch calls for clarity, but in production SyncManager should use the API class from Step 09. See "Implementation" section below for the recommended architecture:

```javascript
// Recommended architecture (using API class from Step 09):
import { showError } from '../utils/errors.js'
import { validateNode, validateConnection } from '../utils/validators.js'

class SyncManager {
  constructor(store, history, api) {
    this.store = store
    this.history = history
    this.api = api  // API class handles all fetch calls AND CSRF tokens
    // ...
  }
  
  async createNode(type, position, data) {
    const validation = validateNode({ type, position, data })
    if (!validation.valid) {
      showError(validation.errors.join(', '))
      return null
    }
    
    const response = await this.api.createNode({ type, position, data }, clientId)
    // ...
  }
}
```

This approach:
- Centralizes all API calls in one place (api.js)
- Ensures CSRF tokens are consistently included
- Separates concerns: API handles fetch, SyncManager handles state

## Dependencies

- Step 02: State Manager (Store)
- Step 03: History (for history.push after operations)

## Implementation

### SyncManager.js

Manages all server communication with optimistic updates.

```javascript
// sync/SyncManager.js

import Node from '../models/Node.js'
import Connection from '../models/Connection.js'
import Graph from '../models/Graph.js'
import { generateUUID } from '../utils/uuid.js'
import { validateNode, validateConnection } from '../utils/validators.js'
import { showError } from '../utils/errors.js'

/**
 * Handles server synchronization with optimistic updates
 * - Updates UI immediately (optimistic)
 * - Syncs with server in background
 * - Rolls back on failure
 * - Maps client IDs to server IDs
 */
class SyncManager {
  constructor(store, history, apiBaseUrl) {
    this.store = store
    this.history = history
    this.apiBaseUrl = apiBaseUrl
    
    // Maps: clientId ↔ serverId
    this.clientToServer = new Map()  // clientId → serverId
    this.serverToClient = new Map()  // serverId → clientId
    
    // Offline queue for operations pending sync
    this.offlineQueue = []
    this.isOnline = navigator.onLine
    
    // Listen for online/offline events
    window.addEventListener('online', () => this.processQueue())
    window.addEventListener('offline', () => { this.isOnline = false })
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
    // Validate input before creating
    const validation = validateNode({ type, position, data })
    if (!validation.valid) {
      showError(validation.errors.join(', '))
      return null
    }
    
    const clientId = generateUUID()
    
    // 1. Optimistic: Add to store immediately
    const node = new Node({ clientId, type, position, data })
    this.store.addNode(node)
    
    // If offline, queue for later
    if (!navigator.onLine) {
      this.offlineQueue.push({
        type: 'createNode',
        clientId,
        params: { type, position, data }
      })
      this.history.push(`Create ${type} node (pending sync)`)
      return clientId
    }
    
    try {
      // 2. Sync with server
      const response = await fetch(`${this.apiBaseUrl}/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          node_type: type,
          position_x: position.x,
          position_y: position.y,
          data
        })
      })
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`)
      }
      
      const json = await response.json()
      
      // 3. Update server ID mapping
      this.clientToServer.set(clientId, json.id)
      this.serverToClient.set(json.id, clientId)
      
      // 4. Update node with server ID
      this.store.updateNode(clientId, { serverId: json.id })
      
      // 5. Push to history
      this.history.push(`Create ${type} node`)
      
      return clientId
      
    } catch (error) {
      // Rollback on failure
      this.store.removeNode(clientId)
      showError(error.message)
      throw error
    }
  }
  
  /**
   * Update a node (optimistic)
   * @param {string} clientId - Node client ID
   * @param {Object} updates - Properties to update
   */
  async updateNode(clientId, updates) {
    // Save previous state for rollback
    const node = this.store.getNode(clientId)
    if (!node) return
    
    const previousState = {
      position: { ...node.position },
      data: { ...node.data }
    }
    
    // 1. Optimistic: Update immediately
    this.store.updateNode(clientId, updates)
    
    try {
      const serverId = this.clientToServer.get(clientId)
      if (!serverId) {
        // Node not yet synced, skip server update
        return
      }
      
      // 2. Sync with server
      const serverUpdates = this.transformToServerFormat(updates)
      const response = await fetch(`${this.apiBaseUrl}/nodes/${serverId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serverUpdates)
      })
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`)
      }
      
      // 3. Push to history (for position/data changes)
      if (updates.position || updates.data) {
        this.history.push(`Update node`)
      }
      
    } catch (error) {
      // Rollback on failure
      this.store.updateNode(clientId, previousState)
      this.showError(error)
      throw error
    }
  }
  
  /**
   * Update node position (optimistic)
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
    // Store for potential rollback
    const node = this.store.getNode(clientId)
    if (!node) return
    
    // Store connections that will be cascade-deleted
    const connections = this.store.graph.getConnectionsForNode(clientId)
    
    // 1. Optimistic: Remove from store (cascade removes connections)
    this.store.removeNode(clientId)
    
    try {
      const serverId = this.clientToServer.get(clientId)
      if (!serverId) {
        // Node not yet synced, nothing to delete on server
        this.history.push('Delete node')
        return
      }
      
      // 2. Sync with server (cascade deletes connections)
      const response = await fetch(`${this.apiBaseUrl}/nodes/${serverId}`, {
        method: 'DELETE'
      })
      
      if (!response.ok && response.status !== 404) {
        throw new Error(`Server error: ${response.status}`)
      }
      
      // 3. Clean up ID mappings
      this.clientToServer.delete(clientId)
      this.serverToClient.delete(serverId)
      
      // 4. Push to history
      this.history.push('Delete node')
      
    } catch (error) {
      // Rollback on failure
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
    // Validate input
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
      const sourceServerId = this.clientToServer.get(sourceClientId)
      const targetServerId = this.clientToServer.get(targetClientId)
      
      if (!sourceServerId || !targetServerId) {
        throw new Error('Cannot connect unsynchronized nodes')
      }
      
      // 2. Sync with server
      const response = await fetch(`${this.apiBaseUrl}/nodes/${sourceServerId}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_id: targetServerId })
      })
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`)
      }
      
      const json = await response.json()
      
      // 3. Update server ID mapping
      this.clientToServer.set(clientId, json.id)
      this.serverToClient.set(json.id, clientId)
      
      this.store.updateConnection(clientId, { serverId: json.id })
      
      // 4. Push to history
      this.history.push('Create connection')
      
      return clientId
      
    } catch (error) {
      // Rollback on failure
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
    // Store for potential rollback
    const connection = this.store.getConnection(clientId)
    if (!connection) return
    
    // 1. Optimistic: Remove from store
    this.store.removeConnection(clientId)
    
    try {
      const serverId = this.clientToServer.get(clientId)
      const sourceServerId = this.clientToServer.get(connection.sourceId)
      
      if (!serverId || !sourceServerId) {
        // Not yet synced, nothing to delete on server
        this.history.push('Delete connection')
        return
      }
      
      // 2. Sync with server
      const response = await fetch(
        `${this.apiBaseUrl}/nodes/${sourceServerId}/connections/${serverId}`,
        { method: 'DELETE' }
      )
      
      if (!response.ok && response.status !== 404) {
        throw new Error(`Server error: ${response.status}`)
      }
      
      // 3. Clean up ID mapping
      this.clientToServer.delete(clientId)
      this.serverToClient.delete(serverId)
      
      // 4. Push to history
      this.history.push('Delete connection')
      
    } catch (error) {
      // Rollback on failure
      this.store.addConnection(connection)
      this.showError(error)
      throw error
    }
  }
  
  // ===== Batch Position Updates =====
  
  /**
   * Update positions for multiple nodes (for drag operations)
   * @param {Array<{clientId: string, x: number, y: number}>} positions
   */
  async batchUpdatePositions(positions) {
    // 1. Optimistic: Update all positions
    positions.forEach(({ clientId, x, y }) => {
      this.store.updateNode(clientId, { position: { x, y } })
    })
    
    // 2. Push single history entry for batch
    this.history.push('Move nodes')
    
    try {
      // 3. Sync all positions with server
      const promises = positions.map(({ clientId, x, y }) => {
        const serverId = this.clientToServer.get(clientId)
        if (!serverId) return Promise.resolve()
        
        return fetch(`${this.apiBaseUrl}/nodes/${serverId}/position`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ position_x: x, position_y: y })
        })
      })
      
      await Promise.all(promises)
      
    } catch (error) {
      // Note: Rollback is complex for batch, show error instead
      showError(error.message)
      throw error
    }
  }
  
  // ===== Loading Existing Bot =====
  
  /**
   * Load existing bot from server and assign client IDs
   * @param {number} botId - Bot ID to load
   * @returns {Promise<Graph>} Graph with nodes and connections
   */
  async loadBot(botId) {
    const response = await fetch(`${this.apiBaseUrl.replace('/bots', '/bots/' + botId + '/edit.json')}`)
    
    if (!response.ok) {
      throw new Error(`Failed to load bot: ${response.status}`)
    }
    
    const json = await response.json()
    
    // Assign client IDs to nodes
    const nodes = json.nodes.map(n => {
      const clientId = generateUUID()
      this.clientToServer.set(clientId, n.id)
      this.serverToClient.set(n.id, clientId)
      
      return new Node({
        clientId,
        serverId: n.id,
        type: n.node_type,
        position: { x: n.position_x, y: n.position_y },
        data: n.data || {}
      })
    })
    
    // Assign client IDs to connections
    const connections = (json.connections || []).map(c => {
      const clientId = generateUUID()
      this.clientToServer.set(clientId, c.id)
      this.serverToClient.set(c.id, clientId)
      
      return new Connection({
        clientId,
        serverId: c.id,
        sourceId: this.serverToClient.get(c.source_node_id),
        targetId: this.serverToClient.get(c.target_node_id)
      })
    })
    
    return new Graph(nodes, connections)
  }
  
  // ===== Offline Queue =====
  
  /**
   * Process queued operations when back online
   */
  async processQueue() {
    this.isOnline = true
    
    if (this.offlineQueue.length === 0) return
    
    console.log(`Processing ${this.offlineQueue.length} queued operations`)
    
    while (this.offlineQueue.length > 0) {
      const operation = this.offlineQueue.shift()
      
      try {
        switch (operation.type) {
          case 'createNode':
            await this.processQueuedCreateNode(operation)
            break
          case 'updateNode':
            await this.processQueuedUpdateNode(operation)
            break
          case 'deleteNode':
            await this.processQueuedDeleteNode(operation)
            break
          case 'createConnection':
            await this.processQueuedCreateConnection(operation)
            break
          case 'deleteConnection':
            await this.processQueuedDeleteConnection(operation)
            break
        }
      } catch (error) {
        console.error('Failed to sync queued operation:', operation, error)
        // Continue processing other operations
      }
    }
  }
  
  async processQueuedCreateNode(operation) {
    const response = await fetch(`${this.apiBaseUrl}/nodes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content || ''
      },
      body: JSON.stringify({
        node_type: operation.params.type,
        position_x: operation.params.position.x,
        position_y: operation.params.position.y,
        data: operation.params.data
      })
    })
    
    if (!response.ok) throw new Error(`Server error: ${response.status}`)
    
    const json = await response.json()
    this.clientToServer.set(operation.clientId, json.id)
    this.serverToClient.set(json.id, operation.clientId)
    this.store.updateNode(operation.clientId, { serverId: json.id })
  }
  
  // Similar methods for updateNode, deleteNode, createConnection, deleteConnection
  
  // ===== Utility Methods =====
  
  /**
   * Transform updates to server format
   * @param {Object} updates - Client-side updates
   * @returns {Object} Server-formatted updates
   */
  transformToServerFormat(updates) {
    const serverUpdates = {}
    
    if (updates.position) {
      serverUpdates.position_x = updates.position.x
      serverUpdates.position_y = updates.position.y
    }
    
    if (updates.data) {
      serverUpdates.data = updates.data
    }
    
    if (updates.type) {
      serverUpdates.node_type = updates.type
    }
    
    return serverUpdates
  }
}

// Note: showError is imported from utils/errors.js

export default SyncManager
```

## Key Design Decisions

### Optimistic Updates

UI updates immediately, server syncs in background.

```javascript
// 1. Update UI optimistically
this.store.addNode(node)

// 2. Sync with server
try {
  await fetch(...)
  // 3. Update server ID mapping
  this.clientToServer.set(clientId, json.id)
} catch (error) {
  // 4. Rollback on failure
  this.store.removeNode(clientId)
  this.showError(error)
}
```

**Why:**
- Responsive UX (no waiting for server)
- Most operations succeed
- Rollback provides safety net
- Error banners inform user

### Client ID Mapping

Maintains bidirectional Map between client IDs and server IDs.

```javascript
// On create
this.clientToServer.set(clientId, json.id)
this.serverToClient.set(json.id, clientId)

// On load
const clientId = generateUUID()
this.clientToServer.set(clientId, n.id)
this.serverToClient.set(n.id, clientId)

// On server API call
const serverId = this.clientToServer.get(clientId)
await fetch(`/nodes/${serverId}`)
```

**Why:**
- Client uses clientIds throughout
- Server expects/returns serverIds
- Translation layer isolates concerns
- No backend changes needed

### Batch Position Updates

Drag operations can move multiple nodes at once.

```javascript
// Single history entry for entire drag
async batchUpdatePositions(positions) {
  // Update all positions optimistically
  positions.forEach(({ clientId, x, y }) => {
    this.store.updateNode(clientId, { position: { x, y } })
  })
  
  // Single history entry
  this.history.push('Move nodes')
  
  // Sync all in parallel
  await Promise.all(promises)
}
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