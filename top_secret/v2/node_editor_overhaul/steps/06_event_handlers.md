# Step 06: Event Handlers

## Goal

Handle user interactions and translate to state changes.

## Files to Create

```
app/javascript/editorV2/
└── handlers/
    ├── DragHandler.js
    ├── ConnectionHandler.js
    ├── ClickHandler.js
    └── KeyboardHandler.js (covered in Step 08)
```

## Dependencies

- Step 02: State Manager (Store)
- Step 03: History
- Step 04: Sync Layer (SyncManager)
- Step 05: Rendering Layer (NodeRenderer, ConnectionRenderer)

## Implementation

### DragHandler.js

Handles node drag operations with optimistic updates.

**IMPORTANT:** Pre-binds event handlers in constructor to fix removeEventListener bug.

```javascript
// handlers/DragHandler.js

/**
 * Handles node drag operations
 * - Tracks drag state
 * - Updates positions optimistically
 * - Syncs with server on drag end
 * - Pushes to history on drag end
 */
class DragHandler {
  constructor(store, syncManager, history) {
    this.store = store
    this.syncManager = syncManager
    this.history = history
    
    // Pre-bind handlers in constructor (fixes removeEventListener bug)
    this.boundHandleMouseMove = this.handleMouseMove.bind(this)
    this.boundHandleMouseUp = this.handleMouseUp.bind(this)
    
    this.dragging = null          // Currently dragged node clientId
    this.startPosition = null      // Original position before drag
    this.offset = null             // Mouse offset from node top-left
    this.hasMoved = false          // Whether drag has actually moved
  }
  
  /**
   * Attach drag handlers to a node element
   * @param {HTMLElement} element - Node element
   * @param {string} clientId - Node client ID
   */
  attach(element, clientId) {
    element.addEventListener('mousedown', (e) => this.handleMouseDown(e, clientId, element))
  }
  
  /**
   * Handle mouse down on node
   */
  handleMouseDown(event, clientId, element) {
    // Only left click
    if (event.button !== 0) return
    
    // Don't interfere with connector clicks
    if (event.target.classList.contains('node-connector')) return
    
    const node = this.store.getNode(clientId)
    if (!node) return
    
    event.preventDefault()
    
    // Store drag state
    this.dragging = clientId
    this.startPosition = { ...node.position }
    this.hasMoved = false
    
    // Calculate offset (where in the node the mouse clicked)
    const rect = element.getBoundingClientRect()
    this.offset = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    }
    
    // Add pre-bound handlers (same references for remove)
    document.addEventListener('mousemove', this.boundHandleMouseMove)
    document.addEventListener('mouseup', this.boundHandleMouseUp)
    
    // Add dragging class for visual feedback
    element.classList.add('dragging')
  }
  
  /**
   * Handle mouse move during drag
   */
  handleMouseMove(event) {
    if (!this.dragging) return
    
    const node = this.store.getNode(this.dragging)
    if (!node) return
    
    // Calculate new position (canvas coordinates)
    const canvas = document.getElementById('nodes-canvas')
    const canvasRect = canvas?.getBoundingClientRect()
    if (!canvasRect) {
      return  // Canvas not in DOM
    }
    
    const newX = event.clientX - canvasRect.left - this.offset.x
    const newY = event.clientY - canvasRect.top - this.offset.y
    
    // Snap to grid (optional)
    const snappedX = Math.round(newX / 10) * 10
    const snappedY = Math.round(newY / 10) * 10
    
    // Check if actually moved
    if (snappedX !== node.position.x || snappedY !== node.position.y) {
      this.hasMoved = true
    }
    
    // Optimistic update (immediate UI change)
    this.store.updateNode(this.dragging, {
      position: { x: snappedX, y: snappedY }
    })
  }
  
  /**
   * Handle mouse up (drag end)
   */
  handleMouseUp(event) {
    if (!this.dragging) return
    
    const clientId = this.dragging
    const node = this.store.getNode(clientId)
    
    // Remove dragging class
    const element = document.querySelector(`.node[data-client-id="${clientId}"]`)
    if (element) {
      element.classList.remove('dragging')
    }
    
    // Remove pre-bound handlers (same references as add)
    document.removeEventListener('mousemove', this.boundHandleMouseMove)
    document.removeEventListener('mouseup', this.boundHandleMouseUp)
    
    // If moved, sync with server
    // NOTE: SyncManager handles history.push internally after successful sync
    if (this.hasMoved && node) {
      this.syncManager.updateNodePosition(clientId, node.position.x, node.position.y)
        .catch(err => console.error('Failed to sync position:', err))
    }
    
    // Reset drag state
    this.dragging = null
    this.startPosition = null
    this.offset = null
    this.hasMoved = false
  }
  
  /**
   * Cleanup handler
   */
  destroy() {
    // Clean up any remaining listeners
    document.removeEventListener('mousemove', this.boundHandleMouseMove)
    document.removeEventListener('mouseup', this.boundHandleMouseUp)
  }
}

export default DragHandler
```

