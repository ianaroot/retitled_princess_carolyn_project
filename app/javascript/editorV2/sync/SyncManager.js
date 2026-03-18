// sync/SyncManager.js
// Orchestrates server synchronization with optimistic updates and rollback

import generateUUID from '../utils/uuid.js'
import Node from '../models/Node.js'
import Connection from '../models/Connection.js'
import { showError } from '../utils/errors.js'
import { showErrorDialog } from '../utils/ErrorDialog.js'

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
    
    // Track pending undo/redo to prevent concurrent operations
    this.isUndoRedoPending = false
    
    // Track in-flight operations for potential cancellation
    this.pendingOperations = new Map()
  }
  
  /**
   * Set loading state for undo/redo
   * @param {boolean} isLoading
   */
  setLoading(isLoading) {
    this.isUndoRedoPending = isLoading
  }
  
  // ===== Undo/Redo Operations =====
  
  /**
   * Undo the last operation with server sync
   * @returns {Promise<Object>} Result object with success/reason
   */
  async undo() {
    // Prevent concurrent undo/redo
    if (this.isUndoRedoPending) {
      return { success: false, reason: 'pending' }
    }
    
    if (!this.history.canUndo()) {
      return { success: false, reason: 'cannot_undo' }
    }
    
    this.setLoading(true)
    
    const currentSnapshot = this.history.getCurrentSnapshot()
    const operation = currentSnapshot?.operation
    
    // If no operation metadata, just restore local state
    if (!operation) {
      this.history.undoLocal()
      this.setLoading(false)
      return { success: true }
    }
    
    // Store pre-undo state for potential rollback
    const preUndoState = this.store.getState()
    
    try {
      // Execute inverse operation on server
      await this.executeInverseOperation(operation)
      
      // Restore client state
      this.history.undoLocal()
      
      this.setLoading(false)
      return { success: true }
    } catch (error) {
      // Show error dialog with undo context
      const action = await showErrorDialog(`Undo: ${currentSnapshot.description}`, error)
      
      if (action === 'retry') {
        // Keep loading state - retry will manage it
        return this.undo()
      } else {
        // Cancel - restore pre-undo state
        this.store.restoreState(preUndoState)
        this.setLoading(false)
        return { success: false, cancelled: true }
      }
    }
  }
  
  /**
   * Redo a previously undone operation with server sync
   * @returns {Promise<Object>} Result object with success/reason
   */
  async redo() {
    // Prevent concurrent undo/redo
    if (this.isUndoRedoPending) {
      return { success: false, reason: 'pending' }
    }
    
    if (!this.history.canRedo()) {
      return { success: false, reason: 'cannot_redo' }
    }
    
    this.setLoading(true)
    
    const nextSnapshot = this.history.getNextSnapshot()
    const operation = nextSnapshot?.operation
    
    // If no operation metadata, just restore local state
    if (!operation) {
      this.history.redoLocal()
      this.setLoading(false)
      return { success: true }
    }
    
    // Store pre-redo state for potential rollback
    const preRedoState = this.store.getState()
    
    try {
      // Re-execute the original operation on server
      await this.executeOperation(operation)
      
      // Advance history
      this.history.redoLocal()
      
      this.setLoading(false)
      return { success: true }
    } catch (error) {
      // Show error dialog with redo context
      const action = await showErrorDialog(`Redo: ${nextSnapshot.description}`, error)
      
      if (action === 'retry') {
        // Keep loading state - retry will manage it
        return this.redo()
      } else {
        // Cancel - restore pre-redo state
        this.store.restoreState(preRedoState)
        this.setLoading(false)
        return { success: false, cancelled: true }
      }
    }
  }
  
  /**
   * Execute inverse operation for undo
   * @param {Object} operation - Operation metadata
   */
  async executeInverseOperation(operation) {
    switch (operation.type) {
      case 'createNode':
        // Undo: delete the created node
        await this.api.deleteNode(operation.clientId)
        break
        
      case 'deleteNode':
        // Undo: recreate the node
        await this.api.createNode({
          type: operation.entity.type,
          position: operation.entity.position,
          data: operation.entity.data
        }, operation.clientId)
        
        // Undo: recreate cascade-deleted connections
        // NOTE: If node recreation succeeds but some connections fail,
        // the server state will be partially inconsistent. User can retry
        // or refresh the page to see actual server state.
        for (const conn of operation.connections) {
          await this.api.createConnection(conn.sourceId, conn.targetId, conn.clientId)
        }
        break
        
      case 'updateNodePosition':
        // Undo: restore previous position
        await this.api.updateNodePosition(
          operation.clientId,
          operation.previousValue.x,
          operation.previousValue.y
        )
        break
        
      case 'updateNodePositions':
        // Undo: restore all previous positions
        await this.api.batchUpdatePositions(
          operation.positions.map(p => ({
            clientId: p.clientId,
            x: p.previousPosition.x,
            y: p.previousPosition.y
          }))
        )
        break
        
      case 'updateNodeData':
        // Undo: restore previous data
        await this.api.updateNode(operation.clientId, operation.previousValue)
        break
        
      case 'createConnection':
        // Undo: delete the created connection
        await this.api.deleteConnection(operation.clientId, operation.sourceId)
        break
        
      case 'deleteConnection':
        // Undo: recreate the deleted connection
        await this.api.createConnection(
          operation.sourceId,
          operation.targetId,
          operation.clientId
        )
        break
        
      default:
        throw new Error(`Unknown operation type: ${operation.type}`)
    }
  }
  
  /**
   * Execute operation for redo
   * @param {Object} operation - Operation metadata
   */
  async executeOperation(operation) {
    switch (operation.type) {
      case 'createNode':
        // Redo: recreate the node
        await this.api.createNode({
          type: operation.entity.type,
          position: operation.entity.position,
          data: operation.entity.data
        }, operation.clientId)
        break
        
      case 'deleteNode':
        // Redo: delete the node again (connections already cascade-deleted)
        await this.api.deleteNode(operation.clientId)
        break
        
      case 'updateNodePosition':
        // Redo: apply the new position
        await this.api.updateNodePosition(
          operation.clientId,
          operation.newValue.x,
          operation.newValue.y
        )
        break
        
      case 'updateNodePositions':
        // Redo: apply all new positions
        await this.api.batchUpdatePositions(
          operation.positions.map(p => ({
            clientId: p.clientId,
            x: p.newPosition.x,
            y: p.newPosition.y
          }))
        )
        break
        
      case 'updateNodeData':
        // Redo: apply the new data
        await this.api.updateNode(operation.clientId, operation.newValue)
        break
        
      case 'createConnection':
        // Redo: recreate the connection
        await this.api.createConnection(
          operation.sourceId,
          operation.targetId,
          operation.clientId
        )
        break
        
      case 'deleteConnection':
        // Redo: delete the connection again
        await this.api.deleteConnection(operation.clientId, operation.sourceId)
        break
        
      default:
        throw new Error(`Unknown operation type: ${operation.type}`)
    }
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
      this.history.push(`Create ${type} node`, {
        type: 'createNode',
        clientId,
        entity: {
          type,
          position,
          data
        }
      })
      
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
    
    // Store original position for rollback and history
    const previousPosition = { x: existingNode.position.x, y: existingNode.position.y }
    const newPosition = { x, y }
    
    // 1. Optimistic update
    this.store.updateNode(clientId, { position: newPosition })
    
    try {
      // 2. Sync with server
      await this.api.updateNodePosition(clientId, x, y)
      
      // 3. Push to history after success
      this.history.push('Move node', {
        type: 'updateNodePosition',
        clientId,
        previousValue: previousPosition,
        newValue: newPosition
      })
      
    } catch (error) {
      // 4. Rollback on failure
      this.store.updateNode(clientId, { position: previousPosition })
      
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
    
    // Store original data for rollback and history
    const previousData = { ...existingNode.data }
    const newData = { ...existingNode.data, ...data }
    
    // 1. Optimistic update
    this.store.updateNode(clientId, { data: newData })
    
    try {
      // 2. Sync with server
      await this.api.updateNode(clientId, { data: data })
      
      // 3. Push to history after success
      this.history.push('Update node', {
        type: 'updateNodeData',
        clientId,
        previousValue: previousData,
        newValue: data
      })
      
    } catch (error) {
      // 4. Rollback on failure
      this.store.updateNode(clientId, { data: previousData })
      
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
    
    // Store node data for rollback and history
    const deletedEntity = {
      type: existingNode.type,
      position: { ...existingNode.position },
      data: { ...existingNode.data }
    }
    const deletedServerId = existingNode.serverId
    
    // Get connections that will be deleted
    const { outgoing, incoming } = this.store.getNodeConnections(clientId)
    const deletedConnections = [...outgoing, ...incoming].map(conn => ({
      clientId: conn.clientId,
      serverId: conn.serverId,
      sourceId: conn.sourceId,
      targetId: conn.targetId
    }))
    
    // Store for rollback
    const nodeBackup = existingNode
    
    // 1. Optimistic update: Remove from store
    this.store.removeNode(clientId)
    
    try {
      // 2. Sync with server
      await this.api.deleteNode(clientId)
      
      // 3. Push to history after success
      this.history.push(`Delete ${nodeBackup.type} node`, {
        type: 'deleteNode',
        clientId,
        serverId: deletedServerId,
        entity: deletedEntity,
        connections: deletedConnections
      })
      
    } catch (error) {
      // 4. Rollback: Re-add the node AND connections
      this.store.addNode(nodeBackup)
      deletedConnections.forEach(connData => {
        const conn = new Connection(connData)
        this.store.addConnection(conn)
      })
      
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
      this.history.push('Create connection', {
        type: 'createConnection',
        clientId,
        sourceId: sourceClientId,
        targetId: targetClientId
      })
      
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
    
    // Store for rollback and history
    const sourceId = existingConn.sourceId
    const targetId = existingConn.targetId
    const connBackup = existingConn
    
    // 1. Optimistic update: Remove from store
    this.store.removeConnection(clientId)
    
    try {
      // 2. Sync with server
      await this.api.deleteConnection(clientId, sourceId)
      
      // 3. Push to history after success
      this.history.push('Delete connection', {
        type: 'deleteConnection',
        clientId,
        sourceId,
        targetId
      })
      
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
   * @param {string} [description='Move nodes'] - Description for history
   * @returns {Promise<void>}
   */
  async batchUpdatePositions(positions, description = 'Move nodes') {
    if (!positions || positions.length === 0) {
      return
    }
    
    // Store original positions for rollback and history
    const positionsWithPrevious = positions.map(({ clientId, x, y }) => {
      const node = this.store.getNode(clientId)
      return {
        clientId,
        previousPosition: node ? { x: node.position.x, y: node.position.y } : null,
        newPosition: { x, y }
      }
    }).filter(p => p.previousPosition !== null)
    
    // 1. Optimistic update: Update all positions
    positionsWithPrevious.forEach(({ clientId, newPosition }) => {
      this.store.updateNode(clientId, { position: newPosition })
    })
    
    try {
      // 2. Sync with server
      await this.api.batchUpdatePositions(positions)
      
      // 3. Push to history after success
      this.history.push(description, {
        type: 'updateNodePositions',
        positions: positionsWithPrevious
      })
      
    } catch (error) {
      // 4. Rollback: Restore original positions
      positionsWithPrevious.forEach(({ clientId, previousPosition }) => {
        if (previousPosition) {
          this.store.updateNode(clientId, { position: previousPosition })
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
      
      // Push initial state to history (no operation metadata - can't undo initial state)
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