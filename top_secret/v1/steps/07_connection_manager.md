# Step 07: Connection Manager

## Goal

Virtualize connection drawing and hit-testing.

## Note

This step is largely absorbed into `ConnectionRenderer.js` from Step 05. The rendering layer already tracks connections by `clientId` in a Map for O(1) lookups. This document describes additional considerations for connection management.

## Files (Already Created in Step 05)

- `app/javascript/editorV2/rendering/ConnectionRenderer.js`

## Connection Tracking

The `ConnectionRenderer` maintains a Map for O(1) connection lookups:

```javascript
class ConnectionRenderer {
  constructor(svgContainer, store) {
    this.svg = svgContainer
    this.store = store
    this.elements = new Map()  // clientId → { line, hitarea }
  }
}
```

## Key Improvements Over Old Implementation

### 1. Stable Keys (clientId vs. `${sourceId}-${targetId}`)

**Old:**
```javascript
// Old connection manager used composite key
const key = `${sourceId}-${targetId}`
this.connections.set(key, connection)
```

**Problem:** When node IDs change during undo/redo, composite keys become invalid.

**New:**
```javascript
// Connection has stable clientId
this.elements.set(connection.clientId, { line, hitarea })
```

**Benefit:** Client IDs never change, so connection references are always valid.

### 2. No DOM Queries

**Old:**
```javascript
// Old implementation queried DOM for connections
const lines = document.querySelectorAll(`line[data-source-id="${sourceId}"]`)
lines.forEach(line => line.remove())
```

**Problem:** DOM queries are slow and can be stale.

**New:**
```javascript
// New implementation uses Map
this.elements.forEach((elements, clientId) => {
  const conn = this.store.getConnection(clientId)
  if (conn.sourceId === clientId || conn.targetId === clientId) {
    this.updateConnectionPosition(clientId)
  }
})
```

**Benefit:** O(1) lookups, no DOM dependency.

### 3. Two SVG Elements per Connection (Preserved)

**Why:**
- Visible line (thin, green stroke)
- Invisible hitarea (wide, transparent stroke)
- Wide hitarea easier to click/hover

**Implementation:**
```javascript
renderConnection(connection) {
  // Visible line
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
  line.setAttribute('stroke', '#4CAF50')
  line.setAttribute('stroke-width', '2')
  
  // Invisible hitarea
  const hitarea = document.createElementNS('http://www.w3.org/2000/svg', 'line')
  hitarea.setAttribute('stroke', 'transparent')
  hitarea.setAttribute('stroke-width', '10')
  hitarea.setAttribute('class', 'connection-hitarea')
  
  this.svg.appendChild(line)
  this.svg.appendChild(hitarea)
  
  this.elements.set(connection.clientId, { line, hitarea })
}
```

### 4. Handles Node Position Changes

When a node moves, update all connections involving that node:

```javascript
handleStateChange(event, data) {
  switch (event) {
    case 'node:update':
      this.updateConnectionsForNode(data.clientId)
      break
    // ...
  }
}

updateConnectionsForNode(clientId) {
  this.store.graph.connections.forEach((connection, connClientId) => {
    if (connection.sourceId === clientId || connection.targetId === clientId) {
      this.updateConnectionPosition(connClientId)
    }
  })
}
```

## Connection Hit-Testing (Optional Enhancement)

For connection deletion via click/hover, add hit-testing:

```javascript
/**
 * Find connection at point (for click detection)
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {string|null} Connection clientId or null
 */
findConnectionAtPoint(x, y) {
  // Iterate through hitareas
  const hitareas = this.svg.querySelectorAll('.connection-hitarea')
  
  for (const hitarea of hitareas) {
    const x1 = parseFloat(hitarea.getAttribute('x1'))
    const y1 = parseFloat(hitarea.getAttribute('y1'))
    const x2 = parseFloat(hitarea.getAttribute('x2'))
    const y2 = parseFloat(hitarea.getAttribute('y2'))
    
    // Calculate distance from point to line segment
    const distance = this.pointToLineDistance(x, y, x1, y1, x2, y2)
    
    // If close enough (within hitarea width), return connection
    if (distance < 5) {
      return hitarea.dataset.clientId
    }
  }
  
  return null
}

/**
 * Calculate distance from point to line segment
 */
pointToLineDistance(px, py, x1, y1, x2, y2) {
  const A = px - x1
  const B = py - y1
  const C = x2 - x1
  const D = y2 - y1
  
  const dot = A * C + B * D
  const lenSq = C * C + D * D
  let param = -1
  
  if (lenSq !== 0) {
    param = dot / lenSq
  }
  
  let xx, yy
  
  if (param < 0) {
    xx = x1
    yy = y1
  } else if (param > 1) {
    xx = x2
    yy = y2
  } else {
    xx = x1 + param * C
    yy = y1 + param * D
  }
  
  const dx = px - xx
  const dy = py - yy
  
  return Math.sqrt(dx * dx + dy * dy)
}
```

## Delete Button (Optional Enhancement)

Show delete button on connection hover:

