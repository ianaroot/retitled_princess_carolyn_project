# frozen_string_literal: true

# Service class for traversing bot node graphs and determining execution order
# Supports DAG structures, counter-clockwise spatial ordering, and infinite loop detection
class NodeTraverser
  NODE_WIDTH = 100
  NODE_HEIGHT = 60
  
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
  
  def initialize(bot)
    @bot = bot
    @nodes = bot.nodes.index_by(&:id)
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
  
  # Preload all connections into a hash for fast lookup
  def preload_connections
    connections = {}
    @nodes.each do |id, node|
      connections[id] = node.outgoing_connections.includes(:target_node).map(&:target_node_id)
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
  
  # Default output connector position (right side center)
  # Override this method for different node types
  def output_anchor_point(node)
    [
      node.position_x + NODE_WIDTH,
      node.position_y + (NODE_HEIGHT / 2.0)
    ]
  end
  
  # Default input connector position (left side center)
  # Override this method for different node types
  def input_anchor_point(node)
    [
      node.position_x,
      node.position_y + (NODE_HEIGHT / 2.0)
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
        # Continue depth-first with this node's children
        grandchildren = get_children(child_id)
        
        if grandchildren.any?
          # Check if first grandchild is an action (exception case)
          first_grandchild = @nodes[grandchildren.first]
          if first_grandchild&.action?
            # Exception: condition followed by action = treat as false
            step.instance_variable_set(:@result, false)
            # Backtrack to parent's next sibling
            break
          else
            traverse_children(child_id, grandchildren, depth + 1)
          end
        else
          # No children = bottom of chain (exception case)
          step.instance_variable_set(:@result, false)
          # Backtrack to parent's next sibling
          break
        end
      elsif result == true && child.root?
        # Root nodes always continue
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
  
  # Evaluate node result
  # NOTE: Returns are stubbed for testing traversal order only.
  # TODO: Replace with actual condition evaluation against game state.
  def evaluate_node_result(node, node_id, depth)
    if node.condition?
      # Stubbed: returns true except at chain bottom or before actions.
      # TODO: Evaluate node.data against board state.
      children = get_children(node_id)
      
      if children.empty?
        false
      elsif children.length == 1 && @nodes[children.first]&.action?
        false
      else
        true
      end
    elsif node.action?
      # Actions are terminal - they don't return true/false in the same way
      # But for traversal purposes, let's say they "execute"
      :execute
    elsif node.root? || node.connector?
      # These are structural, continue traversal
      true
    else
      true
    end
  end
end
