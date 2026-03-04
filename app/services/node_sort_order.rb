# frozen_string_literal: true

# Module for node sorting logic and geometry calculations
module NodeSortOrder
  def sort_children(parent_id, nodes, connections, node_dimensions)
    child_ids = connections[parent_id] || []
    return [] if child_ids.empty?

    parent = nodes[parent_id]
    parent_output = output_anchor_point(parent, node_dimensions)

    children_with_metrics = child_ids.map do |child_id|
      child = nodes[child_id]
      child_input = input_anchor_point(child, node_dimensions)
      angle = calculate_angle(parent_output, child_input)
      distance = calculate_distance(parent_output, child_input)
      [child_id, angle, distance]
    end

    children_with_metrics.sort_by { |_, angle, distance| [-angle, distance] }.map(&:first)
  end

  def calculate_angle(origin, target)
    dx = target[0] - origin[0]
    dy = target[1] - origin[1]
    raw_angle = Math.atan2(dx, -dy)
    (raw_angle + 2 * Math::PI) % (2 * Math::PI)
  end

  def calculate_distance(origin, target)
    Math.sqrt((target[0] - origin[0])**2 + (target[1] - origin[1])**2)
  end

  def output_anchor_point(node, node_dimensions)
    dims = node_dimensions.fetch(node.node_type, { width: 100, height: 60 })
    [
      node.position_x + (dims[:width] / 2.0),
      node.position_y + dims[:height]
    ]
  end

  def input_anchor_point(node, node_dimensions)
    dims = node_dimensions.fetch(node.node_type, { width: 100, height: 60 })
    [
      node.position_x + (dims[:width] / 2.0),
      node.position_y
    ]
  end
end
