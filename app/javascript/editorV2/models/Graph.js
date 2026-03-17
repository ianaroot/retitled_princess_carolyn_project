// models/Graph.js
// Graph container with nodes and connections

import Node from './Node.js'
import Connection from './Connection.js'
import generateUUID from '../utils/uuid.js'

/**
 * Graph container
 * Holds nodes and connections in Maps keyed by clientId
 * All mutation methods return new Graph instances (immutable)
 */
class Graph {
  /**
   * Create a new Graph
   * @param {Node[]} [nodes=[]] - Initial nodes
   * @param {Connection[]} [connections=[]] - Initial connections
   */
  constructor(nodes = [], connections = []) {
    // Store as Maps for O(1) lookup
    this.nodes = new Map()
    this.connections = new Map()
    
    // Populate from arrays
    nodes.forEach(node => {
      if (!(node instanceof Node)) {
        throw new Error('All nodes must be Node instances')
      }
      this.nodes.set(node.clientId, node)
    })
    
    connections.forEach(conn => {
      if (!(conn instanceof Connection)) {
        throw new Error('All connections must be Connection instances')
      }
      this.connections.set(conn.clientId, conn)
    })
    
    // Freeze to prevent direct mutation
    Object.freeze(this.nodes)
    Object.freeze(this.connections)
  }
  
  // ===== Node Operations =====
  
  /**
   * Get a node by clientId
   * @param {string} clientId - Node clientId
   * @returns {Node|undefined} Node or undefined if not found
   */
  getNode(clientId) {
    return this.nodes.get(clientId)
  }
  
  /**
   * Check if a node exists
   * @param {string} clientId - Node clientId
   * @returns {boolean} True if node exists
   */
  hasNode(clientId) {
    return this.nodes.has(clientId)
  }
  
  /**
   * Get all nodes as an array
   * @returns {Node[]} Array of all nodes
   */
  getNodes() {
    return Array.from(this.nodes.values())
  }
  
  /**
   * Get nodes by type
   * @param {string} type - Node type (root, condition, action, connector)
   * @returns {Node[]} Array of matching nodes
   */
  getNodesByType(type) {
    return this.getNodes().filter(node => node.type === type)
  }
  
  /**
   * Add a new node, returns new Graph
   * @param {Node} node - Node to add
   * @returns {Graph} New Graph with node added
   */
  addNode(node) {
    if (this.nodes.has(node.clientId)) {
      console.warn(`Node with clientId ${node.clientId} already exists, replacing`)
    }
    
    const newNodes = new Map(this.nodes)
    newNodes.set(node.clientId, node)
    
    return new Graph(
      Array.from(newNodes.values()),
      Array.from(this.connections.values())
    )
  }
  
  /**
   * Update a node, returns new Graph
   * @param {string} clientId - Node clientId to update
   * @param {Object} updates - Properties to update
   * @returns {Graph} New Graph with updated node
   */
  updateNode(clientId, updates) {
    const existingNode = this.nodes.get(clientId)
    if (!existingNode) {
      console.warn(`Node ${clientId} not found, cannot update`)
      return this
    }
    
    const updatedNode = existingNode.update(updates)
    const newNodes = new Map(this.nodes)
    newNodes.set(clientId, updatedNode)
    
    return new Graph(
      Array.from(newNodes.values()),
      Array.from(this.connections.values())
    )
  }
  
  /**
   * Remove a node and all its connections, returns new Graph
   * @param {string} clientId - Node clientId to remove
   * @returns {Graph} New Graph with node removed
   */
  removeNode(clientId) {
    if (!this.nodes.has(clientId)) {
      console.warn(`Node ${clientId} not found, cannot remove`)
      return this
    }
    
    // Remove node
    const newNodes = new Map(this.nodes)
    newNodes.delete(clientId)
    
    // Remove connections involving this node
    const newConnections = new Map()
    this.connections.forEach((conn, connClientId) => {
      if (!conn.involvesNode(clientId)) {
        newConnections.set(connClientId, conn)
      }
    })
    
    return new Graph(
      Array.from(newNodes.values()),
      Array.from(newConnections.values())
    )
  }
  
  // ===== Connection Operations =====
  
  /**
   * Get a connection by clientId
   * @param {string} clientId - Connection clientId
   * @returns {Connection|undefined} Connection or undefined if not found
   */
  getConnection(clientId) {
    return this.connections.get(clientId)
  }
  
  /**
   * Check if a connection exists
   * @param {string} clientId - Connection clientId
   * @returns {boolean} True if connection exists
   */
  hasConnection(clientId) {
    return this.connections.has(clientId)
  }
  
  /**
   * Get all connections as an array
   * @returns {Connection[]} Array of all connections
   */
  getConnections() {
    return Array.from(this.connections.values())
  }
  
  /**
   * Find connection between two nodes
   * @param {string} sourceClientId - Source node clientId
   * @param {string} targetClientId - Target node clientId
   * @returns {Connection|undefined} Connection or undefined if not found
   */
  findConnection(sourceClientId, targetClientId) {
    for (const conn of this.connections.values()) {
      if (conn.sourceId === sourceClientId && conn.targetId === targetClientId) {
        return conn
      }
    }
    return undefined
  }
  
