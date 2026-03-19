// models/Connection.js
// Immutable Connection model with client-side UUID

import generateUUID from '../utils/uuid.js'

/**
 * Immutable Connection model
 * Represents a directed edge from source node to target node
 * Create new instances for updates - do not mutate directly
 */
class Connection {
  /**
   * Create a new Connection
   * @param {Object} params
   * @param {string} [params.clientId] - Client-side UUID (generated if not provided)
   * @param {number|null} [params.serverId] - Server/database ID (null for new connections)
   * @param {string} params.sourceId - Source node clientId
   * @param {string} params.targetId - Target node clientId
   */
  constructor({ clientId, serverId = null, sourceId, targetId }) {
    // Generate clientId if not provided
    this.clientId = clientId || generateUUID()
    
    // serverId may be null for new connections until synced
    this.serverId = serverId
    
    // Validate required fields
    if (!sourceId) {
      throw new Error('sourceId is required')
    }
    if (!targetId) {
      throw new Error('targetId is required')
    }
    if (sourceId === targetId) {
      throw new Error('sourceId and targetId cannot be the same (no self-connections)')
    }
    
    this.sourceId = sourceId
    this.targetId = targetId
    
    // Freeze to enforce immutability
    Object.freeze(this)
  }
  
  /**
   * Create a new Connection with updated properties
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
   * Check if this connection involves a specific node
   * @param {string} nodeId - Node clientId to check
   * @returns {boolean} True if connection involves this node
   */
  involvesNode(nodeId) {
    return this.sourceId === nodeId || this.targetId === nodeId
  }
  
  /**
   * Check if this is the same connection (by clientId)
   * @param {Connection} other - Another connection
   * @returns {boolean} True if same clientId
   */
  equals(other) {
    return other instanceof Connection && this.clientId === other.clientId
  }
  
  /**
   * Check if this connects the same nodes as another connection
   * (regardless of direction or clientId)
   * @param {Connection} other - Another connection
   * @returns {boolean} True if same source and target
   */
  connectsSameNodes(other) {
    if (!(other instanceof Connection)) return false
    return this.sourceId === other.sourceId && this.targetId === other.targetId
  }
  
  /**
   * Get a unique key for this connection
   * Format: "sourceId-targetId"
   * @returns {string} Connection key
   */
  getKey() {
    return `${this.sourceId}-${this.targetId}`
  }
  
  /**
   * Serialize to JSON
   * @returns {Object} JSON representation
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
   * Create Connection from JSON
   * @param {Object} json - JSON representation
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
  
  /**
   * Create Connection from server response
   * @param {Object} serverConnection - Server connection object
   * @param {string} sourceClientId - Source node clientId
   * @param {string} targetClientId - Target node clientId
   * @param {string} [clientId] - Client-side UUID
   * @returns {Connection} New Connection instance
   */
  static fromServer(serverConnection, sourceClientId, targetClientId, clientId) {
    return new Connection({
      clientId: clientId,
      serverId: serverConnection.id,
      sourceId: sourceClientId,
      targetId: targetClientId
    })
  }
}

export default Connection