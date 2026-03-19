# Step 06: Rendering Layer

## Goal

Create/update DOM elements from state with no business logic.

### Files to Create

```
app/javascript/editorV2/
└── rendering/
    ├── NodeRenderer.js
    └── ConnectionRenderer.js
```

**Note:** Import constants for node dimensions and colors:
```javascript
// In ConnectionRenderer.js:
import { NODE_WIDTH, NODE_HEIGHT, CONNECTION_COLOR, CONNECTION_HITAREA_WIDTH } from '../constants.js'

// In NodeRenderer.js (for preview fetching):
// NodeRenderer receives 'api' parameter for fetch operations
```

## Dependencies

- Step 02: State Manager (Store)
- Step 01: Data Models (Node, Connection, Graph)
- Step 04: API class (for preview fetching)

## Implementation

### NodeRenderer.js

Subscribes to Store and renders/updates node DOM elements.

**IMPORTANT:** Uses AbortController to cancel pending fetches when nodes are removed. Receives `api` parameter instead of accessing it through implicit property chains.

```javascript
// rendering/NodeRenderer.js

import { EVENTS } from '../constants.js'

/**
 * Renders nodes from state
 * Subscribes to Store updates
 * Maintains element cache for O(1) lookups
 */
class NodeRenderer {
  constructor(container, store, api) {
    this.container = container
    this.store = store
    this.api = api  // API instance for preview fetching
    this.elements = new Map()  // clientId → DOM element
    this.pendingFetches = new Map()  // clientId → AbortController
    
    // Subscribe to store updates
    this.unsubscribe = store.subscribe(this.handleStateChange.bind(this))
  }
  
  /**
   * Handle state changes from Store
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  handleStateChange(event, data) {
    switch (event) {
      case EVENTS.NODE_ADD:
        this.renderNode(data.node)
        break
      case EVENTS.NODE_UPDATE:
        this.updateNodeElement(data.clientId)
        break
      case EVENTS.NODE_REMOVE:
        this.removeNodeElement(data.clientId)
        break
      case EVENTS.GRAPH_RESTORE:
        this.renderAll()
        break
    }
  }
  
  /**
   * Render a single node
   * @param {Node} node - Node instance
   */
  renderNode(node) {
    // Create node element
    const element = document.createElement('div')
    element.className = 'node'
    element.dataset.clientId = node.clientId
    element.dataset.type = node.type
    element.style.cssText = `
      left: ${node.position.x}px;
      top: ${node.position.y}px;
    `
    
    // Create node content
    const content = document.createElement('div')
    content.className = 'node-content'
    content.innerHTML = this.getNodeContent(node)
    element.appendChild(content)
    
    // Create connectors
    const inputConnector = document.createElement('div')
    inputConnector.className = 'node-connector input'
    inputConnector.dataset.clientId = node.clientId
    inputConnector.dataset.direction = 'input'
    element.appendChild(inputConnector)
    
    const outputConnector = document.createElement('div')
    outputConnector.className = 'node-connector output'
    outputConnector.dataset.clientId = node.clientId
    outputConnector.dataset.direction = 'output'
    element.appendChild(outputConnector)
    
    // Add to container
    this.container.appendChild(element)
    this.elements.set(node.clientId, element)
    
    // Fetch preview HTML from server
    this.fetchPreview(node.clientId, element)
  }
  
  /**
   * Update an existing node element
   * @param {string} clientId - Node client ID
   */
  updateNodeElement(clientId) {
    const node = this.store.getNode(clientId)
    const element = this.elements.get(clientId)
    
    if (!node || !element) return
    
    // Update position
    element.style.left = `${node.position.x}px`
    element.style.top = `${node.position.y}px`
    
    // Update data attributes
    element.dataset.type = node.type
    
    // Update content if data changed
    const content = element.querySelector('.node-content')
    if (content) {
      content.innerHTML = this.getNodeContent(node)
      this.fetchPreview(clientId, element)
    }
  }
  
  /**
   * Remove a node element
   * @param {string} clientId - Node client ID
   */
  removeNodeElement(clientId) {
    // Cancel any pending fetch for this node
    this.cancelPendingFetch(clientId)
    
    const element = this.elements.get(clientId)
    if (element) {
      element.remove()
      this.elements.delete(clientId)
    }
  }
  
  /**
   * Cancel pending fetch for a node
   * @param {string} clientId - Node client ID
   */
  cancelPendingFetch(clientId) {
    const controller = this.pendingFetches.get(clientId)
    if (controller) {
      controller.abort()
      this.pendingFetches.delete(clientId)
    }
  }
  
  /**
   * Render all nodes (for graph:restore)
   */
  renderAll() {
    // Clear existing elements
    this.elements.forEach(element => element.remove())
    this.elements.clear()
    
    // Render all nodes from current state
    this.store.getNodes().forEach(node => {
      this.renderNode(node)
    })
  }
  
  /**
   * Escape HTML entities to prevent XSS
   * @param {string} unsafe - Unsafe string
   * @returns {string} Escaped string
   */
  escapeHtml(unsafe) {
    if (unsafe == null) return ''
    return String(unsafe)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }
  
  /**
   * Get node content HTML based on type
   * @param {Node} node - Node instance
   * @returns {string} HTML string (user data escaped)
   */
  getNodeContent(node) {
    // Basic content - will be replaced by server preview
    // NOTE: Always escape user data to prevent XSS
    switch (node.type) {
      case 'root':
        return `<div class="node-title">ROOT</div><div class="node-subtitle">Start</div>`
      case 'condition':
        const context = this.escapeHtml(node.data.context || 'all_pieces')
        const pieceType = this.escapeHtml(node.data.piece_type || 'any')
        return `<div class="node-title">Condition</div><div class="node-subtitle">${context} (${pieceType})</div>`
      case 'action':
        const actionType = this.escapeHtml(node.data.action_type || 'move')
        return `<div class="node-title">Action</div><div class="node-subtitle">${actionType}</div>`
      default:
        return `<div class="node-title">${this.escapeHtml(node.type)}</div>`
    }
  }
  
  /**
   * Fetch preview HTML from server
   * Uses AbortController to cancel if node is removed during fetch
   * @param {string} clientId - Node client ID
   * @param {HTMLElement} element - Node element
   */
  async fetchPreview(clientId, element) {
    const node = this.store.getNode(clientId)
    if (!node || !node.serverId) {
      // Node not yet synced, use basic content
      return
    }
    
    // Cancel previous fetch for this node (race condition prevention)
    this.cancelPendingFetch(clientId)
    
    // Create abort controller for this fetch
    const abortController = new AbortController()
    this.pendingFetches.set(clientId, abortController)
    
    try {
      const html = await this.api.getNodePreviewHtml(clientId)
      
      // Check if element still exists (node might have been deleted)
      if (!element.isConnected) return
      
      const content = element.querySelector('.node-content')
      if (content) {
        content.innerHTML = html
      }
      
    } catch (error) {
      if (error.name === 'AbortError') {
        // Fetch was cancelled, this is expected
        return
      }
      console.warn('Preview fetch failed:', error)
      // Keep basic content on failure
    } finally {
      this.pendingFetches.delete(clientId)
    }
  }
  
  /**
   * Cleanup renderer
   */
  destroy() {
    this.unsubscribe()
    
    // Cancel all pending fetches
    this.pendingFetches.forEach(controller => controller.abort())
    this.pendingFetches.clear()
    
    // Remove all elements
    this.elements.forEach(element => element.remove())
    this.elements.clear()
  }
}

export default NodeRenderer
```

