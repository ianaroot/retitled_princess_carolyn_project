// sync/SyncManager.js
// Orchestrates server synchronization with optimistic updates and rollback

import generateUUID from '../utils/uuid.js'
import Node from '../models/Node.js'
import Connection from '../models/Connection.js'
import { showError } from '../utils/errors.js'

/**
 * SyncManager
 * 
 * Handles all server communication with optimistic updates:
 * 1. Update Store immediately (optimistic)
 * 2. Sync with server in background
 * 3. On success: Push to history, update serverId if needed
 * 4. On failure: Rollback store, show error, do NOT push to history
 * 
 * CRITICAL: Only SyncManager calls history.push(). Handlers never push directly.
 */
class SyncManager {
  /**
   * Create SyncManager
   * @param {Store} store - Store instance
   * @param {History} history - History instance
   * @param {API} api - API instance
   */
  constructor(store, history, api) {
    this.store = store
    this.history = history
    this.api = api
    
    // Track in-flight operations for potential cancellation
    this.pendingOperations = new Map()
  }
  
  // ===== Node Operations =====
  
  /**
   * Create a new node
   * @param {string} type - Node type (root, condition, action, connector)
   * @param {Object} position - Position { x, y }
   * @param {Object} [data={}] - Node data
   * @returns {Promise<string>} Client ID of created node
   */
  async createNode(type, position, data = {}) {
    // Generate client ID
    const clientId = generateUUID()
    
    // Create node instance
    const node = new Node({ clientId, type, position, data })
    
    // 1. Optimistic update: Add to store immediately
    this.store.addNode(node)
    
    try {
      // 2. Sync with server
      const response = await this.api.createNode({ type, position, data }, clientId)
      
      // 3. Update with server ID
      this.store.updateNode(clientId, { serverId: response.id })
      
      // 4. Push to history ONLY after success
      this.history.push(`Create ${type} node`)
      
      return clientId
      
    } catch (error) {
      // 5. Rollback on failure (no history entry)
      this.store.removeNode(clientId)
      
      showError(`Failed to create node: ${error.message}`)
      console.error('Failed to create node:', error)
      
      throw error
    }
  }
  
  /**
   * Update node position
   * @param {string} clientId - Node client ID
   * @param {number} x - X position
   * @param {number} y - Y position
   * @returns {Promise<void>}
   */
  async updateNodePosition(clientId, x, y) {
    const existingNode = this.store.getNode(clientId)
    if (!existingNode) {
      console.warn(`Node ${clientId} not found, cannot update position`)
      return
    }
    
    // Store original position for rollback
    const originalPosition = { ...existingNode.position }
    
    // 1. Optimistic update
    this.store.updateNode(clientId, { position: { x, y } })
    
    try {
      // 2. Sync with server
      await this.api.updateNodePosition(clientId, x, y)
      
      // 3. Push to history after success
      this.history.push('Move node')
      
    } catch (error) {
      // 4. Rollback on failure
      this.store.updateNode(clientId, { position: originalPosition })
      
      showError(`Failed to save position: ${error.message}`)
      console.error('Failed to update position:', error)
      
      throw error
    }
  }
  
  /**
   * Update node data
   * @param {string} clientId - Node client ID
   * @param {Object} data - New data (merged with existing)
   * @returns {Promise<void>}
   */
  async updateNodeData(clientId, data) {
    const existingNode = this.store.getNode(clientId)
    if (!existingNode) {
      console.warn(`Node ${clientId} not found, cannot update data`)
      return
    }
    
    // Store original data for rollback
    const originalData = { ...existingNode.data }
    
    // 1. Optimistic update
    this.store.updateNode(clientId, { data: { ...existingNode.data, ...data } })
    
    try {
      // 2. Sync with server
      await this.api.updateNode(clientId, { data: data })
      
      // 3. Push to history after success
      this.history.push('Update node')
      
    } catch (error) {
      // 4. Rollback on failure
      this.store.updateNode(clientId, { data: originalData })
      
      showError(`Failed to save node: ${error.message}`)
      console.error('Failed to update node data:', error)
      
      throw error
    }
  }
  
  /**
   * Delete a node
   * @param {string} clientId - Node client ID
   * @returns {Promise<void>}
   */
  async deleteNode(clientId) {
    const existingNode = this.store.getNode(clientId)
    if (!existingNode) {
      console.warn(`Node ${clientId} not found, cannot delete`)
      return
    }
    
    // Store node for rollback
    const nodeBackup = existingNode
    
    // Get connections that will be deleted
    const { outgoing, incoming } = this.store.getNodeConnections(clientId)
    
    // 1. Optimistic update: Remove from store
    this.store.removeNode(clientId)
    
    try {
      // 2. Sync with server
      await this.api.deleteNode(clientId)
      
      // 3. Push to history after success
      this.history.push(`Delete ${nodeBackup.type} node`)
      
    } catch (error) {
      // 4. Rollback: Re-add the node
      this.store.addNode(nodeBackup)
      
      // Re-add connections (they were cascade-deleted by store.removeNode)
      // Note: This is simplified - in real rollback we'd need to restore connections too
      // For now, we show error and user can refresh
      
      showError(`Failed to delete node: ${error.message}`)
      console.error('Failed to delete node:', error)
      
      throw error
    }
  }
  
