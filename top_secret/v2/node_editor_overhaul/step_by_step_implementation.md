# Node Editor Overhaul - Step by Step Implementation

## Implementation Phases

This document outlines the ordered implementation steps with dependencies. Each step is documented in detail in its own file under `steps/`.

## Phase 1: Foundation

### Step 01: Data Models ([steps/01_data_models.md](./steps/01_data_models.md))

**Goal:** Define immutable data models for Graph, Node, and Connection with client-side UUIDs.

**Files to create:**
- `app/javascript/editorV2/models/Graph.js`
- `app/javascript/editorV2/models/Node.js`
- `app/javascript/editorV2/models/Connection.js`
- `app/javascript/editorV2/utils/uuid.js`
- `app/javascript/editorV2/utils/validators.js`
- `app/javascript/editorV2/constants.js`

**Dependencies:** None

**Key deliverables:**
- `Graph` class with node/connection management methods
- `Node` class with `clientId`, `serverId`, `type`, `position`, `data`
- `Connection` class with `clientId`, `serverId`, `sourceId`, `targetId`
- UUID generation utility
- JSON serialization/deserialization

---

### Step 02: State Manager ([steps/02_state_manager.md](./steps/02_state_manager.md))

**Goal:** Create central state store with immutable updates and subscriber pattern.

**Files to create:**
- `app/javascript/editorV2/state/Store.js`

**Dependencies:** Step 01 (Data Models)

**Key deliverables:**
- `Store` class with graph and viewState
- Immutable update methods
- Subscriber pattern for state changes
- State separation: graph state (undoable) vs view state (not undoable)

---

## Phase 2: Core Functionality

### Step 03: Undo/Redo Manager ([steps/03_undo_redo_manager.md](./steps/03_undo_redo_manager.md))

**Goal:** Implement snapshot-based undo/redo with client ID stability.

**Files to create:**
- `app/javascript/editorV2/state/History.js`

**Dependencies:** Step 02 (State Manager)

**Key deliverables:**
- `History` class managing snapshot stack
- `push()`, `undo()`, `redo()` methods
- Snapshot of entire graph state (JSON)
- Client IDs preserved across undo/redo operations
- View state excluded from history

---

### Step 04: Sync Layer ([steps/04_sync_layer.md](./steps/04_sync_layer.md))

**Goal:** Handle server synchronization with optimistic updates and rollback.

**Files to create:**
- `app/javascript/editorV2/sync/SyncManager.js`

**Dependencies:** Step 02 (State Manager)

**Key deliverables:**
- `SyncManager` class for all server communication
- Optimistic updates (UI updates immediately)
- Background API calls
- Rollback on failure
- Client ID to server ID mapping
- Error handling with user notifications

---

## Phase 3: User Interface

### Step 05: Rendering Layer ([steps/05_rendering_layer.md](./steps/05_rendering_layer.md))

**Goal:** Create/update DOM elements from state with no business logic.

**Files to create:**
- `app/javascript/editorV2/rendering/NodeRenderer.js`
- `app/javascript/editorV2/rendering/ConnectionRenderer.js`

**Dependencies:** Step 02 (State Manager)

**Key deliverables:**
- `NodeRenderer` class subscribed to Store updates
- `ConnectionRenderer` class for SVG connection lines
- Element caches: `clientId` → DOM element
- Pure rendering functions (no side effects)
- Automatic updates on state changes

---

### Step 06: Event Handlers ([steps/06_event_handlers.md](./steps/06_event_handlers.md))

**Goal:** Handle user interactions and translate to state changes.

**Files to create:**
- `app/javascript/editorV2/handlers/DragHandler.js`
- `app/javascript/editorV2/handlers/ConnectionHandler.js`
- `app/javascript/editorV2/handlers/ClickHandler.js`

**Dependencies:** Step 02 (State Manager), Step 05 (Rendering Layer)