### ConnectionRenderer.js

Subscribes to Store and renders/updates connection SVG lines.

```javascript
// rendering/ConnectionRenderer.js

import { NODE_WIDTH, NODE_HEIGHT, CONNECTION_COLOR, CONNECTION_HITAREA_WIDTH } from '../constants.js'

/**
 * Renders connections from state as SVG lines
 * Subscribes to Store updates
 * Maintains element cache for O(1) lookups
 */
class ConnectionRenderer {
  constructor(svgContainer, store) {
    this.svg = svgContainer
    this.store = store
    this.elements = new Map()  // clientId → { line, hitarea }
    
    // Subscribe to store updates
    this.unsubscribe = store.subscribe(this.handleStateChange.bind(this))
    
    // Connector positions (relative to node)
    this.connectorOffset = {
      input: { x: 0, y: '50%' },
      output: { x: '100%', y: '50%' }
    }
  }
  
  /**
   * Handle state changes from Store
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  handleStateChange(event, data) {
    switch (event) {
      case 'connection:add':
        this.renderConnection(data.connection)
        break
      case 'connection:remove':
        this.removeConnection(data.clientId)
        break
      case 'node:update':
        // Update connections for this node
        this.updateConnectionsForNode(data.clientId)
        break
      case 'graph:restore':
        this.renderAll()
        break
    }
  }
  
  /**
   * Render a single connection
   * @param {Connection} connection - Connection instance
   */
  renderConnection(connection) {
    const sourceNode = this.store.getNode(connection.sourceId)
    const targetNode = this.store.getNode(connection.targetId)
    
    if (!sourceNode || !targetNode) {
      console.warn('Cannot render connection: missing nodes')
      return
    }
    
    // Calculate connection points
    const points = this.calculateConnectionPoints(sourceNode, targetNode)
    
    // Create visible line (stroke)
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    line.setAttribute('x1', points.x1)
    line.setAttribute('y1', points.y1)
    line.setAttribute('x2', points.x2)
    line.setAttribute('y2', points.y2)
    line.setAttribute('stroke', CONNECTION_COLOR)
    line.setAttribute('stroke-width', '2')
    line.dataset.clientId = connection.clientId
    line.dataset.sourceId = connection.sourceId
    line.dataset.targetId = connection.targetId
    
    // Create invisible hit area (for click detection)
    const hitarea = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    hitarea.setAttribute('x1', points.x1)
    hitarea.setAttribute('y1', points.y1)
    hitarea.setAttribute('x2', points.x2)
    hitarea.setAttribute('y2', points.y2)
    hitarea.setAttribute('stroke', 'transparent')
    hitarea.setAttribute('stroke-width', CONNECTION_HITAREA_WIDTH)
    hitarea.setAttribute('class', 'connection-hitarea')
    hitarea.dataset.clientId = connection.clientId
    hitarea.dataset.sourceId = connection.sourceId
    hitarea.dataset.targetId = connection.targetId
    
    // Add to SVG
    this.svg.appendChild(line)
    this.svg.appendChild(hitarea)
    
    // Cache elements
    this.elements.set(connection.clientId, { line, hitarea })
  }
  
  /**
   * Remove a connection
   * @param {string} clientId - Connection client ID
   */
  removeConnection(clientId) {
    const elements = this.elements.get(clientId)
    if (elements) {
      elements.line.remove()
      elements.hitarea.remove()
      this.elements.delete(clientId)
    }
  }
  
  /**
   * Update a connection's position
   * @param {string} clientId - Connection client ID
   */
  updateConnectionPosition(clientId) {
    const connection = this.store.getConnection(clientId)
    const elements = this.elements.get(clientId)
    
    if (!connection || !elements) return
    
    const sourceNode = this.store.getNode(connection.sourceId)
    const targetNode = this.store.getNode(connection.targetId)
    
    if (!sourceNode || !targetNode) return
    
    const points = this.calculateConnectionPoints(sourceNode, targetNode)
    
    elements.line.setAttribute('x1', points.x1)
    elements.line.setAttribute('y1', points.y1)
    elements.line.setAttribute('x2', points.x2)
    elements.line.setAttribute('y2', points.y2)
    
    elements.hitarea.setAttribute('x1', points.x1)
    elements.hitarea.setAttribute('y1', points.y1)
    elements.hitarea.setAttribute('x2', points.x2)
    elements.hitarea.setAttribute('y2', points.y2)
  }
  
  /**
   * Update all connections for a node
   * @param {string} clientId - Node client ID
   */
  updateConnectionsForNode(clientId) {
    this.store.graph.connections.forEach((connection, connClientId) => {
      if (connection.sourceId === clientId || connection.targetId === clientId) {
        this.updateConnectionPosition(connClientId)
      }
    })
  }
  
  /**
   * Render all connections (for graph:restore)
   */
  renderAll() {
    // Clear existing elements
    this.elements.forEach(elements => {
      elements.line.remove()
      elements.hitarea.remove()
    })
    this.elements.clear()
    
    // Render all connections from current state
    this.store.getConnections().forEach(connection => {
      this.renderConnection(connection)
    })
  }
  
  /**
   * Calculate connection points from node positions
   * @param {Node} sourceNode - Source node
   * @param {Node} targetNode - Target node
   * @returns {Object} { x1, y1, x2, y2 }
   */
  calculateConnectionPoints(sourceNode, targetNode) {
    // Source: output connector (right side)
    const x1 = sourceNode.position.x + NODE_WIDTH
    const y1 = sourceNode.position.y + NODE_HEIGHT / 2
    
    // Target: input connector (left side)
    const x2 = targetNode.position.x
    const y2 = targetNode.position.y + NODE_HEIGHT / 2
    
    return { x1, y1, x2, y2 }
  }
  
  /**
   * Create delete button for connection (on hover)
   * @param {string} clientId - Connection client ID
   * @param {number} x - X position for button
   * @param {number} y - Y position for button
   */
  showDeleteButton(clientId, x, y) {
    // Remove any existing delete buttons
    document.querySelectorAll('.connection-delete-btn').forEach(btn => btn.remove())
    
    const button = document.createElement('button')
    button.className = 'connection-delete-btn'
    button.dataset.clientId = clientId
    button.textContent = '×'
    button.style.cssText = `
      position: absolute;
      left: ${x}px;
      top: ${y}px;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: 2px solid #c00;
      background: white;
      color: #c00;
      font-size: 16px;
      line-height: 18px;
      cursor: pointer;
      z-index: 1000;
    `
    
    document.body.appendChild(button)
    
    // Remove on click outside
    button.addEventListener('click', () => {
      this.removeConnection(clientId)
      // Emit remove event (handlers will listen)
      this.store.removeConnection(clientId)
    })
  }
  
  /**
   * Hide delete button
   */
  hideDeleteButton() {
    document.querySelectorAll('.connection-delete-btn').forEach(btn => btn.remove())
  }
  
  /**
   * Cleanup renderer
   */
  destroy() {
    this.unsubscribe()
    this.elements.forEach(elements => {
      elements.line.remove()
      elements.hitarea.remove()
    })
    this.elements.clear()
    this.hideDeleteButton()
  }
}

export default ConnectionRenderer
```

