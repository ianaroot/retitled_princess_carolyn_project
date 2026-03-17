// api.js
// HTTP client for server communication with client/server ID translation

import Node from './models/Node.js'
import Connection from './models/Connection.js'
import Graph from './models/Graph.js'
import generateUUID from './utils/uuid.js'

/**
 * API wrapper for server communication
 * Handles client ID ↔ server ID translation
 * Validates CSRF tokens and server responses
 */
class API {
  /**
   * Create API instance
   * @param {number} botId - Bot ID for API endpoints
   * @throws {Error} If CSRF token not found
   */
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
  
  // ===== Authentication =====
  
  /**
   * Get headers for API requests
   * @param {string} [accept='application/json'] - Accept header
   * @returns {Object} Headers object
   */
  getHeaders(accept = 'application/json') {
    return {
      'Content-Type': 'application/json',
      'Accept': accept,
      'X-CSRF-Token': this.csrfToken
    }
  }
  
  // ===== Node Operations =====
  
  /**
   * Create a new node on the server
   * @param {Object} params - { type, position, data }
   * @param {string} clientId - Pre-generated client ID
   * @returns {Promise<Object>} Server response
   */
  async createNode({ type, position, data = {} }, clientId) {
    const response = await fetch(`${this.baseUrl}/nodes`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        node: {
          node_type: type,
          position_x: position.x,
          position_y: position.y,
          data: data
        }
      })
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to create node: ${response.status} - ${errorText}`)
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
   * @returns {Promise<Object|null>} Server response or null if not mapped
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
    if (updates.data !== undefined) {
      body.data = updates.data
    }
    if (updates.type !== undefined) {
      body.node_type = updates.type
    }
    
    const response = await fetch(`${this.baseUrl}/nodes/${serverId}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify({ node: body })
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to update node: ${response.status} - ${errorText}`)
    }
    
    return response.json()
  }
  
  /**
   * Update node position only
   * @param {string} clientId - Node client ID
   * @param {number} x - X position
   * @param {number} y - Y position
   * @returns {Promise<Object|null>}
   */
  async updateNodePosition(clientId, x, y) {
    return this.updateNode(clientId, { position: { x, y } })
  }
  
  /**
   * Delete a node from the server
   * @param {string} clientId - Node client ID
   * @returns {Promise<null>}
   */
  async deleteNode(clientId) {
    const serverId = this.clientToServer.get(clientId)
    if (!serverId) {
      console.warn(`No server ID for client ID ${clientId}, skipping delete`)
      return null
    }
    
    const response = await fetch(`${this.baseUrl}/nodes/${serverId}`, {
      method: 'DELETE',
      headers: this.getHeaders()
    })
    
    // 404 is OK (already deleted)
    if (!response.ok && response.status !== 404) {
      const errorText = await response.text()
      throw new Error(`Failed to delete node: ${response.status} - ${errorText}`)
    }
    
    // Clean up mapping
    this.clientToServer.delete(clientId)
    this.serverToClient.delete(serverId)
    
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
      headers: this.getHeaders(),
      body: JSON.stringify({ target_id: targetServerId })
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to create connection: ${response.status} - ${errorText}`)
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
   * @returns {Promise<null>}
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
        headers: this.getHeaders()
      }
    )
    
    // 404 is OK (already deleted)
    if (!response.ok && response.status !== 404) {
      const errorText = await response.text()
      throw new Error(`Failed to delete connection: ${response.status} - ${errorText}`)
    }
    
    // Clean up mapping
    this.clientToServer.delete(clientConnectionId)
    this.serverToClient.delete(serverConnectionId)
    
    return null
  }
  
  // ===== Batch Operations =====
  
  /**
   * Update positions of multiple nodes
   * @param {Array<{clientId: string, x: number, y: number}>} positions
   * @returns {Promise<void>}
   */
  async batchUpdatePositions(positions) {
    const updates = positions.map(({ clientId, x, y }) => {
      const serverId = this.clientToServer.get(clientId)
      if (!serverId) {
        console.warn(`No server ID for client ID ${clientId}, skipping position update`)
        return null
      }
      return { id: serverId, x, y }
    }).filter(Boolean)
    
    if (updates.length === 0) {
      return
    }
    
    const response = await fetch(`${this.baseUrl}/nodes/batch_update_positions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ nodes: updates })
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to batch update positions: ${response.status} - ${errorText}`)
    }
  }
  
  // ===== Loading Data =====
  
  /**
   * Load bot data from server and create Graph
   * @returns {Promise<Graph>} Graph with nodes and connections
   */
  async loadBot() {
    const response = await fetch(`${this.baseUrl}/edit.json`, {
      headers: this.getHeaders()
    })
    
    if (!response.ok) {
      throw new Error(`Failed to load bot: ${response.status}`)
    }
    
    const json = await response.json()
    
    // Assign client IDs to nodes and store mappings
    const nodes = (json.nodes || []).map(n => {
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
    
    // Assign client IDs to connections and store mappings
    const connections = (json.connections || []).map(c => {
      const clientId = generateUUID()
      
      // Store mapping
      this.clientToServer.set(clientId, c.id)
      this.serverToClient.set(c.id, clientId)
      
      const sourceClientId = this.serverToClient.get(c.source_node_id)
      const targetClientId = this.serverToClient.get(c.target_node_id)
      
      if (!sourceClientId || !targetClientId) {
        console.warn(`Connection ${c.id} references missing node, skipping`)
        return null
      }
      
      return new Connection({
        clientId,
        serverId: c.id,
        sourceId: sourceClientId,
        targetId: targetClientId
      })
    }).filter(Boolean)
    
    return new Graph(nodes, connections)
  }
  
  /**
   * Get node preview HTML from server
   * @param {string} clientId - Node client ID
   * @returns {Promise<string|null>} HTML string or null if not mapped
   */
  async getNodePreviewHtml(clientId) {
    const serverId = this.clientToServer.get(clientId)
    if (!serverId) {
      return null
    }
    
    const response = await fetch(`${this.baseUrl}/nodes/${serverId}`, {
      headers: this.getHeaders('text/html')
    })
    
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
  
  /**
   * Check if a client ID has been synced to server
   * @param {string} clientId - Client ID
   * @returns {boolean}
   */
  isSynced(clientId) {
    return this.clientToServer.has(clientId)
  }
}

export default API