### ConnectionHandler.js

Handles connection creation and deletion.

**IMPORTANT:** Pre-binds event handlers in constructor to fix removeEventListener bug. **Does NOT update store directly** - SyncManager handles optimistic updates.

```javascript
// handlers/ConnectionHandler.js

import { EVENTS } from '../constants.js'

/**
 * Handles connection creation and deletion
 * - Drag from source connector to target connector
 * - Click delete button on connection
 * - SyncManager handles all store updates and history pushes
 */
class ConnectionHandler {
  constructor(store, syncManager, history, connectionRenderer) {
    this.store = store
    this.syncManager = syncManager
    this.history = history
    this.connectionRenderer = connectionRenderer
    
    // Pre-bind handlers in constructor (fixes removeEventListener bug)
    this.boundUpdateTempLine = this.updateTempLine.bind(this)
    this.boundCancelConnection = this.cancelConnection.bind(this)
    
    this.connecting = null        // Connection in progress
    this.tempLine = null          // Temporary line during drag
  }
  
  /**
   * Attach connection handlers to a node element
   * @param {HTMLElement} element - Node element
   * @param {string} clientId - Node client ID
   */
  attach(element, clientId) {
    // Output connector: start connection
    const outputConnector = element.querySelector('.node-connector.output')
    if (outputConnector) {
      outputConnector.addEventListener('mousedown', (e) => this.startConnection(e, clientId))
    }
    
    // Input connector: accept connection
    const inputConnector = element.querySelector('.node-connector.input')
    if (inputConnector) {
      inputConnector.addEventListener('mouseup', (e) => this.finishConnection(e, clientId))
    }
  }
  
  /**
   * Start creating a connection (drag from output)
   */
  startConnection(event, sourceClientId) {
    event.preventDefault()
    event.stopPropagation()
    
    // Can't connect to output of same node
    const sourceNode = this.store.getNode(sourceClientId)
    if (!sourceNode) return
    
    this.connecting = {
      sourceId: sourceClientId
    }
    
    // Create temporary line
    this.createTempLine(event.clientX, event.clientY)
    
    // Add pre-bound handlers (same references for remove)
    document.addEventListener('mousemove', this.boundUpdateTempLine)
    document.addEventListener('mouseup', this.boundCancelConnection)
  }
  
  /**
   * Create temporary line from source to mouse
   */
  createTempLine(x, y) {
    const sourceNode = this.store.getNode(this.connecting.sourceId)
    if (!sourceNode) return
    
    const svg = document.querySelector('#connections-canvas')
    if (!svg) return
    
    // Calculate source point (output connector)
    const nodeWidth = 150
    const nodeHeight = 60
    const x1 = sourceNode.position.x + nodeWidth
    const y1 = sourceNode.position.y + nodeHeight / 2
    
    this.tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    this.tempLine.setAttribute('x1', x1)
    this.tempLine.setAttribute('y1', y1)
    this.tempLine.setAttribute('x2', x)
    this.tempLine.setAttribute('y2', y)
    this.tempLine.setAttribute('stroke', '#4CAF50')
    this.tempLine.setAttribute('stroke-width', '2')
    this.tempLine.setAttribute('stroke-dasharray', '5,5')
    this.tempLine.setAttribute('opacity', '0.5')
    
    svg.appendChild(this.tempLine)
  }
  
  /**
   * Update temporary line position
   */
  updateTempLine(event) {
    if (!this.tempLine) return
    
    // Get canvas-relative coordinates
    const canvas = document.getElementById('nodes-canvas')
    const canvasRect = canvas.getBoundingClientRect()
    
    const x = event.clientX - canvasRect.left
    const y = event.clientY - canvasRect.top
    
    this.tempLine.setAttribute('x2', x)
    this.tempLine.setAttribute('y2', y)
  }
  
  /**
   * Finish creating a connection (drop on input)
   */
  finishConnection(event, targetClientId) {
    event.preventDefault()
    
    if (!this.connecting) return
    
    // Can't connect to self
    if (this.connecting.sourceId === targetClientId) {
      this.cancelConnection()
      return
    }
    
    // Check if connection already exists
    const existingConnection = Array.from(this.store.graph.connections.values()).find(conn =>
      conn.sourceId === this.connecting.sourceId &&
      conn.targetId === targetClientId
    )
    
    if (existingConnection) {
      // Connection already exists, cancel
      this.cancelConnection()
      return
    }
    
    // SyncManager handles: optimistic store update, server sync, history push
    // Note: Handler does NOT call store.addConnection() directly
    this.syncManager.createConnection(this.connecting.sourceId, targetClientId)
      .catch(err => {
        console.error('Failed to create connection:', err)
        // Rollback handled by SyncManager
      })
    
    // Cleanup
    this.cleanupTempLine()
    this.connecting = null
  }
  
  /**
   * Cancel connection creation
   */
  cancelConnection() {
    this.cleanupTempLine()
    this.connecting = null
    
    // Remove pre-bound handlers (same references as add)
    document.removeEventListener('mousemove', this.boundUpdateTempLine)
    document.removeEventListener('mouseup', this.boundCancelConnection)
  }
  
  /**
   * Remove temporary line
   */
  cleanupTempLine() {
    if (this.tempLine) {
      this.tempLine.remove()
      this.tempLine = null
    }
  }
  
  /**
   * Delete a connection
   * NOTE: Does NOT call store.removeConnection() directly - SyncManager handles everything
   * @param {string} clientId - Connection client ID
   */
  deleteConnection(clientId) {
    const connection = this.store.getConnection(clientId)
    if (!connection) return
    
    if (!confirm('Delete this connection?')) return
    
    // SyncManager handles: optimistic store update, server sync, history push, rollback
    this.syncManager.deleteConnection(clientId)
      .catch(err => {
        console.error('Failed to delete connection:', err)
        // Rollback handled by SyncManager
      })
  }
  
  /**
   * Setup hover-to-show delete button
   * Called from ConnectionRenderer when connection hitarea is hovered
   */
  setupDeleteButton(interaction) {
    // ConnectionRenderer will call this when a connection is hovered
    // Shows delete button at midpoint of line
    // This is handled in ConnectionRenderer for simplicity
  }
  
  /**
   * Cleanup handler
   */
  destroy() {
    this.cleanupTempLine()
    // Clean up any remaining listeners
    document.removeEventListener('mousemove', this.boundUpdateTempLine)
    document.removeEventListener('mouseup', this.boundCancelConnection)
  }
}

export default ConnectionHandler
```

