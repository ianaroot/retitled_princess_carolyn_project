// Node dimension constants (fallback only)
const NODE_WIDTH = 100;
const NODE_HEIGHT = 60;

import {
  CONNECTION_STROKE_COLOR,
  CONNECTION_STROKE_WIDTH,
  TEMP_LINE_STROKE_COLOR,
  TEMP_LINE_STROKE_WIDTH,
  TEMP_LINE_STROKE_DASHARRAY,
  HITAREA_STROKE_COLOR,
  HITAREA_STROKE_WIDTH,
  DELETE_BUTTON_TEXT
} from 'editor/constants';

// Cache for connector positions (prevents repeated DOM measurements)
const connectorCache = new WeakMap();

// Measure actual connector element positions using getBoundingClientRect
// Returns { inputX, inputY, outputX, outputY } relative to node top-left
function readCSSConnectors(nodeElement) {
  const inputConnector = nodeElement.querySelector('.node-connector.input');
  const outputConnector = nodeElement.querySelector('.node-connector.output');
  
  const nodeRect = nodeElement.getBoundingClientRect();
  
  let inputX = nodeRect.width / 2;  // Default: center
  let inputY = -7;                  // Default: slightly above top
  let outputX = nodeRect.width / 2; // Default: center
  let outputY = nodeRect.height + 7; // Default: slightly below bottom
  
  if (inputConnector) {
    const inputRect = inputConnector.getBoundingClientRect();
    inputX = inputRect.left - nodeRect.left + inputRect.width / 2;
    inputY = inputRect.top - nodeRect.top + inputRect.height / 2;
  }
  
  if (outputConnector) {
    const outputRect = outputConnector.getBoundingClientRect();
    outputX = outputRect.left - nodeRect.left + outputRect.width / 2;
    outputY = outputRect.top - nodeRect.top + outputRect.height / 2;
  }
  
  const cache = { 
    inputX: inputX, 
    inputY: inputY,
    outputX: outputX, 
    outputY: outputY
  };
  
  connectorCache.set(nodeElement, cache);
  return cache;
}

// Get cached or freshly measured input anchor point
function getInputAnchor(nodeElement) {
  let cache = connectorCache.get(nodeElement);
  if (!cache) {
    cache = readCSSConnectors(nodeElement);
  }
  return { x: cache.inputX, y: cache.inputY };
}

// Get cached or freshly measured output anchor point
function getOutputAnchor(nodeElement) {
  let cache = connectorCache.get(nodeElement);
  if (!cache) {
    cache = readCSSConnectors(nodeElement);
  }
  return { x: cache.outputX, y: cache.outputY };
}

// Clear cache for a specific node (call when node content changes)
function clearConnectorCache(nodeElement) {
  connectorCache.delete(nodeElement);
}

class ConnectionManager {
  constructor(api, nodesMap, screenToCanvas, nodeEditor) {
    this.api = api;
    this.nodes = nodesMap;
    this.screenToCanvas = screenToCanvas;
    this.nodeEditor = nodeEditor;
    this.connectionsCanvas = document.getElementById('connections-canvas');
    this.nodesCanvas = document.getElementById('nodes-canvas');
    
    this.isConnecting = false;
    this.connectSource = null;
    this.tempLine = null;
    
    // Track which connectors already have listeners
    this._elementsWithListeners = new WeakMap();
    
    // Track all connections: Map<`${sourceId}-${targetId}`, { sourceId, targetId, connectionId, line, hitArea, deleteBtn }>
    this.connections = new Map();
    
    // Store bound handlers for cleanup
    this.boundHandleMouseMove = this.handleMouseMove.bind(this);
    this.boundHandleMouseUp = this.handleMouseUp.bind(this);
  }

  loadConnections() {
    this.nodes.forEach((node, id) => {
      const output = node.element.querySelector('.output');
      // Only attach listeners if node has output connector (not action nodes)
      if (output && !this._elementsWithListeners.has(output)) {
        output.addEventListener('mousedown', (e) => this.startConnection(e, id));
        this._elementsWithListeners.set(output, true);
      }
    });
  }

