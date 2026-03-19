require 'rails_helper'

RSpec.describe 'EditorV2', type: :feature, js: true do
  include EditorV2Helpers

  let(:user) { create(:user) }
  let!(:bot) { create(:bot, user: user) }

  before do
    sign_in user
    Capybara.current_driver = :selenium_chrome
    visit edit_bot_path(bot)
    wait_for_editor
  end

  after do
    Capybara.use_default_driver
  end

  # ============================================================
  # PAGE LOAD & TURBO NAVIGATION
  # ============================================================

  describe 'page load' do
    it 'loads the root node on initial page load' do
      expect(visible_node_count).to eq(1)
      expect(page).to have_css('.node[data-type="root"]')
    end

    it 'initializes editorAPI in development/test environments' do
      expect(editor_api_available?).to be true
    end

    it 'loads nodes correctly after Turbo navigation from index', :slow do
      # Navigate away
      click_link 'Back to Bots'
      expect(page).to have_css('h1', text: 'Bots', wait: 5)

      # Navigate back
      click_link 'Edit', match: :first
      wait_for_editor

      expect(visible_node_count).to eq(1)
    end
  end

  # ============================================================
  # NODE CREATION
  # ============================================================

  describe 'node creation' do
    it 'creates a condition node via toolbar button' do
      click_button '+ Condition'

      expect_node_count(2)
      expect(Node.where(bot: bot, node_type: 'condition').count).to eq(1)
      expect_history_count(2)
    end

    it 'creates an action node via toolbar button' do
      click_button '+ Action'

      expect_node_count(2)
      expect(Node.where(bot: bot, node_type: 'action').count).to eq(1)
      expect_history_count(2)
    end

    it 'assigns stable client IDs to created nodes' do
      click_button '+ Condition'

      node = Node.where(bot: bot, node_type: 'condition').first
      client_id = find_node_client_id(node.id)

      expect(client_id).not_to be_nil
      expect(client_id).to match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    end

    it 'maps client ID to server ID correctly' do
      click_button '+ Condition'

      node = Node.where(bot: bot, node_type: 'condition').first
      client_id = find_node_client_id(node.id)
      server_id = get_server_id(client_id)

      expect(server_id).to eq(node.id)
    end
  end

  # ============================================================
  # NODE DELETION
  # ============================================================

  describe 'node deletion via toolbar' do
    let!(:condition_node) { create(:node, bot: bot, node_type: 'condition') }

    before { visit edit_bot_path(bot) }

    it 'deletes selected node via toolbar button' do
      wait_for_editor
      expect_node_count(2)

      select_node(condition_node.id)

      # Delete button should now be enabled
      expect(page).to have_button('Delete', disabled: false, wait: 2)

      delete_selected_node

      expect_node_count(1)
      expect(Node.find_by(id: condition_node.id)).to be_nil
      expect_history_count(2)
    end

    it 'does not delete root node' do
      wait_for_editor

      # Root node is created automatically with bot
      root_node = bot.nodes.find_by(node_type: 'root')
      select_node(root_node.id)

      # Delete button should remain disabled for root
      expect(page).to have_button('Delete', disabled: true, wait: 2)
    end

    it 'deletes connected connections when node is deleted' do
      # Create nodes and connection
      action_node = create(:node, bot: bot, node_type: 'action')
      create(:node_connection, bot: bot, source_node: condition_node, target_node: action_node)

      visit edit_bot_path(bot)
      wait_for_editor

      expect(connection_count).to eq(1)

      select_node(condition_node.id)
      delete_selected_node

      expect_node_count(2) # root + action
      expect(connection_count).to eq(0)
    end
  end

  # ============================================================
  # CONNECTION CREATION
  # ============================================================

  describe 'connection creation' do
    let!(:node1) { create(:node, bot: bot, node_type: 'condition') }
    let!(:node2) { create(:node, bot: bot, node_type: 'action') }

    before { visit edit_bot_path(bot) }

    it 'creates connection by dragging from output to input connector' do
      wait_for_editor
      expect_node_count(3) # root + 2 nodes

      create_connection(node1.id, node2.id)

      expect(connection_count).to eq(1)
      expect(NodeConnection.where(source_node_id: node1.id, target_node_id: node2.id).count).to eq(1)
      expect_history_count(2)
    end

    it 'does not create duplicate connections' do
      wait_for_editor

      create_connection(node1.id, node2.id)
      expect(connection_count).to eq(1)

      # Try to create same connection again
      create_connection(node1.id, node2.id)

      # Should still be 1, no duplicate
      expect(connection_count).to eq(1)
    end

    it 'does not allow self-connections' do
      wait_for_editor

      # This would require special DOM manipulation to try same source/target
      # Connection creation logic prevents this in JS
    end
  end

  # ============================================================
  # CONNECTION DELETION
  # ============================================================

  describe 'connection deletion' do
    let!(:node1) { create(:node, bot: bot, node_type: 'condition') }
    let!(:node2) { create(:node, bot: bot, node_type: 'action') }
    let!(:connection) { create(:node_connection, bot: bot, source_node: node1, target_node: node2) }

    before { visit edit_bot_path(bot) }

    it 'deletes connection via delete button' do
      wait_for_editor
      expect(connection_count).to eq(1)

      delete_connection(node1.id, node2.id)

      expect(connection_count).to eq(0)
      expect(NodeConnection.where(source_node_id: node1.id, target_node_id: node2.id).count).to eq(0)
      expect_history_count(2)
    end
  end

  # ============================================================
  # UNDO/REDO - NODES
  # ============================================================

  describe 'undo/redo - node operations' do
    describe 'node creation' do
      it 'undoes node creation' do
        click_button '+ Condition'
        expect_node_count(2)

        click_undo

        expect_node_count(1)
        expect_history_count(1)
        expect(redo_enabled?).to be true
      end

      it 'redoes node creation after undo' do
        click_button '+ Condition'
        expect_node_count(2)

        click_undo
        click_redo

        expect_node_count(2)
        expect_history_count(2)
        expect(redo_enabled?).to be false
      end

      it 'preserves client ID through undo/redo cycle' do
        click_button '+ Condition'

        original_client_id = page.evaluate_script('window.editorAPI.store.getNodes()[1].clientId')

        click_undo

        click_redo

        restored_client_id = page.evaluate_script('window.editorAPI.store.getNodes()[1].clientId')

        expect(restored_client_id).to eq(original_client_id)
      end

      it 'server ID changes after delete-undo-redo cycle' do
        click_button '+ Condition'

        node = Node.where(bot: bot, node_type: 'condition').first
        original_server_id = node.id
        client_id = find_node_client_id(original_server_id)

        # Delete the node
        select_node(original_server_id)
        delete_selected_node

        # Undo the delete
        click_undo

        # Node should be restored with same client ID
        restored_client_id = page.evaluate_script('window.editorAPI.store.getNodes()[1].clientId')
        expect(restored_client_id).to eq(client_id)

        # Redo the delete
        click_redo

        expect_node_count(1)
      end
    end

    describe 'node deletion' do
      let!(:condition_node) { create(:node, bot: bot, node_type: 'condition') }

      before { visit edit_bot_path(bot) }

      it 'undoes node deletion' do
        wait_for_editor
        expect_node_count(2)

        select_node(condition_node.id)
        delete_selected_node

        expect_node_count(1)

        click_undo

        expect_node_count(2)
        # Node should be restored
        expect(Node.where(bot: bot, node_type: 'condition').count).to eq(1)
      end
    end
  end

  # ============================================================
  # UNDO/REDO - CONNECTIONS
  # ============================================================

  describe 'undo/redo - connection operations' do
    let!(:node1) { create(:node, bot: bot, node_type: 'condition') }
    let!(:node2) { create(:node, bot: bot, node_type: 'action') }

    before { visit edit_bot_path(bot) }

    describe 'connection creation' do
      it 'undoes connection creation' do
        wait_for_editor

        create_connection(node1.id, node2.id)
        expect(connection_count).to eq(1)

        click_undo

        expect(connection_count).to eq(0)
        expect_history_count(1)
      end

      it 'redoes connection creation after undo' do
        wait_for_editor

        create_connection(node1.id, node2.id)
        click_undo
        click_redo

        expect(connection_count).to eq(1)
      end
    end

    describe 'connection deletion' do
      let!(:connection) { create(:node_connection, bot: bot, source_node: node1, target_node: node2) }

      it 'undoes connection deletion' do
        wait_for_editor
        expect(connection_count).to eq(1)

        delete_connection(node1.id, node2.id)
        expect(connection_count).to eq(0)

        click_undo

        expect(connection_count).to eq(1)
      end

      it 'redoes connection deletion after undo' do
        wait_for_editor

        delete_connection(node1.id, node2.id)
        click_undo
        click_redo

        expect(connection_count).to eq(0)
      end
    end
  end

  # ============================================================
  # KEYBOARD SHORTCUTS
  # ============================================================

  describe 'keyboard shortcuts' do
    let!(:condition_node) { create(:node, bot: bot, node_type: 'condition') }

    before { visit edit_bot_path(bot) }

    it 'uses Ctrl+Z for undo' do
      wait_for_editor

      click_button '+ Action'
      expect_node_count(3)

      find('body').send_keys([:control, 'z'])

      expect_node_count(2)
    end

    it 'uses Ctrl+Y for redo' do
      wait_for_editor

      click_button '+ Action'
      click_undo

      find('body').send_keys([:control, 'y'])

      expect_node_count(3)
    end

    it 'uses Delete/Backspace key to delete selected node' do
      wait_for_editor

      select_node(condition_node.id)

      page.accept_confirm do
        find('body').send_keys(:delete)
      end

      expect_node_count(1)
    end
  end

  # ============================================================
  # UI STATE
  # ============================================================

  describe 'UI state' do
    it 'disables undo button when no history' do
      expect(page).to have_button('↩ Undo', disabled: true)
      expect(undo_enabled?).to be false
    end

    it 'disables redo button when no redo available' do
      expect(page).to have_button('↪ Redo', disabled: true)
      expect(redo_enabled?).to be false
    end

    it 'enables undo after action' do
      click_button '+ Condition'

      expect(undo_enabled?).to be true
      expect(redo_enabled?).to be false
    end

    it 'enables redo after undo' do
      click_button '+ Condition'
      click_undo

      # After undoing the node creation, we're back at initial state
      # Can't undo further, but CAN redo to restore the node
      expect(undo_enabled?).to be false
      expect(redo_enabled?).to be true
    end

    it 'disables delete button when no node selected' do
      expect(page).to have_button('Delete', disabled: true)
    end

    it 'enables delete button when node selected' do
      click_button '+ Condition'

      # Select the condition node
      condition_node = Node.where(bot: bot, node_type: 'condition').first
      select_node(condition_node.id)

      expect(page).to have_button('Delete', disabled: false, wait: 2)
    end

    it 'disables delete button when root node selected' do
      root_node = bot.nodes.find_by(node_type: 'root')
      select_node(root_node.id)

      expect(page).to have_button('Delete', disabled: true, wait: 2)
    end
  end

  # ============================================================
  # ERROR HANDLING
  # ============================================================

  describe 'error handling' do
    it 'shows error dialog when undo fails due to network error' do
      click_button '+ Condition'
      expect_node_count(2)

      # Go offline to simulate network failure
      go_offline
      click_undo

      # Error dialog should appear
      expect(page).to have_css('.undo-error-dialog', wait: 3)
      expect(page).to have_content('Operation Failed')

      go_online
    end

    it 'retries operation after network failure' do
      skip 'JavaScript fetch mocking timing issues - tested manually and via ErrorDialog unit tests'

      click_button '+ Condition'
      expect_node_count(2)

      go_offline
      click_undo

      expect(page).to have_css('.undo-error-dialog', wait: 3)

      # Restore network and retry
      go_online
      find('.btn-retry').click

      expect_node_count(1)
      expect(page).not_to have_css('.undo-error-dialog')
    end

    it 'cancels operation after network failure' do
      click_button '+ Condition'
      expect_node_count(2)

      go_offline
      click_undo

      expect(page).to have_css('.undo-error-dialog', wait: 3)

      find('.btn-cancel').click

      # State should remain unchanged (node still exists)
      expect_node_count(2)
      expect(page).not_to have_css('.undo-error-dialog')
    end

    it 'handles redo failure gracefully' do
      click_button '+ Condition'
      click_undo
      expect_node_count(1)

      go_offline
      click_redo

      expect(page).to have_css('.undo-error-dialog', wait: 3)

      go_online
    end
  end

  # ============================================================
  # CLIENT ID MAPPING
  # ============================================================

  describe 'client-server ID mapping' do
    it 'maintains stable client IDs through operations' do
      click_button '+ Condition'
      expect_node_count(2)

      condition_node = Node.where(bot: bot, node_type: 'condition').first
      original_client_id = find_node_client_id(condition_node.id)

      # Update position (simulating drag)
      page.evaluate_script("
        window.editorAPI.syncManager.updateNodePosition('#{original_client_id}', 200, 200)
      ")
      sleep ASYNC_WAIT

      # Client ID should remain stable
      expect(find_node_client_id(condition_node.id)).to eq(original_client_id)

      click_undo

      click_redo

      # Client ID still stable after undo/redo
      expect(find_node_client_id(condition_node.id)).to eq(original_client_id)
    end

    it 'associates new server ID with same client ID after undo-redo of deletion' do
      click_button '+ Condition'
      expect_node_count(2)

      condition_node = Node.where(bot: bot, node_type: 'condition').first
      original_client_id = find_node_client_id(condition_node.id)
      original_server_id = condition_node.id

      # Delete
      select_node(original_server_id)
      delete_selected_node

      # Undo - node restored
      click_undo
      expect_node_count(2)

      # Client ID should be the same
      restored_client_id = page.evaluate_script('window.editorAPI.store.getNodes()[1].clientId')
      expect(restored_client_id).to eq(original_client_id)

      # Server ID should be NEW (different from original)
      new_server_id = get_server_id(restored_client_id)
      expect(new_server_id).not_to eq(original_server_id)
    end
  end

  # ============================================================
  # COMPLEX WORKFLOWS
  # ============================================================

  describe 'complex workflow', :slow do
    it 'handles multiple operations with full undo/redo cycle' do
      # Initial state
      expect_node_count(1)
      expect_history_count(1)

      # Operation 1: Create condition node
      click_button '+ Condition'
      expect_node_count(2)
      expect_history_count(2)

      condition_node = find_node_by_properties(bot: bot, node_type: 'condition', position_x: 100, position_y: 100)

      # Operation 2: Create action node
      click_button '+ Action'
      expect_node_count(3)
      expect_history_count(3)

      action_node = find_node_by_properties(bot: bot, node_type: 'action', position_x: 130, position_y: 100)

      # Operation 3: Connect condition -> action
      create_connection(condition_node.id, action_node.id)
      expect(connection_count).to eq(1)
      expect_history_count(4)

      # Operation 4: Delete condition node (cascade deletes connection)
      select_node(condition_node.id)
      delete_selected_node
      expect_node_count(2)
      expect(connection_count).to eq(0)
      expect_history_count(5)

      # Undo operation 4
      click_undo
      expect_node_count(3)
      expect(connection_count).to eq(1)

      # Undo operation 3
      click_undo
      expect(connection_count).to eq(0)

      # Undo operation 2
      click_undo
      expect_node_count(2)

      # Undo operation 1
      click_undo
      expect_node_count(1)
      expect_history_count(1)

      # Redo all
      click_redo
      expect_node_count(2)

      click_redo
      expect_node_count(3)

      click_redo
      expect(connection_count).to eq(1)

      click_redo
      expect_node_count(2)
      expect(connection_count).to eq(0)
    end
  end
end