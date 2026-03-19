# require 'rails_helper'

# RSpec.describe 'Node Editor', type: :feature, js: true do
#   let(:user) { create(:user) }
#   let!(:bot) { create(:bot, user: user) }

#   before do
#     sign_in user
#     Capybara.current_driver = :selenium_chrome
#   end

#   after do
#     Capybara.use_default_driver
#   end

#   describe 'creating a bot and adding nodes' do
#     it 'creates a new bot and adds nodes to it', :slow do
#       visit new_bot_path
      
#       fill_in 'Name', with: 'Test Chess Bot'
#       fill_in 'Description', with: 'A bot for testing node editor'
#       click_button 'Create Bot'
      
#       expect(page).to have_content('Editing Bot: Test Chess Bot')
#       expect(page).to have_css('#nodes-canvas', wait: 5)
      
#       sleep 2
      
#       click_button '+ Condition'
      
#       expect(page).to have_css('.node', minimum: 1, wait: 5)
#     end

#     it 'adds multiple nodes to an existing bot', :slow do
#       visit edit_bot_path(bot)
      
#       expect(page).to have_css('#nodes-canvas', wait: 5)
      
#       click_button '+ Condition'
#       expect(page).to have_css('.node', minimum: 1, wait: 5)
      
#       click_button '+ Action'
#       expect(page).to have_css('.node', minimum: 2, wait: 5)
#     end
#   end

#   describe 'connecting nodes', :slow do
#     let!(:node1) { create(:node, bot: bot, node_type: 'condition', position_x: 150, position_y: 150) }
#     let!(:node2) { create(:node, bot: bot, node_type: 'action', position_x: 400, position_y: 150) }

#     it 'connects two nodes by dragging from output to input' do
#       visit edit_bot_path(bot)
      
#       expect(page).to have_css('.node', count: 3, wait: 5)
#       expect(page).to have_css('svg#connections-canvas', wait: 5)
      
#       source = find(".node[data-id='#{node1.id}'] .node-connector.output", wait: 5)
#       target = find(".node[data-id='#{node2.id}'] .node-connector.input", wait: 5)
      
#       source.drag_to(target)
      
#       sleep 1
      
#       expect(page).to have_css('line[data-source-id]', visible: :all, minimum: 1, wait: 5)
#     end
#   end

#   describe 'dragging nodes', :slow do
#     let!(:node) { create(:node, bot: bot, node_type: 'condition', position_x: 200, position_y: 200) }

#     it 'drags a node to a new position' do
#       visit edit_bot_path(bot)
      
#       expect(page).to have_css('.node', count: 2, wait: 5)
      
#       node_element = find(".node[data-id='#{node.id}']", wait: 5)
      
#       initial_left = node_element['style'].match(/left:\s*(\d+)\.?\d*px/)[1].to_i
#       initial_top = node_element['style'].match(/top:\s*(\d+)\.?\d*px/)[1].to_i
      
#       page.driver.browser.action.click_and_hold(node_element.native).perform
#       page.driver.browser.action.move_by(150, 150).perform
#       page.driver.browser.action.release.perform
      
#       sleep 0.5
      
#       visit edit_bot_path(bot)
      
#       moved_node = find(".node[data-id='#{node.id}']", wait: 5)
#       new_left = moved_node['style'].match(/left:\s*(\d+)\.?\d*px/)[1].to_i
#       new_top = moved_node['style'].match(/top:\s*(\d+)\.?\d*px/)[1].to_i
      
#       expect(new_left).not_to eq(initial_left)
#       expect(new_top).not_to eq(initial_top)
#     end
#   end

#   describe 'zoom controls', :slow do
#     let!(:node) { create(:node, bot: bot, node_type: 'condition', position_x: 300, position_y: 300) }

#     it 'zooms in and out using toolbar buttons' do
#       visit edit_bot_path(bot)
      
#       expect(page).to have_css('#zoom-level', text: /\d+%/, wait: 5)
#       initial_zoom = find('#zoom-level').text.to_i
      
#       sleep 0.1
      
#       find('#zoom-in').click
      
#       expect(page).to have_css('#zoom-level', text: /\d+%/, wait: 5)
#       zoom_after_in = find('#zoom-level').text.to_i
#       expect(zoom_after_in).to be > initial_zoom
      
#       find('#zoom-out').click
      
#       expect(page).to have_css('#zoom-level', text: /\d+%/, wait: 5)
#       zoom_after_out = find('#zoom-level').text.to_i
#       expect(zoom_after_out).to be < zoom_after_in
      