  drawExistingConnections() {
    const connectionsData = this.connectionsCanvas?.dataset.connections;
    if (!connectionsData) return;
    
    try {
      const connections = JSON.parse(connectionsData);
      connections.forEach(conn => {
        if (this.nodes.has(conn.source) && this.nodes.has(conn.target)) {
          this.drawConnection(conn.source, conn.target, conn.id);
        }
      });
    } catch (e) {
      console.error('Failed to parse connections:', e);
    }
  }

  startConnection(e, nodeId) {
    this.isConnecting = true;
    this.connectSource = { nodeId };
    e.stopPropagation();
    e.preventDefault();
    
    this.createTempLine(e.clientX, e.clientY);
    
    // Attach document-level listeners only during connection operation
    document.addEventListener('mousemove', this.boundHandleMouseMove);
    document.addEventListener('mouseup', this.boundHandleMouseUp);
  }

  createTempLine(x, y) {
    this.tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    const sourceNode = this.nodes.get(this.connectSource.nodeId);
    const sourceEl = sourceNode.element;
    
    const anchor = getOutputAnchor(sourceEl);
    const startX = parseFloat(sourceEl.style.left) + anchor.x;
    const startY = parseFloat(sourceEl.style.top) + anchor.y;
    
    // Convert screen coordinates to canvas coordinates for proper positioning
    const canvasCoords = this.screenToCanvas ? 
      this.screenToCanvas(x, y) : 
      { x: x - this.nodesCanvas.getBoundingClientRect().left, y: y - this.nodesCanvas.getBoundingClientRect().top };
    
    this.tempLine.setAttribute('x1', startX);
    this.tempLine.setAttribute('y1', startY);
    this.tempLine.setAttribute('x2', canvasCoords.x);
    this.tempLine.setAttribute('y2', canvasCoords.y);
    this.tempLine.setAttribute('stroke', TEMP_LINE_STROKE_COLOR);
    this.tempLine.setAttribute('stroke-width', TEMP_LINE_STROKE_WIDTH);
    this.tempLine.setAttribute('stroke-dasharray', TEMP_LINE_STROKE_DASHARRAY);
    
    this.connectionsCanvas.appendChild(this.tempLine);
  }

  handleMouseMove(e) {
    if (this.isConnecting) {
      this.updateConnectionLine(e.clientX, e.clientY);
    }
  }
  
  handleMouseUp(e) {
    if (!this.isConnecting) return;
    
    const inputConnector = e.target.closest('.node-connector.input');
    if (inputConnector) {
      const targetNode = inputConnector.closest('.node');
      if (targetNode && this.connectSource) {
        const sourceNode = this.nodes.get(this.connectSource.nodeId);
        if (sourceNode && parseInt(targetNode.dataset.id) !== this.connectSource.nodeId) {
          this.createConnection(this.connectSource.nodeId, parseInt(targetNode.dataset.id));
        }
      }
    }
    
    this.endConnection();
  }

  updateConnectionLine(x, y) {
    if (!this.tempLine) return;
    
    // Convert screen coordinates to canvas coordinates for proper positioning
    const canvasCoords = this.screenToCanvas ? 
      this.screenToCanvas(x, y) : 
      { x: x - this.nodesCanvas.getBoundingClientRect().left, y: y - this.nodesCanvas.getBoundingClientRect().top };
    
    this.tempLine.setAttribute('x2', canvasCoords.x);
    this.tempLine.setAttribute('y2', canvasCoords.y);
  }

  endConnection() {
    if (this.tempLine) {
      this.tempLine.remove();
      this.tempLine = null;
    }
    this.isConnecting = false;
    this.connectSource = null;
    
    // Remove document-level listeners
    document.removeEventListener('mousemove', this.boundHandleMouseMove);
    document.removeEventListener('mouseup', this.boundHandleMouseUp);
  }