## Key Design Decisions

### State-Driven Rendering

Renderers subscribe to Store and update DOM on state changes.

```javascript
// NodeRenderer subscribes to store
this.unsubscribe = store.subscribe(this.handleStateChange.bind(this))

// On state change, update DOM
handleStateChange(event, data) {
  switch (event) {
    case 'node:add':
      this.renderNode(data.node)
      break
    // ...
  }
}
```

**Why:**
- Decoupled: Renderers don't know about handlers
- Reactive: DOM updates automatically on state change
- Single source of truth: Store drives all rendering
- Easy to test: Can mock Store and verify DOM updates

### Element Cache for O(1) Lookups

Maintain Map from `clientId` to DOM element.

```javascript
this.elements = new Map()  // clientId → DOM element

renderNode(node) {
  const element = document.createElement('div')
  // ...
  this.elements.set(node.clientId, element)
}

updateNodeElement(clientId) {
  const element = this.elements.get(clientId)  // O(1) lookup
  // ...
}
```

**Why:**
- O(1) lookup by client ID
- No DOM queries needed
- Stable: client ID doesn't change
- Same pattern as old `connectionManager.connections`

### Two SVG Elements per Connection

Each connection has:
1. Visible stroke (thin, green)
2. Invisible hit area (wide, transparent)

