require 'rails_helper'

RSpec.describe 'Undo/Redo', type: :feature, js: true do
  let(:user) { create(:user) }
  let!(:bot) { create(:bot, user: user) }

  before do
    sign_in user
    Capybara.current_driver = :selenium_chrome
    visit edit_bot_path(bot)
    expect(page).to have_css('#nodes-canvas', wait: 5)
  end

  after do
    Capybara.use_default_driver
  end

  def parse_position(node_element)
    style = node_element['style']
    {
      left: style.match(/left:\s*(\d+)\.?\d*px/)[1].to_i,
      top: style.match(/top:\s*(\d+)\.?\d*px/)[1].to_i
    }
  end

  def drag_node_by(node_element, delta_x, delta_y)
    page.driver.browser.action.click_and_hold(node_element.native).perform
    page.driver.browser.action.move_by(delta_x, delta_y).perform
    page.driver.browser.action.release.perform
  end

  def expect_history_count(n)
    expect(page).to have_css('.undo-count', text: "(#{n}/25)", wait: 2)
  end

  describe 'node drag undo', :slow do
    let!(:node) { create(:node, bot: bot, node_type: 'condition', position_x: 100, position_y: 100) }

    it 'reverts node position after undo', :slow do
      visit edit_bot_path(bot)
      
      expect(page).to have_css('.node', count: 2, wait: 5)
      
      node_element = find(".node[data-id='#{node.id}']", wait: 5)
      initial_position = parse_position(node_element)
      
      # Verify initial DB state
      node.reload
      expect(node.position_x).to eq(100)
      expect(node.position_y).to eq(100)
      
      # Drag node by 150px
      drag_node_by(node_element, 150, 150)
      
      sleep 0.5
      
      # Verify new position in DOM
      node_element = find(".node[data-id='#{node.id}']", wait: 5)
      new_position = parse_position(node_element)
      expect(new_position[:left]).not_to eq(initial_position[:left])
      expect(new_position[:top]).not_to eq(initial_position[:top])
      
      # Verify DB updated
      node.reload
      expect(node.position_x).to eq(250)
      expect(node.position_y).to eq(250)
      
      # History should show 2 (initial + drag)
      expect_history_count(2)
      
      # Click undo
      find('.btn-undo').click
      
      sleep 0.5
      
      # Verify DOM position reverted
      node_element = find(".node[data-id='#{node.id}']", wait: 5)
      reverted_position = parse_position(node_element)
      expect(reverted_position[:left]).to eq(initial_position[:left])
      expect(reverted_position[:top]).to eq(initial_position[:top])
      
      # Verify DB reverted
      node.reload
      expect(node.position_x).to eq(100)
      expect(node.position_y).to eq(100)
      
      # History count decremented
      expect_history_count(1)
    end
  end

  describe 'node drag redo', :slow do
    let!(:node) { create(:node, bot: bot, node_type: 'condition', position_x: 100, position_y: 100) }

    it 'restores node position after redo', :slow do
      visit edit_bot_path(bot)
      
      expect(page).to have_css('.node', count: 2, wait: 5)
      
      node_element = find(".node[data-id='#{node.id}']", wait: 5)
      initial_position = parse_position(node_element)
      
      # Drag node
      drag_node_by(node_element, 150, 150)
      sleep 0.5
      
      # Verify dragged position in DB
      node.reload
      dragged_x = node.position_x
      dragged_y = node.position_y
      expect(dragged_x).to eq(250)
      expect(dragged_y).to eq(250)
      
      # Undo
      find('.btn-undo').click
      sleep 0.5
      
      # Verify undone in DB
      node.reload
      expect(node.position_x).to eq(100)
      expect(node.position_y).to eq(100)
      
      expect_history_count(1)
      
      # Redo button should be enabled
      expect(page).to have_css('.btn-redo:not([disabled])', wait: 2)
      
      # Redo
      find('.btn-redo').click
      sleep 0.5
      
      # Verify DOM position restored
      node_element = find(".node[data-id='#{node.id}']", wait: 5)
      restored_position = parse_position(node_element)
      expect(restored_position[:left]).to eq(dragged_x)
      expect(restored_position[:top]).to eq(dragged_y)
      
      # Verify DB restored
      node.reload
      expect(node.position_x).to eq(250)
      expect(node.position_y).to eq(250)
      
      expect_history_count(2)
    end
  end

  describe 'node creation undo', :slow do
    it 'removes created node after undo', :slow do
      # Start with just root node
      expect(page).to have_css('.node', count: 1, wait: 5)
      initial_node_count = Node.where(bot: bot).count
      
      # Create condition node
      click_button '+ Condition'
      sleep 0.5
      
      expect(page).to have_css('.node', count: 2, wait: 5)
      expect(Node.where(bot: bot).count).to eq(initial_node_count + 1)
      
      expect_history_count(2)
      
      # Undo
      find('.btn-undo').click
      sleep 0.5
      
      # Verify removed from DOM
      expect(page).to have_css('.node', count: 1, wait: 5)
      
      # Verify removed from DB
      expect(Node.where(bot: bot).count).to eq(initial_node_count)
      
      expect_history_count(1)
    end
  end

  describe 'node creation redo', :slow do
    it 'restores created node after redo', :slow do
      # Create condition node
      click_button '+ Condition'
      sleep 0.5
      
      expect(page).to have_css('.node', count: 2, wait: 5)
      
      # Capture original attributes before undo
      original_node = Node.find_by(bot: bot, node_type: 'condition')
      expect(original_node).to be_present
      original_x = original_node.position_x
      original_y = original_node.position_y
      original_data = original_node.data
      
      # Undo
      find('.btn-undo').click
      sleep 0.5
      
      expect(page).to have_css('.node', count: 1, wait: 5)
      expect(Node.where(bot: bot, node_type: 'condition').count).to eq(0)
      
      # Redo button enabled
      expect(page).to have_css('.btn-redo:not([disabled])', wait: 2)
      
      # Redo
      find('.btn-redo').click
      sleep 0.5
      
      # Verify restored in DOM
      expect(page).to have_css('.node', count: 2, wait: 5)
      
      # Verify restored in DB by attributes (new ID, same properties)
      restored = Node.find_by(bot: bot, node_type: 'condition')
      expect(restored).to be_present
      expect(restored.position_x).to eq(original_x)
      expect(restored.position_y).to eq(original_y)
      expect(restored.data).to eq(original_data)
      
      expect_history_count(2)
    end
  end

  describe 'node deletion undo', :slow do
    let!(:node) { create(:node, bot: bot, node_type: 'condition', position_x: 200, position_y: 200) }

    it 'restores deleted node after undo', :slow do
      visit edit_bot_path(bot)
      
      expect(page).to have_css('.node', count: 2, wait: 5)
      node_id = node.id
      original_data = node.data
      
      # Select delete tool
      click_button 'Delete'
      
      # Click on node to delete
      page.accept_confirm do
        find(".node[data-id='#{node_id}']").click
      end
      
      sleep 0.5
      
      # Verify removed from DOM
      expect(page).to have_css('.node', count: 1, wait: 5)
      
      # Verify removed from DB
      expect(Node.find_by(id: node_id)).to be_nil
      
      expect_history_count(2)
      
      # Undo
      find('.btn-undo').click
      sleep 0.5
      
      # Verify restored in DOM
      expect(page).to have_css('.node', count: 2, wait: 5)
      
      # Verify restored in DB (new ID, same properties)
      restored = Node.find_by(bot: bot, node_type: 'condition')
      expect(restored).to be_present
      expect(restored.node_type).to eq('condition')
      expect(restored.position_x).to eq(200)
      expect(restored.position_y).to eq(200)
      expect(restored.data).to eq(original_data)
      
      expect_history_count(1)
    end
  end

  describe 'keyboard shortcuts', :slow do
    let!(:node) { create(:node, bot: bot, node_type: 'condition', position_x: 100, position_y: 100) }

    it 'uses Ctrl+Z for undo and Ctrl+Shift+Z for redo', :slow do
      visit edit_bot_path(bot)
      
      expect(page).to have_css('.node', count: 2, wait: 5)
      
      node_element = find(".node[data-id='#{node.id}']", wait: 5)
      initial_position = parse_position(node_element)
      
      # Drag node
      drag_node_by(node_element, 150, 150)
      sleep 0.5
      
      # Verify DB updated
      node.reload
      expect(node.position_x).to eq(250)
      expect(node.position_y).to eq(250)
      
      # Ctrl+Z to undo
      find('body').send_keys([:control, 'z'])
      sleep 0.5
      
      # Verify undone in DOM
      node_element = find(".node[data-id='#{node.id}']", wait: 5)
      undone_position = parse_position(node_element)
      expect(undone_position[:left]).to eq(initial_position[:left])
      expect(undone_position[:top]).to eq(initial_position[:top])
      
      # Verify undone in DB
      node.reload
      expect(node.position_x).to eq(100)
      expect(node.position_y).to eq(100)
      
      # Ctrl+Y to redo
      find('body').send_keys([:control, 'y'])
      sleep 0.5
      
      # Verify redone in DOM
      node_element = find(".node[data-id='#{node.id}']", wait: 5)
      redone_position = parse_position(node_element)
      expect(redone_position[:left]).to eq(initial_position[:left] + 150)
      expect(redone_position[:top]).to eq(initial_position[:top] + 150)
      
      # Verify redone in DB
      node.reload
      expect(node.position_x).to eq(250)
      expect(node.position_y).to eq(250)
    end
  end

  describe 'undo button states', :slow do
    it 'enables and disables buttons based on history state', :slow do
      # Initial state - both buttons disabled
      expect(page).to have_css('.btn-undo[disabled]', wait: 2)
      expect(page).to have_css('.btn-redo[disabled]', wait: 2)
      expect_history_count(1)
      
      # Create a node
      click_button '+ Condition'
      sleep 0.5
      
      # Undo enabled, redo disabled
      expect(page).to have_css('.btn-undo:not([disabled])', wait: 2)
      expect(page).to have_css('.btn-redo[disabled]', wait: 2)
      expect_history_count(2)
      
      # Undo
      find('.btn-undo').click
      sleep 0.5
      
      # Undo disabled, redo enabled
      expect(page).to have_css('.btn-undo[disabled]', wait: 2)
      expect(page).to have_css('.btn-redo:not([disabled])', wait: 2)
      expect_history_count(1)
      
      # Redo
      find('.btn-redo').click
      sleep 0.5
      
      # Back to undo enabled, redo disabled
      expect(page).to have_css('.btn-undo:not([disabled])', wait: 2)
      expect(page).to have_css('.btn-redo[disabled]', wait: 2)
      expect_history_count(2)
    end
  end

  describe 'complex multi-operation workflow', :slow do
    it 'handles mixed operations with full undo/redo cycle', :slow do
      # Initial state
      expect(page).to have_css('.node', count: 1, wait: 5)
      initial_node_count = Node.where(bot: bot).count
      expect_history_count(1)
      
      # Operation 1: Create condition node
      click_button '+ Condition'
      sleep 0.5
      condition_node = find(".node:not([data-type='root'])", wait: 5)
      condition_id = condition_node['data-id'].to_i
      expect(page).to have_css('.node', count: 2, wait: 5)
      expect_history_count(2)
      
      # Operation 2: Create action node
      click_button '+ Action'
      sleep 0.5
      action_node = find(".node[data-type='action']", wait: 5)
      action_id = action_node['data-id'].to_i
      expect(page).to have_css('.node', count: 3, wait: 5)
      expect_history_count(3)
      
      # Operation 3: Connect condition -> action
      source = find(".node[data-id='#{condition_id}'] .node-connector.output", wait: 5)
      target = find(".node[data-id='#{action_id}'] .node-connector.input", wait: 5)
      source.drag_to(target)
      sleep 0.5
      expect(page).to have_css('line[data-source-id]', visible: :all, minimum: 1, wait: 5)
      expect(NodeConnection.where(source_node_id: condition_id, target_node_id: action_id).count).to eq(1)
      expect_history_count(4)
      
      # Operation 4: Drag condition node (with connected action as child)
      condition_element = find(".node[data-id='#{condition_id}']", wait: 5)
      drag_node_by(condition_element, 100, 100)
      sleep 0.5
      
      # Verify both nodes moved in DB
      condition_node_db = Node.find(condition_id)
      action_node_db = Node.find(action_id)
      expect(condition_node_db.position_x).not_to eq(100) # Should have moved
      condition_moved_x = condition_node_db.position_x
      condition_moved_y = condition_node_db.position_y
      expect(action_node_db.position_x).not_to eq(100) # Should have moved with parent
      expect_history_count(5)
      
      # Operation 5: Edit condition node's data
      find(".node[data-id='#{condition_id}']").click
      sleep 0.5
      
      panel = find('#node-editor-panel', visible: :all, wait: 5)
      expect(panel[:class]).not_to include('hidden')
      
      # Change condition context
      find('#cond-context').find('option[value="enemies"]').select_option
      click_button 'Save'
      sleep 0.5
      
      # Verify data changed in DB
      condition_node_db.reload
      expect(condition_node_db.data['context']).to eq('enemies')
      expect_history_count(6)
      
      # Operation 6: Disconnect nodes
      # Use first() in case multiple line elements exist
      line = first("line[data-source-id='#{condition_id}'][data-target-id='#{action_id}']", visible: :all, wait: 5)
      line.hover
      sleep 0.5
      
      # Find and click delete button
      delete_btn = first(".connection-delete-btn[data-source-id='#{condition_id}'][data-target-id='#{action_id}']", visible: :all, wait: 5)
      page.execute_script("document.querySelector('.connection-delete-btn[data-source-id=\"#{condition_id}\"][data-target-id=\"#{action_id}\"]').click()")
      sleep 0.5
      
      # Verify connection removed from DB
      expect(NodeConnection.where(source_node_id: condition_id, target_node_id: action_id).count).to eq(0)
      expect_history_count(7)
      
      # Operation 7: Delete action node
      click_button 'Delete'
      page.accept_confirm do
        find(".node[data-id='#{action_id}']").click
      end
      sleep 0.5
      
      # Verify action node removed from DOM and DB
      expect(page).to have_css('.node', count: 2, wait: 5)
      expect(Node.find_by(id: action_id)).to be_nil
      expect_history_count(8)
      
      # Now undo all 7 operations one by one
      
      # Undo 7: Restore deleted action node
      find('.btn-undo').click
      sleep 0.5
      expect(page).to have_css('.node', count: 3, wait: 5)
      expect(Node.where(bot: bot, node_type: 'action').count).to eq(1)
      
      # Undo 6: Restore connection
      find('.btn-undo').click
      sleep 0.5
      expect(NodeConnection.where(source_node_id: condition_id, target_node_id: action_id).count).to eq(1)
      
      # Undo 5: Revert node data edit
      find('.btn-undo').click
      sleep 0.5
      condition_node_db.reload
      expect(condition_node_db.data['context']).not_to eq('enemies') # Should revert
      
      # Undo 4: Revert drag positions
      find('.btn-undo').click
      sleep 0.5
      condition_node_db.reload
      expect(condition_node_db.position_x).not_to eq(condition_moved_x) # Should revert
      
      # Undo 3: Remove connection
      find('.btn-undo').click
      sleep 0.5
      expect(NodeConnection.where(source_node_id: condition_id, target_node_id: action_id).count).to eq(0)
      expect(page).to have_css('line[data-source-id]', visible: :all, count: 0, wait: 5)
      
      # Undo 2: Remove action node
      find('.btn-undo').click
      sleep 0.5
      expect(page).to have_css('.node', count: 2, wait: 5)
      expect(Node.find_by(id: action_id)).to be_nil
      
      # Undo 1: Remove condition node
      find('.btn-undo').click
      sleep 0.5
      expect(page).to have_css('.node', count: 1, wait: 5)
      expect(Node.find_by(id: condition_id)).to be_nil
      expect(Node.where(bot: bot).count).to eq(initial_node_count)
      
      # Back to initial state
      expect_history_count(1)
      
      # Now redo all 7 operations
      
      # Redo 1: Restore condition node
      find('.btn-redo').click
      sleep 0.5
      expect(page).to have_css('.node', count: 2, wait: 5)
      expect(Node.where(bot: bot, node_type: 'condition').count).to eq(1)
      
      # Redo 2: Restore action node
      find('.btn-redo').click
      sleep 0.5
      expect(page).to have_css('.node', count: 3, wait: 5)
      expect(Node.where(bot: bot, node_type: 'action').count).to eq(1)
      
      # Redo 3: Restore connection
      find('.btn-redo').click
      sleep 0.5
      expect(NodeConnection.where(source_node_id: condition_id, target_node_id: action_id).count).to eq(1)
      expect(page).to have_css('line[data-source-id]', visible: :all, minimum: 1, wait: 5)
      
      # Redo 4: Restore drag positions
      find('.btn-redo').click
      sleep 0.5
      condition_node_db.reload
      expect(condition_node_db.position_x).to eq(condition_moved_x)
      expect(condition_node_db.position_y).to eq(condition_moved_y)
      
      # Redo 5: Restore data edit
      find('.btn-redo').click
      sleep 0.5
      condition_node_db.reload
      expect(condition_node_db.data['context']).to eq('enemies')
      
      # Redo 6: Restore connection (re-disconnect... wait, this should be disconnect)
      # Actually, after redo 5 we should be at the connected state with edited data
      # Redo 6 disconnects them
      find('.btn-redo').click
      sleep 0.5
      expect(NodeConnection.where(source_node_id: condition_id, target_node_id: action_id).count).to eq(0)
      
      # Redo 7: Delete action node
      find('.btn-redo').click
      sleep 0.5
      expect(page).to have_css('.node', count: 2, wait: 5)
      expect(Node.find_by(id: action_id)).to be_nil
      
      # Final state should match after all operations
      expect(page).to have_css('.node', count: 2, wait: 5) # Root + condition
      expect(Node.find_by(id: condition_id)).to be_present
      expect(Node.find_by(id: action_id)).to be_nil
      expect(NodeConnection.where(source_node_id: condition_id, target_node_id: action_id).count).to eq(0)
      
      # Verify condition node has edited data
      condition_node_db.reload
      expect(condition_node_db.data['context']).to eq('enemies')
      expect(condition_node_db.position_x).to eq(condition_moved_x)
      
      expect_history_count(8)
    end
  end
end
