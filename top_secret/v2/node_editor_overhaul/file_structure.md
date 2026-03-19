# Node Editor Overhaul - File Structure

## New Directory Structure

```
app/javascript/editorV2/
├── index.js                    # Entry point, initializes editor
├── constants.js                # Shared constants (colors, sizes, events)
├── api.js                      # HTTP client, client/server ID translation
│
├── models/
│   ├── Graph.js                # Graph container: nodes, connections, methods
│   ├── Node.js                 # Node model: id (UUID), type, position, data
│   └── Connection.js           # Connection model: id (UUID), sourceId, targetId
│
├── state/
│   ├── Store.js                # Central state: graph, viewState (NO circular dep)
│   └── History.js              # Undo/redo stack with snapshots
│
├── sync/
│   └── SyncManager.js          # Orchestrates API calls, optimistic updates
│
├── rendering/
│   ├── NodeRenderer.js         # Creates/updates node DOM elements
│   └── ConnectionRenderer.js   # Creates/updates connection SVG lines
│
├── handlers/
│   ├── DragHandler.js          # Node drag with position updates
│   ├── ConnectionHandler.js    # Connection creation/deletion
│   ├── ClickHandler.js         # Node selection, editor panel
│   └── KeyboardHandler.js      # Undo/redo shortcuts
│
└── utils/
    ├── uuid.js                 # UUID generation (crypto.randomUUID or fallback)
    ├── validators.js            # Input validation for models
    └── errors.js               # Error display utilities (XSS-safe)
```

## File Responsibilities

### Entry Point

#### `index.js`
- Main initialization function
- Wires together Store, History, SyncManager, Renderers, Handlers
- Loads existing bot from server
- Exposes `initEditor()` globally for Rails view
- Returns public API for external access

#### `constants.js`
- Shared constants used across modules
- Colors (connection stroke, node backgrounds)
- Sizes (node width/height, connector size)
- Templates (node HTML templates)

```javascript
// constants.js - Shared configuration
export const NODE_WIDTH = 150
export const NODE_HEIGHT = 60
export const CONNECTOR_SIZE = 12

export const CONNECTION_COLOR = '#4CAF50'
export const CONNECTION_HITAREA_WIDTH = 10
export const CONNECTION_DELETE_BTN_SIZE = 24

export const MAX_HISTORY = 50

export const NODE_COLORS = {
  root: '#4CAF50',
  condition: '#2196F3',
  action: '#FF9800'
}

// Event names for Store subscriber pattern
// Use constants to prevent typos and enable IDE autocomplete
export const EVENTS = {
  NODE_ADD: 'node:add',
  NODE_UPDATE: 'node:update',
  NODE_REMOVE: 'node:remove',
  CONNECTION_ADD: 'connection:add',
  CONNECTION_UPDATE: 'connection:update',
  CONNECTION_REMOVE: 'connection:remove',
  GRAPH_REPLACE: 'graph:replace',
  GRAPH_RESTORE: 'graph:restore'
}
```

### API Layer

#### `api.js`
- Handles all HTTP communication with Rails backend
- Translates between client IDs (UUID) and server IDs (database IDs)
- Includes CSRF token validation
- Validates server responses
- Used by SyncManager for all network requests

### Models (Pure Data)

#### `models/Graph.js`
- Container for nodes and connections
- Methods: `addNode()`, `removeNode()`, `addConnection()`, `removeConnection()`
- Queries: `getNode()`, `getConnection()`, `getNodesByType()`
- Serialization: `toJSON()`, `fromJSON()`
- No DOM or API dependencies

#### `models/Node.js`
- Pure data class for node
- Properties: `clientId`, `serverId`, `type`, `position`, `data`
- Immutable - create new instances for updates
- No methods that cause side effects

#### `models/Connection.js`
- Pure data class for connection
- Properties: `clientId`, `serverId`, `sourceId`, `targetId`
- References node `clientId`s, not database IDs
- Immutable - create new instances for updates

### State Management

#### `state/Store.js`
- Single source of truth for application state
- Contains: `graph` (Graph instance), `viewState` (zoom, pan, selection)
- Immutable update methods for all state changes
- Subscriber pattern for notifying renderers
- **No DOM manipulation**
- **No history reference** (avoidscircular dependency - see decisions_log.md)

#### `state/History.js`
- Manages undo/redo stack
- Stores snapshots of graph state (JSON)
- Methods: `push()`, `undo()`, `redo()`, `canUndo()`, `canRedo()`
- Calls `Store.replaceGraph()` to restore snapshots
- **Passed explicitly to components that need it** (not via Store)
- Batch tracking to prevent orphaned batches

### Sync Layer

