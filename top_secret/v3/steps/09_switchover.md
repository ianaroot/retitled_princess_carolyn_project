# Step 09: Switchover

## Goal

Wire all components together and replace old editor with new editorV2.

## Dependencies

All previous steps must be complete and tested.

## New Files

```
app/javascript/editorV2/
└── index.js  # New entry point
```

## Implementation

### index.js (Entry Point)

Wires everything together and exposes initialization function.

**IMPORTANT:** All dependencies are passed explicitly. No circular dependencies. History is NOT stored in Store.

```javascript
// app/javascript/editorV2/index.js

import Store from './state/Store.js'
import History from './state/History.js'
import API from './api.js'
import SyncManager from './sync/SyncManager.js'
import NodeRenderer from './rendering/NodeRenderer.js'
import ConnectionRenderer from './rendering/ConnectionRenderer.js'
import DragHandler from './handlers/DragHandler.js'
import ConnectionHandler from './handlers/ConnectionHandler.js'
import ClickHandler from './handlers/ClickHandler.js'
import KeyboardHandler from './handlers/KeyboardHandler.js'
import { MAX_HISTORY } from './constants.js'

/**
 * Initialize the node editor
 * @param {number} botId - Bot ID to load
 * @param {HTMLElement} container - Container element for nodes
 * @param {HTMLElement} svgContainer - SVG element for connections
 * @param {HTMLElement} editorPanel - Editor panel element
 * @returns {Promise<Object>} API for external access
 */
export async function initEditor(botId, container, svgContainer, editorPanel) {
  console.log('Initializing editorV2 for bot', botId)
  
  // 1. Initialize core components (all dependencies explicit)
  const api = new API(botId)
  const store = new Store()
  const history = new History(store, MAX_HISTORY)
  const syncManager = new SyncManager(store, history, api)
  
  // NO: Don't set store.history = history (avoids circular dependency)
  // Components receive history explicitly when needed
  
  // 2. Load existing bot data
  let initialGraph
  try {
    initialGraph = await api.loadBot()
    store.replaceGraph(initialGraph)
    
    // Push initial state to history
    history.push('Initial state')
    
    console.log('Loaded', initialGraph.nodes.size, 'nodes and', initialGraph.connections.size, 'connections')
  } catch (error) {
    console.error('Failed to load bot:', error)
    showError('Failed to load bot data. Please refresh the page.')
    throw error
  }
  
  // 3. Initialize renderers (pass api for preview fetching)
  const nodeRenderer = new NodeRenderer(container, store, api)
  const connectionRenderer = new ConnectionRenderer(svgContainer, store)
  
  // 4. Initialize handlers (pass history explicitly)
  const dragHandler = new DragHandler(store, syncManager, history)
  const connectionHandler = new ConnectionHandler(store, syncManager, history, connectionRenderer)
  const clickHandler = new ClickHandler(store, history)
  const keyboardHandler = new KeyboardHandler(store, history, syncManager)
  
  // Setup click handler
  clickHandler.editorPanel = editorPanel
  clickHandler.setupGlobalHandlers()
  
  // Setup keyboard handler
  keyboardHandler.attach()
  
  // 5. Attach handlers to initial nodes
  initialGraph.nodes.forEach((node, clientId) => {
    setTimeout(() => {
      const element = document.querySelector(`.node[data-client-id="${clientId}"]`)
      if (element) {
        dragHandler.attach(element, clientId)
        connectionHandler.attach(element, clientId)
        clickHandler.attach(element, clientId)
      }
    }, 0)
  })
  
  // 6. Subscribe to new nodes to attach handlers
  store.subscribe((event, data) => {
    if (event === 'node:add') {  // Use EVENTS constant in production
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
  
  // 7. Initialize UI
  history.updateUI()
  
  // 8. Return public API
  return {
    store,
    history,
    syncManager,
    api,
    
    // Convenience methods
    createNode: (type, position, data) => syncManager.createNode(type, position, data),
    deleteNode: (clientId) => syncManager.deleteNode(clientId),
    createConnection: (sourceId, targetId) => syncManager.createConnection(sourceId, targetId),
    deleteConnection: (clientId) => syncManager.deleteConnection(clientId),
    undo: () => history.undo(),
    redo: () => history.redo(),
    canUndo: () => history.canUndo(),
    canRedo: () => history.canRedo(),
    
    // Cleanup
    destroy: () => {
      nodeRenderer.destroy()
      connectionRenderer.destroy()
      dragHandler.destroy()
      connectionHandler.destroy()
      clickHandler.destroy()
      keyboardHandler.destroy()
    }
  }
}

/**
 * Show error message
 */
function showError(message) {
  const banner = document.createElement('div')
  banner.className = 'editor-error-banner'
  banner.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #c00;
    color: white;
    padding: 15px 25px;
    border-radius: 5px;
    z-index: 10000;
    font-family: sans-serif;
  `
  banner.textContent = message
  document.body.appendChild(banner)
  
  setTimeout(() => banner.remove(), 5000)
}