```javascript
// Visible line
line.setAttribute('stroke', '#4CAF50')
line.setAttribute('stroke-width', '2')

// Invisible hit area for click detection
hitarea.setAttribute('stroke', 'transparent')
hitarea.setAttribute('stroke-width', '10')
```

**Why:**
- Hit area wider for easier clicking
- Same as old implementation (proven)
- Transparent hit area doesn't interfere with visuals

### No Business Logic in Renderers

Renderers only transform state to DOM.

```javascript
// Good: Renderer only updates DOM
updateNodeElement(clientId) {
  const node = this.store.getNode(clientId)
  const element = this.elements.get(clientId)
  
  element.style.left = `${node.position.x}px`
  element.style.top = `${node.position.y}px`
}

// Bad: Renderer contains business logic
updateNodeElement(clientId) {
  const node = this.store.getNode(clientId)
  
  // NO: Business logic in renderer
  if (node.type === 'condition' && shouldHighlight(node)) {
    node.data.highlighted = true  // WRONG: mutating state
    this.store.updateNode(clientId, { highlighted: true })  // WRONG: triggering state change
  }
}
```

**Why:**
- Separation of concerns
- Renderers are pure functions (almost)
- Business logic belongs in handlers or store
- Easier to test and reason about

### Handle Graph Restore