**Key deliverables:**
- `DragHandler` for node drag operations
- `ConnectionHandler` for connection creation/deletion
- `ClickHandler` for node selection and editor panel
- All handlers update Store first, then sync with server

---

### Step 07: Connection Manager ([steps/07_connection_manager.md](./steps/07_connection_manager.md))

**Goal:** Virtualize connection drawing and hit-testing.

**Dependencies:** Step 02 (State Manager), Step 05 (Rendering Layer)

**Key deliverables:**
- Connection tracking by `clientId` (stable across undo/redo)
- Bezier curve calculations
- Hit-testing for connection clicks
- Two SVG elements per connection (visible + hitarea)

**Note:** This is largely absorbed into `ConnectionRenderer.js` from Step 05. The rendering layer already tracks connections by `clientId` in a Map for O(1) lookups. See step file for details.

---

### Step 08: Keyboard Shortcuts ([steps/08_keyboard_shortcuts.md](./steps/08_keyboard_shortcuts.md))

**Goal:** Implement keyboard bindings for undo/redo and other actions.

**Files to create:**
- `app/javascript/editorV2/handlers/KeyboardHandler.js`

**Dependencies:** Step 03 (Undo/Redo Manager)

**Key deliverables:**
- `KeyboardHandler` class
- Undo: Ctrl+Z / Cmd+Z
- Redo: Ctrl+Shift+Z / Cmd+Shift+Z / Ctrl+Y
- Delete: Delete key / Backspace (for selected node)
- Cross-platform support (Ctrl for Windows/Linux, Cmd for Mac)

---

## Phase 4: Integration

### Step 09: API Integration ([steps/09_api_integration.md](./steps/09_api_integration.md))

**Goal:** Adapt existing API endpoints to work with client IDs.

**Files to create:**
- `app/javascript/editorV2/api.js` (or modify existing)

**Dependencies:** Step 04 (Sync Layer), Step 05 (Rendering Layer), Step 07 (Connection Manager)

**Key deliverables:**
- API wrapper with client ID to server ID mapping
- Load existing bot with client ID assignment
- Create/update/delete operations with ID mapping
- No backend changes required

---

## Phase 5: Migration

### Step 10: Switchover ([steps/10_switchover.md](./steps/10_switchover.md))

**Goal:** Replace old editor with new editorV2 in production.

**Dependencies:** All previous steps

**Key deliverables:**
- New entry point: `app/javascript/editorV2/index.js`
- Wiring all components together
- Rails view update to use new entry point
- Build configuration (Webpacker/Import map)
- Testing checklist verification
- Remove old editor after verification

---

## Dependency Graph

```
Step 01: Data Models
    ↓
Step 02: State Manager
    ↓
Step 03: Undo/Redo Manager ───────────────────┐
    ↓                                         │
Step 04: Sync Layer                           │
    ↓                                         ↓
Step 05: Rendering Layer                  Step 08: Keyboard Shortcuts
    ↓
Step 06: Event Handlers
    ↓
Step 07: Connection Manager
    ↓
Step 09: API Integration
    ↓
Step 10: Switchover
```

## Testing Strategy

Each step should include:

1. **Unit tests** for the new module
2. **Integration tests** with dependent modules
3. **Manual testing** in browser
4. **Regression tests** against existing test suite

## Rollback Plan

If issues arise during Switchover (Step 10):

1. Revert Rails view change (single file)
2. Original `editor/` folder still exists
3. No database changes to undo
4. Clean fallback with no data loss

## Success Metrics

After Step 10:

- [ ] All existing undo/redo tests pass
- [ ] Complex multi-operation workflow test passes
- [ ] Node IDs stable across all operations
- [ ] Connections reference correctly after undo/redo
- [ ] No double-deletion errors
- [ ] No stale ID references
- [ ] Performance acceptable (<100ms for operations)
- [ ] Page reload preserves state
- [ ] Browser back/forward works