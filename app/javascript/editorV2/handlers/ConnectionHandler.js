// handlers/ConnectionHandler.js
// Handles connection creation and deletion

/**
 * ConnectionHandler
 * 
 * Handles:
 * - Mouse down on output connector to start connection
 * - Mouse move during connection drag
 * - Mouse up on input connector to create connection
 * - Click on delete button to remove connection
 * 
 * IMPORTANT: This handler never calls history.push() directly.
 * SyncManager handles history push after successful server sync.
 */
class ConnectionHandler {
  /**
   * Create ConnectionHandler
   * @param {Store} store - Store instance
   * @param {SyncManager} syncManager - SyncManager instance
   * @param {ConnectionRenderer} connectionRenderer - ConnectionRenderer instance
   */
  constructor(store, syncManager, connectionRenderer, viewport = null) {
    this.store = store
    this.syncManager = syncManager
    this.connectionRenderer = connectionRenderer
    this.viewport = viewport
    
    // Connection drag state
    this.isConnecting = false
    this.sourceClientId = null
    this.sourceElement = null
    this.tempLine = null
    
    // Pre-bound handlers (fixes removeEventListener bug)
    this.boundHandleMouseMove = this.handleMouseMove.bind(this)
    this.boundHandleMouseUp = this.handleMouseUp.bind(this)
    
    // Element-to-clientId mappings
    this.attachedElements = new WeakMap()
  }
  
  /**
   * Attach connection handlers to a node element
   * @param {HTMLElement} element - Node element
   * @param {string} clientId - Node client ID
   */
  attach(element, clientId) {
    // Prevent duplicate attachments
    if (this.attachedElements.has(element)) {
      return
    }
    
    this.attachedElements.set(element, clientId)
    
    // Find connector elements
    const outputConnector = element.querySelector('.node-connector.output')
    
    // Output connector: start new connection
    if (outputConnector) {
      outputConnector.addEventListener('mousedown', (e) => {
        this.startConnection(e, clientId, outputConnector)
      })
    }
    
    // Handle delete button clicks (delegated from node canvas)
    // Note: Delete buttons are created by ConnectionRenderer
  }
  
  /**
   * Start creating a connection
   * @param {MouseEvent} event
   * @param {string} clientId - Source node client ID
   * @param {HTMLElement} sourceConnector - Output connector element
   */
  startConnection(event, clientId, sourceConnector) {
    event.preventDefault()
    event.stopPropagation()
    
    const node = this.store.getNode(clientId)
    if (!node) {
      return
    }
    
    this.isConnecting = true
    this.sourceClientId = clientId
    this.sourceElement = sourceConnector
    
    // Create temporary line for visual feedback
    const svgContainer = document.getElementById('connections-canvas')
    if (!svgContainer) {
      console.error('SVG container not found')
      this.isConnecting = false
      return
    }
    
    // Create temp line
    this.tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    this.tempLine.setAttribute('stroke', '#4CAF50')
    this.tempLine.setAttribute('stroke-width', '3')
    this.tempLine.setAttribute('stroke-dasharray', '5,5')
    
    // Set initial position
    const { x, y } = this.getConnectorPosition(sourceConnector)
    this.tempLine.setAttribute('x1', x)
    this.tempLine.setAttribute('y1', y)
    this.tempLine.setAttribute('x2', x)
    this.tempLine.setAttribute('y2', y)
    
    svgContainer.appendChild(this.tempLine)
    
    // Add document handlers
    document.addEventListener('mousemove', this.boundHandleMouseMove)
    document.addEventListener('mouseup', this.boundHandleMouseUp)
    
    // Add connecting class to source node
    const nodeEl = sourceConnector.closest('.node')
    if (nodeEl) {
      nodeEl.classList.add('connecting-source')
    }
  }
  
  /**
   * Handle mouse move during connection drag
   * @param {MouseEvent} event
   */
  handleMouseMove(event) {
    if (!this.isConnecting || !this.tempLine) {
      return
    }
    
    const pointer = this.viewport?.screenToGraphPoint(event.clientX, event.clientY) || {
      x: event.clientX,
      y: event.clientY
    }
    
    // Update temp line endpoint
    this.tempLine.setAttribute('x2', pointer.x)
    this.tempLine.setAttribute('y2', pointer.y)
  }
  