  // ===== Connection Operations =====
  
  /**
   * Create a connection between two nodes
   * @param {string} sourceClientId - Source node client ID
   * @param {string} targetClientId - Target node client ID
   * @returns {Promise<string>} Client ID of created connection
   */
  async createConnection(sourceClientId, targetClientId) {
    // Validate nodes exist
    const sourceNode = this.store.getNode(sourceClientId)
    const targetNode = this.store.getNode(targetClientId)
    
    if (!sourceNode) {
      throw new Error(`Source node ${sourceClientId} not found`)
    }
    if (!targetNode) {
      throw new Error(`Target node ${targetClientId} not found`)
    }
    
    // Check for existing connection
    const existing = this.store.findConnection(sourceClientId, targetClientId)
    if (existing) {
      console.warn('Connection already exists')
      return existing.clientId
    }
    
    // Generate client ID
    const clientId = generateUUID()
    
    // Create connection instance
    const connection = new Connection({
      clientId,
      sourceId: sourceClientId,
      targetId: targetClientId
    })
    
    // 1. Optimistic update: Add to store
    this.store.addConnection(connection)
    
    try {
      // 2. Sync with server
      const response = await this.api.createConnection(sourceClientId, targetClientId, clientId)
      
      // 3. Update with server ID
      this.store.updateConnection(clientId, { serverId: response.id })
      
      // 4. Push to history after success
      this.history.push('Create connection')
      
      return clientId
      
    } catch (error) {
      // 5. Rollback on failure
      this.store.removeConnection(clientId)
      
      showError(`Failed to create connection: ${error.message}`)
      console.error('Failed to create connection:', error)
      
      throw error
    }
  }
  
  /**
   * Delete a connection
   * @param {string} clientId - Connection client ID
   * @returns {Promise<void>}
   */
  async deleteConnection(clientId) {
    const existingConn = this.store.getConnection(clientId)
    if (!existingConn) {
      console.warn(`Connection ${clientId} not found, cannot delete`)
      return
    }
    
    // Store for rollback
    const connBackup = existingConn
    
    // 1. Optimistic update: Remove from store
    this.store.removeConnection(clientId)
    
    try {
      // 2. Sync with server
      await this.api.deleteConnection(clientId, connBackup.sourceId)
      
      // 3. Push to history after success
      this.history.push('Delete connection')
      
    } catch (error) {
      // 4. Rollback: Re-add connection
      this.store.addConnection(connBackup)
      
      showError(`Failed to delete connection: ${error.message}`)
      console.error('Failed to delete connection:', error)
      
      throw error
    }
  }
  
  // ===== Batch Operations =====
  
  /**
   * Update positions of multiple nodes (for drag operations with children)
   * @param {Array<{clientId: string, x: number, y: number}>} positions
   * @param {string} description - Description for history
   * @returns {Promise<void>}
   */
  async batchUpdatePositions(positions, description = 'Move nodes') {
    if (!positions || positions.length === 0) {
      return
    }
    
    // Store original positions for rollback
    const originalPositions = positions.map(({ clientId }) => {
      const node = this.store.getNode(clientId)
      return {
        clientId,
        x: node?.position.x,
        y: node?.position.y
      }
    })
    
    // 1. Optimistic update: Update all positions
    positions.forEach(({ clientId, x, y }) => {
      this.store.updateNode(clientId, { position: { x, y } })
    })
    
    try {
      // 2. Sync with server
      await this.api.batchUpdatePositions(positions)
      
      // 3. Push to history after success
      this.history.push(description)
      
    } catch (error) {
      // 4. Rollback: Restore original positions
      originalPositions.forEach(({ clientId, x, y }) => {
        if (x !== undefined && y !== undefined) {
          this.store.updateNode(clientId, { position: { x, y } })
        }
      })
      
      showError(`Failed to save positions: ${error.message}`)
      console.error('Failed to batch update positions:', error)
      
      throw error
    }
  }
  
  // ===== Initialization =====
  
  /**
   * Load existing bot data from server
   * @returns {Promise<void>}
   */
  async loadBot() {
    try {
      const graph = await this.api.loadBot()
      
      // Replace store's graph with loaded graph
      this.store.replaceGraph(graph)
      
      // Push initial state to history
      this.history.push('Initial state')
      
      return graph
      
    } catch (error) {
      showError(`Failed to load bot: ${error.message}`)
      console.error('Failed to load bot:', error)
      
      throw error
    }
  }
  
  // ===== Utility =====
  
  /**
   * Get server ID for a client ID
   * @param {string} clientId - Client ID
   * @returns {number|null}
   */
  getServerId(clientId) {
    return this.api.getServerId(clientId)
  }
  
  /**
   * Get client ID for a server ID
   * @param {number} serverId - Server ID
   * @returns {string|null}
   */
  getClientId(serverId) {
    return this.api.getClientId(serverId)
  }
  
  /**
   * Check if a node is synced to server
   * @param {string} clientId - Client ID
   * @returns {boolean}
   */
  isSynced(clientId) {
    return this.api.isSynced(clientId)
  }
}

export default SyncManager