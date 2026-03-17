// rendering/ConnectionRenderer.js
// Creates and updates connection SVG lines from state

import { EVENTS, CONNECTION_COLOR, CONNECTION_STROKE_WIDTH, CONNECTION_HITAREA_WIDTH } from '../constants.js'

/**
 * ConnectionRenderer
 * 
 * Subscribes to Store updates and manages connection SVG elements.
 * Pure rendering - no business logic.
 * 
 * Each connection has:
 * - A visible line element
 * - An invisible hit area (wider stroke for easier clicking)
 * - A delete button positioned at the midpoint
 */
class ConnectionRenderer {
  /**
   * Create ConnectionRenderer
   * @param {SVGSVGElement} svgContainer - SVG element for connections
   * @param {Store} store - Store instance
   */
  constructor(svgContainer, store) {
    this.svgContainer = svgContainer
    this.store = store
    
    // Map: clientId → { line, hitArea, deleteBtn }
    this.elements = new Map()
    
    // Subscribe to store updates
    this.unsubscribe = this.store.subscribe(this.handleChange.bind(this))
  }
  
  /**
   * Handle store changes
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  handleChange(event, data) {
    switch (event) {
      case EVENTS.CONNECTION_ADD:
        this.renderConnection(data.connection)
        break
      
      case EVENTS.CONNECTION_REMOVE:
        this.removeConnection(data.clientId)
        break
      
      case EVENTS.NODE_UPDATE:
        // Update connections when node position changes
        this.updateConnectionsForNode(data.clientId)
        break
      
      case EVENTS.NODE_REMOVE:
        // Connections are cascade-deleted by store
        this.removeConnectionsForNode(data.clientId)
        break
      
      case EVENTS.GRAPH_REPLACE:
      case EVENTS.GRAPH_RESTORE:
        this.renderAllConnections()
        break
    }
  }
  
  /**
   * Render a single connection
   * @param {Connection} connection - Connection instance
   */
  renderConnection(connection) {
    // Remove existing if present
    const existing = this.elements.get(connection.clientId)
    if (existing) {
      this.removeConnectionElements(existing)
    }
    
    // Get source and target nodes
    const sourceNode = this.store.getNode(connection.sourceId)
    const targetNode = this.store.getNode(connection.targetId)
    
    if (!sourceNode || !targetNode) {
      console.warn(`Cannot render connection: missing nodes`)
      return
    }
    
    // Get node elements from NodeRenderer (via container query)
    const sourceEl = this.container.querySelector(`[data-client-id="${connection.sourceId}"]`)
    const targetEl = this.container.querySelector(`[data-client-id="${connection.targetId}"]`)
    
    if (!sourceEl || !targetEl) {
      console.warn(`Cannot render connection: missing node elements`)
      return
    }
    
    // Calculate connection points
    const { startX, startY, endX, endY } = this.getConnectionPoints(sourceNode, targetNode)
    
    // Create elements
    const { line, hitArea, deleteBtn } = this.createConnectionElements(
      connection.clientId,
      connection.sourceId,
      connection.targetId,
      startX, startY, endX, endY
    )
    
    // Add to SVG container
    this.svgContainer.appendChild(hitArea)
    this.svgContainer.appendChild(line)
    
    // Add delete button to nodes canvas (parent of SVG)
    const nodesCanvas = this.svgContainer.parentElement
    if (nodesCanvas) {
      nodesCanvas.appendChild(deleteBtn)
    }
    
    // Store references
    this.elements.set(connection.clientId, { line, hitArea, deleteBtn })
  }
  
  /**
   * Calculate connection start and end points
   * @param {Node} sourceNode - Source node
   * @param {Node} targetNode - Target node
   * @returns {{ startX: number, startY: number, endX: number, endY: number }}
   */
  getConnectionPoints(sourceNode, targetNode) {
    // Get connector positions (offset from node top-left)
    const sourceEl = this.container?.querySelector(`[data-client-id="${sourceNode.clientId}"]`)
    const targetEl = this.container?.querySelector(`[data-client-id="${targetNode.clientId}"]`)
    
    // Default to node center if elements not found
    const sourceOffset = sourceEl ? this.getOutputConnectorOffset(sourceEl) : { x: 0, y: 30 }
    const targetOffset = targetEl ? this.getInputConnectorOffset(targetEl) : { x: 0, y: 0 }
    
    return {
      startX: sourceNode.position.x + sourceOffset.x,
      startY: sourceNode.position.y + sourceOffset.y,
      endX: targetNode.position.x + targetOffset.x,
      endY: targetNode.position.y + targetOffset.y
    }
  }
  
