import EditorApi from "editor/api";
import NodeFormHandler from "editor/form_handler";
import ConnectionManager from "editor/connection_manager";
import DragManager from "editor/drag_manager";

// Positioning constants
const MIN_NODE_DISTANCE = 120;
const INITIAL_POSITION_RANGE = 200;
const MAX_PLACEMENT_ATTEMPTS = 50;

// Zoom constants
const ZOOM_MIN = 0.01;
const ZOOM_MAX = 2.0;
const ZOOM_STEP = 0.1;
const ZOOM_DEFAULT = 1.0;

// Base canvas dimensions (actual working area at 100% zoom)
const BASE_CANVAS_WIDTH = 3000;
const BASE_CANVAS_HEIGHT = 2000;

// Minimum visible canvas size (at max zoom)
const MIN_CANVAS_WIDTH = 1500;
const MIN_CANVAS_HEIGHT = 1000;

// Node dimensions for positioning calculations
const NODE_WIDTH = 100;
const NODE_HEIGHT = 60;

class NodeEditor {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.nodesCanvas = document.getElementById('nodes-canvas');
    this.connectionsCanvas = document.getElementById('connections-canvas');
    this.canvasContainer = document.querySelector('.canvas-container');
    this.botId = this.nodesCanvas?.dataset.botId;

    this.api = new EditorApi(this.botId);

    this.nodes = new Map();
    this.currentTool = 'select';
    this.zoomLevel = ZOOM_DEFAULT;
    
    this.formHandler = new NodeFormHandler(this.api, this.nodes);
    this.connectionManager = new ConnectionManager(this.api, this.nodes, this);
    this.dragManager = new DragManager(this.nodes, this.nodesCanvas, this.api, this.connectionManager, this);
    
    // Store bound handlers for cleanup
    this.boundHandleMouseDown = this.handleMouseDown.bind(this);
    
    // Set up drag callbacks
    this.dragManager.setCallbacks({
      onDragStart: (nodeId) => {
        const node = this.nodes.get(nodeId);
        this.openEditor(nodeId);
      }
    });

