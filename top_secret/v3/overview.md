# Node Editor Overhaul - Overview

## Project Goal

Rebuild the node editor with stable identity and clean undo/redo functionality for the chess bot AI visual node-based editor.

## Core Principles

### 1. Client-Side UUIDs for All Graph Elements
- Every node and connection gets a `clientId` (UUID) on creation
- ClientIds never change across undo/redo operations
- Server stores mapping: `clientId` → database ID
- Database IDs (`serverId`) are secondary and nullable for new nodes

### 2. Immutable State with Snapshot-Based Undo/Redo
- Entire graph state captured as JSON snapshots
- No diffing or ID mapping required during undo/redo
- View state (zoom, pan, selection) separate from graph state
- Plain JavaScript objects with spread operators - no Immer or other libraries

### 3. Separation of Concerns
- **Graph State** (undo/redo eligible): nodes, connections, positions, data
- **View State** (not in history): zoom level, pan offset, selected node, editing panel state
- **Rendering Layer**: Pure DOM updates driven by state changes
- **Handlers**: Translate user interactions to state changes

### 4. Single Source of Truth
- `Store` class holds all state
- All subscribers receive state updates from same Store instance
- No state scattered across multiple objects or DOM elements

### 5. Optimistic UI Updates
- UI updates immediately on user action
- Server syncs in background
- Rollback to previous state on failure
- User-friendly error banners on sync failures

## Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Node IDs | Client-generated UUIDs | Stable across undo/redo; server maps to DB IDs |
| State Management | Plain JS + spread | No dependency; easy to debug; sufficient for scope |
| Undo/Redo | Snapshot-based | Entire graph state captured; no diffing needed |
| Optimistic Updates | Yes, with sync confirmation | Responsive UI; rollback on failure |
| Migration | Parallel `editorV2/` folder | Safe; can test before swap |
| Connection Tracking | In-memory Map keyed by `clientId` | O(1) lookup; no DOM queries; stable IDs |
| State Location | Single Store class | Single source of truth; all subscribers get same state |
| Circular Dependencies | None | History passed explicitly, not via Store.history |
| Event Names | Constants in EVENTS object | Prevents typos; IDE autocomplete; easy refactoring |
| History Push Timing | After successful sync | History always reflects saved state |
| Event Handlers | Pre-bound in constructor | Fixes removeEventListener bug |
| Async Operations | AbortController for cancellation | Prevents race conditions on deleted nodes |
| Batch Operations | Depth tracking with error on mismatch | Prevents orphaned batch state |
| History Ownership | SyncManager only | Handlers never push directly |

---

## Fixes Applied (2026-03-13)

### Modularity Fixes

1. **Removed Store ↔ History circular dependency**
   - Store no longer holds `history` reference
   - Components receive History explicitly: `new KeyboardHandler(store, history, syncManager)`
   - Use `history.canUndo()` directly instead of `store.canUndo()`

2. **Added api.js as explicit dependency**
   - NodeRenderer receives `api` parameter for preview fetching
   - No more `store.history.syncManager.clientToServer` property chains

3. **Added EVENTS constant**
   - All event names in `constants.js`: `EVENTS.NODE_ADD`, `EVENTS.CONNECTION_ADD`, etc.
   - Prevents typos like `'node:add'` vs `'node:ad'`

### Security Fixes

4. **CSRF token validation**
   - API constructor throws if CSRF token missing
   - Better than silent failure with empty string

5. **Response validation**
   - Added `validateNodeResponse()` and `validateConnectionResponse()`
   - Throws on malformed server data

### Bug Fixes

6. **Event listener cleanup (bind issue)**
   - Handlers pre-bound in constructor: `this.boundHandleMouseMove = this.handleMouseMove.bind(this)`
   - `addEventListener` and `removeEventListener` use same reference

7. **AbortController for preview fetch**
   - NodeRenderer tracks pending fetches in `Map`
   - Cancels fetch when node deleted
   - Checks `element.isConnected` before DOM update

8. **Batch depth tracking**
   - History tracks `batchDepth` counter
   - Throws on unbalanced `endBatch()` calls
   - `batch(description, fn)` wrapper for safe cleanup

9. **History push timing**
   - SyncManager pushes to history AFTER successful server sync
   - Previously pushed before, causing inconsistent state on failure

10. **Removed duplicate deleteSelected() method**
    - KeyboardHandler had the method defined twice
    - Fixed documentation to show single implementation

11. **SyncManager owns all history pushes**
    - Handlers (DragHandler, ConnectionHandler, etc.) never call history.push() directly
    - History only pushed after successful server sync
    - Fixes bug where drag pushed history before sync confirmed

## Migration Strategy

1. Build new editor in `app/javascript/editorV2/` folder
2. Implement all features in parallel with existing editor
3. Test thoroughly with existing test suite
4. Swap Rails view to use `editorV2` entry point
5. Remove old `editor/` folder after verification

## Success Criteria

- [ ] All existing undo/redo tests pass
- [ ] Complex multi-operation workflow test passes
- [ ] Node IDs stable across all undo/redo operations
- [ ] Connections maintain references correctly after undo/redo
- [ ] Page reload preserves state
- [ ] No double-deletion or stale ID issues
- [ ] Responsive UI with optimistic updates

## Testing Considerations

When writing tests for undo/redo operations:
- **Never rely on element IDs** - They may change on undo/redo
- **Find nodes by properties** - Use `data-client-id` attributes which are stable
- **Test state, not implementation** - Verify the Store state, not DOM elements
- **Use Vitest** - Preferred for ES modules and speed

## Optional Chaining for DOM Elements

All DOM queries use optional chaining (`?.`) to prevent errors whenelements are not found:

```javascript
const canvas = document.getElementById('nodes-canvas')
const canvasRect = canvas?.getBoundingClientRect()
if (!canvasRect) return  // Safety check

const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || ''
```

This prevents crashes if:
- DOM elements are not yet rendered
- Elements are removed during operation
- Page is not fully loaded

## Reference

This overhaul addresses the core issues identified in the current undo/redo system where nodes are recreated with new database IDs during undo/redo operations, causing connection references to become stale.