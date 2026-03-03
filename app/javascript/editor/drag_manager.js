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
    
    const rect = nodeEl.getBoundingClientRect();
    
    // Calculate offset in canvas coordinates (accounting for zoom)
    if (this.screenToCanvas) {
      const canvasCoords = this.screenToCanvas(e.clientX, e.clientY);
      this.dragOffset = {
        x: canvasCoords.x - parseFloat(nodeEl.style.left),
        y: canvasCoords.y - parseFloat(nodeEl.style.top)
      };
    } else {
      this.dragOffset = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    }
    
    if (this.onDragStart) {
      this.onDragStart(nodeId);
    }
    
    // Attach document-level listeners only during drag operation
    document.addEventListener('mousemove', this.boundHandleMouseMove);
    document.addEventListener('mouseup', this.boundHandleMouseUp);
  }

  handleMouseMove(e) {
    if (!this.isDragging || !this.selectedNode) return;
    
    const node = this.nodes.get(this.selectedNode);
    
    // Convert screen coordinates to canvas coordinates
    if (this.screenToCanvas) {
      const canvasCoords = this.screenToCanvas(e.clientX, e.clientY);
      node.position.x = canvasCoords.x - this.dragOffset.x;
      node.position.y = canvasCoords.y - this.dragOffset.y;
    } else {
      const canvasRect = this.nodesCanvas.getBoundingClientRect();
      node.position.x = e.clientX - canvasRect.left - this.dragOffset.x;
      node.position.y = e.clientY - canvasRect.top - this.dragOffset.y;
    }
    
    node.element.style.left = `${node.position.x}px`;
    node.element.style.top = `${node.position.y}px`;
    
    this.positionChanged = true;
    
    // Update connections as we drag
    if (this.connectionManager) {
      this.connectionManager.updateConnections();
    }
  }

  handleMouseUp() {
    if (!this.isDragging || !this.selectedNode) {
      this.reset();
      return;
    }
    
    const node = this.nodes.get(this.selectedNode);
    if (this.positionChanged && this.api.botId) {
      this.api.updateNodePosition(this.selectedNode, node.position.x, node.position.y)
        .catch(err => console.error('Failed to update position:', err));
    }
    
    if (this.onDragEnd) {
      this.onDragEnd(this.selectedNode, this.positionChanged);
    }
    
    this.reset();
  }

  reset() {
    this.isDragging = false;
    this.positionChanged = false;
    this.selectedNode = null;
    
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
}

export default DragManager;