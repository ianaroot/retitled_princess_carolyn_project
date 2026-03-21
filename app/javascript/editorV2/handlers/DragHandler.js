// handlers/DragHandler.js
// Handles node drag operations with optimistic updates

import {
  DRAG_AUTOPAN_EDGE_THRESHOLD,
  DRAG_AUTOPAN_SPEED
} from '../constants.js'

/**
 * DragHandler
 * 
 * Handles:
 * - Mouse down on nodes to start drag
 * - Mouse move during drag
 * - Mouse up to end drag and sync
 * 
 * Child dragging:
 * - By default, dragging a node also moves all its descendants
 * - Hold Shift while dragging to move only the selected node
 * 
 * IMPORTANT: This handler never calls history.push() directly.
 * SyncManager handles history push after successful server sync.
 */
class DragHandler {
  /**
   * Create DragHandler
   * @param {Store} store - Store instance
   * @param {SyncManager} syncManager - SyncManager instance
   */
  constructor(store, syncManager, viewport = null) {
    this.store = store
    this.syncManager = syncManager
    this.viewport = viewport
    
    // Drag state
    this.isDragging = false
    this.draggedClientId = null
    this.draggedNode = null
    this.startPosition = null
    this.offset = { x: 0, y: 0 }
    this.hasMoved = false
    this.lastPointerClient = null
    this.autoPanFrameId = null
    this.autoPanRemainder = { x: 0, y: 0 }
    
    // Child drag state
    this.shouldDragChildren = true
    this.childOffsets = new Map()  // Map<clientId, { dx, dy, startX, startY }>
    
    // Pre-bound handlers (fixes removeEventListener bug)
    this.boundHandleMouseMove = this.handleMouseMove.bind(this)
    this.boundHandleMouseUp = this.handleMouseUp.bind(this)
    this.boundAutoPanStep = this.autoPanStep.bind(this)
    
    // Element-to-clientId mappings
    this.attachedElements = new WeakMap()
  }
  
  /**
   * Attach drag handlers to a node element
   * @param {HTMLElement} element - Node element
   * @param {string} clientId - Node client ID
   */
  attach(element, clientId) {
    // Prevent duplicate attachments
    if (this.attachedElements.has(element)) {
      return
    }
    
    this.attachedElements.set(element, clientId)
    
    // Mouse down starts potential drag
    element.addEventListener('mousedown', (e) => this.handleMouseDown(e, clientId, element))
  }
  
  /**
   * Handle mouse down on a node
   * @param {MouseEvent} event
   * @param {string} clientId
   * @param {HTMLElement} element
   */
  handleMouseDown(event, clientId, element) {
    // Only left click
    if (event.button !== 0) {
      return
    }
    
    // Don't interfere with connector clicks
    if (event.target.classList.contains('node-connector')) {
      return
    }
    
    const node = this.store.getNode(clientId)
    // this seems like overkill?
    if (!node) {
      return
    }
    
    event.preventDefault()
    event.stopPropagation()
    
    // Initialize drag state
    this.isDragging = true
    this.draggedClientId = clientId
    this.draggedNode = node
    this.hasMoved = false
    
    // Store start position (for potential rollback)
    this.startPosition = { ...node.position }
    
    // Check Shift key: hold Shift to drag node alone (without children)
    this.shouldDragChildren = !event.shiftKey
    
    if (this.shouldDragChildren) {
      // Find all descendants and store their offsets relative to dragged node
      this.childOffsets.clear()
      const descendantIds = this.store.graph.getDescendantIds(clientId)
      
      descendantIds.forEach(id => {
        const child = this.store.getNode(id)
        if (child) {
          this.childOffsets.set(id, {
            dx: child.position.x - node.position.x,
            dy: child.position.y - node.position.y,
            startX: child.position.x,
            startY: child.position.y
          })
        }
      })
    }
    
    // Calculate offset (where in the node the mouse clicked)
    this.lastPointerClient = { x: event.clientX, y: event.clientY }
    this.autoPanRemainder = { x: 0, y: 0 }
    const pointer = this.viewport?.screenToGraphPoint(event.clientX, event.clientY) || {
      x: event.clientX,
      y: event.clientY
    }
    this.offset = {
      x: pointer.x - node.position.x,
      y: pointer.y - node.position.y
    }
    
    // Add visual feedback
    element.classList.add('dragging')
    this.viewport?.beginInteraction()
    
    // Attach document-level handlers for drag
    document.addEventListener('mousemove', this.boundHandleMouseMove)
    document.addEventListener('mouseup', this.boundHandleMouseUp)
    this.startAutoPanLoop()
    
    // Update selection
    this.store.setSelectedNode(clientId)
  }
  
