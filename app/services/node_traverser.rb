# frozen_string_literal: true

# Service class for traversing bot node graphs and determining execution order
# Supports DAG structures, counter-clockwise spatial ordering, and infinite loop detection
class NodeTraverser
  # Node dimensions by type - class-level hash for lookup
  NODE_DIMENSIONS = {
    'condition' => { width: 100, height: 60 },
    'action' => { width: 100, height: 60 },
    'root' => { width: 120, height: 120 },
    'connector' => { width: 40, height: 40 }
  }.freeze
  
  # Result class to hold traversal step information
  class TraversalStep
    attr_reader :node_id, :node_type, :parent_id, :depth, :result, :angle, :sort_order
    
    def initialize(node_id:, node_type:, parent_id:, depth:, result: nil, angle: nil, sort_order: nil)
      @node_id = node_id
      @node_type = node_type
      @parent_id = parent_id
      @depth = depth
      @result = result
      @angle = angle
      @sort_order = sort_order
    end
    
    def to_s
      indent = "  " * depth
      angle_str = angle ? format("[%.1f°]", angle * 180 / Math::PI) : ""
      sort_str = sort_order ? "(##{sort_order})" : ""
      result_str = result.nil? ? "" : " → #{result}"
      "#{indent}#{sort_str} nodeId: #{node_id} (#{node_type})#{angle_str}#{result_str}"
    end
    
    def to_simple_format
      result_str = result.nil? ? "pending" : result.to_s
      "nodeId: #{node_id}; #{result_str}"
    end
  end
  
  class InfiniteLoopError < StandardError
    attr_reader :cycle_path
    
    def initialize(cycle_path)
      @cycle_path = cycle_path
      super("Infinite loop detected: #{format_cycle(cycle_path)}")
    end
    
    private
    
    def format_cycle(path)
      path.map { |step| "#{step.node_id}" }.join(" → ")
    end
  end
  
  # Lightweight node struct for memory efficiency
  NodeData = Struct.new(:id, :node_type, :position_x, :position_y, :data, :bot_id) do
    # Type check helpers (match Node model interface)
    def condition?
      node_type == 'condition'
    end
    
    def action?
      node_type == 'action'
    end
    
    def root?
      node_type == 'root'
    end
    
    def connector?
      node_type == 'connector'
    end
  end
  
  def initialize(bot)
    @bot = bot
    # Use pluck with Structs for memory efficiency
    @nodes = load_nodes_as_structs
    @connections = preload_connections
    @results = []
    @execution_stack = [] # Tracks current path for cycle detection
    @next_sort_order = 0
  end
  
  # Main entry point - traverses from root node
  def traverse
    root = @bot.root_node
    raise "Bot has no root node" unless root
    
    @results = []
    @execution_stack = []
    @next_sort_order = 0
    
    # Start with root's children (root itself is just a starting point)
    children = get_children(root.id)
    traverse_children(root.id, children, 0)
    
    @results
  end
  
  # Formats results for console display
  def format_results
    return "No traversal results" if @results.empty?
    
    output = ["Traversal Path:"]
    output << "=" * 50
    
    @results.each { |step| output << step.to_s }
    
    output << "=" * 50
    output << "Summary: #{@results.length} steps"
    output.join("\n")
  end
  
  # Simple comma-separated format: "nodeId: 5; true, nodeId: 8; true..."
  def to_simple_format
    @results.map(&:to_simple_format).join(", ")
  end
  
  private
  
  # Load nodes as lightweight Structs to reduce memory footprint
  def load_nodes_as_structs
    @bot.nodes.pluck(:id, :node_type, :position_x, :position_y, :data, :bot_id)
        .map { |attrs| NodeData.new(*attrs) }
        .index_by(&:id)
  end
  
  # Get dimensions for a node type
  def node_dimensions(node)
    NODE_DIMENSIONS.fetch(node.node_type, { width: 100, height: 60 })
  end
  
  # Preload all connections into a hash for fast lookup
  # Queries NodeConnection directly since @nodes are Structs without associations
  def preload_connections
    connections = Hash.new { |hash, key| hash[key] = [] }
    NodeConnection.where(source_node_id: @nodes.keys)
      .pluck(:source_node_id, :target_node_id)
      .each do |source_id, target_id|
        connections[source_id] << target_id
      end
    connections
  end
  
  # Get children of a node, sorted by counter-clockwise angle from midnight
  def get_children(node_id)
    child_ids = @connections[node_id] || []
    return [] if child_ids.empty?
    
    parent = @nodes[node_id]
    parent_output = output_anchor_point(parent)
    
    children_with_angles = child_ids.map do |child_id|
      child = @nodes[child_id]
      child_input = input_anchor_point(child)
      angle = calculate_angle(parent_output, child_input)
      [child_id, angle]
    end
    
    # Sort by angle (counter-clockwise from midnight)
    # Since DOM Y increases downward, we need descending order for CCW
    children_with_angles.sort_by { |_, angle| -angle }.map(&:first)
  end
  
  # Calculate angle from origin to target, counter-clockwise from midnight
  # Returns angle in radians [0, 2π)
  # 0 = midnight (straight up)
  # Sorting: Descending order gives counter-clockwise progression
  #   (10 o'clock has larger angle than 9 o'clock, so it comes first)
  def calculate_angle(origin, target)
    dx = target[0] - origin[0]
    dy = target[1] - origin[1]
    
    # Flip Y because DOM Y increases downward
    # This makes angles increase clockwise from midnight
    # We then sort descending to get counter-clockwise order
    raw_angle = Math.atan2(dx, -dy)
    
    # Normalize to [0, 2π)
    (raw_angle + 2 * Math::PI) % (2 * Math::PI)
  end
  
  # Default output connector position (bottom center)
  # Override this method for different node types
  def output_anchor_point(node)
    dims = node_dimensions(node)
    [
      node.position_x + (dims[:width] / 2.0),  # Center horizontally
      node.position_y + dims[:height]          # Bottom of node
    ]
  end
  
  # Default input connector position (top center)
  # Override this method for different node types
  def input_anchor_point(node)
    dims = node_dimensions(node)
    [
      node.position_x + (dims[:width] / 2.0),  # Center horizontally
      node.position_y                          # Top of node
    ]
  end
  
  # Main traversal logic with backtracking
  def traverse_children(parent_id, child_ids, depth)
    return if child_ids.empty?
    
    parent = @nodes[parent_id]
    parent_output = output_anchor_point(parent)
    
    child_ids.each_with_index do |child_id, index|
      child = @nodes[child_id]
      
      # Check for infinite loop (cycle in current stack)
      if would_create_cycle?(parent_id, child_id)
        cycle_path = @execution_stack + [build_step(parent_id, child_id, depth, nil)]
        raise InfiniteLoopError.new(cycle_path)
      end
      
      # Calculate angle for this child
      child_input = input_anchor_point(child)
      angle = calculate_angle(parent_output, child_input)
      @next_sort_order += 1
      
      # Determine result for this node
      result = evaluate_node_result(child, child_id, depth)
      
      # Create and store step
      step = TraversalStep.new(
        node_id: child_id,
        node_type: child.node_type,
        parent_id: parent_id,
        depth: depth,
        result: result,
        angle: angle,
        sort_order: @next_sort_order
      )
      @results << step
      @execution_stack << step
      
      if result == true && child.condition?
        grandchildren = get_children(child_id)
        traverse_children(child_id, grandchildren, depth + 1) if grandchildren.any?
      end
      
      # Pop from execution stack when done with this branch
      @execution_stack.pop
    end
  end
  
  # Check if adding this edge would create a cycle in the current traversal
  def would_create_cycle?(parent_id, child_id)
    # Check if child_id already in stack with the same parent
    @execution_stack.any? { |step| step.node_id == child_id && step.parent_id == parent_id }
  end
  
  # Build a temporary step for cycle detection error reporting
  def build_step(parent_id, child_id, depth, result)
    child = @nodes[child_id]
    TraversalStep.new(
      node_id: child_id,
      node_type: child&.node_type || 'unknown',
      parent_id: parent_id,
      depth: depth,
      result: result
    )
  end
  
  # Evaluate node result using ConditionEvaluator service object
  # Delegates evaluation logic to separate service for clean separation of concerns
  def evaluate_node_result(node, node_id, depth)
    children = get_children(node_id)
    # TEMPORARY: Pass nodes hash for child type lookup - remove once real evaluation implemented
    evaluator = ConditionEvaluator.new(node, @nodes, nil)
    evaluator.evaluate(children)
  end
end
