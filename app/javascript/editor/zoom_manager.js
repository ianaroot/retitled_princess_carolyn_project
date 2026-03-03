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

class ZoomManager {
  constructor(nodesCanvas, connectionsCanvas, canvasContainer) {
    this.nodesCanvas = nodesCanvas;
    this.connectionsCanvas = connectionsCanvas;
    this.canvasContainer = canvasContainer;
    this.zoomLevel = ZOOM_DEFAULT;
    
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    const zoomInBtn = document.getElementById('zoom-in');
    const zoomOutBtn = document.getElementById('zoom-out');
    const zoomResetBtn = document.getElementById('zoom-reset');
    
    if (zoomInBtn) zoomInBtn.addEventListener('click', () => this.zoomIn());
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => this.zoomOut());
    if (zoomResetBtn) zoomResetBtn.addEventListener('click', () => this.zoomReset());
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
  
  getZoomLevel() {
    return this.zoomLevel;
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
  centerViewOnNodes(nodes) {
    if (nodes.size === 0) return;
    
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    // Find the bounding box of all nodes
    nodes.forEach((node) => {
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
}

export default ZoomManager;