### ClickHandler.js

Handles node selection and editor panel interaction.

```javascript
// handlers/ClickHandler.js

/**
 * Handles node selection and editor panel
 * - Click to select node
 * - Double-click to edit node
 * - Click outside to deselect
 */
class ClickHandler {
  constructor(store, history) {
    this.store = store
    this.history = history
    
    // Reference to editor panel (set externally)
    this.editorPanel = null
    this.onNodeSelected = null
    this.onNodeDeselected = null
  }
  
  /**
   * Attach click handlers to a node element
   * @param {HTMLElement} element - Node element
   * @param {string} clientId - Node client ID
   */
  attach(element, clientId) {
    // Single click: select node
    element.addEventListener('click', (e) => this.onNodeClick(e, clientId))
    
    // Double click: edit node
    element.addEventListener('dblclick', (e) => this.onNodeDoubleClick(e, clientId))
  }
  
  /**
   * Handle node click (select)
   */
  onNodeClick(event, clientId) {
    event.preventDefault()
    event.stopPropagation()
    
    const node = this.store.getNode(clientId)
    if (!node) return
    
    // Deselect previous node
    if (this.store.viewState.selectedNodeId) {
      this.deselectNode(this.store.viewState.selectedNodeId)
    }
    
    // Select this node
    this.selectNode(clientId, event.target)
  }
  
  /**
   * Handle node double-click (edit)
   */
  onNodeDoubleClick(event, clientId) {
    event.preventDefault()
    event.stopPropagation()
    
    const node = this.store.getNode(clientId)
    if (!node) return
    
    // Open editor panel for this node
    this.openEditorPanel(clientId)
  }
  
  /**
   * Select a node
   */
  selectNode(clientId, element) {
    // Update state
    this.store.setSelectedNodeId(clientId)
    
    // Update UI
    if (element) {
      element.closest('.node')?.classList.add('selected')
    }
    
    // Callback
    if (this.onNodeSelected) {
      this.onNodeSelected(clientId)
    }
  }
  
  /**
   * Deselect a node
   */
  deselectNode(clientId) {
    // Update state
    if (this.store.viewState.selectedNodeId === clientId) {
      this.store.setSelectedNodeId(null)
    }
    
    // Update UI
    const element = document.querySelector(`.node[data-client-id="${clientId}"]`)
    if (element) {
      element.classList.remove('selected')
    }
    
    // Callback
    if (this.onNodeDeselected) {
      this.onNodeDeselected(clientId)
    }
  }
  
  /**
   * Open editor panel for a node
   */
  openEditorPanel(clientId) {
    const node = this.store.getNode(clientId)
    if (!node) return
    
    // Update state
    this.store.setEditingNodeId(clientId)
    
    // Show editor panel
    if (this.editorPanel) {
      this.editorPanel.classList.remove('hidden')
      
      // Populate editor panel with node data
      this.populateEditorPanel(node)
    }
  }
  
  /**
   * Close editor panel
   */
  closeEditorPanel() {
    // Update state
    this.store.setEditingNodeId(null)
    
    // Hide editor panel
    if (this.editorPanel) {
      this.editorPanel.classList.add('hidden')
    }
  }
  
  /**
   * Populate editor panel with node data
   */
  populateEditorPanel(node) {
    if (!this.editorPanel) return
    
    // Get form elements
    const panelContent = this.editorPanel.querySelector('#node-editor-form')
    if (!panelContent) return
    
    // Clear previous content
    this.clearEditorPanel()
    
    // Populate based on node type
    switch (node.type) {
      case 'condition':
        this.populateConditionEditor(node)
        break
      case 'action':
        this.populateActionEditor(node)
        break
      default:
        console.warn('Unknown node type:', node.type)
    }
  }
  
  /**
   * Populate condition editor
   */
  populateConditionEditor(node) {
    // Build form for condition node
    // This will be implemented based on the condition form structure
    // Similar to existing implementation in node_editor.js
  }
  
  /**
   * Populate action editor
   */
  populateActionEditor(node) {
    // Build form for action node
    // Similar to existing implementation
  }
  
  /**
   * Clear editor panel
   */
  clearEditorPanel() {
    if (this.editorPanel) {
      const form = this.editorPanel.querySelector('#node-editor-form')
      if (form) {
        form.innerHTML = ''
      }
    }
  }
  
  /**
   * Handle click outside nodes (deselect)
   */
  onCanvasClick(event) {
    // If clicked on canvas (not on node), deselect
    if (event.target.id === 'nodes-canvas' || event.target.closest('#nodes-canvas')) {
      if (!event.target.closest('.node')) {
        if (this.store.viewState.selectedNodeId) {
          this.deselectNode(this.store.viewState.selectedNodeId)
        }
      }
    }
  }
  
  /**
   * Setup global click handler
   */
  setupGlobalHandlers() {
    document.addEventListener('click', (e) => this.onCanvasClick(e))
  }
  
  /**
   * Cleanup handler
   */
  destroy() {
    document.removeEventListener('click', this.onCanvasClick)
  }
}

export default ClickHandler
```