```javascript
/**
 * Show delete button at line midpoint
 */
showDeleteButton(clientId, lineElement) {
  // Remove any existing delete buttons
  this.hideDeleteButton()
  
  const x1 = parseFloat(lineElement.getAttribute('x1'))
  const y1 = parseFloat(lineElement.getAttribute('y1'))
  const x2 = parseFloat(lineElement.getAttribute('x2'))
  const y2 = parseFloat(lineElement.getAttribute('y2'))
  
  // Calculate midpoint
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  
  // Create button
  const button = document.createElement('button')
  button.className = 'connection-delete-btn'
  button.dataset.clientId = clientId
  button.textContent = '×'
  button.style.cssText = `
    position: absolute;
    left: ${midX}px;
    top: ${midY}px;
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
  
  button.addEventListener('click', () => {
    this.store.removeConnection(clientId)
    this.hideDeleteButton()
  })
  
  document.body.appendChild(button)
}

/**
 * Hide delete button
 */
hideDeleteButton() {
  document.querySelectorAll('.connection-delete-btn').forEach(btn => btn.remove())
}
```

## Comparison with Old Connection Manager

| Old Connection Manager | New Connection Renderer |
|------------------------|-------------------------|
| Keyed by `${sourceId}-${targetId}` | Keyed by `clientId` |
| DOM queries for connections | In-memory Map |
| Mixed concerns (rendering + state) | Pure rendering |
| Separate file | Integrated with Store subscription |
| Properties tracked on object | Properties in Connection model |

## Additional Considerations

### Bezier Curves (Optional Enhancement)

Current implementation uses straight lines. For curved connections:

```javascript
calculateConnectionPoints(sourceNode, targetNode) {
  // ... calculate x1, y1, x2, y2 ...
  
  // Control points for Bezier curve
  const dx = x2 - x1
  const tension = 0.3
  
  const cx1 = x1 + dx * tension
  const cy1 = y1
  const cx2 = x2 - dx * tension
  const cy2 = y2
  
  return { x1, y1, x2, y2, cx1, cy1, cx2, cy2 }
}

// Use path instead of line for curves
const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
path.setAttribute('d', `M ${x1} ${y1} C ${cx1} ${cy1} ${cx2} ${cy2} ${x2} ${y2}`)
```

### Connection Labels (Optional Enhancement)

Add labels to connections:

```javascript
renderConnection(connection) {
  // ... create line and hitarea ...
  
  // Create label
  const label = document.createElementNS('http://www.w3.org/2000/svg', 'text')
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  
  label.setAttribute('x', midX)
  label.setAttribute('y', midY)
  label.setAttribute('text-anchor', 'middle')
  label.setAttribute('fill', '#333')
  label.setAttribute('font-size', '12')
  label.textContent = connection.label || ''
  
  this.svg.appendChild(label)
  
  this.elements.set(connection.clientId, { line, hitarea, label })
}
```

## Testing Strategy

Unit tests should cover:

1. **Rendering**: Connection lines created correctly
2. **Position Updates**: Lines update when nodes move
3. **Deletion**: Elements removed on connection remove
4. **Graph Restore**: All connections re-rendered on restore
5. **Client ID Keys**: Map uses clientId, not source/target

```javascript
// rendering/__tests__/ConnectionRenderer.test.js
import ConnectionRenderer from '../ConnectionRenderer.js'
import Store from '../../state/Store.js'
import Connection from '../../models/Connection.js'
import Node from '../../models/Node.js'

describe('ConnectionRenderer', () => {
  let svg, store, renderer
  
  beforeEach(() => {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    document.body.appendChild(svg)
    store = new Store()
    renderer = new ConnectionRenderer(svg, store)
  })
  
  afterEach(() => {
    renderer.destroy()
    svg.remove()
  })
  
  it('renders connection on connection:add', () => {
    const node1 = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })
    const node2 = new Node({ clientId: 'n2', type: 'action', position: { x: 200, y: 0 } })
    const conn = new Connection({ clientId: 'c1', sourceId: 'n1', targetId: 'n2' })
    
    store.addNode(node1)
    store.addNode(node2)
    store.addConnection(conn)
    
    expect(renderer.elements.has('c1')).toBe(true)
    expect(svg.querySelectorAll('line').length).toBe(2) // line + hitarea
  })
  
  it('updates connection position on node:update', () => {
    const node1 = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })
    const node2 = new Node({ clientId: 'n2', type: 'action', position: { x: 200, y: 0 } })
    const conn = new Connection({ clientId: 'c1', sourceId: 'n1', targetId: 'n2' })
    
    store.addNode(node1)
    store.addNode(node2)
    store.addConnection(conn)
    
    store.updateNode('n1', { position: { x: 100, y: 0 } })
    
    const elements = renderer.elements.get('c1')
    expect(elements.line.getAttribute('x1')).toBe('250') // 100 + 150 (node width)
  })
  
  it('removes connection on connection:remove', () => {
    const node1 = new Node({ clientId: 'n1', type: 'root', position: { x: 0, y: 0 } })
    const node2 = new Node({ clientId: 'n2', type: 'action', position: { x: 200, y: 0 } })
    const conn = new Connection({ clientId: 'c1', sourceId: 'n1', targetId: 'n2' })
    
    store.addNode(node1)
    store.addNode(node2)
    store.addConnection(conn)
    store.removeConnection('c1')
    
    expect(renderer.elements.has('c1')).toBe(false)
    expect(svg.querySelectorAll('line').length).toBe(0)
  })
})
```

## Completion Checklist

- [ ] ConnectionRenderer tracks connections by clientId
- [ ] O(1) lookups via Map
- [ ] Two SVG elements per connection (line + hitarea)
- [ ] Updates on node position changes
- [ ] Handles graph:restore event
- [ ] Optional: Hit-testing for click detection
- [ ] Optional: Delete button on hover
- [ ] Optional: Bezier curves
- [ ] Unit tests pass