  /**
   * Handle mouse move during drag
   * @param {MouseEvent} event
   */
  handleMouseMove(event) {
    if (!this.isDragging || !this.draggedClientId) {
      return
    }

    this.lastPointerClient = { x: event.clientX, y: event.clientY }
    this.updateDragPosition(event.clientX, event.clientY)
  }
  
  /**
   * Handle mouse up to end drag
   * @param {MouseEvent} event
   */
  handleMouseUp(event) {
    this.stopAutoPanLoop()
    this.viewport?.endInteraction()

    // Remove document handlers immediately
    document.removeEventListener('mousemove', this.boundHandleMouseMove)
    document.removeEventListener('mouseup', this.boundHandleMouseUp)
    
    // Remove visual feedback
    if (this.draggedClientId) {
      const element = document.querySelector(`[data-client-id="${this.draggedClientId}"]`)
      if (element) {
        element.classList.remove('dragging')
      }
    }
    
    // Sync with server if we moved
    if (this.hasMoved && this.draggedClientId && this.draggedNode) {
      const node = this.store.getNode(this.draggedClientId)
      if (node) {
        if (this.shouldDragChildren && this.childOffsets.size > 0) {
          // Multi-node drag: use batch update
          const positions = [
            { clientId: this.draggedClientId, x: node.position.x, y: node.position.y }
          ]
          
          this.childOffsets.forEach((offset, childId) => {
            const child = this.store.getNode(childId)
            if (child) {
              positions.push({
                clientId: childId,
                x: child.position.x,
                y: child.position.y
              })
            }
          })
          
          const descendantCount = this.childOffsets.size
          const description = `Move ${this.draggedNode.type} node (+ ${descendantCount} descendants)`
          
          this.syncManager.batchUpdatePositions(positions, description)
            .catch(err => {
              console.error('Failed to sync drag positions:', err)
            })
        } else {
          // Single-node drag
          this.syncManager.updateNodePosition(
            this.draggedClientId,
            node.position.x,
            node.position.y
          ).catch(err => {
            console.error('Failed to sync drag position:', err)
          })
        }
      }
    }
    
    // Reset state
    this.isDragging = false
    this.draggedClientId = null
    this.draggedNode = null
    this.startPosition = null
    this.hasMoved = false
    this.lastPointerClient = null
    this.autoPanRemainder = { x: 0, y: 0 }
    this.childOffsets.clear()
  }

  updateDragPosition(clientX, clientY) {
    const pointer = this.viewport?.screenToGraphPoint(clientX, clientY) || {
      x: clientX,
      y: clientY
    }
    const x = pointer.x - this.offset.x
    const y = pointer.y - this.offset.y

    const node = this.store.getNode(this.draggedClientId)
    if (node && node.position.x === x && node.position.y === y) {
      return
    }

    this.hasMoved = true
    this.store.updateNode(this.draggedClientId, { position: { x, y } })

    const element = document.querySelector(`[data-client-id="${this.draggedClientId}"]`)
    if (element) {
      element.style.left = `${x}px`
      element.style.top = `${y}px`
    }

    if (this.shouldDragChildren) {
      this.childOffsets.forEach((offset, childId) => {
        const childX = x + offset.dx
        const childY = y + offset.dy

        this.store.updateNode(childId, { position: { x: childX, y: childY } })

        const childElement = document.querySelector(`[data-client-id="${childId}"]`)
        if (childElement) {
          childElement.style.left = `${childX}px`
          childElement.style.top = `${childY}px`
        }
      })
    }
  }

  startAutoPanLoop() {
    if (!this.viewport?.container || this.autoPanFrameId) {
      return
    }

    this.autoPanFrameId = requestAnimationFrame(this.boundAutoPanStep)
  }

