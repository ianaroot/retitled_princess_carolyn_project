# Node Editor Overhaul - Current State Analysis

## Current File Structure

```
app/javascript/editor/
├── node_editor.js           # Main entry point
├── undo_manager.js          # History management with full state restore
├── connection_manager.js    # Connection drawing and tracking
├── api.js                   # Backend communication
├── node_drag_handler.js     # Drag handling
├── keyboard_shortcuts.js    # Key bindings
└── constants.js             # Shared constants
```

## Pain Points

### 1. ID Instability (Critical)

**Problem:** Nodes recreated on undo/redo get new database IDs.

**How it happens:**
- `undo_manager.js:restoreFullState()` compares historical node IDs to current node IDs
- When it finds a mismatch (different database ID), it creates a new node
- Server assigns a new database ID
- All connections referencing the old node ID become invalid

**Result:**
- Cascading failures in connection restoration
- Test intermittency due to changing IDs
- Complex ID mapping tables (`idMapping`, `connectionIdMapping`) that are fragile
- Double-deletion attempts for connections

**Code reference:** `undo_manager.js:164-296`

### 2. Connection Tracking Complexity

**Problem:** Connection management evolved from DOM queries to in-memory Map, but still has edge cases.

**Historical context:**
- Originally queried DOM for connection line elements
- Caused double-deletion (each connection has 2 SVG line elements)
- Migrated to `connectionManager.connections` Map
- Keyed by `${sourceId}-${targetId}` which breaks when node IDs change

**Current state:**
- `connection_manager.js:connections` Map tracks connections
- Still keyed by node IDs that may change during undo/redo
- Connection deletion requires filtering by `targetNodeIds` to avoid cascade-delete issues

**Code reference:** `connection_manager.js`, `undo_manager.js:239-290`

### 3. Mixed Concerns in Undo Manager

**Problem:** `undo_manager.js` does too much.

**Responsibilities mixed together:**
1. History state management (push, undo, redo)
2. Node server sync (create, update, delete API calls)
3. Connection server sync
4. DOM manipulation (`visualRestore()`)
5. Visual elements recreation
6. Preview HTML fetching with retry logic
7. Error banner display

**Result:** Hard to test, hard to modify, hard to reason about.

**Code reference:** `undo_manager.js` entire file

### 4. No Central State Store

**Problem:** State scattered across multiple objects.

**State locations:**
- `nodeEditor.nodes` - Map of node data
- `nodeEditor.connectionsCanvas` - DOM reference
- `connectionManager.connections` - Connection Map
- `undoManager.history` - History stack
- `undoManager.currentIndex` - History position
- `undoManager.idMapping` - ID translation table
- DOM elements with `data-id` attributes

**Result:** No single source of truth, state synchronization issues.

### 5. Undo/Redo Algorithm Complexity

**Problem:** `restoreFullState()` is complex and fragile.

**Algorithm:**
1. Compare current node IDs vs target state node IDs
2. Delete nodes that exist now but not in target
3. Create nodes that exist in target but not now
4. **Problem:** Server may assign new IDs → ID mismatch
5. Track ID mapping from old to new
6. Translate connection IDs using mapping
7. Delete connections not in target
8. Create connections not in current
9. Recreate all DOM elements from scratch

**Issues:**
- Every non-drag undo/redo recreates all DOM elements
- Images/previews must be re-fetched
- ID mapping tables can get stale
- Race conditions between API calls

**Code reference:** `undo_manager.js:164-296`

### 6. No Optimistic Updates

**Problem:** UI waits for server responses before showing changes.

**Current flow:**
1. User drags node
2. API call starts
3. UI updates after API responds
4. If API fails, show error

**Better flow:**
1. User drags node
2. UI updates immediately
3. API call starts in background
4. If API fails, rollback UI and show error

**Result:** Feels sluggish, especially on slow connections.

## What Works Well

### Drag Undo/Redo
Position-only changes work correctly because:
- Uses `preDragPositions` and `postDragPositions`
- Just updates positions, doesn't recreate nodes
- No ID changes necessary

**Code reference:** `undo_manager.js:43-68`, `undo_manager.js:84-99`, `undo_manager.js:113-127`

### Visual Node Rendering
Node elements render cleanly with proper HTML structure:
- Node container with position styling
- Content area with dynamic HTML from server
- Connector dots for input/output

**Code reference:** `node_editor.js:renderNode()`

### Connection Drawing
Bezier curve connections work visually:
- Proper SVG rendering
- Lines connect to node connectors
- Curves look good
- Hit areas for click detection

**Code reference:** `connection_manager.js:drawConnection()`

### Keyboard Shortcuts
Undo/redo shortcuts work:
- Ctrl+Z / Cmd+Z for undo
- Ctrl+Shift+Z / Cmd+Shift+Z for redo
- Ctrl+Y for redo (alternative)

**Code reference:** `keyboard_shortcuts.js`

### Error Handling
User-friendly error banners:
- Shows error message
- Dismiss button
- Retained in DOM for screenshot

**Code reference:** `undo_manager.js:313-328`

## Test Coverage

### Passing Tests
- Node drag undo (position changes)
- Node drag redo
- Node creation undo/redo
- Node deletion undo/redo
- Keyboard shortcuts
- Button state management

### Failing Test
- **Complex multi-operation workflow** - Fails during connection redo operations due to unstable node IDs

**Test file:** `spec/features/undo_redo_spec.rb:361-818`

## Dependencies

- No external state management libraries (Redux, MobX, etc.)
- Uses native JavaScript classes and objects
- Rails backend with standard REST API
- Capybara/Selenium for integration testing

## Key Insight

The fundamental design flaw is treating database IDs as stable identifiers. When undo/redo recreates nodes, the server assigns new IDs, breaking all references. The new architecture solves this by using client-generated UUIDs that never change, keeping database IDs as secondary references only.