  /**
   * Get output connector offset from node element
   * @param {HTMLElement} nodeEl - Node element
   * @returns {{ x: number, y: number }}
   */
  getOutputConnectorOffset(nodeEl) {
    const outputConnector = nodeEl.querySelector('.node-connector.output')
    if (!outputConnector) {
      // Default: center, bottom
      return { x: 50, y: 60 }
    }
    
    const nodeRect = nodeEl.getBoundingClientRect()
    const connRect = outputConnector.getBoundingClientRect()
    
    return {
      x: connRect.left - nodeRect.left + connRect.width / 2,
      y: connRect.top - nodeRect.top + connRect.height / 2
    }
  }
  
  /**
   * Get input connector offset from node element
   * @param {HTMLElement} nodeEl - Node element
   * @returns {{ x: number, y: number }}
   */
  getInputConnectorOffset(nodeEl) {
    const inputConnector = nodeEl.querySelector('.node-connector.input')
    if (!inputConnector) {
      // Default: center, top
      return { x: 50, y: 0 }
    }
    
    const nodeRect = nodeEl.getBoundingClientRect()
    const connRect = inputConnector.getBoundingClientRect()
    
    return {
      x: connRect.left - nodeRect.left + connRect.width / 2,
      y: connRect.top - nodeRect.top + connRect.height / 2
    }
  }
  
  /**
   * Create connection SVG elements and delete button
   * @param {string} clientId - Connection client ID
   * @param {string} sourceId - Source node client ID
   * @param {string} targetId - Target node client ID
   * @param {number} startX - Start X position
   * @param {number} startY - Start Y position
   * @param {number} endX - End X position
   * @param {number} endY - End Y position
   * @returns {{ line: SVGLineElement, hitArea: SVGLineElement, deleteBtn: HTMLElement }}
   */
  createConnectionElements(clientId, sourceId, targetId, startX, startY, endX, endY) {
    // Visible line
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    line.setAttribute('x1', startX)
    line.setAttribute('y1', startY)
    line.setAttribute('x2', endX)
    line.setAttribute('y2', endY)
    line.setAttribute('stroke', CONNECTION_COLOR)
    line.setAttribute('stroke-width', CONNECTION_STROKE_WIDTH)
    line.style.pointerEvents = 'none'
    line.dataset.clientId = clientId
    line.dataset.sourceId = sourceId
    line.dataset.targetId = targetId
    
    // Invisible hit area (wider stroke for easier clicking)
    const hitArea = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    hitArea.setAttribute('x1', startX)
    hitArea.setAttribute('y1', startY)
    hitArea.setAttribute('x2', endX)
    hitArea.setAttribute('y2', endY)
    hitArea.setAttribute('stroke', 'transparent')
    hitArea.setAttribute('stroke-width', CONNECTION_HITAREA_WIDTH)
    hitArea.style.pointerEvents = 'stroke'
    hitArea.style.cursor = 'pointer'
    hitArea.dataset.clientId = clientId
    hitArea.dataset.sourceId = sourceId
    hitArea.dataset.targetId = targetId
    
    // Delete button at midpoint
    const midX = (startX + endX) / 2
    const midY = (startY + endY) / 2
    
    const deleteBtn = document.createElement('button')
    deleteBtn.className = 'connection-delete-btn'
    deleteBtn.textContent = '×'
    deleteBtn.style.cssText = `
      position: absolute;
      left: ${midX}px;
      top: ${midY}px;
      width: 20px;
      height: 20px;
      background: #e94560;
      color: white;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      font-size: 12px;
      line-height: 1;
      display: none;
      pointer-events: auto;
      transform: translate(-50%, -50%);
      z-index: 100;
    `
    deleteBtn.dataset.clientId = clientId
    deleteBtn.dataset.sourceId = sourceId
    deleteBtn.dataset.targetId = targetId
    
    // Show/hide delete button on hover
    hitArea.addEventListener('mouseenter', () => {
      deleteBtn.style.display = 'block'
    })
    
    hitArea.addEventListener('mouseleave', () => {
      deleteBtn.style.display = 'none'
    })
    
    deleteBtn.addEventListener('mouseenter', () => {
      deleteBtn.style.display = 'block'
    })
    
    deleteBtn.addEventListener('mouseleave', () => {
      deleteBtn.style.display = 'none'
    })
    
    return { line, hitArea, deleteBtn }
  }
  