  /**
   * Handle mouse up to end connection
   * @param {MouseEvent} event
   */
  handleMouseUp(event) {
    // Remove handlers immediately
    document.removeEventListener('mousemove', this.boundHandleMouseMove)
    document.removeEventListener('mouseup', this.boundHandleMouseUp)
    
    // Clean up visual state
    if (this.sourceElement) {
      const nodeEl = this.sourceElement.closest('.node')
      if (nodeEl) {
        nodeEl.classList.remove('connecting-source')
      }
    }
    
    // Check if we're over an input connector
    const inputConnector = event.target.closest('.node-connector.input')
    if (inputConnector && this.sourceClientId) {
      const targetNode = inputConnector.closest('.node')
      const targetClientId = targetNode?.dataset.clientId
      
      if (targetClientId && targetClientId !== this.sourceClientId) {
        // Valid target - create connection
        this.finishConnection(this.sourceClientId, targetClientId)
      }
    }
    
    // Clean up temp line
    if (this.tempLine) {
      this.tempLine.remove()
      this.tempLine = null
    }
    
    // Reset state
    this.isConnecting = false
    this.sourceClientId = null
    this.sourceElement = null
  }
  
  /**
   * Finish creating a connection
   * @param {string} sourceClientId - Source node client ID
   * @param {string} targetClientId - Target node client ID
   */
  async finishConnection(sourceClientId, targetClientId) {
    // Validate
    if (sourceClientId === targetClientId) {
      console.warn('Cannot connect node to itself')
      return
    }
    
    // Check for existing connection
    const existing = this.store.findConnection(sourceClientId, targetClientId)
    if (existing) {
      console.warn('Connection already exists')
      return
    }
    
    // SyncManager handles: optimistic update, server sync, history push
    try {
      await this.syncManager.createConnection(sourceClientId, targetClientId)
    } catch (error) {
      console.error('Failed to create connection:', error)
    }
  }
  
  /**
   * Delete a connection
   * @param {string} clientId - Connection client ID
   */
  async deleteConnection(clientId) {
    try {
      await this.syncManager.deleteConnection(clientId)
    } catch (error) {
      console.error('Failed to delete connection:', error)
    }
  }
  
  /**
   * Get connector position relative to canvas
   * @param {HTMLElement} connector - Connector element
   * @returns {{ x: number, y: number }}
   */
  getConnectorPosition(connector) {
    return this.viewport?.getElementCenterGraphPoint(connector) || { x: 0, y: 0 }
  }
  
  /**
   * Setup delegated delete button handler on canvas
   * @param {HTMLElement} canvas - Nodes canvas element
   */
  setupDeleteHandler(canvas) {
    canvas.addEventListener('click', (e) => {
      const deleteBtn = e.target.closest('.connection-delete-btn')
      if (deleteBtn) {
        const clientId = deleteBtn.dataset.clientId
        if (clientId) {
          this.deleteConnection(clientId)
        }
      }
    })
  }
  
  /**
   * Cancel current connection (for external use)
   */
  cancelConnection() {
    if (this.isConnecting) {
      // Remove handlers
      document.removeEventListener('mousemove', this.boundHandleMouseMove)
      document.removeEventListener('mouseup', this.boundHandleMouseUp)
      
      // Clean up visual state
      if (this.sourceElement) {
        const nodeEl = this.sourceElement.closest('.node')
        if (nodeEl) {
          nodeEl.classList.remove('connecting-source')
        }
      }
      
      // Remove temp line
      if (this.tempLine) {
        this.tempLine.remove()
        this.tempLine = null
      }
      
      // Reset state
      this.isConnecting = false
      this.sourceClientId = null
      this.sourceElement = null
    }
  }
  
  /**
   * Check if currently creating a connection
   * @returns {boolean}
   */
  isCurrentlyConnecting() {
    return this.isConnecting
  }
  
  /**
   * Cleanup on destroy
   */
  destroy() {
    this.cancelConnection()
    this.attachedElements = new WeakMap()
  }
}

export default ConnectionHandler
