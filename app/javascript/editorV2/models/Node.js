// models/Node.js
// Immutable Node model with client-side UUID

import generateUUID from '../utils/uuid.js'

/**
 * Immutable Node model
 * Create new instances for updates - do not mutate directly
 */
class Node {
  /**
   * Create a new Node
   * @param {Object} params
   * @param {string} [params.clientId] - Client-side UUID (generated if not provided)
   * @param {number|null} [params.serverId] - Server/database ID (null for new nodes)
   * @param {string} params.type - Node type (root, condition, action, connector)
   * @param {Object} params.position - Position { x, y }
   * @param {Object} [params.data={}] - Node configuration data
   */
  constructor({ clientId, serverId = null, type, position, data = {} }) {
    // Generate clientId if not provided
    this.clientId = clientId || generateUUID()
    
    // serverId may be null for new nodes until synced
    this.serverId = serverId
    
    // Validate required fields
    if (!type) {
      throw new Error('Node type is required')
    }
    if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
      throw new Error('Valid position { x, y } is required')
    }
    
    this.type = type
    this.position = { x: position.x, y: position.y }
    this.data = data && typeof data === 'object' ? { ...data } : {}
    
    // Freeze to enforce immutability
    Object.freeze(this)
    Object.freeze(this.position)
    Object.freeze(this.data)
  }
  
  /**
   * Create a new Node with updated properties
   * @param {Object} updates - Properties to update
   * @returns {Node} New Node instance
   */
  update(updates) {
    return new Node({
      clientId: this.clientId,
      serverId: updates.serverId !== undefined ? updates.serverId : this.serverId,
      type: updates.type !== undefined ? updates.type : this.type,
      position: updates.position !== undefined ? updates.position : this.position,
      data: updates.data !== undefined ? updates.data : this.data
    })
  }
  
  /**
   * Update position only
   * @param {number} x - New X position
   * @param {number} y - New Y position
   * @returns {Node} New Node instance
   */
  updatePosition(x, y) {
    return new Node({
      clientId: this.clientId,
      serverId: this.serverId,
      type: this.type,
      position: { x, y },
      data: this.data
    })
  }
  
  /**
   * Update data only
   * @param {Object} newData - New data (merged with existing)
   * @returns {Node} New Node instance
   */
  updateData(newData) {
    return new Node({
      clientId: this.clientId,
      serverId: this.serverId,
      type: this.type,
      position: this.position,
      data: { ...this.data, ...newData }
    })
  }
  
  /**
   * Serialize to JSON
   * @returns {Object} JSON representation
   */
  toJSON() {
    return {
      clientId: this.clientId,
      serverId: this.serverId,
      type: this.type,
      position: { x: this.position.x, y: this.position.y },
      data: { ...this.data }
    }
  }
  
  /**
   * Create Node from JSON
   * @param {Object} json - JSON representation
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
  
  /**
   * Create Node from server response
   * @param {Object} serverNode - Server node object (has database ID)
   * @param {string} clientId - Client-side UUID
   * @returns {Node} New Node instance
   */
  static fromServer(serverNode, clientId) {
    return new Node({
      clientId: clientId,
      serverId: serverNode.id,
      type: serverNode.node_type,
      position: { x: serverNode.position_x, y: serverNode.position_y },
      data: serverNode.data || {}
    })
  }
}

export default Node