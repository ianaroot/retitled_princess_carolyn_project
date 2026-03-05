class DragManager {
  constructor(nodesMap, nodesCanvas, api, connectionManager, screenToCanvas) {
    this.nodes = nodesMap;
    this.nodesCanvas = nodesCanvas;
    this.api = api;
    this.connectionManager = connectionManager;
    this.screenToCanvas = screenToCanvas;
    
    this.selectedNode = null;
    this.isDragging = false;
    this.positionChanged = false;
    this.dragOffset = { x: 0, y: 0 };
    
    // Parent-child drag tracking
    this.draggedNodes = null;
    this.preDragPositions = null;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.throttleTimer = null;
    
    this.onDragStart = null;
    this.onDragEnd = null;
    
    // Store bound handlers for cleanup
    this.boundHandleMouseMove = this.handleMouseMove.bind(this);
    this.boundHandleMouseUp = this.handleMouseUp.bind(this);
  }

  setCallbacks(callbacks) {
    this.onDragStart = callbacks.onDragStart;
    this.onDragEnd = callbacks.onDragEnd;
  }

  startDrag(e, nodeId) {
    const nodeEl = this.nodes.get(nodeId)?.element;
    if (!nodeEl) return;
    
    this.selectedNode = nodeId;
    this.isDragging = true;
    this.positionChanged = false;
    
    // Get initial position for delta calculation
    const canvasCoords = this.screenToCanvas ? 
      this.screenToCanvas(e.clientX, e.clientY) : 
      { x: e.clientX, y: e.clientY };
    this.dragStartX = canvasCoords.x;
    this.dragStartY = canvasCoords.y;
    
    // Calculate offset in canvas coordinates (accounting for zoom)
    this.dragOffset = {
      x: canvasCoords.x - parseFloat(nodeEl.style.left),
      y: canvasCoords.y - parseFloat(nodeEl.style.top)
    };
    
    // Build list of all nodes to drag (parent + descendants)
    this.draggedNodes = new Map();
    this.preDragPositions = new Map();
    
    // Add the dragged node (parent)
    const parentNode = this.nodes.get(nodeId);
    this.draggedNodes.set(nodeId, parentNode);
    this.preDragPositions.set(nodeId, { 
      x: parentNode.position.x, 
      y: parentNode.position.y 
    });
    
    // Add all descendant nodes
    if (this.connectionManager?.getDescendantNodeIds) {
      const descendants = this.connectionManager.getDescendantNodeIds(nodeId);
      descendants.forEach(descId => {
        const descNode = this.nodes.get(descId);
        if (descNode) {
          this.draggedNodes.set(descId, descNode);
          this.preDragPositions.set(descId, { 
            x: descNode.position.x, 
            y: descNode.position.y 
          });
        }
      });
    }
    
    if (this.onDragStart) {
      this.onDragStart(nodeId);
    }
    
    // Attach document-level listeners only during drag operation
    document.addEventListener('mousemove', this.boundHandleMouseMove);
    document.addEventListener('mouseup', this.boundHandleMouseUp);
  }

  handleMouseMove(e) {
    if (!this.isDragging || !this.selectedNode || !this.draggedNodes) return;
    
    // Throttle: skip if timer is active
    if (this.throttleTimer) return;
    
    // Schedule next update
    this.throttleTimer = requestAnimationFrame(() => {
      this.throttleTimer = null;
    });
    
    // Calculate delta from drag start
    const canvasCoords = this.screenToCanvas ? 
      this.screenToCanvas(e.clientX, e.clientY) : 
      { x: e.clientX, y: e.clientY };
    const deltaX = canvasCoords.x - this.dragStartX;
    const deltaY = canvasCoords.y - this.dragStartY;
    
    // Skip if no movement
    if (deltaX === 0 && deltaY === 0) return;
    
    this.positionChanged = true;
    
    // Apply delta to all dragged nodes
    this.draggedNodes.forEach((node, id) => {
      const initialPos = this.preDragPositions.get(id);
      const newX = initialPos.x + deltaX;
      const newY = initialPos.y + deltaY;
      
      node.position.x = newX;
      node.position.y = newY;
      node.element.style.left = `${newX}px`;
      node.element.style.top = `${newY}px`;
    });
    
    // Update connections once for all moved nodes
    if (this.connectionManager) {
      this.connectionManager.updateConnections();
    }
  }

  handleMouseUp() {
    if (!this.isDragging || !this.selectedNode) {
      this.reset();
      return;
    }
    
    // Cleanup IMMEDIATELY - stop dragging right away
    const wasChanged = this.positionChanged;
    const selectedNodeId = this.selectedNode;
    
    // Capture pre-drag and post-drag positions BEFORE reset clears them
    const preDragPositions = [];
    const postDragPositions = [];
    
    if (this.preDragPositions && this.draggedNodes) {
      this.preDragPositions.forEach((pos, id) => {
        preDragPositions.push({ id: id, x: pos.x, y: pos.y });
        const node = this.draggedNodes.get(id);
        if (node) {
          postDragPositions.push({ id: id, x: node.position.x, y: node.position.y });
        }
      });
    }
    
    // Store references before reset clears them
    const draggedNodes = this.draggedNodes;
    
    // Reset immediately to stop the drag
    this.reset();
    
    // Fire API call in background (after reset)
    if (wasChanged && this.api.botId && draggedNodes) {
      const updates = [];
      draggedNodes.forEach((node, id) => {
        updates.push({
          id: id,
          x: node.position.x,
          y: node.position.y
        });
      });
      
      // Fire and forget - happens in background
      this.api.batchUpdatePositions(updates)
        .catch(err => {
          console.error('Failed to update positions:', err);
          alert('Failed to save positions. Please refresh the page.');
        });
    }
    
    if (this.onDragEnd) {
      this.onDragEnd(selectedNodeId, wasChanged, preDragPositions, postDragPositions);
    }
  }

  rollbackPositions() {
    if (!this.preDragPositions || !this.draggedNodes) return;
    
    this.preDragPositions.forEach((pos, id) => {
      const node = this.draggedNodes.get(id);
      if (node) {
        node.position.x = pos.x;
        node.position.y = pos.y;
        node.element.style.left = `${pos.x}px`;
        node.element.style.top = `${pos.y}px`;
      }
    });
    
    // Update connections after rollback
    if (this.connectionManager) {
      this.connectionManager.updateConnections();
    }
  }

  reset() {
    this.isDragging = false;
    this.positionChanged = false;
    this.selectedNode = null;
    this.draggedNodes = null;
    this.preDragPositions = null;
    
    // Cancel any pending throttle timer
    if (this.throttleTimer) {
      cancelAnimationFrame(this.throttleTimer);
      this.throttleTimer = null;
    }
    
    // Remove document-level listeners
    document.removeEventListener('mousemove', this.boundHandleMouseMove);
    document.removeEventListener('mouseup', this.boundHandleMouseUp);
  }

  isCurrentlyDragging() {
    return this.isDragging;
  }

  getSelectedNodeId() {
    return this.selectedNode;
  }
  
  // Cleanup method for when editor is destroyed
  destroy() {
    this.reset();
  }

  // Get pre-drag positions for undo support
  getPreDragPositions() {
    return this.preDragPositions;
  }
}

export default DragManager;