## Integration with Main Entry Point

```javascript
// index.js (partial)

import DragHandler from './handlers/DragHandler.js'
import ConnectionHandler from './handlers/ConnectionHandler.js'
import ClickHandler from './handlers/ClickHandler.js'

export async function initEditor(botId, container) {
  // ... store, history, syncManager setup ...
  
  // Setup handlers
  const dragHandler = new DragHandler(store, syncManager, history)
  const connectionHandler = new ConnectionHandler(store, syncManager, history, connectionRenderer)
  const clickHandler = new ClickHandler(store, history)
  
  // Attach handlers to existing nodes
  store.getNodes().forEach(node => {
    const element = document.querySelector(`.node[data-client-id="${node.clientId}"]`)
    if (element) {
      dragHandler.attach(element, node.clientId)
      connectionHandler.attach(element, node.clientId)
      clickHandler.attach(element, node.clientId)
    }
  })
  
  // Setup global handlers
  clickHandler.setupGlobalHandlers()
  
  // Subscribe to new nodes to attach handlers
  store.subscribe((event, data) => {
    if (event === 'node:add') {
      // Wait for DOM to be updated
      setTimeout(() => {
        const element = document.querySelector(`.node[data-client-id="${data.clientId}"]`)
        if (element) {
          dragHandler.attach(element, data.clientId)
          connectionHandler.attach(element, data.clientId)
          clickHandler.attach(element, data.clientId)
        }
      }, 0)
    }
  })
  
  return { store, history, dragHandler, connectionHandler, clickHandler }
}
```