  createConnection(sourceId, targetId) {
    if (!this.api.botId) return;
    
    this.api.createConnection(sourceId, targetId)
    .then(conn => {
      this.drawConnection(sourceId, targetId, conn.id);
      // Push state AFTER successful connection
      if (this.nodeEditor && this.nodeEditor.undoManager) {
        this.nodeEditor.undoManager.pushState('Create connection');
      }
    })
    .catch(err => console.error('Connection failed:', err));
  }

  drawConnection(sourceId, targetId, connectionId) {
    const sourceNode = this.nodes.get(sourceId);
    const targetNode = this.nodes.get(targetId);
    
    if (!sourceNode || !targetNode) {
      return;
    }
    
    // Remove any existing connection between these nodes before creating new one
    this.removeConnection(sourceId, targetId);
    
    const sourceEl = sourceNode.element;
    const targetEl = targetNode.element;
    
    const sourceAnchor = getOutputAnchor(sourceEl);
    const targetAnchor = getInputAnchor(targetEl);
    
    const startX = parseFloat(sourceEl.style.left) + sourceAnchor.x;
    const startY = parseFloat(sourceEl.style.top) + sourceAnchor.y;
    const endX = parseFloat(targetEl.style.left) + targetAnchor.x;
    const endY = parseFloat(targetEl.style.top) + targetAnchor.y;
    
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    const hitArea = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    
    hitArea.setAttribute('x1', startX);
    hitArea.setAttribute('y1', startY);
    hitArea.setAttribute('x2', endX);
    hitArea.setAttribute('y2', endY);
    hitArea.setAttribute('stroke', HITAREA_STROKE_COLOR);
    hitArea.setAttribute('stroke-width', HITAREA_STROKE_WIDTH);
    hitArea.style.pointerEvents = 'stroke';
    hitArea.dataset.sourceId = sourceId;
    hitArea.dataset.targetId = targetId;
    hitArea.dataset.connectionId = connectionId;
    
    line.setAttribute('x1', startX);
    line.setAttribute('y1', startY);
    line.setAttribute('x2', endX);
    line.setAttribute('y2', endY);
    line.setAttribute('stroke', CONNECTION_STROKE_COLOR);
    line.setAttribute('stroke-width', CONNECTION_STROKE_WIDTH);
    line.style.pointerEvents = 'none';
    line.dataset.sourceId = sourceId;
    line.dataset.targetId = targetId;
    line.dataset.connectionId = connectionId;
    
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'connection-delete-btn';
    deleteBtn.textContent = DELETE_BUTTON_TEXT;
    deleteBtn.style.left = `${midX}px`;
    deleteBtn.style.top = `${midY}px`;
    deleteBtn.dataset.sourceId = sourceId;
    deleteBtn.dataset.targetId = targetId;
    deleteBtn.dataset.connectionId = connectionId;
    
    hitArea.addEventListener('mouseenter', (e) => {
      if (!this.nodes.has(sourceId) || !this.nodes.has(targetId)) return;
      const sourceEl = this.nodes.get(sourceId).element;
      const targetEl = this.nodes.get(targetId).element;
      if (sourceEl.matches(':hover') || targetEl.matches(':hover')) return;
      deleteBtn.style.display = 'block';
    });
    
    hitArea.addEventListener('mouseleave', () => {
      deleteBtn.style.display = 'none';
    });
    
    deleteBtn.addEventListener('mouseenter', () => {
      deleteBtn.style.display = 'block';
    });
    
    deleteBtn.addEventListener('mouseleave', () => {
      deleteBtn.style.display = 'none';
    });
    
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.disconnectNode(sourceId, targetId);
    });
    
    this.connectionsCanvas.appendChild(hitArea);
    this.connectionsCanvas.appendChild(line);
    this.nodesCanvas.appendChild(deleteBtn);
    
    // Store connection in map
    this.connections.set(`${sourceId}-${targetId}`, {
      sourceId,
      targetId,
      connectionId,
      line,
      hitArea,
      deleteBtn
    });
  }

  removeConnection(sourceId, targetId) {
    const key = `${sourceId}-${targetId}`;
    const conn = this.connections.get(key);
    if (!conn) return;
    
    conn.line.remove();
    conn.hitArea.remove();
    conn.deleteBtn.remove();
    
    this.connections.delete(key);
  }

  getConnections() {
    return Array.from(this.connections.values()).map(conn => ({
      source_node_id: conn.sourceId,
      target_node_id: conn.targetId,
      connection_id: conn.connectionId
    }));
  }

  updateConnections() {
    this.connections.forEach((conn) => {
      const sourceNode = this.nodes.get(conn.sourceId);
      const targetNode = this.nodes.get(conn.targetId);
      
      if (!sourceNode || !targetNode) return;
      
      const sourceEl = sourceNode.element;
      const targetEl = targetNode.element;
      
      const sourceAnchor = getOutputAnchor(sourceEl);
      const targetAnchor = getInputAnchor(targetEl);
      
      const startX = parseFloat(sourceEl.style.left) + sourceAnchor.x;
      const startY = parseFloat(sourceEl.style.top) + sourceAnchor.y;
      const endX = parseFloat(targetEl.style.left) + targetAnchor.x;
      const endY = parseFloat(targetEl.style.top) + targetAnchor.y;
      
      conn.line.setAttribute('x1', startX);
      conn.line.setAttribute('y1', startY);
      conn.line.setAttribute('x2', endX);
      conn.line.setAttribute('y2', endY);
      
      conn.hitArea.setAttribute('x1', startX);
      conn.hitArea.setAttribute('y1', startY);
      conn.hitArea.setAttribute('x2', endX);
      conn.hitArea.setAttribute('y2', endY);
      
      const midX = (startX + endX) / 2;
      const midY = (startY + endY) / 2;
      
      conn.deleteBtn.style.left = `${midX}px`;
      conn.deleteBtn.style.top = `${midY}px`;
    });
  }

  disconnectNode(sourceId, targetId) {
    if (!this.api.botId) return;
    
    const conn = this.connections.get(`${sourceId}-${targetId}`);
    if (!conn) return;
    
    this.api.deleteConnection(sourceId, conn.connectionId)
    .then(() => {
      this.removeConnection(sourceId, targetId);
      
      // Push state AFTER successful disconnection
      if (this.nodeEditor && this.nodeEditor.undoManager) {
        this.nodeEditor.undoManager.pushState('Delete connection');
      }
    })
    .catch(err => console.error('Failed to disconnect:', err));
  }
  
  // Cleanup method for when editor is destroyed
  destroy() {
    this.endConnection();
    this.connections.clear();
  }

  // Get all descendant node IDs (children, grandchildren, etc.) from a starting node
  // Uses BFS to traverse the tree, with visited Set to handle DAG structures safely
  getDescendantNodeIds(startNodeId) {
    const descendants = new Set();
    const queue = [startNodeId];
    const visited = new Set();
    
    while (queue.length > 0) {
      const currentId = queue.shift();
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      
      // Find all children (targets of outgoing connections) using Map
      this.connections.forEach((conn) => {
        if (conn.sourceId === currentId && conn.targetId !== startNodeId && !visited.has(conn.targetId)) {
          descendants.add(conn.targetId);
          queue.push(conn.targetId);
        }
      });
    }
    
    return descendants;
  }
  
  // Remove all connections involving a specific node (used when node is deleted)
  removeConnectionsForNode(nodeId) {
    const toRemove = [];
    this.connections.forEach((conn, key) => {
      if (conn.sourceId === nodeId || conn.targetId === nodeId) {
        toRemove.push([conn.sourceId, conn.targetId]);
      }
    });
    toRemove.forEach(([sourceId, targetId]) => {
      this.removeConnection(sourceId, targetId);
    });
  }
}

export default ConnectionManager;