    this.init();
  }

  init() {
    this.loadNodes();
    this.setupEventListeners();
    // Center the view on loaded nodes after a brief delay to ensure DOM is ready
    setTimeout(() => this.centerViewOnNodes(), 100);
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
    this.connectionManager.loadConnections();
    this.connectionManager.drawExistingConnections();
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

    // Zoom controls
    const zoomInBtn = document.getElementById('zoom-in');
    const zoomOutBtn = document.getElementById('zoom-out');
    const zoomResetBtn = document.getElementById('zoom-reset');
    
    if (zoomInBtn) zoomInBtn.addEventListener('click', () => this.zoomIn());
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => this.zoomOut());
    if (zoomResetBtn) zoomResetBtn.addEventListener('click', () => this.zoomReset());

    document.addEventListener('mousedown', this.boundHandleMouseDown);
  }

  zoomIn() {
    if (this.zoomLevel < ZOOM_MAX) {
      this.zoomLevel = Math.min(ZOOM_MAX, this.zoomLevel + ZOOM_STEP);
      this.applyZoom();
    }
  }

  zoomOut() {
    if (this.zoomLevel > ZOOM_MIN) {
      this.zoomLevel = Math.max(ZOOM_MIN, this.zoomLevel - ZOOM_STEP);
      this.applyZoom();
    }
  }

  zoomReset() {
    this.zoomLevel = ZOOM_DEFAULT;
    this.applyZoom();
  }

  applyZoom() {
    // Calculate canvas dimensions inversely proportional to zoom
    // At 50% zoom: 2x the dimensions (showing 4x more workspace)
    // At 200% zoom: half the dimensions (focusing on area)
    const scaleFactor = ZOOM_DEFAULT / this.zoomLevel;
    const canvasWidth = Math.max(MIN_CANVAS_WIDTH, BASE_CANVAS_WIDTH * scaleFactor);
    const canvasHeight = Math.max(MIN_CANVAS_HEIGHT, BASE_CANVAS_HEIGHT * scaleFactor);
    
    // Resize the canvas layers to provide more working space
    if (this.nodesCanvas) {
      this.nodesCanvas.style.width = `${canvasWidth}px`;
      this.nodesCanvas.style.height = `${canvasHeight}px`;
      // Scale the content inside (makes nodes smaller when zoomed out)
      this.nodesCanvas.style.transform = `scale(${this.zoomLevel})`;
      this.nodesCanvas.style.transformOrigin = 'top left';
    }
    
    if (this.connectionsCanvas) {
      this.connectionsCanvas.style.width = `${canvasWidth}px`;
      this.connectionsCanvas.style.height = `${canvasHeight}px`;
      this.connectionsCanvas.setAttribute('width', canvasWidth);
      this.connectionsCanvas.setAttribute('height', canvasHeight);
      // Scale the SVG content
      this.connectionsCanvas.style.transform = `scale(${this.zoomLevel})`;
      this.connectionsCanvas.style.transformOrigin = 'top left';
    }
    
    // Update zoom display
    const zoomDisplay = document.getElementById('zoom-level');
    if (zoomDisplay) {
      zoomDisplay.textContent = `${Math.round(this.zoomLevel * 100)}%`;
    }
  }

  // Calculate bounding box of all nodes and center the view
  centerViewOnNodes() {
    if (this.nodes.size === 0) return;
    
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    // Find the bounding box of all nodes
    this.nodes.forEach((node) => {
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x);
      maxY = Math.max(maxY, node.position.y);
    });
    
    // Add padding around nodes
    const padding = 100;
    minX -= padding;
    minY -= padding;
    maxX += padding + NODE_WIDTH; // Account for node width
    maxY += padding + NODE_HEIGHT; // Account for node height
    
    // Get viewport dimensions
    const containerRect = this.canvasContainer.getBoundingClientRect();
    const viewportWidth = containerRect.width;
    const viewportHeight = containerRect.height;
    
    // Calculate zoom level to fit all nodes
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const zoomX = viewportWidth / contentWidth;
    const zoomY = viewportHeight / contentHeight;
    
    // Use the smaller zoom to ensure everything fits, but cap at ZOOM_DEFAULT (100%)
    // Don't zoom in beyond 100%, but allow zooming out to fit spread-out nodes
    const fitZoom = Math.min(zoomX, zoomY);
    this.zoomLevel = Math.max(ZOOM_MIN, Math.min(fitZoom * 0.9, ZOOM_DEFAULT));
    
    // Apply the zoom (this resizes the canvas and scales content)
    this.applyZoom();
    
    // Calculate center of bounding box
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    // Wait for DOM to update after zoom, then scroll
    requestAnimationFrame(() => {
      // Calculate scroll position to center on nodes
      // After zoom is applied, we need to scroll the scaled coordinates into view
      const scaledCenterX = centerX * this.zoomLevel;
      const scaledCenterY = centerY * this.zoomLevel;
      
      const scrollLeft = scaledCenterX - (viewportWidth / 2);
      const scrollTop = scaledCenterY - (viewportHeight / 2);
      
      // Apply scroll
      this.canvasContainer.scrollLeft = Math.max(0, scrollLeft);
      this.canvasContainer.scrollTop = Math.max(0, scrollTop);
    });
  }

  // Convert screen coordinates to canvas coordinates (accounting for zoom)
  screenToCanvas(screenX, screenY) {
    const rect = this.canvasContainer.getBoundingClientRect();
    return {
      x: (screenX - rect.left) / this.zoomLevel,
      y: (screenY - rect.top) / this.zoomLevel
    };
  }

  // Convert canvas coordinates to screen coordinates
  canvasToScreen(canvasX, canvasY) {
    const rect = this.canvasContainer.getBoundingClientRect();
    return {
      x: canvasX * this.zoomLevel + rect.left,
      y: canvasY * this.zoomLevel + rect.top
    };
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
      this.dragManager.startDrag(e, clickedNodeId);
      e.preventDefault();
    } else if (!nodeEl) {
      this.closeEditor();
    }
  }

  startConnection(e, nodeId) {
    this.connectionManager.startConnection(e, nodeId);
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
    
    this.nodesCanvas.appendChild(nodeEl);
    this.nodes.set(node.id, {
      element: nodeEl,
      type: node.node_type,
      position: { x: node.position_x, y: node.position_y }
    });
    
    this.connectionManager.loadConnections();
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
    let x = 100 + Math.random() * INITIAL_POSITION_RANGE;
    let y = 100 + Math.random() * INITIAL_POSITION_RANGE;
    let attempts = 0;
    
    while (attempts < MAX_PLACEMENT_ATTEMPTS) {
      let overlapping = false;
      
      for (const node of this.nodes.values()) {
        const dx = node.position.x - x;
        const dy = node.position.y - y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < MIN_NODE_DISTANCE) {
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
  
  // Cleanup method to remove all event listeners
  destroy() {
    document.removeEventListener('mousedown', this.boundHandleMouseDown);
    
    // Clean up managers
    this.dragManager.destroy();
    this.connectionManager.destroy();
    
    // Clear nodes map
    this.nodes.clear();
  }
}

export default NodeEditor;

document.addEventListener('turbo:load', () => {
  // Destroy previous instance if it exists
  if (window.nodeEditor) {
    window.nodeEditor.destroy();
    window.nodeEditor = null;
  }
  
  if (document.getElementById('nodes-canvas')) {
    window.nodeEditor = new NodeEditor('nodes-canvas');
  }
});