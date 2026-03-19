module ApplicationHelper
  # Node dimensions lookup - must match NodeTraverser::NODE_DIMENSIONS
  NODE_DIMENSIONS = {
    'condition' => { width: 100, height: 60 },
    'action' => { width: 100, height: 60 },
    'root' => { width: 120, height: 120 },
    'connector' => { width: 40, height: 40 }
  }.freeze

  # Calculate connector positions for a node
  # Returns hash with CSS custom property values
  def node_connector_styles(node)
    dims = NODE_DIMENSIONS.fetch(node.node_type, { width: 100, height: 60 })
    width = dims[:width]
    height = dims[:height]
    
    # Connector dots are 14px, center point is offset by 7px
    {
      '--connector-input-x' => "#{width / 2}px",
      '--connector-input-y' => '0px',
      '--connector-output-x' => "#{width / 2}px",
      '--connector-output-y' => '0px',
      'width' => "#{width}px",
      'min-height' => "#{height}px"
    }
  end
end
