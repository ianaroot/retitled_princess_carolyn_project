require 'rails_helper'

RSpec.describe NodeSortOrder do
  let(:node_dimensions) { ApplicationHelper::NODE_DIMENSIONS }
  let(:test_class) { Class.new { include NodeSortOrder } }
  let(:test_instance) { test_class.new }
  
  describe '#calculate_angle' do
    it 'returns π for straight down from bottom output' do
      # Parent at (100, 100), child at (100, 200)
      origin = [150.0, 160.0]  # output anchor: 100 + 50, 100 + 60
      target = [150.0, 200.0]  # input anchor: 100 + 50, 200
      
      angle = test_instance.calculate_angle(origin, target)
      expect(angle).to be_within(0.01).of(Math::PI)
    end
    
    it 'returns smaller angles for left-of-center positions' do
      origin = [150.0, 160.0]
      left_target = [150.0, 400.0]      # straight down, 240px below (180°)
      right_target = [300.0, 400.0]     # right and down (~150°)
      
      left_angle = test_instance.calculate_angle(origin, left_target)
      right_angle = test_instance.calculate_angle(origin, right_target)
      
      # Right should have smaller angle (closer to 150° than 180°)
      expect(right_angle).to be < left_angle
    end
    
    it 'returns 0 for straight up' do
      origin = [150.0, 160.0]
      target = [150.0, 100.0]  # straight up
      
      angle = test_instance.calculate_angle(origin, target)
      expect(angle).to be_within(0.01).of(0.0)
    end
  end
  
  describe '#output_anchor_point' do
    it 'calculates bottom center of condition node' do
      node = double('node', node_type: 'condition', position_x: 100, position_y: 100)
      point = test_instance.output_anchor_point(node, node_dimensions)
      
      expect(point[0]).to eq(150.0)  # 100 + 50 (half of 100 width)
      expect(point[1]).to eq(160.0)  # 100 + 60 (full height)
    end
    
    it 'calculates bottom center of root node' do
      node = double('node', node_type: 'root', position_x: 100, position_y: 100)
      point = test_instance.output_anchor_point(node, node_dimensions)
      
      expect(point[0]).to eq(160.0)  # 100 + 60 (half of 120 width)
      expect(point[1]).to eq(220.0)  # 100 + 120 (full height)
    end
    
    it 'uses defaults for unknown node types' do
      node = double('node', node_type: 'unknown', position_x: 100, position_y: 100)
      point = test_instance.output_anchor_point(node, node_dimensions)
      
      expect(point[0]).to eq(150.0)  # 100 + 50 (default half width)
      expect(point[1]).to eq(160.0)  # 100 + 60 (default height)
    end
  end
  
  describe '#input_anchor_point' do
    it 'calculates top center of condition node' do
      node = double('node', node_type: 'condition', position_x: 100, position_y: 100)
      point = test_instance.input_anchor_point(node, node_dimensions)
      
      expect(point[0]).to eq(150.0)  # 100 + 50 (half of 100 width)
      expect(point[1]).to eq(100.0)   # 100 (top of node)
    end
    
    it 'calculates top center of root node' do
      node = double('node', node_type: 'root', position_x: 100, position_y: 100)
      point = test_instance.input_anchor_point(node, node_dimensions)
      
      expect(point[0]).to eq(160.0)  # 100 + 60 (half of 120 width)
      expect(point[1]).to eq(100.0)  # 100 (top of node)
    end
  end
  
  describe '#sort_children' do
    let(:nodes) do
      {
        1 => double('root_node', id: 1, node_type: 'root', position_x: 400, position_y: 100),
        2 => double('near', id: 2, node_type: 'condition', position_x: 400, position_y: 200),
        3 => double('mid', id: 3, node_type: 'condition', position_x: 400, position_y: 350),
        4 => double('far', id: 4, node_type: 'condition', position_x: 400, position_y: 600),
        5 => double('left', id: 5, node_type: 'condition', position_x: 300, position_y: 200),
        6 => double('right', id: 6, node_type: 'condition', position_x: 500, position_y: 200)
      }
    end
    
    it 'sorts collinear children by distance (nearest first) when angles are equal' do
      # All at x=400, directly below parent at x=400, y=100
      connections = { 1 => [4, 3, 2] }  # scrambled order: far, mid, near
      
      sorted = test_instance.sort_children(1, nodes, connections, node_dimensions)
      
      # Should be ordered by distance: near (2) -> mid (3) -> far (4)
      expect(sorted).to eq([2, 3, 4])
    end
    
    it 'sorts by angle counter-clockwise when angles differ' do
      # left at x=300, right at x=500, both at y=200
      # Parent at x=400, y=100
      connections = { 1 => [6, 5] }  # scrambled: right, left
      
      sorted = test_instance.sort_children(1, nodes, connections, node_dimensions)
      
      # Left should come first (smaller angle in CCW from midnight)
      expect(sorted).to eq([5, 6])
    end
    
    it 'returns empty array when node has no children' do
      connections = {}
      
      sorted = test_instance.sort_children(1, nodes, connections, node_dimensions)
      
      expect(sorted).to be_empty
    end
    
    it 'returns empty array when node has no connections' do
      connections = { 1 => [] }
      
      sorted = test_instance.sort_children(1, nodes, connections, node_dimensions)
      
      expect(sorted).to be_empty
    end
  end
  
  describe '#calculate_distance' do
    it 'calculates euclidean distance between two points' do
      origin = [0, 0]
      target = [3, 4]  # 3-4-5 triangle
      
      distance = test_instance.calculate_distance(origin, target)
      
      expect(distance).to eq(5.0)
    end
    
    it 'returns 0 for identical points' do
      point = [100, 200]
      
      distance = test_instance.calculate_distance(point, point)
      
      expect(distance).to eq(0.0)
    end
  end
end
