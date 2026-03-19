// state/Store.js
// Central state container with subscriber pattern

import { EVENTS } from '../constants.js'
import Graph from '../models/Graph.js'
import Node from '../models/Node.js'
import Connection from '../models/Connection.js'

/**
 * Store - Single source of truth for application state
 * 
 * Contains:
 * - graph: Graph instance (nodes and connections)
 * - viewState: UI-only state (zoom, pan, selection - NOT in history)
 * 
 * NOT contained:
 * - history: Passed explicitly to components that need it (avoids circular dependency)
 */
class Store {
  constructor() {
    // Graph state (undoable)
    this.graph = new Graph()
    
    // View state (not undoable)
    this.viewState = {
      zoom: 1,
      panX: 0,
      panY: 0,
      selectedNodeId: null,
      editingNodeId: null
    }
    
    // Subscribers: Array of { event, callback }
    this.subscribers = []
    
    // Flag to prevent recursive updates
    this.isUpdating = false
    
    // Flag to prevent updates after destruction
    this.destroyed = false
  }
  
  // ===== Subscriber Pattern =====
  
  /**
   * Subscribe to store events
   * @param {Function} callback - Called with (event, data)
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    this.subscribers.push(callback)
    
    // Return unsubscribe function
    return () => {
      const index = this.subscribers.indexOf(callback)
      if (index > -1) {
        this.subscribers.splice(index, 1)
      }
    }
  }
  
/**
    * Emit an event to all subscribers
    * @param {string} event - Event name (use EVENTS constant)
    * @param {Object} data - Event data
    */
  emit(event, data) {
    // Don't emit if store is destroyed
    if (this.destroyed) {
      return
    }
    
    // Prevent recursive updates
    if (this.isUpdating) {
      console.warn(`Recursive emit prevented: ${event}`)
      return
    }
    
    this.isUpdating = true
    try {
      this.subscribers.forEach(callback => {
        try {
          callback(event, data)
        } catch (error) {
          console.error(`Error in subscriber for ${event}:`, error)
        }
      })
    } finally {
      this.isUpdating = false
    }
  }
  
  // ===== Graph State Operations =====
  
  /**
   * Replace the entire graph (used by History for undo/redo)
   * @param {Graph} newGraph - New Graph instance
   */
  replaceGraph(newGraph) {
    this.graph = newGraph
    this.emit(EVENTS.GRAPH_REPLACE, { graph: newGraph })
  }
  
  // --- Node Operations ---
  
  /**
   * Add a node
   * @param {Node} node - Node instance to add
   */
  addNode(node) {
    if (!(node instanceof Node)) {
      throw new Error('addNode requires a Node instance')
    }
    
    this.graph = this.graph.addNode(node)
    this.emit(EVENTS.NODE_ADD, { node, clientId: node.clientId })
  }
  
  /**
   * Update a node
   * @param {string} clientId - Node clientId
   * @param {Object} updates - Properties to update
   */
  updateNode(clientId, updates) {
    const existingNode = this.graph.getNode(clientId)
    if (!existingNode) {
      console.warn(`Node ${clientId} not found, cannot update`)
      return
    }
    
    this.graph = this.graph.updateNode(clientId, updates)
    const updatedNode = this.graph.getNode(clientId)
    this.emit(EVENTS.NODE_UPDATE, { node: updatedNode, clientId, updates })
  }
  
  /**
   * Remove a node and all its connections
   * @param {string} clientId - Node clientId
   */
  removeNode(clientId) {
    if (!this.graph.hasNode(clientId)) {
      console.warn(`Node ${clientId} not found, cannot remove`)
      return
    }
    
    // Get connections before removal (for emit)
    const { outgoing, incoming } = this.graph.getNodeConnections(clientId)
    
    this.graph = this.graph.removeNode(clientId)
    this.emit(EVENTS.NODE_REMOVE, { clientId })
    
    // Emit connection removal events
    outgoing.forEach(conn => {
      this.emit(EVENTS.CONNECTION_REMOVE, { clientId: conn.clientId })
    })
    incoming.forEach(conn => {
      this.emit(EVENTS.CONNECTION_REMOVE, { clientId: conn.clientId })
    })
  }
  
  /**
   * Get a node by clientId
   * @param {string} clientId - Node clientId
   * @returns {Node|undefined}
   */
  getNode(clientId) {
    return this.graph.getNode(clientId)
  }
  
  /**
   * Get all nodes
   * @returns {Node[]}
   */
  getNodes() {
    return this.graph.getNodes()
  }
  
  /**
   * Get nodes by type
   * @param {string} type - Node type
   * @returns {Node[]}
   */
  getNodesByType(type) {
    return this.graph.getNodesByType(type)
  }
  
  // --- Connection Operations ---
  
