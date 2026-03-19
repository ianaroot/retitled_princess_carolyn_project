# Step 08: Keyboard Shortcuts

## Goal

Implement keyboard bindings for undo/redo and other actions.

## Files to Create

```
app/javascript/editorV2/
└── handlers/
    └── KeyboardHandler.js
```

## Dependencies

- Step 02: State Manager (Store)
- Step 03: History (passed directly, NOT via Store.history)
- Step 04: Sync Layer (SyncManager)

## Implementation

### KeyboardHandler.js

Handles all keyboard shortcuts for the editor.

**IMPORTANT:** Receives History directly in constructor (not via Store.history) to avoid circular dependency.

**Naming Convention:** Use `handleXxx` for event handler methods, plain verbs for actions.

```javascript
// handlers/KeyboardHandler.js

import { showError } from '../utils/errors.js'

/**
 * Handles keyboard shortcuts for the node editor
 * - Undo: Ctrl+Z / Cmd+Z
 * - Redo: Ctrl+Shift+Z / Cmd+Shift+Z / Ctrl+Y
 * - Delete: Delete / Backspace (for selected node)
 * - Escape: Deselect / Close editor panel
 */
class KeyboardHandler {
  constructor(store, history, syncManager) {
    this.store = store
    this.history = history  // Passed directly, NOT store.history
    this.syncManager = syncManager
    
    this.enabled = true
  }
  
  /**
   * Attach keyboard listener
   */
  attach() {
    document.addEventListener('keydown', this.handleKeyDown.bind(this))
  }
  
  /**
   * Detach keyboard listener
   */
  detach() {
    document.removeEventListener('keydown', this.handleKeyDown.bind(this))
  }
  
  /**
   * Handle keydown events
   */
  handleKeyDown(event) {
    // Ignore if disabled
    if (!this.enabled) return
    
    // Ignore if focus is in input/textarea
    if (this.isInputFocused()) return
    
    // Undo: Ctrl+Z / Cmd+Z
    if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
      event.preventDefault()
      this.undo()
      return
    }
    
    // Redo: Ctrl+Shift+Z / Cmd+Shift+Z
    if ((event.ctrlKey || event.metaKey) && event.key === 'z' && event.shiftKey) {
      event.preventDefault()
      this.redo()
      return
    }
    
    // Redo: Ctrl+Y / Cmd+Y
    if ((event.ctrlKey || event.metaKey) && event.key === 'y') {
      event.preventDefault()
      this.redo()
      return
    }
    
    // Delete selected node: Delete / Backspace
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      this.deleteSelected()
      return
    }
    
    // Escape: Deselect / Close editor panel
    if (event.key === 'Escape') {
      event.preventDefault()
      this.escape()
      return
    }
  }
  
  /**
   * Check if an input element is focused
   */
  isInputFocused() {
    const activeElement = document.activeElement
    const tagName = activeElement.tagName.toLowerCase()
    
    return tagName === 'input' ||
           tagName === 'textarea' ||
           tagName === 'select' ||
           activeElement.isContentEditable
  }
  
  /**
   * Undo last operation
   */
  undo() {
    if (this.history.canUndo()) {
      this.history.undo()
    }
  }
  
  /**
   * Redo next operation
   */
  redo() {
    if (this.history.canRedo()) {
      this.history.redo()
    }
  }
  
  /**
   * Delete selected node (uses shared error utility for XSS safety)
   * NOTE: Does NOT call store.removeNode() directly - SyncManager handles everything
   */
  deleteSelected() {
    const selectedClientId = this.store.viewState.selectedNodeId
    
    if (!selectedClientId) return
    
    const node = this.store.getNode(selectedClientId)
    if (!node) return
    
    // Can't delete root node
    if (node.type === 'root') {
      showError('Cannot delete the root node')
      return
    }
    
    // Confirm deletion
    if (!confirm(`Delete this ${node.type} node?`)) return
    
    // Clear selection first (before SyncManager removes the node)
    this.store.setSelectedNodeId(null)
    this.store.setEditingNodeId(null)
    
    // SyncManager handles: optimistic store update, server sync, history push, rollback
    this.syncManager.deleteNode(selectedClientId)
      .catch(err => {
        console.error('Failed to delete node:', err)
        // Note: Rollback handled by SyncManager
      })
  }
  
  /**
   * Escape: Deselect node or close editor panel
   */
  escape() {
    // Close editor panel if open
    if (this.store.viewState.editingNodeId) {
      this.store.setEditingNodeId(null)
      const panel = document.getElementById('node-editor-panel')
      if (panel) {
        panel.classList.add('hidden')
      }
      return
    }
    
    // Deselect node if selected
    if (this.store.viewState.selectedNodeId) {
      this.store.setSelectedNodeId(null)
      
      // Remove selection visual
      document.querySelectorAll('.node.selected').forEach(el => {
        el.classList.remove('selected')
      })
      return
    }
  }
  
  /**
   * Enable keyboard shortcuts
   */
  enable() {
    this.enabled = true
  }
  
  /**
   * Disable keyboard shortcuts
   */
  disable() {
    this.enabled = false
  }
  
  /**
   * Cleanup handler
   */
  destroy() {
    this.detach()
  }
}

export default KeyboardHandler
```

## Keyboard Shortcut Reference

| Key Combination | Action | Context |
|----------------|--------|---------|
| Ctrl+Z / Cmd+Z | Undo | Global (except input focus) |
| Ctrl+Shift+Z / Cmd+Shift+Z | Redo | Global (except input focus) |
| Ctrl+Y / Cmd+Y | Redo | Global (except input focus) |
| Delete / Backspace | Delete selected node | When node selected |
| Escape | Deselect / Close panel | Global |

## Platform Differences

The handler supports both Windows/Linux (Ctrl) and Mac (Cmd) modifiers:

```javascript
// Undo: Ctrl+Z (Windows/Linux) or Cmd+Z (Mac)
if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey)

// Redo: Ctrl+Shift+Z (Windows/Linux) or Cmd+Shift+Z (Mac)
if ((event.ctrlKey || event.metaKey) && event.key === 'z' && event.shiftKey)
```

## Input Focus Detection

Keyboard shortcuts are disabled when focus is in an input:

```javascript
isInputFocused() {
  const activeElement = document.activeElement
  const tagName = activeElement.tagName.toLowerCase()
  
  return tagName === 'input' ||
         tagName === 'textarea' ||
         tagName === 'select' ||
         activeElement.isContentEditable
}
```

**Why:**
- Prevents accidental undo/redo while typing
- Allows normal keyboard behavior in inputs
- Common UX pattern

## Security Note

Error messages use `textContent` instead of `innerHTML` to prevent XSS:

```javascript
// Safe - treats as plain text
banner.textContent = message
```

## Completion Checklist

- [ ] `KeyboardHandler.js` created
- [ ] Undo on Ctrl+Z / Cmd+Z
- [ ] Redo on Ctrl+Shift+Z / Cmd+Shift+Z / Ctrl+Y
- [ ] Delete selected node on Delete / Backspace
- [ ] Escape to deselect / close panel
- [ ] Ignores shortcuts when input is focused
- [ ] Supports Windows (Ctrl) and Mac (Cmd)
- [ ] Uses textContent for error messages (XSS safe)
- [ ] Unit tests pass