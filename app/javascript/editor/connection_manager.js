// Node dimension constants (fallback only)
const NODE_WIDTH = 100;
const NODE_HEIGHT = 60;

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
  constructor(api, nodesMap, screenToCanvas) {
    this.api = api;
    this.nodes = nodesMap;
    this.screenToCanvas = screenToCanvas;
    this.connectionsCanvas = document.getElementById('connections-canvas');
    this.nodesCanvas = document.getElementById('nodes-canvas');
    
    this.isConnecting = false;
    this.connectSource = null;
    this.tempLine = null;
    
    // Track which connectors already have listeners
    this._elementsWithListeners = new WeakMap();
    
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
    this.tempLine.setAttribute('stroke', '#4CAF50');
    this.tempLine.setAttribute('stroke-width', '3');
    this.tempLine.setAttribute('stroke-dasharray', '5,5');
    
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
    })
    .catch(err => console.error('Connection failed:', err));
  }

  drawConnection(sourceId, targetId, connectionId) {
    const sourceNode = this.nodes.get(sourceId);
    const targetNode = this.nodes.get(targetId);
    
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
    hitArea.setAttribute('stroke', 'transparent');
    hitArea.setAttribute('stroke-width', '20');
    hitArea.style.pointerEvents = 'stroke';
    hitArea.dataset.sourceId = sourceId;
    hitArea.dataset.targetId = targetId;
    hitArea.dataset.connectionId = connectionId;
    
    line.setAttribute('x1', startX);
    line.setAttribute('y1', startY);
    line.setAttribute('x2', endX);
    line.setAttribute('y2', endY);
    line.setAttribute('stroke', '#4CAF50');
    line.setAttribute('stroke-width', '2');
    line.style.pointerEvents = 'none';
    line.dataset.sourceId = sourceId;
    line.dataset.targetId = targetId;
    line.dataset.connectionId = connectionId;
    
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'connection-delete-btn';
    deleteBtn.textContent = '×';
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
  }

  updateConnections() {
    this.connectionsCanvas.querySelectorAll('line:not([stroke="transparent"])').forEach(line => {
      const sourceId = parseInt(line.dataset.sourceId);
      const targetId = parseInt(line.dataset.targetId);
      
      const sourceNode = this.nodes.get(sourceId);
      const targetNode = this.nodes.get(targetId);
      
      if (!sourceNode || !targetNode) return;
      
      const sourceEl = sourceNode.element;
      const targetEl = targetNode.element;
      
      const sourceAnchor = getOutputAnchor(sourceEl);
      const targetAnchor = getInputAnchor(targetEl);
      
      const startX = parseFloat(sourceEl.style.left) + sourceAnchor.x;
      const startY = parseFloat(sourceEl.style.top) + sourceAnchor.y;
      const endX = parseFloat(targetEl.style.left) + targetAnchor.x;
      const endY = parseFloat(targetEl.style.top) + targetAnchor.y;
      
      line.setAttribute('x1', startX);
      line.setAttribute('y1', startY);
      line.setAttribute('x2', endX);
      line.setAttribute('y2', endY);
      
      // Update hit area (transparent line)
      const hitArea = this.connectionsCanvas.querySelector(`line[stroke="transparent"][data-source-id="${sourceId}"][data-target-id="${targetId}"]`);
      if (hitArea) {
        hitArea.setAttribute('x1', startX);
        hitArea.setAttribute('y1', startY);
        hitArea.setAttribute('x2', endX);
        hitArea.setAttribute('y2', endY);
      }
      
      const midX = (startX + endX) / 2;
      const midY = (startY + endY) / 2;
      
      const deleteBtn = document.querySelector(`.connection-delete-btn[data-source-id="${sourceId}"][data-target-id="${targetId}"]`);
      if (deleteBtn) {
        deleteBtn.style.left = `${midX}px`;
        deleteBtn.style.top = `${midY}px`;
      }
    });
  }

  disconnectNode(sourceId, targetId) {
    if (!this.api.botId) return;
    
    const line = document.querySelector(`line[data-source-id="${sourceId}"][data-target-id="${targetId}"]`);
    const connectionId = line?.dataset.connectionId;
    if (!connectionId) return;
    
    this.api.deleteConnection(sourceId, connectionId)
    .then(() => {
      document.querySelectorAll(
        `line[data-source-id="${sourceId}"][data-target-id="${targetId}"], ` +
        `.connection-delete-btn[data-source-id="${sourceId}"][data-target-id="${targetId}"]`
      ).forEach(el => el.remove());
    })
    .catch(err => console.error('Failed to disconnect:', err));
  }
  
  // Cleanup method for when editor is destroyed
  destroy() {
    this.endConnection();
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
      
      // Find all children (targets of outgoing connections)
      const childLines = this.connectionsCanvas.querySelectorAll(`line[data-source-id="${currentId}"]`);
      childLines.forEach(line => {
        const childId = parseInt(line.dataset.targetId);
        if (childId !== startNodeId && !visited.has(childId)) {
          descendants.add(childId);
          queue.push(childId);
        }
      });
    }
    
    return descendants;
  }
}

export default ConnectionManager;