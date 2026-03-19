# Node Editor Overhaul - Step by Step Implementation

## Implementation Phases

This document outlines the ordered implementation steps with dependencies. Each step is documented in detail in its own file under `steps/`.

## Phase 1: Foundation

### Step 01: Data Models ([steps/01_data_models.md](./steps/01_data_models.md))

**Goal:** Define immutable data models for Graph, Node, and Connection with client-side UUIDs. Also create utilities and constants.

**Files to create:**
- `app/javascript/editorV2/models/Graph.js`
- `app/javascript/editorV2/models/Node.js`
- `app/javascript/editorV2/models/Connection.js`
- `app/javascript/editorV2/utils/uuid.js`
- `app/javascript/editorV2/utils/validators.js`
- `app/javascript/editorV2/utils/errors.js`
- `app/javascript/editorV2/constants.js`

**Dependencies:** None

**Key deliverables:**
- `Graph` class with node/connection management methods
- `Node` class with `clientId`, `serverId`, `type`, `position`, `data`
- `Connection` class with `clientId`, `serverId`, `sourceId`, `targetId`
- UUID generation utility
- Validation utilities
- Error display utilities (XSS-safe)
- Constants including `EVENTS` object, `MAX_HISTORY`, and styling values
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

### Step 04: API Layer ([steps/04_api_layer.md](./steps/04_api_layer.md))

**Goal:** Create API wrapper for HTTP communication with client/server ID translation.

**Files to create:**
- `app/javascript/editorV2/api.js`

**Dependencies:** Step 01 (Data Models)

**Key deliverables:**
- `API` class with CSRF token validation
- Client ID ↔ server ID mapping ( Maps)
- All HTTP operations: create/update/delete nodes and connections
- `loadBot()` with client ID assignment for existing data
- `getNodePreviewHtml()` for fetching node preview HTML

---

### Step 05: Sync Layer ([steps/05_sync_layer.md](./steps/05_sync_layer.md))

**Goal:** Handle server synchronization with optimistic updates and rollback.

**Files to create:**
- `app/javascript/editorV2/sync/SyncManager.js`

**Dependencies:** Step 02 (State Manager), Step 03 (History), Step 04 (API Layer)

**Key deliverables:**
- `SyncManager` class for all server communication
- Optimistic updates (UI updates immediately)
- Background API calls via API class
- Rollback on failure
- **CRITICAL: SyncManager owns ALL history.push() calls**
- Error handling with user notifications

---

## Phase 3: User Interface

### Step 06: Rendering Layer ([steps/06_rendering_layer.md](./steps/06_rendering_layer.md))

**Goal:** Create/update DOM elements from state with no business logic.

**Files to create:**
- `app/javascript/editorV2/rendering/NodeRenderer.js`
- `app/javascript/editorV2/rendering/ConnectionRenderer.js`

**Dependencies:** Step 02 (State Manager), Step 04 (API Layer - for preview fetching)

**Key deliverables:**
- `NodeRenderer` class subscribed to Store updates
- `ConnectionRenderer` class for SVG connection lines
- Element caches: `clientId` → DOM element
- Pure rendering functions (no side effects)
- Automatic updates on state changes
- AbortController for canceling pending preview fetches

---

### Step 07: Event Handlers ([steps/07_event_handlers.md](./steps/07_event_handlers.md))

**Goal:** Handle user interactions and translate to state changes.

**Files to create:**
- `app/javascript/editorV2/handlers/DragHandler.js`
- `app/javascript/editorV2/handlers/ConnectionHandler.js`
- `app/javascript/editorV2/handlers/ClickHandler.js`

**Dependencies:** Step 02 (State Manager), Step 03 (History), Step 05 (Sync Layer), Step 06 (Rendering Layer)

**Key deliverables:**
- `DragHandler` for node drag operations
- `ConnectionHandler` for connection creation/deletion
- `ClickHandler` for node selection and editor panel
- **All handlers call SyncManager methods, never history.push() directly**
- Pre-bound event handlers (fixes removeEventListener bug)

---

### Step 08: Keyboard Shortcuts ([steps/08_keyboard_shortcuts.md](./steps/08_keyboard_shortcuts.md))

**Goal:** Implement keyboard bindings for undo/redo and other actions.

**Files to create:**
- `app/javascript/editorV2/handlers/KeyboardHandler.js`

**Dependencies:** Step 02 (State Manager), Step 03 (History), Step 05 (Sync Layer)

**Key deliverables:**
- `KeyboardHandler` class
- Undo: Ctrl+Z / Cmd+Z
- Redo: Ctrl+Shift+Z / Cmd+Shift+Z / Ctrl+Y
- Delete: Delete key / Backspace (for selected node)
- Cross-platform support (Ctrl for Windows/Linux, Cmd for Mac)
- **Receives History directly (not via Store)**

---

## Phase 4: Integration

### Step 09: Switchover ([steps/09_switchover.md](./steps/09_switchover.md))

**Goal:** Wire all components together and replace old editor with new editorV2.

**Files to create:**
- `app/javascript/editorV2/index.js`

**Dependencies:** All previous steps

**Key deliverables:**
- New entry point: `app/javascript/editorV2/index.js`
- Wiring all components together (explicit dependency injection)
- Rails view update to use new entry point
- Importmap configuration update
- Testing checklist verification
- Form handler integration (NodeFormHandler from existing editor)
- Remove old editor after verification

---

## Dependency Graph

```
Step 01: Data Models + Utils + Constants
    ↓
Step 02: State Manager (Store)
    ↓
Step 03: Undo/Redo Manager (History)
    ↓                        ↘
Step 04: API Layer            Step 08: Keyboard Shortcuts
    ↓                            ↓
Step 05: Sync Layer ←───────────┘
    ↓
Step 06: Rendering Layer
    ↓
Step 07: Event Handlers
    ↓
Step 09: Switchover
```

**Critical dependency chain:**
1. Models/Utils/Constants (no dependencies)
2. Store (depends on Models + Constants)
3. History (depends on Store)
4. API Layer (depends on Models)
5. SyncManager (depends on Store, History, API)
6. Renderers (depend on Store + API)
7. Handlers (depend on Store, History, SyncManager, Renderers)
8. KeyboardHandler (depends on Store, History, SyncManager)
9. Index (wires everything together)

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