# frozen_string_literal: true

# Helper methods for EditorV2 feature tests
# Provides utilities for finding nodes by server ID via client ID mapping,
# and common editor operations.

# Timing constants for async operations
ASYNC_WAIT = 0.5  # Wait for async server sync operations
HOVER_WAIT = 0.2  # Wait for hover reveal
SELECTION_WAIT = 0.1  # Wait for selection animation
MOUSE_CLICK_OFFSET = 5  # Offset from element edge for drag simulation

module EditorV2Helpers
  # Find a node's client ID given its server (database) ID
  # Uses window.editorAPI to map server IDs to client IDs
  # @param server_id [Integer] The database ID of the node
  # @return [String, nil] The client UUID or nil if not found
  def find_node_client_id(server_id)
    page.evaluate_script(<<~JS)
      (function() {
        const nodes = window.editorAPI.store.getNodes();
        for (const node of nodes) {
          const sid = window.editorAPI.api.getServerId(node.clientId);
          if (sid === #{server_id}) {
            return node.clientId;
          }
        }
        return null;
      })()
    JS
  end

  # Find a node DOM element by its server (database) ID
  # Uses the client ID mapping to find the correct element
  # @param server_id [Integer] The database ID of the node
  # @return [Capybara::Element] The node element
  def find_node_by_server_id(server_id)
    client_id = find_node_client_id(server_id)
    raise "No client ID found for server ID #{server_id}" if client_id.nil?
    
    find(".node[data-client-id='#{client_id}']")
  end

  # Get the server (database) ID for a client ID
  # @param client_id [String] The client UUID
  # @return [Integer, nil] The server ID or nil if not found
  def get_server_id(client_id)
    page.evaluate_script("window.editorAPI.api.getServerId('#{client_id}')")
  end

  # Wait for the editor to fully initialize
  # Ensures canvas and nodes are present before proceeding
  def wait_for_editor
    expect(page).to have_css('#nodes-canvas', wait: 5)
    expect(page).to have_css('#connections-canvas', wait: 5)
    # Wait for at least root node to be rendered
    expect(page).to have_css('.node', wait: 5)
  end

  # Assert history count (format: "X/50")
  # @param n [Integer] Expected history count
  def expect_history_count(n)
    expect(page).to have_css('.undo-count', text: /^\(#{n}\/50\)/, wait: 3)
  end

  # Count visible nodes in DOM
  # @return [Integer] Number of visible .node elements
  def visible_node_count
    all('.node').count
  end

  # Wait for expected node count in DOM
  # @param expected_count [Integer] Expected number of nodes
  def expect_node_count(expected_count)
    expect(page).to have_css('.node', count: expected_count, wait: 2)
  end

  # Count connections in store
  # @return [Integer] Number of connections
  def connection_count
    page.evaluate_script('window.editorAPI.store.getConnections().length')
  end

  # Check if undo button is enabled
  # Uses Capybara's built-in waiting for async state changes
  # @return [Boolean] true if enabled, false if disabled
  def undo_enabled?
    page.has_button?('↩ Undo', disabled: false, wait: 2)
  end

  # Check if redo button is enabled
  # Uses Capybara's built-in waiting for async state changes
  # @return [Boolean] true if enabled, false if disabled
  def redo_enabled?
    page.has_button?('↪ Redo', disabled: false, wait: 2)
  end

  # Click undo button and wait for loading to complete
  def click_undo
    find('.btn-undo').click
    expect(page).not_to have_css('.btn-undo.loading', wait: 2)
  end

  # Click redo button and wait for loading to complete
  def click_redo
    find('.btn-redo').click
    expect(page).not_to have_css('.btn-redo.loading', wait: 2)
  end

  # Select a node by clicking it
  # @param server_id [Integer] The database ID of the node
  def select_node(server_id)
    element = find_node_by_server_id(server_id)
    # Use JavaScript click to avoid header overlap issues at small viewport sizes
    page.execute_script('arguments[0].click()', element)
    sleep SELECTION_WAIT
  end

  # Delete the currently selected node via toolbar button
  # Accepts the confirmation dialog
  def delete_selected_node
    find('.btn-delete-node').click
    page.accept_confirm
    sleep 0.3 # Wait for async deletion
  end

  # Create a connection by dragging from source to target
  # @param source_server_id [Integer] The database ID of the source node
  # @param target_server_id [Integer] The database ID of the target node
  def create_connection(source_server_id, target_server_id)
    source_client = find_node_client_id(source_server_id)
    target_client = find_node_client_id(target_server_id)
    
    source_connector = find(".node[data-client-id='#{source_client}'] .node-connector.output")
    target_connector = find(".node[data-client-id='#{target_client}'] .node-connector.input")
    
    source_connector.drag_to(target_connector)
    sleep 0.3 # Wait for connection to be created
  end

  # Delete a connection via its delete button
  # Mimics user interaction: hover on hitArea to reveal button, then click via JS
  # @param source_server_id [Integer] The database ID of the source node
  # @param target_server_id [Integer] The database ID of the target node
  def delete_connection(source_server_id, target_server_id)
    source_client = find_node_client_id(source_server_id)
    target_client = find_node_client_id(target_server_id)
    
    # Find the hitArea line (transparent stroke, used for mouse interactions)
    # The visible line has stroke='#4CAF50', the hitArea has stroke='transparent'
    hitArea = find("line[data-source-id='#{source_client}'][data-target-id='#{target_client}'][stroke='transparent']", visible: :all)
    
    # Hover to reveal the delete button (mimics user behavior)
    hitArea.hover
    sleep HOVER_WAIT
    
    # Find button (allow hidden) and click via JS (more reliable for hover-triggered visibility)
    delete_btn = find(".connection-delete-btn[data-source-id='#{source_client}'][data-target-id='#{target_client}']", visible: :all)
    page.execute_script('arguments[0].click()', delete_btn)
    sleep ASYNC_WAIT
  end

  # Find a node in the database by its properties
  # Useful when server ID changes after undo/redo
  # @param bot [Bot] The bot instance
  # @param node_type [String] The node type
  # @param position_x [Integer] X position
  # @param position_y [Integer] Y position
  # @param data [Hash] Optional data to match
  # @return [Node, nil] The matching node or nil
  def find_node_by_properties(bot:, node_type:, position_x:, position_y:, data: {})
    Node.where(bot: bot, node_type: node_type, position_x: position_x, position_y: position_y)
        .detect { |n| data.all? { |k, v| n.data[k] == v } }
  end

  # Get the current state from the editor API
  # Useful for verifying client-side state
  # @return [Hash] The serialized state
  def get_editor_state
    page.evaluate_script('window.editorAPI.store.getState()')
  end

  # Check if the editor API is available
  # @return [Boolean] true if editorAPI is defined
  def editor_api_available?
    page.evaluate_script('typeof window.editorAPI !== "undefined"')
  end

  # Simulate network offline by mocking fetch
  def go_offline
    page.execute_script(<<~JS)
      window.__originalFetch = window.fetch;
      window.fetch = () => Promise.reject(new TypeError('Network error'));
    JS
  end

  # Restore network by restoring original fetch
  def go_online
    page.execute_script('window.fetch = window.__originalFetch;')
  end

  # Simulate dragging a node to a new position
  # All descendants will move with the node (unless Shift key is used)
  # @param server_id [Integer] The database ID of the node
  # @param new_x [Integer] Target X position
  # @param new_y [Integer] Target Y position
  def drag_node(server_id, new_x, new_y)
    client_id = find_node_client_id(server_id)
    
    # Get current position from store
    current = page.evaluate_script(<<~JS)
      (function() {
        const node = window.editorAPI.store.getNode('#{client_id}');
        return { x: node.position.x, y: node.position.y };
      })();
    JS
    
    current_x = current['x']
    current_y = current['y']
    
    # Mouse down at current position (with small offset for realistic click)
    page.execute_script(<<~JS)
      (function() {
        const el = document.querySelector('[data-client-id="#{client_id}"]');
        const canvas = document.getElementById('nodes-canvas');
        const canvasRect = canvas.getBoundingClientRect();
        
        el.dispatchEvent(new MouseEvent('mousedown', {
          clientX: canvasRect.left + #{current_x} + #{MOUSE_CLICK_OFFSET},
          clientY: canvasRect.top + #{current_y} + #{MOUSE_CLICK_OFFSET},
          button: 0,
          bubbles: true
        }));
      })();
    JS
    
    # Mouse move to new position
    page.execute_script(<<~JS)
      (function() {
        const canvas = document.getElementById('nodes-canvas');
        const canvasRect = canvas.getBoundingClientRect();
        
        document.dispatchEvent(new MouseEvent('mousemove', {
          clientX: canvasRect.left + #{new_x} + #{MOUSE_CLICK_OFFSET},
          clientY: canvasRect.top + #{new_y} + #{MOUSE_CLICK_OFFSET},
          bubbles: true
        }));
      })();
    JS
    
    # Mouse up at new position
    page.execute_script(<<~JS)
      (function() {
        const canvas = document.getElementById('nodes-canvas');
        const canvasRect = canvas.getBoundingClientRect();
        
        document.dispatchEvent(new MouseEvent('mouseup', {
          clientX: canvasRect.left + #{new_x} + #{MOUSE_CLICK_OFFSET},
          clientY: canvasRect.top + #{new_y} + #{MOUSE_CLICK_OFFSET},
          bubbles: true
        }));
      })();
    JS
    
    sleep ASYNC_WAIT
  end

  # Simulate dragging a node with Shift key held (drag node only, no children)
  # @param server_id [Integer] The database ID of the node
  # @param new_x [Integer] Target X position
  # @param new_y [Integer] Target Y position
  def drag_node_with_shift(server_id, new_x, new_y)
    client_id = find_node_client_id(server_id)
    
    # Get current position from store
    current = page.evaluate_script(<<~JS)
      (function() {
        const node = window.editorAPI.store.getNode('#{client_id}');
        return { x: node.position.x, y: node.position.y };
      })();
    JS
    
    current_x = current['x']
    current_y = current['y']
    
    # Mouse down with Shift key at current position
    page.execute_script(<<~JS)
      (function() {
        const el = document.querySelector('[data-client-id="#{client_id}"]');
        const canvas = document.getElementById('nodes-canvas');
        const canvasRect = canvas.getBoundingClientRect();
        
        el.dispatchEvent(new MouseEvent('mousedown', {
          clientX: canvasRect.left + #{current_x} + #{MOUSE_CLICK_OFFSET},
          clientY: canvasRect.top + #{current_y} + #{MOUSE_CLICK_OFFSET},
          button: 0,
          shiftKey: true,
          bubbles: true
        }));
      })();
    JS
    
    # Mouse move to new position
    page.execute_script(<<~JS)
      (function() {
        const canvas = document.getElementById('nodes-canvas');
        const canvasRect = canvas.getBoundingClientRect();
        
        document.dispatchEvent(new MouseEvent('mousemove', {
          clientX: canvasRect.left + #{new_x} + #{MOUSE_CLICK_OFFSET},
          clientY: canvasRect.top + #{new_y} + #{MOUSE_CLICK_OFFSET},
          bubbles: true
        }));
      })();
    JS
    
    # Mouse up at new position
    page.execute_script(<<~JS)
      (function() {
        const canvas = document.getElementById('nodes-canvas');
        const canvasRect = canvas.getBoundingClientRect();
        
        document.dispatchEvent(new MouseEvent('mouseup', {
          clientX: canvasRect.left + #{new_x} + #{MOUSE_CLICK_OFFSET},
          clientY: canvasRect.top + #{new_y} + #{MOUSE_CLICK_OFFSET},
          bubbles: true
        }));
      })();
    JS
    
    sleep ASYNC_WAIT
  end

  # Assert that a node is at a specific position
  # @param server_id [Integer] The database ID of the node
  # @param expected_x [Integer] Expected X position
  # @param expected_y [Integer] Expected Y position
  def expect_node_position(server_id, expected_x, expected_y)
    client_id = find_node_client_id(server_id)
    actual = page.evaluate_script(<<~JS)
      (function() {
        const node = window.editorAPI.store.getNode('#{client_id}');
        return { x: node.position.x, y: node.position.y };
      })();
    JS
    expect(actual['x']).to eq(expected_x)
    expect(actual['y']).to eq(expected_y)
  end
end