// Expose globally for Rails views
window.initEditor = initEditor

console.log('editorV2 loaded')
```

### Update Rails View

Single file change to swap from old to new editor:

```erb
<!-- app/views/bots/edit.html.erb -->

<!-- OLD (commented out)
<%= javascript_include_tag 'editor' %>
-->

<!-- NEW -->
<%= javascript_include_tag 'editorV2' %>

<script>
  document.addEventListener('DOMContentLoaded', () => {
    const botId = <%= @bot.id %>;
    const container = document.getElementById('nodes-canvas');
    const svgContainer = document.getElementById('connections-canvas');
    const editorPanel = document.getElementById('node-editor-panel');
    
    // Initialize editorV2
    window.editorV2 = initEditor(botId, container, svgContainer, editorPanel)
      .then(api => {
        console.log('editorV2 initialized successfully');
        window.editorAPI = api;
      })
      .catch(error => {
        console.error('Failed to initialize editorV2:', error);
      });
  });
</script>
```

### Update Webpacker/Import Map

Add editorV2 as a new entry point:

```javascript
// config/webpacker.yml (if using Webpacker)

// Or in app/javascript/packs/application.js
import './editorV2'

// Or create dedicated pack:
// app/javascript/packs/editorV2.js
import '../editorV2/index.js'
```

### Update HTML Template

Ensure the required DOM elements exist:

```erb
<!-- app/views/bots/edit.html.erb (partial) -->

<div id="editor-container">
  <div id="toolbar">
    <!-- Undo/Redo buttons -->
    <button class="btn-undo" disabled>Undo</button>
    <span class="undo-count">(0/50)</span>
    <button class="btn-redo" disabled>Redo</button>
    
    <!-- Node creation buttons -->
    <button class="btn-create" data-type="condition">+ Condition</button>
    <button class="btn-create" data-type="action">+ Action</button>
    <button class="btn-delete">Delete</button>
  </div>
  
  <!-- Canvas for nodes -->
  <div id="nodes-canvas">
    <svg id="connections-canvas"></svg>
  </div>
  
  <!-- Editor panel for editing node properties -->
  <div id="node-editor-panel" class="hidden">
    <div id="node-editor-form">
      <!-- Dynamically populated -->
    </div>
    <button id="save-node">Save</button>
    <button id="cancel-edit">Cancel</button>
  </div>
</div>
```

### Update Button Handlers

Wire create/delete buttons to new API:

```javascript
// In Rails view or separate JS

