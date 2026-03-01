import EditorApi from "editor/api";
import NodeFormHandler from "editor/form_handler";

class NodeEditor {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.nodesCanvas = document.getElementById('nodes-canvas');
    this.botId = this.nodesCanvas?.dataset.botId;

    this.api = new EditorApi(this.botId);

    this.nodes = new Map();
    this.connections = [];
    this.selectedNode = null;
    this.currentTool = 'select';
    this.isDragging = false;
    this.positionChanged = false;
    this.isConnecting = false;
    this.connectSource = null;
    this.dragOffset = { x: 0, y: 0 };
    
    this.formHandler = new NodeFormHandler(this.api, this.nodes);

    this.init();
  }

  init() {
    this.loadNodes();
    this.setupEventListeners();
    this.setupPaletteDrag();
  }

  loadNodes() {
    document.querySelectorAll('.node').forEach(nodeEl => {
      const id = parseInt(nodeEl.dataset.id);
      this.nodes.set(id, {
        element: nodeEl,
        type: nodeEl.dataset.type,
        position: { 
          x: parseFloat(nodeEl.style.left), 
          y: parseFloat(nodeEl.style.top) 
        }
      });
    });
    this.loadConnections();
    this.drawExistingConnections();
  }

  ensureNodeSpacing() {
    const MIN_DISTANCE = 120;
    const nodesArray = Array.from(this.nodes.values());
    
    for (let i = 0; i < nodesArray.length; i++) {
      for (let j = i + 1; j < nodesArray.length; j++) {
        const nodeA = nodesArray[i];
        const nodeB = nodesArray[j];
        
        const dx = nodeA.position.x - nodeB.position.x;
        const dy = nodeA.position.y - nodeB.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < MIN_DISTANCE) {
          nodeB.position.x = nodeA.position.x + MIN_DISTANCE;
          nodeB.position.y = nodeA.position.y;
          nodeB.element.style.left = `${nodeB.position.x}px`;
          nodeB.element.style.top = `${nodeB.position.y}px`;
          
          this.saveNodePosition(parseInt(nodeB.element.dataset.id), nodeB.position.x, nodeB.position.y);
        }
      }
    }
  }

  drawExistingConnections() {
    const svg = document.getElementById('connections-canvas');
    const connectionsData = svg?.dataset.connections;
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

  loadConnections() {
    this.nodes.forEach((node, id) => {
      const output = node.element.querySelector('.output');
      
      if (output) {
        output.addEventListener('mousedown', (e) => this.startConnection(e, id));
      }
    });
  }

  setupEventListeners() {
    document.querySelectorAll('.tool-select, .tool-delete').forEach(btn => {
      btn.addEventListener('click', (e) => this.setTool(e.target.dataset.tool));
    });

    const addButtons = document.querySelectorAll('.btn-add-node');
    addButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.addNode(e.target.dataset.type);
      });
    });

    document.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    document.addEventListener('mouseup', (e) => this.handleMouseUp(e));
  }

  setupPaletteDrag() {
    document.querySelectorAll('.palette-item').forEach(item => {
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('nodeType', item.dataset.type);
      });
    });

    this.nodesCanvas.addEventListener('dragover', (e) => e.preventDefault());
    this.nodesCanvas.addEventListener('drop', (e) => this.handleDrop(e));
  }

  setTool(tool) {
    this.currentTool = tool;
    document.querySelectorAll('.tool-select, .tool-delete').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === tool);
    });
  }

  handleMouseDown(e) {
    const nodeEl = e.target.closest('.node');
    const editorPanel = document.getElementById('node-editor-panel');
    const clickedOnEditor = editorPanel && editorPanel.contains(e.target);
    
    if (clickedOnEditor) {
      return;
    }
    
    if (this.currentTool === 'delete' && nodeEl) {
      this.deleteNode(parseInt(nodeEl.dataset.id));
      return;
    }

    if (this.currentTool === 'select' && nodeEl) {
      const clickedNodeId = parseInt(nodeEl.dataset.id);
      this.selectedNode = clickedNodeId;
      this.isDragging = true;
      this.positionChanged = false;
      const rect = nodeEl.getBoundingClientRect();
      const canvasRect = this.nodesCanvas.getBoundingClientRect();
      this.dragOffset = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
      
      const node = this.nodes.get(clickedNodeId);
      this.openEditor(clickedNodeId);
      this.showPaletteForNode(node.type);
      
      e.preventDefault();
    } else if (!nodeEl) {
      this.hideAllPalettes();
      this.closeEditor();
      this.selectedNode = null;
    }
  }

  hideAllPalettes() {
    document.querySelectorAll('.palette-section').forEach(section => {
      section.classList.remove('visible');
    });
  }

  showPaletteForNode(nodeType) {
    this.hideAllPalettes();
    if (nodeType === 'condition') {
      const sections = document.querySelectorAll('.palette-section');
      if (sections[0]) sections[0].classList.add('visible');
    } else if (nodeType === 'action') {
      const sections = document.querySelectorAll('.palette-section');
      if (sections[1]) sections[1].classList.add('visible');
    }
  }

  handleMouseMove(e) {
    if (this.isDragging && this.selectedNode) {
      const node = this.nodes.get(this.selectedNode);
      const canvasRect = this.nodesCanvas.getBoundingClientRect();
      
      node.position.x = e.clientX - canvasRect.left - this.dragOffset.x;
      node.position.y = e.clientY - canvasRect.top - this.dragOffset.y;
      
      node.element.style.left = `${node.position.x}px`;
      node.element.style.top = `${node.position.y}px`;
      
      this.positionChanged = true;
      
      this.updateConnections();
    }

    if (this.isConnecting) {
      this.updateConnectionLine(e.clientX, e.clientY);
    }
  }

  handleMouseUp(e) {
    if (this.isDragging && this.selectedNode) {
      const node = this.nodes.get(this.selectedNode);
      if (this.positionChanged) {
        this.saveNodePosition(this.selectedNode, node.position.x, node.position.y);
      }
    }
    this.isDragging = false;
    this.positionChanged = false;
    this.selectedNode = null;

    if (this.isConnecting) {
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
  }

  startConnection(e, nodeId) {
    this.isConnecting = true;
    this.connectSource = { nodeId };
    e.stopPropagation();
    e.preventDefault();
    
    this.createTempLine(e.clientX, e.clientY);
  }

  createTempLine(x, y) {
    const svg = document.getElementById('connections-canvas');
    this.tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    const sourceNode = this.nodes.get(this.connectSource.nodeId);
    const sourceEl = sourceNode.element;
    const nodesCanvasRect = this.nodesCanvas.getBoundingClientRect();
    
    const startX = parseFloat(sourceEl.style.left) + 100;
    const startY = parseFloat(sourceEl.style.top) + 30;
    
    this.tempLine.setAttribute('x1', startX);
    this.tempLine.setAttribute('y1', startY);
    this.tempLine.setAttribute('x2', x - nodesCanvasRect.left);
    this.tempLine.setAttribute('y2', y - nodesCanvasRect.top);
    this.tempLine.setAttribute('stroke', '#4CAF50');
    this.tempLine.setAttribute('stroke-width', '3');
    this.tempLine.setAttribute('stroke-dasharray', '5,5');
    
    svg.appendChild(this.tempLine);
  }

  updateConnectionLine(x, y) {
    if (!this.tempLine) return;
    
    const nodesCanvasRect = this.nodesCanvas.getBoundingClientRect();
    this.tempLine.setAttribute('x2', x - nodesCanvasRect.left);
    this.tempLine.setAttribute('y2', y - nodesCanvasRect.top);
  }

  endConnection() {
    if (this.tempLine) {
      this.tempLine.remove();
      this.tempLine = null;
    }
    this.isConnecting = false;
    this.connectSource = null;
  }
  
  createConnection(sourceId, targetId) {
    if (!this.botId) return;
    
    this.api.createConnection(sourceId, targetId)
    .then(conn => {
      this.drawConnection(sourceId, targetId, conn.id);
    })
    .catch(err => console.error('Connection failed:', err));
  }

  drawConnection(sourceId, targetId, connectionId) {
    const svg = document.getElementById('connections-canvas');
    const sourceNode = this.nodes.get(sourceId);
    const targetNode = this.nodes.get(targetId);
    
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    const startX = parseFloat(sourceNode.element.style.left) + 100;
    const startY = parseFloat(sourceNode.element.style.top) + 30;
    const endX = parseFloat(targetNode.element.style.left);
    const endY = parseFloat(targetNode.element.style.top) + 30;
    
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
    
    svg.appendChild(hitArea);
    svg.appendChild(line);
    this.nodesCanvas.appendChild(deleteBtn);
  }

  updateConnections() {
    const svg = document.getElementById('connections-canvas');
    svg.querySelectorAll('line').forEach(line => {
      const sourceId = parseInt(line.dataset.sourceId);
      const targetId = parseInt(line.dataset.targetId);
      
      const sourceNode = this.nodes.get(sourceId);
      const targetNode = this.nodes.get(targetId);
      
      if (!sourceNode || !targetNode) return;
      
      const startX = parseFloat(sourceNode.element.style.left) + 100;
      const startY = parseFloat(sourceNode.element.style.top) + 30;
      const endX = parseFloat(targetNode.element.style.left);
      const endY = parseFloat(targetNode.element.style.top) + 30;
      
      line.setAttribute('x1', startX);
      line.setAttribute('y1', startY);
      line.setAttribute('x2', endX);
      line.setAttribute('y2', endY);
      
      const midX = (startX + endX) / 2;
      const midY = (startY + endY) / 2;
      
      const deleteBtn = document.querySelector('.connection-delete-btn[data-source-id="' + sourceId + '"][data-target-id="' + targetId + '"]');
      if (deleteBtn) {
        deleteBtn.style.left = midX + 'px';
        deleteBtn.style.top = midY + 'px';
      }
    });
  }

  renderNode(node) {
    const nodeEl = document.createElement('div');
    nodeEl.className = `node ${node.node_type}`;
    nodeEl.dataset.id = node.id;
    nodeEl.dataset.type = node.node_type;
    nodeEl.style.left = `${node.position_x}px`;
    nodeEl.style.top = `${node.position_y}px`;
    
    nodeEl.innerHTML = `
      <div class="node-content">
        <div class="node-preview">Configure...</div>
      </div>
      <div class="node-connector input"></div>
      <div class="node-connector output"></div>
    `;
    
    nodeEl.addEventListener('dblclick', () => this.openEditor(node));
    
    this.nodesCanvas.appendChild(nodeEl);
    this.nodes.set(node.id, {
      element: nodeEl,
      type: node.node_type,
      position: { x: node.position_x, y: node.position_y }
    });
    
    this.loadConnections();
  }

  deleteNode(nodeId) {
    if (!this.botId) return;
    
    if (confirm('Delete this node?')) {
      this.api.deleteNode(nodeId)
      .then(() => {
        const node = this.nodes.get(nodeId);
        node.element.remove();
        this.nodes.delete(nodeId);
        
        document.querySelectorAll(
          `line[data-source-id="${nodeId}"], ` +
          `line[data-target-id="${nodeId}"], ` +
          `.connection-delete-btn[data-source-id="${nodeId}"], ` +
          `.connection-delete-btn[data-target-id="${nodeId}"]`
        ).forEach(el => el.remove());
      })
      .catch(err => console.error('Failed to delete node:', err));
    }
  }

  disconnectNode(sourceId, targetId) {
    if (!this.botId) return;
    
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

  openEditor(nodeOrId) {
    this.formHandler.openEditor(nodeOrId);
  }

  closeEditor() {
    this.formHandler.closeEditor();
  }

  saveNodePosition(nodeId, x, y) {
    if (!this.botId) return;
    
    this.api.updateNodePosition(nodeId, x, y)
    .catch(err => console.error('Failed to update position:', err));
  }

  addNode(type) {
    const { x, y } = this.findNonOverlappingPosition();
    this.createNode(type, x, y);
  }

  createNode(nodeType, x, y) {
    if (!this.botId) return;
    
    const nodeData = {
      node_type: nodeType,
      position_x: x,
      position_y: y
    };
    
    if (nodeType === 'action') {
      nodeData.data = { action_type: 'move' };
    }
    
    this.api.createNode(nodeData)
    .then(node => {
      this.renderNode(node);
    })
    .catch(err => console.error('Failed to create node:', err));
  }

  findNonOverlappingPosition() {
    const MIN_DISTANCE = 120;
    let x = 100 + Math.random() * 200;
    let y = 100 + Math.random() * 200;
    let attempts = 0;
    const maxAttempts = 50;
    
    while (attempts < maxAttempts) {
      let overlapping = false;
      
      for (const node of this.nodes.values()) {
        const dx = node.position.x - x;
        const dy = node.position.y - y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < MIN_DISTANCE) {
          overlapping = true;
          break;
        }
      }
      
      if (!overlapping) {
        return { x, y };
      }
      
      x = 100 + Math.random() * 400;
      y = 100 + Math.random() * 400;
      attempts++;
    }
    
    return { x, y };
  }
}

export default NodeEditor;

document.addEventListener('turbo:load', () => {
  if (document.getElementById('nodes-canvas')) {
    window.nodeEditor = new NodeEditor('nodes-canvas');
  }
});