When history restores a snapshot, renderers need to re-render everything.

```javascript
case 'graph:restore':
  this.renderAll()
  break

renderAll() {
  // Clear existing elements
  this.elements.forEach(element => element.remove())
  this.elements.clear()
  
  // Render all from current state
  this.store.getNodes().forEach(node => this.renderNode(node))
}
```

**Why:**
- History restores graph to previous state
- Renderers need to sync DOM with new graph
- More efficient than dispatching individual events
- Ensures DOM matches state exactly

## Security Note: XSS Prevention

User data should always be escaped when inserted into HTML.

```javascript
// Escape function for HTML strings (defined in NodeRenderer)
escapeHtml(unsafe) {
  if (unsafe == null) return ''
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// Use in getNodeContent
getNodeContent(node) {
  const context = this.escapeHtml(node.data.context || 'all_pieces')
  return `<div class="node-title">${context}</div>`
}

// Use textContent for error messages (prevents XSS)
showError(message) {
  const banner = document.createElement('div')
  const text = document.createElement('span')
  text.textContent = message  // Safe - treated as plain text
  banner.appendChild(text)
}
```

**Why `textContent` is safer than `innerHTML`:**
- `innerHTML` executes any HTML tags in the string (XSS vulnerability)
- `textContent` treats the string as plain text, displaying tags literally
- Never insert user data via `innerHTML` without escaping

## Testing

```javascript
// rendering/__tests__/NodeRenderer.test.js
import Store from '../../state/Store.js'
import NodeRenderer from '../NodeRenderer.js'
import Node from '../../models/Node.js'
import { generateUUID } from '../../utils/uuid.js'

describe('NodeRenderer', () => {
  let container, store, renderer
  
  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    store = new Store()
    renderer = new NodeRenderer(container, store)
  })
  
  afterEach(() => {
    renderer.destroy()
    container.remove()
  })
  
  it('renders node on node:add event', () => {
    const node = new Node({
      clientId: generateUUID(),
      type: 'condition',
      position: { x: 100, y: 200 }
    })
    
    store.addNode(node)
    
    expect(container.querySelectorAll('.node').length).toBe(1)
    expect(renderer.elements.has(node.clientId)).toBe(true)
  })
  
  it('updates node position on node:update event', () => {
    const clientId = generateUUID()
    const node = new Node({
      clientId,
      type: 'condition',
      position: { x: 100, y: 200 }
    })
    
    store.addNode(node)
    store.updateNode(clientId, { position: { x: 150, y: 250 } })
    
    const element = renderer.elements.get(clientId)
    expect(element.style.left).toBe('150px')
    expect(element.style.top).toBe('250px')
  })
  
  it('removes node on node:remove event', () => {
    const clientId = generateUUID()
    const node = new Node({
      clientId,
      type: 'condition',
      position: { x: 100, y: 200 }
    })
    
    store.addNode(node)
    store.removeNode(clientId)
    
    expect(container.querySelectorAll('.node').length).toBe(0)
    expect(renderer.elements.has(clientId)).toBe(false)
  })
  
  it('re-renders all nodes on graph:restore event', () => {
    const node1 = new Node({
      clientId: generateUUID(),
      type: 'condition',
      position: { x: 100, y: 200 }
    })
    const node2 = new Node({
      clientId: generateUUID(),
      type: 'action',
      position: { x: 200, y: 300 }
    })
    
    store.addNode(node1)
    store.addNode(node2)
    
    // Restore would clear and re-render
    store.graph = new Graph([node1])  // Mock restore
    store.notify('graph:restore', {})
    
    expect(container.querySelectorAll('.node').length).toBe(1)
  })
})
```

## Completion Checklist

- [ ] `NodeRenderer.js` created
- [ ] `ConnectionRenderer.js` created
- [ ] Both subscribe to Store updates
- [ ] Element caches for O(1) lookups
- [ ] Two SVG elements per connection
- [ ] `renderAll()` handles graph:restore
- [ ] Connection positions update on node position change
- [ ] Delete button for connections (optional)
- [ ] Preview HTML fetching (optional)
- [ ] Cleanup on destroy()
- [ ] Unit tests pass