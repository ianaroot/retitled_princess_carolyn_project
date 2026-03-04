# frozen_string_literal: true

require 'rails_helper'

RSpec.describe NodeTraverser do
  let(:user) { create(:user) }
  let(:bot) { create(:bot, user: user) }
  
  describe '#traverse' do
    context 'basic traversal order' do
      let!(:root) { bot.root_node }
      let!(:node_a) { create(:node, :condition, bot: bot, position_x: 100, position_y: 100) }
      let!(:node_b) { create(:node, :condition, bot: bot, position_x: 200, position_y: 100) }
      let!(:node_c) { create(:node, :action, bot: bot, position_x: 300, position_y: 100) }
      
      before do
        create(:node_connection, source_node: root, target_node: node_a)
        create(:node_connection, source_node: node_a, target_node: node_b)
        create(:node_connection, source_node: node_b, target_node: node_c)
        
        # TODO: Remove this once conditions are properly evaluated
        # Currently stubbing ConditionEvaluator to return true so traversal continues
        allow_any_instance_of(ConditionEvaluator).to receive(:evaluate).and_return(true)
      end
      
      it 'visits all connected nodes from root' do
        traverser = described_class.new(bot)
        results = traverser.traverse
        expect(results.map(&:node_id)).to eq([node_a.id, node_b.id, node_c.id])
      end
    end
    
    context 'counter-clockwise angle sorting from bottom output' do
      let!(:root) { bot.root_node }
      # With top/bottom connectors, output is at bottom center
      # Root at (100, 50) has output at (150, 110)
      # For CCW from midnight (straight down), nodes to the LEFT have smaller angles
      let!(:node_left) { create(:node, :condition, bot: bot, position_x: 50, position_y: 200) }
      let!(:node_right) { create(:node, :condition, bot: bot, position_x: 150, position_y: 200) }
      
      before do
        root.update!(position_x: 100, position_y: 50)
        create(:node_connection, source_node: root, target_node: node_left)
        create(:node_connection, source_node: root, target_node: node_right)
      end
      
      it 'orders children counter-clockwise from midnight (straight down)' do
        traverser = described_class.new(bot)
        results = traverser.traverse
        # Node to the left (smaller angle) should come first in CCW order
        expect(results.first.node_id).to eq(node_left.id)
        expect(results.last.node_id).to eq(node_right.id)
      end
    end
    
    context 'depth-first traversal' do
      let!(:root) { bot.root_node }
      let!(:parent) { create(:node, :condition, bot: bot, position_x: 200, position_y: 100) }
      # Position children at different x for CCW sorting
      let!(:child_left) { create(:node, :condition, bot: bot, position_x: 150, position_y: 220) }
      let!(:child_right) { create(:node, :condition, bot: bot, position_x: 250, position_y: 220) }
      let!(:grandchild) { create(:node, :action, bot: bot, position_x: 150, position_y: 340) }
      
      before do
        create(:node_connection, source_node: root, target_node: parent)
        create(:node_connection, source_node: parent, target_node: child_left)
        create(:node_connection, source_node: parent, target_node: child_right)
        create(:node_connection, source_node: child_left, target_node: grandchild)
        
        # TODO: Remove this once conditions are properly evaluated
        # Currently stubbing all conditions to return true so traversal continues
        allow_any_instance_of(ConditionEvaluator).to receive(:evaluate_condition).and_return(true)
      end
      
      it 'explores first child branch fully before second child' do
        traverser = described_class.new(bot)
        results = traverser.traverse
        ids = results.map(&:node_id)
        
        expect(ids.index(child_left.id)).to be < ids.index(child_right.id)
        expect(ids.index(grandchild.id)).to be < ids.index(child_right.id)
      end
    end
    
    context 'infinite loop detection' do
      let!(:root) { bot.root_node }
      let!(:node_a) { create(:node, :condition, bot: bot, position_x: 100, position_y: 100) }
      let!(:node_b) { create(:node, :condition, bot: bot, position_x: 200, position_y: 100) }
      let!(:node_c) { create(:node, :condition, bot: bot, position_x: 300, position_y: 100) }
      
      before do
        create(:node_connection, source_node: root, target_node: node_a)
        create(:node_connection, source_node: node_a, target_node: node_b)
        create(:node_connection, source_node: node_b, target_node: node_c)
        create(:node_connection, source_node: node_c, target_node: node_a)
      end
      
      it 'raises InfiniteLoopError for cycles' do
        traverser = described_class.new(bot)
        expect { traverser.traverse }.to raise_error(NodeTraverser::InfiniteLoopError)
      end
    end
    
    context 'no root node' do
      let!(:bot_without_root) { create(:bot, user: user) }
      
      before do
        bot_without_root.root_node.destroy
      end
      
      it 'raises error' do
        traverser = described_class.new(bot_without_root)
        expect { traverser.traverse }.to raise_error(/no root node/)
      end
    end
    
    context 'disconnected nodes' do
      let!(:root) { bot.root_node }
      let!(:connected) { create(:node, :condition, bot: bot, position_x: 100, position_y: 100) }
      let!(:disconnected) { create(:node, :condition, bot: bot, position_x: 500, position_y: 500) }
      
      before do
        create(:node_connection, source_node: root, target_node: connected)
      end
      
      it 'only visits nodes reachable from root' do
        traverser = described_class.new(bot)
        results = traverser.traverse
        ids = results.map(&:node_id)
        expect(ids).to include(connected.id)
        expect(ids).not_to include(disconnected.id)
      end
    end
    
    context 'collinear children ordered by distance from parent' do
      let!(:root) { bot.root_node }
      let!(:parent) { create(:node, :condition, bot: bot, position_x: 400, position_y: 100) }
      # Position parent at same X as root, children at same X as parent
      # This ensures perfect collinearity (all condition nodes are 100x60)
      # SCRAMBLED creation order (not by distance from parent):
      let!(:far) { create(:node, :condition, bot: bot, position_x: 400, position_y: 600) }   # Distance: 440
      let!(:mid) { create(:node, :condition, bot: bot, position_x: 400, position_y: 350) }   # Distance: 190  
      let!(:near) { create(:node, :condition, bot: bot, position_x: 400, position_y: 200) }   # Distance: 40
      let!(:mid2) { create(:node, :condition, bot: bot, position_x: 400, position_y: 450) }  # Distance: 290
      let!(:near2) { create(:node, :condition, bot: bot, position_x: 400, position_y: 280) }  # Distance: 120
      
      before do
        
        # Connect root -> parent
        create(:node_connection, source_node: root, target_node: parent)
        
        # SCRAMBLED connection order (not by distance):
        create(:node_connection, source_node: parent, target_node: mid)
        create(:node_connection, source_node: parent, target_node: far)
        create(:node_connection, source_node: parent, target_node: near2)
        create(:node_connection, source_node: parent, target_node: near)
        create(:node_connection, source_node: parent, target_node: mid2)
        
        # Stub to traverse into parent's children
        allow_any_instance_of(ConditionEvaluator).to receive(:evaluate).and_return(true)
      end
      
      it 'orders collinear children by proximity to parent (nearest first)' do
        traverser = described_class.new(bot)
        results = traverser.traverse
        
        # Filter to only parent's children (skip parent itself)
        parent_children = results.select { |r| r.parent_id == parent.id }
        actual_ids = parent_children.map(&:node_id)
        
        # Expected order by distance from parent's bottom anchor: near -> near2 -> mid -> mid2 -> far
        expected_ids = [near.id, near2.id, mid.id, mid2.id, far.id]
        expect(actual_ids).to eq(expected_ids)
      end
      
      it 'assigns sequential sort_order based on distance' do
        traverser = described_class.new(bot)
        results = traverser.traverse
        
        parent_children = results.select { |r| r.parent_id == parent.id }
        
        near_step = parent_children.find { |r| r.node_id == near.id }
        near2_step = parent_children.find { |r| r.node_id == near2.id }
        mid_step = parent_children.find { |r| r.node_id == mid.id }
        mid2_step = parent_children.find { |r| r.node_id == mid2.id }
        far_step = parent_children.find { |r| r.node_id == far.id }
        
        expect(near_step.sort_order).to be < near2_step.sort_order
        expect(near2_step.sort_order).to be < mid_step.sort_order
        expect(mid_step.sort_order).to be < mid2_step.sort_order
        expect(mid2_step.sort_order).to be < far_step.sort_order
      end
      
      # it 'debug: show angles for collinear children' do
      #   traverser = described_class.new(bot)
      #   parent_output = traverser.send(:output_anchor_point, parent)
        
      #   [near, near2, mid, mid2, far].each do |child|
      #     child_input = traverser.send(:input_anchor_point, child)
      #     angle = traverser.send(:calculate_angle, parent_output, child_input)
      #     distance = Math.sqrt((child_input[0] - parent_output[0])**2 + (child_input[1] - parent_output[1])**2)
      #     puts "Node #{child.id}: angle=#{angle * 180 / Math::PI}°, distance=#{distance}"
      #   end
        
      #   results = traverser.traverse
      #   puts "Traversal order: #{results.select { |r| r.parent_id == parent.id }.map { |r| [r.node_id, r.angle ? r.angle * 180 / Math::PI : nil] }}"
      # end
    end
    
    context 'action results' do
      let!(:root) { bot.root_node }
      let!(:action) { create(:node, :action, bot: bot, position_x: 100, position_y: 100) }
      
      before do
        create(:node_connection, source_node: root, target_node: action)
      end
      
      it 'marks actions as :execute' do
        traverser = described_class.new(bot)
        results = traverser.traverse
        action_result = results.find { |r| r.node_id == action.id }
        expect(action_result.result).to eq(:execute)
      end
    end
    
    context 'backtracking when condition is false' do
      let!(:root) { bot.root_node }
      let!(:parent) { create(:node, :stub_true, :condition, bot: bot, position_x: 200, position_y: 100) }
      let!(:child_a) { create(:node, :stub_false, :condition, bot: bot, position_x: 150, position_y: 220) }
      let!(:child_b) { create(:node, :stub_true, :condition, bot: bot, position_x: 250, position_y: 220) }
      let!(:grandchild) { create(:node, :action, bot: bot, position_x: 150, position_y: 340) }
      
      before do
        create(:node_connection, source_node: root, target_node: parent)
        create(:node_connection, source_node: parent, target_node: child_a)
        create(:node_connection, source_node: parent, target_node: child_b)
        create(:node_connection, source_node: child_a, target_node: grandchild)
        
        allow(parent).to receive(:evaluate_condition).and_return(true)
        allow(child_a).to receive(:evaluate_condition).and_return(false)
        allow(child_b).to receive(:evaluate_condition).and_return(true)
      end
      
      it 'visits child_a then backtracks to child_b when child_a is false' do
        allow(parent).to receive(:evaluate_condition).and_return(true)
        allow(child_a).to receive(:evaluate_condition).and_return(false)
        allow(child_b).to receive(:evaluate_condition).and_return(true)
        
        traverser = described_class.new(bot)
        results = traverser.traverse
        ids = results.map(&:node_id)
        
        expect(ids).to include(parent.id, child_a.id, child_b.id)
        expect(ids.index(child_a.id)).to be < ids.index(child_b.id)
        expect(ids).not_to include(grandchild.id)
      end
    end
    
    context 'continuing when condition is true' do
      let!(:root) { bot.root_node }
      let!(:condition) { create(:node, :condition, bot: bot, position_x: 100, position_y: 100) }
      let!(:child) { create(:node, :action, bot: bot, position_x: 200, position_y: 100) }
      
      before do
        create(:node_connection, source_node: root, target_node: condition)
        create(:node_connection, source_node: condition, target_node: child)
        
        # TODO: Remove this once conditions are properly evaluated
        # Currently stubbing all conditions to return true so traversal continues
        allow_any_instance_of(ConditionEvaluator).to receive(:evaluate_condition).and_return(true)
      end
      
      it 'traverses into child when condition returns true' do
        traverser = described_class.new(bot)
        results = traverser.traverse
        ids = results.map(&:node_id)
        
        expect(ids).to include(condition.id, child.id)
      end
    end
  end
  
  describe '#format_results' do
    let!(:root) { bot.root_node }
    let!(:node) { create(:node, :condition, bot: bot, position_x: 100, position_y: 100) }
    
    before do
      create(:node_connection, source_node: root, target_node: node)
    end
    
    it 'returns formatted traversal report' do
      traverser = described_class.new(bot)
      traverser.traverse
      output = traverser.format_results
      
      expect(output).to include('Traversal Path:')
      expect(output).to include("nodeId: #{node.id}")
      expect(output).to include('Summary:')
    end
  end
  
  describe '#to_simple_format' do
    let!(:root) { bot.root_node }
    let!(:node) { create(:node, :condition, bot: bot, position_x: 100, position_y: 100) }
    
    before do
      create(:node_connection, source_node: root, target_node: node)
    end
    
    it 'returns compact comma-separated format' do
      traverser = described_class.new(bot)
      traverser.traverse
      output = traverser.to_simple_format
      
      expect(output).to match(/nodeId: \d+; \w+/)
    end
  end
  
  describe 'geometry calculations with top/bottom connectors' do
    let!(:root) { bot.root_node }
    
    before do
      root.update!(position_x: 100, position_y: 50)
    end
    
    describe '#calculate_angle' do
      it 'returns π for straight down from bottom output' do
        # Use two condition nodes (not root) for consistent dimensions
        parent = create(:node, :condition, bot: bot, position_x: 100, position_y: 100)
        child = create(:node, :condition, bot: bot, position_x: 100, position_y: 200)
        
        create(:node_connection, source_node: root, target_node: parent)
        
        traverser = described_class.new(bot)
        parent_output = traverser.send(:output_anchor_point, parent)
        child_input = traverser.send(:input_anchor_point, child)
        angle = traverser.send(:calculate_angle, parent_output, child_input)
        
        expect(angle).to be_within(0.01).of(Math::PI)
      end
      
      it 'orders children counter-clockwise from midnight (straight down) despite scrambled instantiation' do
        # Create 5 nodes in scrambled order to prove angles determine sorting, not IDs
        far_right = create(:node, :condition, bot: bot, position_x: 200, position_y: 200)
        mid_left = create(:node, :condition, bot: bot, position_x: 50, position_y: 200)
        center = create(:node, :condition, bot: bot, position_x: 100, position_y: 200)
        far_left = create(:node, :condition, bot: bot, position_x: 0, position_y: 200)
        mid_right = create(:node, :condition, bot: bot, position_x: 150, position_y: 200)
        
        create(:node_connection, source_node: root, target_node: far_right)
        create(:node_connection, source_node: root, target_node: mid_left)
        create(:node_connection, source_node: root, target_node: center)
        create(:node_connection, source_node: root, target_node: far_left)
        create(:node_connection, source_node: root, target_node: mid_right)
        
        traverser = described_class.new(bot)
        results = traverser.traverse
        
        # Expected CCW order from midnight: far_left (leftmost) → mid_left → center → mid_right → far_right
        expect(results.map(&:node_id)).to eq([far_left.id, mid_left.id, center.id, mid_right.id, far_right.id])
      end
    end
    
    describe '#output_anchor_point' do
      it 'calculates bottom center of node' do
        node = create(:node, :condition, bot: bot, position_x: 100, position_y: 100)
        traverser = described_class.new(bot)
        point = traverser.send(:output_anchor_point, node)
        
        expect(point[0]).to eq(150.0)
        expect(point[1]).to eq(160.0)
      end
    end
    
    describe '#input_anchor_point' do
      it 'calculates top center of node' do
        node = create(:node, :condition, bot: bot, position_x: 100, position_y: 100)
        traverser = described_class.new(bot)
        point = traverser.send(:input_anchor_point, node)
        
        expect(point[0]).to eq(150.0)
        expect(point[1]).to eq(100.0)
      end
    end
  end
end