#       find('#zoom-reset').click
      
#       expect(page).to have_css('#zoom-level', text: '100%', wait: 5)
#     end
#   end

#   describe 'deleting nodes', :slow do
#     let!(:node) { create(:node, bot: bot, node_type: 'condition') }

#     it 'deletes a node using delete tool' do
#       visit edit_bot_path(bot)
      
#       expect(page).to have_css('.node', count: 2, wait: 5)
      
#       click_button 'Delete'
      
#       page.accept_confirm do
#         find(".node[data-id='#{node.id}']").click
#       end
      
#       expect(page).to have_css('.node', count: 1, wait: 5)
#     end
#   end

#   describe 'deleting connections', :slow do
#     let!(:node1) { create(:node, bot: bot, node_type: 'condition') }
#     let!(:node2) { create(:node, bot: bot, node_type: 'action') }
#     let!(:connection) { create(:node_connection, source_node: node1, target_node: node2) }

#     it 'deletes a connection between nodes' do
#       visit edit_bot_path(bot)
      
#       expect(page).to have_css('line[data-connection-id]', visible: :all, minimum: 1, wait: 5)
      
#       line = first('line[data-connection-id]', visible: :all)
      
#       line.hover
#       sleep 0.5
      
#       delete_btns = all('.connection-delete-btn', visible: :all)
      
#       if delete_btns.any?
#         btn_id = delete_btns.first['data-connection-id']
#         page.execute_script("document.querySelector('.connection-delete-btn[data-connection-id=\"#{btn_id}\"]').click()")
#         sleep 0.5
        
#         remaining = all('line[data-connection-id]', visible: :all).count
#         expect(remaining).to eq(0)
#       else
#         expect(page).to have_css('.connection-delete-btn', visible: :all, wait: 5)
#       end
#     end
#   end

#   describe 'opening node editor', :slow do
#     let!(:node) { create(:node, bot: bot, node_type: 'condition', data: { context: 'self', query: 'is_attacked' }) }

#     it 'opens the editor panel when clicking a node' do
#       visit edit_bot_path(bot)
      
#       expect(page).to have_css('.node', count: 2, wait: 5)
      
#       panel = find('#node-editor-panel', visible: :all, wait: 5)
#       expect(panel[:class]).to include('hidden')
      
#       find(".node[data-id='#{node.id}']").click
      
#       sleep 0.3
      
#       panel = find('#node-editor-panel', visible: :all, wait: 10)
#       expect(panel[:class]).not_to include('hidden')
#     end
#   end

#   describe 'saving node changes', :slow do
#     let!(:node) { create(:node, bot: bot, node_type: 'condition', data: { context: 'self', query: 'is_attacked' }) }

#     it 'saves changes to a node through the editor panel' do
#       visit edit_bot_path(bot)
      
#       find(".node[data-id='#{node.id}']").click
      
#       panel = find('#node-editor-panel', visible: :all, wait: 5)
#       expect(panel[:class]).not_to include('hidden')
      
#       find('#cond-context').find('option[value="enemies"]').select_option
      
#       click_button 'Save'
      
#       sleep 0.5
      
#       panel = find('#node-editor-panel', visible: :all, wait: 5)
#       expect(panel[:class]).to include('hidden')
      
#       visit edit_bot_path(bot)
#       find(".node[data-id='#{node.id}']").click
      
#       expect(find('#cond-context', visible: :all).value).to eq('enemies')
#     end
#   end

#   describe 'zoom and node visibility', :slow do
#     it 'zooms out, adds a node at outer corner, and shows all nodes after reload' do
#       visit edit_bot_path(bot)
      
#       click_button '+ Condition'
#       expect(page).to have_css('.node', minimum: 1, wait: 5)
      
#       3.times do
#         click_button '-'
#         sleep 0.2
#       end
      
#       expect(page).to have_css('#zoom-level', wait: 5)
#       zoom_text = find('#zoom-level').text
#       expect(zoom_text).to match(/\d+%/)
#       zoom_value = zoom_text.to_i
#       expect(zoom_value).to be < 100
      
#       click_button '+ Condition'
      
#       expect(page).to have_css('.node', minimum: 2, wait: 5)
      
#       visit edit_bot_path(bot)
      
#       expect(page).to have_css('.node', minimum: 2, wait: 5)
      
#       nodes = all('.node', minimum: 2, wait: 5)
#       expect(nodes.count).to be >= 2
#     end
#   end
# end