document.addEventListener('DOMContentLoaded', () => {
  // ... initEditor call ...
  
  // Create node buttons
  document.querySelectorAll('.btn-create').forEach(button => {
    button.addEventListener('click', () => {
      const type = button.dataset.type
      const position = { x: 100, y: 100 }  // Calculate from canvas center
      
      window.editorAPI.createNode(type, position, {})
        .then(clientId => {
          console.log('Created node:', clientId)
        })
        .catch(error => {
          console.error('Failed to create node:', error)
        })
    })
  })
  
  // Delete button
  const deleteModeButton = document.querySelector('.btn-delete')
  let deleteMode = false
  
  deleteModeButton.addEventListener('click', () => {
    deleteMode = !deleteMode
    deleteModeButton.classList.toggle('active', deleteMode)
    
    if (deleteMode) {
      // Next node click will delete
      document.querySelectorAll('.node').forEach(node => {
        node.addEventListener('click', function handler(e) {
          if (deleteMode) {
            const clientId = this.dataset.clientId
            if (confirm('Delete this node?')) {
              window.editorAPI.deleteNode(clientId)
            }
            deleteMode = false
            deleteModeButton.classList.remove('active')
          }
          this.removeEventListener('click', handler)
        })
      })
    }
  })
  
  // Undo/Redo buttons
  document.querySelector('.btn-undo').addEventListener('click', () => {
    window.editorAPI.undo()
  })
  
  document.querySelector('.btn-redo').addEventListener('click', () => {
    window.editorAPI.redo()
  })
})
```

## Testing Checklist

After switchover, verify all functionality:

### Core Functionality

- [ ] Load existing bot with nodes and connections
- [ ] Create new node (Condition)
- [ ] Create new node (Action)
- [ ] Delete node
- [ ] Edit node properties
- [ ] Create connection between nodes
- [ ] Delete connection
- [ ] Drag node to new position
- [ ] Drag node with connected children (cascade)

### Undo/Redo

- [ ] Undo node creation
- [ ] Undo node deletion
- [ ] Undo connection creation
- [ ] Undo connection deletion
- [ ] Undo node drag
- [ ] Undo property edit
- [ ] Redo all of the above
- [ ] Complex multi-operation workflow

### Visual

- [ ] Nodes render correctly
- [ ] Connections render correctly
- [ ] Node preview HTML loads
- [ ] Editor panel opens/closes
- [ ] Selection highlighting works
- [ ] Drag visual feedback

### State Preservation

- [ ] Page reload preserves state (nodes, connections, positions)
- [ ] Browser back/forward works
- [ ] Multiple tabs work independently

### Error Handling

- [ ] Network error shows user-friendly message
- [ ] Failed operations rollback correctly
- [ ] Invalid operations show appropriate errors

### Performance

- [ ] Drag is smooth
- [ ] Undo/redo is instant
- [ ] No memory leaks
- [ ] Handles 50+ nodes gracefully

## Rollback Plan

If issues arise:

1. **Revert Rails view change** (single line):
   ```erb
   <!-- Swap back to old editor -->
   <%= javascript_include_tag 'editor' %>
   ```

2. **Old editor still exists** in `app/javascript/editor/`

3. **No database changes** to undo

4. **User data preserved** - both editors use same backend API

## Removing Old Editor

After successful testing:

```bash
# Remove old editor
rm -rf app/javascript/editor

# Update any remaining references
grep -r "editor" app/javascript/  # Check for import references
grep -r "editor" app/assets/     # Check for asset references

# Update documentation if needed
```

## Post-Switchover Monitoring

Monitor for:

1. **Console errors** - Check browser console for JavaScript errors
2. **Network errors** - Check for 404s or 500s in Network tab
3. **Performance** - Check for slowdown with many nodes
4. **User feedback** - Monitor for usability issues
5. **Memory** - Check for memory leaks (increasing memory over time)

## Completion Checklist

- [ ] `index.js` created with all wiring
- [ ] Rails view updated to load editorV2
- [ ] Build configuration updated (Webpacker/Import map)
- [ ] DOM elements verified (container, SVG, editor panel)
- [ ] Button handlers wired to new API
- [ ] All core functionality tested
- [ ] Undo/redo tested
- [ ] Visual elements verified
- [ ] Error handling verified
- [ ] Performance acceptable
- [ ] Rollback plan documented
- [ ] Old editor removed after verification