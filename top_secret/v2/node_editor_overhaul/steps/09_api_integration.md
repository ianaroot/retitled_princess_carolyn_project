# Step 09: API Integration

## Goal

Create API layer for HTTP communication with Rails backend, handling client/server ID translation and CSRF tokens.

## Files

- Create: `app/javascript/editorV2/api.js`
- No backend changes required

## Key Concept

The server uses database IDs, but the client uses stable client UUIDs. The API layer translates between them.

```
Client (clientIds) ←→ API Layer (translation) ←→ Server (database IDs)
```

## Implementation

### api.js (New File)

```javascript
// api.js

import Node from './models/Node.js'
import Connection from './models/Connection.js'
import Graph from './models/Graph.js'
import { generateUUID } from './utils/uuid.js'

/**
 * API wrapper for server communication
 * Handles client ID ↔ server ID translation
 * Validates CSRF tokens and server responses
 */
class API {
  constructor(botId) {
    this.botId = botId
    this.baseUrl = `/bots/${botId}`
    
    // CSRF token for Rails security - fail fast if missing
    const token = document.querySelector('meta[name="csrf-token"]')?.content
    if (!token) {
      console.error('CSRF token not found. Ensure <meta name="csrf-token"> exists in head.')
      throw new Error('CSRF token not found - cannot make authenticated requests')
    }
    this.csrfToken = token
    
    // Maps: clientId ↔ serverId
    this.clientToServer = new Map()  // clientId → serverId
    this.serverToClient = new Map()  // serverId → clientId
  }
  
  // ===== Node Operations =====
  
  /**
   * Create a new node on the server
   * @param {Object} params - { type, position, data }
   * @param {string} clientId - Pre-generated client ID
   * @returns {Promise<Object>} Server response
   */
  async createNode({ type, position, data }, clientId) {
    const response = await fetch(`${this.baseUrl}/nodes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': this.csrfToken
      },
      body: JSON.stringify({
        node_type: type,
        position_x: position.x,
        position_y: position.y,
        data: data || {}
      })
    })
    
    if (!response.ok) {
      throw new Error(`Failed to create node: ${response.status}`)
    }
    
    const json = await response.json()
    
    // Store mapping
    this.clientToServer.set(clientId, json.id)
    this.serverToClient.set(json.id, clientId)
    
    return json
  }
  
  /**
   * Update a node on the server
   * @param {string} clientId - Node client ID
   * @param {Object} updates - Updates to apply
   */
  async updateNode(clientId, updates) {
    const serverId = this.clientToServer.get(clientId)
    if (!serverId) {
      console.warn(`No server ID for client ID ${clientId}, skipping update`)
      return null
    }
    
    const body = {}
    if (updates.position) {
      body.position_x = updates.position.x
      body.position_y = updates.position.y
    }
    if (updates.data) {
      body.data = updates.data
    }
    if (updates.type) {
      body.node_type = updates.type
    }
    
    const response = await fetch(`${this.baseUrl}/nodes/${serverId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': this.csrfToken
      },
      body: JSON.stringify(body)
    })
    
    if (!response.ok) {
      throw new Error(`Failed to update node: ${response.status}`)
    }
    
    return response.json()
  }
  
  /**
   * Update node position
   * @param {string} clientId - Node client ID
   * @param {number} x - X position
   * @param {number} y - Y position
   */
  async updateNodePosition(clientId, x, y) {
    return this.updateNode(clientId, { position: { x, y } })
  }
  
  /**
   * Delete a node from the server
   * @param {string} clientId - Node client ID
   */
  async deleteNode(clientId) {
    const serverId = this.clientToServer.get(clientId)
    if (!serverId) {
      console.warn(`No server ID for client ID ${clientId}, skipping delete`)
      return null
    }
    
    const response = await fetch(`${this.baseUrl}/nodes/${serverId}`, {
      method: 'DELETE',
      headers: {
        'X-CSRF-Token': this.csrfToken
      }
    })
    
    // 404 is OK (already deleted)
    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to delete node: ${response.status}`)
    }
    
    // Clean up mapping
    const sid = this.clientToServer.get(clientId)
    this.clientToServer.delete(clientId)
    this.serverToClient.delete(sid)
    
    return null
  }
  
  // ===== Connection Operations =====
  
  /**
   * Create a connection on the server
   * @param {string} sourceClientId - Source node client ID
   * @param {string} targetClientId - Target node client ID
   * @param {string} clientConnectionId - Pre-generated connection client ID
   * @returns {Promise<Object>} Server response
   */
  async createConnection(sourceClientId, targetClientId, clientConnectionId) {
    const sourceServerId = this.clientToServer.get(sourceClientId)
    const targetServerId = this.clientToServer.get(targetClientId)
    
    if (!sourceServerId || !targetServerId) {
      throw new Error('Cannot create connection: missing server IDs')
    }
    
    const response = await fetch(`${this.baseUrl}/nodes/${sourceServerId}/connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': this.csrfToken
      },
      body: JSON.stringify({ target_id: targetServerId })
    })
    
    if (!response.ok) {
      throw new Error(`Failed to create connection: ${response.status}`)
    }
    
    const json = await response.json()
    
    // Store mapping
    this.clientToServer.set(clientConnectionId, json.id)
    this.serverToClient.set(json.id, clientConnectionId)
    
    return json
  }
  
  /**
   * Delete a connection from the server
   * @param {string} clientConnectionId - Connection client ID
   * @param {string} sourceClientId - Source node client ID (for API path)
   */
  async deleteConnection(clientConnectionId, sourceClientId) {
    const serverConnectionId = this.clientToServer.get(clientConnectionId)
    const sourceServerId = this.clientToServer.get(sourceClientId)
    
    if (!serverConnectionId || !sourceServerId) {
      console.warn(`No server ID for connection ${clientConnectionId}, skipping delete`)
      return null
    }
    
    const response = await fetch(
      `${this.baseUrl}/nodes/${sourceServerId}/connections/${serverConnectionId}`,
      {
        method: 'DELETE',
        headers: {
          'X-CSRF-Token': this.csrfToken
        }
      }
    )
    
    // 404 is OK (already deleted)
    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to delete connection: ${response.status}`)
    }
    
    // Clean up mapping
    const sid = this.clientToServer.get(clientConnectionId)
    this.clientToServer.delete(clientConnectionId)
    this.serverToClient.delete(sid)
    
    return null
  }
  
  // ===== Batch Operations =====
  
  /**
   * Update positions of multiple nodes
   * @param {Array<{clientId: string, x: number, y: number}>} positions
   */
  async batchUpdatePositions(positions) {
    const promises = positions.map(({ clientId, x, y }) => {
      return this.updateNodePosition(clientId, x, y)
    })
    
    return Promise.all(promises)
  }
  
  // ===== Loading Data =====
  
  /**
   * Load bot data from server and create graph
   * @returns {Promise<Graph>} Graph with nodes and connections
   */
  async loadBot() {
    const response = await fetch(`${this.baseUrl}/edit.json`)
    
    if (!response.ok) {
      throw new Error(`Failed to load bot: ${response.status}`)
    }
    
    const json = await response.json()
    
    // Assign client IDs to nodes
    const nodes = json.nodes.map(n => {
      const clientId = generateUUID()
      
      // Store mapping
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
      
      // Store mapping
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
  
  /**
   * Get node preview HTML from server
   * @param {string} clientId - Node client ID
   * @returns {Promise<string>} HTML string
   */
  async getNodePreviewHtml(clientId) {
    const serverId = this.clientToServer.get(clientId)
    if (!serverId) {
      return null
    }
    
    const response = await fetch(`/nodes/${serverId}/preview`)
    
    if (!response.ok) {
      throw new Error(`Failed to get preview: ${response.status}`)
    }
    
    return response.text()
  }
  
  // ===== Utility Methods =====
  
  /**
   * Get server ID for a client ID
   * @param {string} clientId - Client ID
   * @returns {number|null} Server ID or null
   */
  getServerId(clientId) {
    return this.clientToServer.get(clientId) || null
  }
  
  /**
   * Get client ID for a server ID
   * @param {number} serverId - Server ID
   * @returns {string|null} Client ID or null
   */
  getClientId(serverId) {
    return this.serverToClient.get(serverId) || null
  }
  
  /**
   * Clear all ID mappings (for testing)
   */
  clearMappings() {
    this.clientToServer.clear()
    this.serverToClient.clear()
  }
  
  // ===== Response Validation =====
  
  /**
   * Validate server response for node
   * @param {Object} json - Server response
   * @returns {Object} Validated response
   * @throws {Error} If response is invalid
   */
  validateNodeResponse(json) {
    if (!json || typeof json !== 'object') {
      throw new Error('Invalid node response: expected object')
    }
    if (typeof json.id !== 'number') {
      throw new Error('Invalid node response: missing or invalid id')
    }
    if (typeof json.node_type !== 'string') {
      throw new Error('Invalid node response: missing node_type')
    }
    return json
  }
  
  /**
   * Validate server response for connection
   * @param {Object} json - Server response
   * @returns {Object} Validated response
   * @throws {Error} If response is invalid
   */
  validateConnectionResponse(json) {
    if (!json || typeof json !== 'object') {
      throw new Error('Invalid connection response: expected object')
    }
    if (typeof json.id !== 'number') {
      throw new Error('Invalid connection response: missing or invalid id')
    }
    if (typeof json.source_node_id !== 'number') {
      throw new Error('Invalid connection response: missing source_node_id')
    }
    if (typeof json.target_node_id !== 'number') {
      throw new Error('Invalid connection response: missing target_node_id')
    }
    return json
  }
}

## Backend Compatibility

**No backend changes required.** The server continues to use database IDs for everything. All translation happens in the API layer.

### Existing Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/bots/:id/edit.json` | GET | Load bot with nodes and connections |
| `/bots/:id/nodes` | POST | Create node |
| `/bots/:id/nodes/:id` | PATCH | Update node |
| `/bots/:id/nodes/:id` | DELETE | Delete node |
| `/bots/:id/nodes/:id/connect` | POST | Create connection |
| `/bots/:id/nodes/:id/connections/:id` | DELETE | Delete connection |
| `/nodes/:id/preview` | GET | Get preview HTML |

### Expected Server Response Format

```javascript
// loadBot response
{
  nodes: [
    {
      id: 1,
      node_type: 'condition',
      position_x: 100,
      position_y: 200,
      data: { context: 'enemies', piece_type: 'knight' }
    }
  ],
  connections: [
    {
      id: 10,
      source_node_id: 1,
      target_node_id: 2
    }
  ]
}

// createNode response
{
  id: 123,
  node_type: 'condition',
  position_x: 100,
  position_y: 200,
  data: {}
}

// createConnection response
{
  id: 456,
  source_node_id: 1,
  target_node_id: 2
}
```

## Loading Existing Bots

When loading an existing bot, assign new client IDs and store the mappings:

```javascript
async loadBot() {
  const json = await fetch(`${this.baseUrl}/edit.json`).then(r => r.json())
  
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
      data: n.data
    })
  })
  
  // Assign client IDs to connections
  const connections = json.connections.map(c => {
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
```

## Integration with SyncManager

The SyncManager uses the API class for all server communication. The API class handles the client ID ↔ server ID translation.

```javascript
// In index.js, both are instantiated:
const api = new API(botId)
const syncManager = new SyncManager(store, history, api)

// SyncManager uses API methods:
class SyncManager {
  constructor(store, history, api) {
    this.store = store
    this.history = history
    this.api = api  // API instance handles all fetch calls
  }
  
  async createNode(type, position, data) {
    const clientId = generateUUID()
    
    // Optimistic update
    const node = new Node({ clientId, type, position, data })
    this.store.addNode(node)
    
    // API handles client ID ↔ server ID translation
    try {
      const response = await this.api.createNode({ type, position, data }, clientId)
      this.store.updateNode(clientId, { serverId: response.id })
      this.history.push('Create node')
    } catch (error) {
      this.store.removeNode(clientId)
      throw error
    }
  }
}
```

The SyncManager uses the API layer for all server communication:

```javascript
// sync/SyncManager.js
class SyncManager {
  constructor(store, history, api) {
    this.store = store
    this.history = history
    this.api = api  // API instance from above
  }
  
  async createNode(type, position, data) {
    const clientId = generateUUID()
    
    // Optimistic update
    const node = new Node({ clientId, type, position, data })
    this.store.addNode(node)
    
    try {
      const response = await this.api.createNode({ type, position, data }, clientId)
      this.store.updateNode(clientId, { serverId: response.id })
    } catch (error) {
      this.store.removeNode(clientId)
      throw error
    }
  }
  
  // ... other methods use this.api
}
```

## Testing

```javascript
// __tests__/api.test.js
import API from '../api.js'
import fetch from 'node-fetch'

global.fetch = fetch

describe('API', () => {
  let api
  
  beforeEach(() => {
    api = new API(1)  // bot ID 1
  })
  
  it('creates node and stores mapping', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 123, node_type: 'condition' })
    })
    
    const response = await api.createNode(
      { type: 'condition', position: { x: 100, y: 200 }, data: {} },
      'client-uuid-1'
    )
    
    expect(response.id).toBe(123)
    expect(api.clientToServer.get('client-uuid-1')).toBe(123)
    expect(api.serverToClient.get(123)).toBe('client-uuid-1')
  })
  
  it('updates node using client ID', async () => {
    // Setup mapping
    api.clientToServer.set('client-uuid-1', 123)
    api.serverToClient.set(123, 'client-uuid-1')
    
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 123 })
    })
    
    await api.updateNode('client-uuid-1', { position: { x: 150, y: 250 } })
    
    expect(global.fetch).toHaveBeenCalledWith(
      '/bots/1/nodes/123',
      expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('position_x')
      })
    )
  })
  
  it('loads bot and assigns client IDs', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        nodes: [
          { id: 1, node_type: 'root', position_x: 0, position_y: 0, data: {} }
        ],
        connections: []
      })
    })
    
    const graph = await api.loadBot()
    
    expect(graph.nodes.size).toBe(1)
    const node = graph.getNode(Array.from(graph.nodes.keys())[0])
    expect(node.serverId).toBe(1)
    expect(node.clientId).toBeDefined()
    expect(api.serverToClient.get(1)).toBe(node.clientId)
  })
})
```

## Completion Checklist

- [ ] `API.js` created or modified
- [ ] `createNode()` stores mapping
- [ ] `updateNode()` uses mapping
- [ ] `deleteNode()` clears mapping
- [ ] `createConnection()` stores mapping
- [ ] `deleteConnection()` clears mapping
- [ ] `loadBot()` assigns client IDs
- [ ] `getNodePreviewHtml()` uses mapping
- [ ] `getServerId()` and `getClientId()` helpers
- [ ] No backend changes required
- [ ] Unit tests pass