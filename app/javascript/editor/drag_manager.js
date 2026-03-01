class DragManager {
  constructor(nodesMap, nodesCanvas, api, connectionManager) {
    this.nodes = nodesMap;
    this.nodesCanvas = nodesCanvas;
    this.api = api;
    this.connectionManager = connectionManager;
    
    this.selectedNode = null;
    this.isDragging = false;
    this.positionChanged = false;
    this.dragOffset = { x: 0, y: 0 };
    
    this.onDragStart = null;
    this.onDragEnd = null;
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
    this.dragOffset = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    
    if (this.onDragStart) {
      this.onDragStart(nodeId);
    }
  }

  handleMouseMove(e) {
    if (!this.isDragging || !this.selectedNode) return;
    
    const node = this.nodes.get(this.selectedNode);
    const canvasRect = this.nodesCanvas.getBoundingClientRect();
    
    node.position.x = e.clientX - canvasRect.left - this.dragOffset.x;
    node.position.y = e.clientY - canvasRect.top - this.dragOffset.y;
    
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
  }

  isCurrentlyDragging() {
    return this.isDragging;
  }

  getSelectedNodeId() {
    return this.selectedNode;
  }
}

export default DragManager;