  stopAutoPanLoop() {
    if (!this.autoPanFrameId) {
      return
    }

    cancelAnimationFrame(this.autoPanFrameId)
    this.autoPanFrameId = null
  }

  autoPanStep() {
    this.autoPanFrameId = null

    if (!this.isDragging || !this.lastPointerClient || !this.viewport?.container) {
      return
    }

    const container = this.viewport.container
    const rect = container.getBoundingClientRect()
    const deltaX = this.getAutoPanDelta(
      this.lastPointerClient.x,
      rect.left,
      rect.right
    )
    const deltaY = this.getAutoPanDelta(
      this.lastPointerClient.y,
      rect.top,
      rect.bottom
    )

    if (deltaX !== 0 || deltaY !== 0) {
      this.autoPanRemainder.x += deltaX
      this.autoPanRemainder.y += deltaY

      const scrollDeltaX = this.extractScrollDelta('x')
      const scrollDeltaY = this.extractScrollDelta('y')

      if (scrollDeltaX !== 0 || scrollDeltaY !== 0) {
        container.scrollLeft += scrollDeltaX
        container.scrollTop += scrollDeltaY
        this.updateDragPosition(this.lastPointerClient.x, this.lastPointerClient.y)
      }
    }

    this.autoPanFrameId = requestAnimationFrame(this.boundAutoPanStep)
  }

  getAutoPanDelta(pointer, minEdge, maxEdge) {
    const distanceToMin = pointer - minEdge
    if (distanceToMin < DRAG_AUTOPAN_EDGE_THRESHOLD) {
      return -DRAG_AUTOPAN_SPEED
    }

    const distanceToMax = maxEdge - pointer
    if (distanceToMax < DRAG_AUTOPAN_EDGE_THRESHOLD) {
      return DRAG_AUTOPAN_SPEED
    }

    return 0
  }

  extractScrollDelta(axis) {
    const remainder = this.autoPanRemainder[axis]
    const delta = remainder > 0 ? Math.floor(remainder) : Math.ceil(remainder)

    this.autoPanRemainder[axis] = remainder - delta
    return delta
  }

  /**
   * Check if currently dragging
   * @returns {boolean}
   */
  isCurrentlyDragging() {
    return this.isDragging
  }
  
  /**
   * Get the currently dragged node's client ID
   * @returns {string|null}
   */
  getDraggedNodeId() {
    return this.draggedClientId
  }
  
  /**
   * Cancel current drag (for external use)
   */
  cancelDrag() {
    if (this.isDragging) {
      // Restore dragged node position
      if (this.startPosition && this.draggedClientId) {
        this.store.updateNode(this.draggedClientId, { position: this.startPosition })
        
        const element = document.querySelector(`[data-client-id="${this.draggedClientId}"]`)
        if (element) {
          element.style.left = `${this.startPosition.x}px`
          element.style.top = `${this.startPosition.y}px`
          element.classList.remove('dragging')
        }
      }
      
      // Restore descendant positions
      if (this.shouldDragChildren) {
        this.childOffsets.forEach((offset, childId) => {
          this.store.updateNode(childId, { position: { x: offset.startX, y: offset.startY } })
          
          const childElement = document.querySelector(`[data-client-id="${childId}"]`)
          if (childElement) {
            childElement.style.left = `${offset.startX}px`
            childElement.style.top = `${offset.startY}px`
          }
        })
      }
      
      // Remove handlers
      document.removeEventListener('mousemove', this.boundHandleMouseMove)
      document.removeEventListener('mouseup', this.boundHandleMouseUp)
      this.stopAutoPanLoop()
      this.viewport?.endInteraction()
      
      // Reset state
      this.isDragging = false
      this.draggedClientId = null
      this.startPosition = null
      this.hasMoved = false
      this.lastPointerClient = null
      this.autoPanRemainder = { x: 0, y: 0 }
      this.childOffsets.clear()
    }
  }
  
  /**
   * Cleanup on destroy
   */
  destroy() {
    // Cancel any active drag
    this.cancelDrag()
    
    // Clear mappings
    this.attachedElements = new WeakMap()
  }
}

export default DragHandler