  /**
   * Update connection positions for a node
   * @param {string} clientId - Node client ID
   */
  updateConnectionsForNode(clientId) {
    // Get all connections involving this node
    const { outgoing, incoming } = this.store.getNodeConnections(clientId)
    const allConnections = [...outgoing, ...incoming]
    
    allConnections.forEach(conn => {
      this.updateConnectionPosition(conn.clientId)
    })
  }
  
  /**
   * Update a single connection's position
   * @param {string} clientId - Connection client ID
   */
  updateConnectionPosition(clientId) {
    const elements = this.elements.get(clientId)
    const connection = this.store.getConnection(clientId)
    
    if (!elements || !connection) {
      return
    }
    
    const sourceNode = this.store.getNode(connection.sourceId)
    const targetNode = this.store.getNode(connection.targetId)
    
    if (!sourceNode || !targetNode) {
      return
    }
    
    // Calculate new positions
    const { startX, startY, endX, endY } = this.getConnectionPoints(sourceNode, targetNode)
    
    // Update SVG elements
    elements.line.setAttribute('x1', startX)
    elements.line.setAttribute('y1', startY)
    elements.line.setAttribute('x2', endX)
    elements.line.setAttribute('y2', endY)
    
    elements.hitArea.setAttribute('x1', startX)
    elements.hitArea.setAttribute('y1', startY)
    elements.hitArea.setAttribute('x2', endX)
    elements.hitArea.setAttribute('y2', endY)
    
    // Update delete button position
    const midX = (startX + endX) / 2
    const midY = (startY + endY) / 2
    elements.deleteBtn.style.left = `${midX}px`
    elements.deleteBtn.style.top = `${midY}px`
  }
  
  /**
   * Remove a connection
   * @param {string} clientId - Connection client ID
   */
  removeConnection(clientId) {
    const elements = this.elements.get(clientId)
    if (elements) {
      this.removeConnectionElements(elements)
      this.elements.delete(clientId)
    }
  }
  
  /**
   * Remove connection elements from DOM
   * @param {Object} elements - { line, hitArea, deleteBtn }
   */
  removeConnectionElements(elements) {
    elements.line?.remove()
    elements.hitArea?.remove()
    elements.deleteBtn?.remove()
  }
  
  /**
   * Remove all connections for a node
   * @param {string} clientId - Node client ID
   */
  removeConnectionsForNode(clientId) {
    // Note: This is called when a node is removed
    // The Store already removes connections cascade-style
    // This is a safety cleanup for any remaining elements
    this.elements.forEach((elements, connClientId) => {
      const conn = this.store.getConnection(connClientId)
      if (!conn) {
        // Connection was removed from store, clean up
        this.removeConnectionElements(elements)
        this.elements.delete(connClientId)
      }
    })
  }
  
  /**
   * Render all connections
   */
  renderAllConnections() {
    // Clear existing
    this.clear()
    
    // Render all connections from store
    const connections = this.store.getConnections()
    connections.forEach(conn => this.renderConnection(conn))
  }
  
  /**
   * Clear all connections
   */
  clear() {
    this.elements.forEach(elements => {
      this.removeConnectionElements(elements)
    })
    this.elements.clear()
  }
  
  /**
   * Get delete button element for a connection
   * @param {string} clientId - Connection client ID
   * @returns {HTMLElement|undefined}
   */
  getDeleteButton(clientId) {
    return this.elements.get(clientId)?.deleteBtn
  }
  
  /**
   * Get hit area element for a connection
   * @param {string} clientId - Connection client ID
   * @returns {SVGLineElement|undefined}
   */
  getHitArea(clientId) {
    return this.elements.get(clientId)?.hitArea
  }
  
  /**
   * Cleanup - remove all elements and unsubscribe
   */
  destroy() {
    this.clear()
    this.unsubscribe()
  }
}

export default ConnectionRenderer