#### `sync/SyncManager.js`
- Handles all server communication
- Optimistic updates: UI updates immediately
- Background sync with API
- Rollback on failure
- Maps client IDs to server IDs
- Error handling and user notifications

### Rendering (State → DOM)

#### `rendering/NodeRenderer.js`
- Subscribes to Store updates
- Creates/removes/updates node DOM elements
- Maintains Map: `clientId` → DOM element
- No business logic, pure rendering
- Updates positions, content, styling

#### `rendering/ConnectionRenderer.js`
- Subscribes to Store updates
- Creates/removes/updates connection SVG lines
- Maintains Map: `clientId` → SVG elements
- Bezier curve calculations
- Updates on node position changes
- No business logic, pure rendering

### Event Handlers (User → State)

#### `handlers/DragHandler.js`
- Attaches to node elements
- Tracks drag state
- **Pre-binds event handlers** (fixes removeEventListener bug)
- Updates node positions in Store
- Notifies SyncManager after drag complete
- Pushes to History after drag

#### `handlers/ConnectionHandler.js`
- Handles connection creation (drag from connector)
- Handles connection deletion
- **Pre-binds event handlers** (fixes removeEventListener bug)
- Creates Connection models
- Updates Store

#### `handlers/ClickHandler.js`
- Node selection management
- Opens editor panel for selected node
- Delete confirmation dialogs
- **Receives Store and History directly** (no circular dependency)

#### `handlers/KeyboardHandler.js`
- Undo/redo keyboard shortcuts (Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y)
- Delete key for selected node
- **Receives History directly** (not via Store canUndo/canRedo)
- Consistent naming convention: `handleXxx` for event handlers

### Utilities

#### `utils/uuid.js`
- Generates RFC 4122 compliant UUIDs
- Uses `crypto.randomUUID()` if available
- Falls back to Math.random-based generation
- Used for all client IDs

#### `utils/validators.js`
- Input validation for node and connection data
- `validateNode()` validates type, position, and data
- `validateConnection()` validates sourceId and targetId
- Returns `{ valid: boolean, errors: string[] }`
- Used in handlers before creating/updating entities

#### `utils/errors.js`
- Shared error handling utility
- `showError()` displays error banner to user
- `showInfo()` displays info banner to user
- Uses `textContent` for XSS safety
- Auto-dismiss after configurable duration
- Used across SyncManager, KeyboardHandler, etc.

## Comparison with Old Structure

| Old | New | Difference |
|-----|-----|------------|
| `node_editor.js` - Does everything | `index.js` + specialized modules | Separation of concerns |
| `undo_manager.js` - Mixed logic | `History.js` + `SyncManager.js` | Undo/redo vs. sync separated |
| `connection_manager.js` - DOM+state | `ConnectionRenderer.js` + `Connection.js` | Model vs. view |
| `api.js` - Simple fetches | `SyncManager.js` - Optimistic + rollback | Proactive sync |
| No models | `models/*.js` | Explicit data structures |
| No central state | `Store.js` | Single source of truth |

## Import Dependencies

```
index.js
├── Store.js
│   ├── Graph.js
│   │   ├── Node.js
│   │   └── Connection.js
│   └── History.js
├── api.js                        # HTTP client, CSRF validation, ID mapping
├── SyncManager.js
│   ├── Store.js
│   ├── History.js
│   └── api.js
├── NodeRenderer.js
│   ├── Store.js
│   └── api.js                   # For preview fetchwith abort support
├── ConnectionRenderer.js
│   └── Store.js
├── DragHandler.js
│   ├── Store.js
│   ├── History.js
│   └── SyncManager.js
├── ConnectionHandler.js
│   ├── Store.js
│   ├── History.js
│   ├── SyncManager.js
│   └── uuid.js
├── ClickHandler.js
│   ├── Store.js
│   └── History.js
└── KeyboardHandler.js
    ├── Store.js
    └── History.js
```

**Note:** History is passed directly to handlers that need it, NOT accessed via Store.history. This avoids circular dependencies.

## Build Integration

Add to `app/javascript/packs/application.js` or equivalent:

```javascript
import { initEditor } from 'editorV2'
window.initEditor = initEditor
```

Or create dedicated pack:

```javascript
// app/javascript/packs/editorV2.js
import { initEditor } from 'editorV2'
window.initEditor = initEditor
```

## Database Changes

**None required.** Existing database schema works with new architecture:
- Nodes table: `id`, `bot_id`, `node_type`, `position_x`, `position_y`, `data`
- NodeConnections table: `id`, `source_node_id`, `target_node_id`

Client IDs stored in JavaScript memory only, mapped to database IDs in SyncManager.