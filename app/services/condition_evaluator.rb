# frozen_string_literal: true

# Service object for evaluating node conditions against chess board state
# Currently implements temporary stub logic for testing traversal order
# TODO: Replace stub with actual chess board state evaluation
class ConditionEvaluator
  # TEMPORARY: nodes hash passed for child type lookup - remove once real evaluation implemented
  def initialize(node_data, nodes_hash = nil, board_state = nil)
    @node = node_data
    @nodes = nodes_hash
    @board = board_state
  end
  
  # Evaluate the node based on its type and children
  # @param children [Array<Integer>] IDs of child nodes
  # @return [Boolean, Symbol] true/false for conditions, :execute for actions, true for others
  def evaluate(children = [])
    case @node.node_type
    when 'condition'
      evaluate_condition(children)
    when 'action'
      :execute
    when 'root', 'connector'
      true
    else
      true
    end
  end
  
  private
  
  # Temporary implementation - returns false at chain bottom or before actions
  # TODO: Replace with actual chess condition evaluation using @node.data and @board
  def evaluate_condition(children)
    if children.empty?
      # Bottom of chain - treat as false to trigger backtracking in tests
      false
    elsif children.length == 1
      # TEMPORARY: Check if single child is an action (structural check)
      # In real implementation, this would evaluate actual chess condition
      first_child_id = children.first
      first_child = @nodes[first_child_id] if @nodes
      first_child&.node_type == 'action' ? false : true
    else
      # Multiple children - continue traversal
      true
    end
  end
end