## Key Design Decisions

### Handlers Update Store, Then Sync

All handlers follow the same pattern:
1. Update Store (optimistic UI)
2. Push to History
3. Sync with Server

```javascript
// Create connection
this.store.addConnection(connection)  // 1. Optimistic
this.history.push('Create connection')  // 2. History
this.syncManager.createConnection(...)  // 3. Server sync
```

**Why:**
- Consistent pattern across all handlers
- UI feels responsive
- History has correct state
- Errors handled consistently

### Drag Has Final Position on MouseUp

Drag updates are continuous, but history push happens on mouseup.

```javascript
onMouseMove(event) {
  // Continuous updates during drag (no history push)
  this.store.updateNode(clientId, { position: { x, y } })
}

onMouseUp(event) {
  // Single history push at end
  if (this.hasMoved) {
    this.history.push('Drag node')
    this.syncManager.updateNodePosition(...)
  }
}
```

**Why:**
- Continuous history pushes would create many undo steps
- User expects single undo to revert entire drag
- Aligns with user mental model

### Connection Creation Validates

Before creating connection, validate:
- Not connecting to self
- Connection doesn't already exist

```javascript
if (sourceId === targetId) {
  this.cancelConnection()
  return
}

const existing = this.store.graph.connections.find(conn =>
  conn.sourceId === sourceId && conn.targetId === targetId
)

if (existing) {
  this.cancelConnection()
  return
}
```

**Why:**
- Prevent invalid connections
- Better UX (immediate feedback)
- No server round-trip for validation

## Completion Checklist

- [ ] `DragHandler.js` created
- [ ] `ConnectionHandler.js` created
- [ ] `ClickHandler.js` created
- [ ] Drag pushes history on mouseup
- [ ] Connection validates before creation
- [ ] Click toggles selection
- [ ] Double-click opens editor panel
- [ ] Global click handler deselects
- [ ] Cleanup on destroy()
- [ ] Unit tests pass