  /**
   * Get all connections for a node (both incoming and outgoing)
   * @param {string} clientId - Node clientId
   * @returns {Object} { outgoing: Connection[], incoming: Connection[] }
   */
  getNodeConnections(clientId) {
    const outgoing = []
    const incoming = []
    
    this.connections.forEach(conn => {
      if (conn.sourceId === clientId) outgoing.push(conn)
      if (conn.targetId === clientId) incoming.push(conn)
    })
    
    return { outgoing, incoming }
  }
  
  /**
   * Get outgoing connections for a node
   * @param {string} clientId - Node clientId
   * @returns {Connection[]} Array of outgoing connections
   */
  getOutgoingConnections(clientId) {
    const result = []
    this.connections.forEach(conn => {
      if (conn.sourceId === clientId) result.push(conn)
    })
    return result
  }
  
  /**
   * Get incoming connections for a node
   * @param {string} clientId - Node clientId
   * @returns {Connection[]} Array of incoming connections
   */
  getIncomingConnections(clientId) {
    const result = []
    this.connections.forEach(conn => {
      if (conn.targetId === clientId) result.push(conn)
    })
    return result
  }
  
  /**
   * Get descendant node IDs (children, grandchildren, etc.)
   * Uses BFS to traverse the tree
   * @param {string} clientId - Starting node clientId
   * @returns {Set<string>} Set of descendant clientIds
   */
  getDescendantIds(clientId) {
    const descendants = new Set()
    const queue = [clientId]
    const visited = new Set()
    
    while (queue.length > 0) {
      const currentId = queue.shift()
      if (visited.has(currentId)) continue
      visited.add(currentId)
      
      // Find all children (targets of outgoing connections)
      this.connections.forEach(conn => {
        if (conn.sourceId === currentId && conn.targetId !== clientId) {
          if (!visited.has(conn.targetId)) {
            descendants.add(conn.targetId)
            queue.push(conn.targetId)
          }
        }
      })
    }
    
    return descendants
  }
  
  /**
   * Add a connection, returns new Graph
   * @param {Connection} connection - Connection to add
   * @returns {Graph} New Graph with connection added
   */
  addConnection(connection) {
    // Validate that both source and target nodes exist
    if (!this.nodes.has(connection.sourceId)) {
      console.warn(`Source node ${connection.sourceId} does not exist`)
      return this
    }
    if (!this.nodes.has(connection.targetId)) {
      console.warn(`Target node ${connection.targetId} does not exist`)
      return this
    }
    
    // Check for duplicate connection
    const existing = this.findConnection(connection.sourceId, connection.targetId)
    if (existing) {
      console.warn(`Connection ${connection.sourceId} -> ${connection.targetId} already exists`)
      return this
    }
    
    const newConnections = new Map(this.connections)
    newConnections.set(connection.clientId, connection)
    
    return new Graph(
      Array.from(this.nodes.values()),
      Array.from(newConnections.values())
    )
  }
  
  /**
   * Update a connection, returns new Graph
   * @param {string} clientId - Connection clientId to update
   * @param {Object} updates - Properties to update
   * @returns {Graph} New Graph with updated connection
   */
  updateConnection(clientId, updates) {
    const existingConn = this.connections.get(clientId)
    if (!existingConn) {
      console.warn(`Connection ${clientId} not found, cannot update`)
      return this
    }
    
    const updatedConn = existingConn.update(updates)
    const newConnections = new Map(this.connections)
    newConnections.set(clientId, updatedConn)
    
    return new Graph(
      Array.from(this.nodes.values()),
      Array.from(newConnections.values())
    )
  }
  
  /**
   * Remove a connection, returns new Graph
   * @param {string} clientId - Connection clientId to remove
   * @returns {Graph} New Graph with connection removed
   */
  removeConnection(clientId) {
    if (!this.connections.has(clientId)) {
      console.warn(`Connection ${clientId} not found, cannot remove`)
      return this
    }
    
    const newConnections = new Map(this.connections)
    newConnections.delete(clientId)
    
    return new Graph(
      Array.from(this.nodes.values()),
      Array.from(newConnections.values())
    )
  }
  
  // ===== Serialization =====
  
  /**
   * Serialize to JSON
   * @returns {Object} JSON representation
   */
  toJSON() {
    return {
      nodes: this.getNodes().map(n => n.toJSON()),
      connections: this.getConnections().map(c => c.toJSON())
    }
  }
  
  /**
   * Create Graph from JSON
   * @param {Object} json - JSON representation
   * @returns {Graph} New Graph instance
   */
  static fromJSON(json) {
    const nodes = json.nodes.map(n => Node.fromJSON(n))
    const connections = json.connections.map(c => Connection.fromJSON(c))
    return new Graph(nodes, connections)
  }
  
  // ===== Utility Methods =====
  
  /**
   * Get total count of nodes and connections
   * @returns {Object} { nodes: number, connections: number }
   */
  getSize() {
    return {
      nodes: this.nodes.size,
      connections: this.connections.size
    }
  }
  
  /**
   * Check if graph is empty
   * @returns {boolean} True if no nodes or connections
   */
  isEmpty() {
    return this.nodes.size === 0 && this.connections.size === 0
  }
  
  /**
   * Create a deep clone of this graph
   * @returns {Graph} New Graph instance with same data
   */
  clone() {
    return Graph.fromJSON(this.toJSON())
  }
}

export default Graph