  /**
   * Add a connection
   * @param {Connection} connection - Connection instance to add
   */
  addConnection(connection) {
    if (!(connection instanceof Connection)) {
      throw new Error('addConnection requires a Connection instance')
    }
    
    this.graph = this.graph.addConnection(connection)
    this.emit(EVENTS.CONNECTION_ADD, { connection, clientId: connection.clientId })
  }
  
  /**
   * Update a connection
   * @param {string} clientId - Connection clientId
   * @param {Object} updates - Properties to update
   */
  updateConnection(clientId, updates) {
    const existingConn = this.graph.getConnection(clientId)
    if (!existingConn) {
      console.warn(`Connection ${clientId} not found, cannot update`)
      return
    }
    
    this.graph = this.graph.updateConnection(clientId, updates)
    const updatedConn = this.graph.getConnection(clientId)
    this.emit(EVENTS.CONNECTION_UPDATE, { connection: updatedConn, clientId, updates })
  }
  
  /**
   * Remove a connection
   * @param {string} clientId - Connection clientId
   */
  removeConnection(clientId) {
    if (!this.graph.hasConnection(clientId)) {
      console.warn(`Connection ${clientId} not found, cannot remove`)
      return
    }
    
    this.graph = this.graph.removeConnection(clientId)
    this.emit(EVENTS.CONNECTION_REMOVE, { clientId })
  }
  
  /**
   * Get a connection by clientId
   * @param {string} clientId - Connection clientId
   * @returns {Connection|undefined}
   */
  getConnection(clientId) {
    return this.graph.getConnection(clientId)
  }
  
  /**
   * Get all connections
   * @returns {Connection[]}
   */
  getConnections() {
    return this.graph.getConnections()
  }
  
  /**
   * Find connection between two nodes
   * @param {string} sourceClientId - Source node clientId
   * @param {string} targetClientId - Target node clientId
   * @returns {Connection|undefined}
   */
  findConnection(sourceClientId, targetClientId) {
    return this.graph.findConnection(sourceClientId, targetClientId)
  }
  
  /**
   * Get connections for a node
   * @param {string} clientId - Node clientId
   * @returns {Object} { outgoing: Connection[], incoming: Connection[] }
   */
  getNodeConnections(clientId) {
    return this.graph.getNodeConnections(clientId)
  }
  
  /**
   * Get descendant node IDs
   * @param {string} clientId - Starting node clientId
   * @returns {Set<string>}
   */
  getDescendantIds(clientId) {
    return this.graph.getDescendantIds(clientId)
  }
  
  // ===== View State Operations =====
  
  /**
   * Set zoom level
   * @param {number} zoom - Zoom level (1 = 100%)
   */
  setZoom(zoom) {
    this.viewState.zoom = Math.max(0.1, Math.min(5, zoom))
    // No emit for view state changes
  }
  
  /**
   * Set pan offset
   * @param {number} panX - X offset
   * @param {number} panY - Y offset
   */
  setPan(panX, panY) {
    this.viewState.panX = panX
    this.viewState.panY = panY
    // No emit for view state changes
  }
  
  /**
   * Set selected node
   * @param {string|null} clientId - Node clientId or null to deselect
   */
  setSelectedNode(clientId) {
    this.viewState.selectedNodeId = clientId
    // No emit for view state changes
  }
  
  /**
   * Get selected node
   * @returns {string|null}
   */
  getSelectedNode() {
    return this.viewState.selectedNodeId
  }
  
  /**
   * Set editing node (for side panel)
   * @param {string|null} clientId - Node clientId or null to close
   */
  setEditingNode(clientId) {
    this.viewState.editingNodeId = clientId
    // No emit for view state changes
  }
  
  /**
   * Get editing node
   * @returns {string|null}
   */
  getEditingNode() {
    return this.viewState.editingNodeId
  }
  
  // ===== Serialization =====
  
  /**
   * Get serializable state (for history snapshots)
   * @returns {Object} JSON representation
   */
  getState() {
    return {
      graph: this.graph.toJSON()
      // Note: viewState is NOT included - it's not undoable
    }
  }
  
  /**
   * Restore state (from history)
   * @param {Object} state - JSON state from getState()
   */
  restoreState(state) {
    this.graph = Graph.fromJSON(state.graph)
    this.emit(EVENTS.GRAPH_RESTORE, { graph: this.graph })
  }
  
  // ===== Utility =====
  
  /**
   * Get graph size
   * @returns {Object} { nodes: number, connections: number }
   */
  getSize() {
    return this.graph.getSize()
  }
  
  /**
   * Clear all state
   */
  clear() {
    this.graph = new Graph()
    this.viewState = {
      zoom: 1,
      panX: 0,
      panY: 0,
      selectedNodeId: null,
      editingNodeId: null
    }
    this.emit(EVENTS.GRAPH_REPLACE, { graph: this.graph })
  }
  
  /**
   * Destroy the store and prevent further updates
   * Called when editor is torn down
   */
  destroy() {
    this.destroyed = true
    this.subscribers = []
    this.graph = new Graph()
  }
}

export default Store