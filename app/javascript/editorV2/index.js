// index.js
// Entry point for editorV2
// Wires together all components with explicit dependency injection

import Store from './state/Store.js'
import History from './state/History.js'
import API from './api.js'
import SyncManager from './sync/SyncManager.js'
import NodeRenderer from './rendering/NodeRenderer.js'
import ConnectionRenderer from './rendering/ConnectionRenderer.js'
import CanvasViewport from './rendering/CanvasViewport.js'
import DragHandler from './handlers/DragHandler.js'
import ConnectionHandler from './handlers/ConnectionHandler.js'
import ClickHandler from './handlers/ClickHandler.js'
import KeyboardHandler from './handlers/KeyboardHandler.js'
import { MAX_HISTORY } from './constants.js'
import { showError } from './utils/errors.js'
import ToolbarHandler from './handlers/ToolbarHandler.js'

/**
 * Initialize the node editor
 * @param {number} botId - Bot ID to load
 * @param {HTMLElement} container - Container element for nodes
 * @param {SVGSVGElement} svgContainer - SVG element for connections
 * @param {HTMLElement} editorPanel - Editor panel element (optional)
 * @returns {Promise<Object>} API for external access
 */
export async function initEditor(botId, container, svgContainer, editorPanel = null) {
  console.log('Initializing editorV2 for bot', botId)
  
  // Validate required elements
  if (!container) {
    throw new Error('Container element is required')
  }
  if (!svgContainer) {
    throw new Error('SVG container element is required')
  }

  const workspace = document.getElementById('canvas-workspace')
  const scene = document.getElementById('canvas-scene')
  const canvasContainer = container.closest('.canvas-container')

  if (!workspace || !scene || !canvasContainer) {
    throw new Error('Canvas viewport elements are required')
  }
  
  // 1. Initialize core components (explicit dependencies, no circular refs)
  const api = new API(botId)
  const store = new Store()
  const history = new History(store, MAX_HISTORY)
  const syncManager = new SyncManager(store, history, api)
  const canvasViewport = new CanvasViewport(
    canvasContainer,
    workspace,
    scene,
    container,
    svgContainer,
    store
  )
  
  // 2. Initialize renderers BEFORE loading data (so they receive GRAPH_REPLACE event)
  const nodeRenderer = new NodeRenderer(container, store, api)
  const connectionRenderer = new ConnectionRenderer(svgContainer, store, canvasViewport)
  connectionRenderer.container = container
  
  // 3. Load existing bot data
  let initialGraph
  try {
    initialGraph = await syncManager.loadBot()
    console.log(`Loaded ${initialGraph.nodes.size} nodes and ${initialGraph.connections.size} connections`)
  } catch (error) {
    showError('Failed to load bot data. Please refresh the page.')
    console.error('Failed to load bot:', error)
    throw error
  }
  
// 4. Initialize handlers (pass history explicitly)
  const dragHandler = new DragHandler(store, syncManager, history, canvasViewport)
  const connectionHandler = new ConnectionHandler(store, syncManager, connectionRenderer, canvasViewport)
  const clickHandler = new ClickHandler(store, history, editorPanel)
  const keyboardHandler = new KeyboardHandler(store, history, syncManager)
  const toolbarHandler = new ToolbarHandler(store, history, syncManager, container, clickHandler, canvasViewport)
  
  // Set syncManager on clickHandler for delete
  clickHandler.setSyncManager(syncManager)
  
  // Setup click handler global handlers
  clickHandler.setupGlobalHandlers()
  
  // Setup keyboard handler
  keyboardHandler.attach()
  
  // Setup toolbar handler
  toolbarHandler.attach()
  
  // Wire up selection callbacks to update toolbar delete button
  clickHandler.onNodeSelected = () => toolbarHandler.updateButtons()
  clickHandler.onNodeDeselected = () => toolbarHandler.updateButtons()
  
  // Setup connection delete handler (on canvas-container, where delete buttons are appended)
  const deleteButtonContainer = svgContainer.parentElement
  connectionHandler.setupDeleteHandler(deleteButtonContainer)
  
  // 5. Helper functions for attaching handlers to nodes
  function attachHandlersToNode(element, clientId) {
    dragHandler.attach(element, clientId)
    connectionHandler.attach(element, clientId)
    clickHandler.attach(element, clientId)
  }
  
  function attachHandlersToAllNodes() {
    store.getNodes().forEach(node => {
      const element = container.querySelector(`[data-client-id="${node.clientId}"]`)
      if (element) {
        attachHandlersToNode(element, node.clientId)
      }
    })
  }
  
  // 6. Attach handlers to initial nodes (rendered by NodeRenderer during loadBot)
  initialGraph.nodes.forEach((node, clientId) => {
    setTimeout(() => {
      const element = container.querySelector(`[data-client-id="${clientId}"]`)
      if (element) {
        attachHandlersToNode(element, clientId)
      }
    }, 0)
  })
  
  // 7. Subscribe to store events for handler re-attachment
  store.subscribe((event, data) => {
    // New nodes need handlers attached
    if (event === 'node:add') {
      setTimeout(() => {
        const element = container.querySelector(`[data-client-id="${data.clientId}"]`)
        if (element) {
          attachHandlersToNode(element, data.clientId)
        }
      }, 0)
    }
    
    // Undo/redo or graph replacement requires re-attaching all handlers
    if (event === 'graph:replace' || event === 'graph:restore') {
      setTimeout(() => {
        attachHandlersToAllNodes()
      }, 0)
    }
  })
  
  // 7. Initialize undo/redo UI callback
  history.setUpdateUICallback(() => {
    updateUndoRedoUI(history)
  })
  
  updateUndoRedoUI(history)
  requestAnimationFrame(() => {
    canvasViewport.fitToGraph()
  })
  
  // 8. Return public API
  return {
    store,
    history,
    syncManager,
    api,
    nodeRenderer,
    connectionRenderer,
    canvasViewport,
    dragHandler,
    connectionHandler,
    clickHandler,
    keyboardHandler,
    ToolbarHandler,
    
    // Convenience methods
    createNode: (type, position, data) => syncManager.createNode(type, position, data),
    deleteNode: (clientId) => syncManager.deleteNode(clientId),
    createConnection: (sourceId, targetId) => syncManager.createConnection(sourceId, targetId),
    deleteConnection: (clientId) => syncManager.deleteConnection(clientId),
    updateNodeData: (clientId, data) => syncManager.updateNodeData(clientId, data),
    
    // Undo/redo - async because they sync with server
    undo: async () => {
      await syncManager.undo()
      updateUndoRedoUI(history)
    },
    redo: async () => {
      await syncManager.redo()
      updateUndoRedoUI(history)
    },
    canUndo: () => history.canUndo() && !syncManager.isUndoRedoPending,
    canRedo: () => history.canRedo() && !syncManager.isUndoRedoPending,
    
    // Selection
    getSelectedNode: () => clickHandler.getSelectedNodeId(),
    getEditingNode: () => clickHandler.getEditingNodeId(),
    
    // Cleanup
    destroy: () => {
      nodeRenderer.destroy()
      connectionRenderer.destroy()
      canvasViewport.destroy()
      dragHandler.destroy()
      connectionHandler.destroy()
      clickHandler.destroy()
      keyboardHandler.destroy()
      store.destroy()
    }
  }
}

/**
 * Update undo/redo button UI
 * @param {History} history - History instance
 */
function updateUndoRedoUI(history) {
  const undoBtn = document.querySelector('.btn-undo')
  const redoBtn = document.querySelector('.btn-redo')
  const countDisplay = document.querySelector('.undo-count')
  
  // Get syncManager from global or passed context
  // Note: syncManager is not passed here, so we need to check the loading state differently
  // The buttons will be updated via KeyboardHandler.updateUndoRedoUI() which has access to syncManager
  
  if (undoBtn) {
    undoBtn.disabled = !history.canUndo()
  }
  if (redoBtn) {
    redoBtn.disabled = !history.canRedo()
  }
  if (countDisplay) {
    countDisplay.textContent = history.getHistoryDisplay()
  }
}

// Expose globally for Rails views
window.initEditor = initEditor

console.log('editorV2 loaded')
