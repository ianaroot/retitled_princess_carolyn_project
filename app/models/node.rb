# == Schema Information
#
# Table name: nodes
#
#  id          :bigint           not null, primary key
#  bot_id      :bigint           not null
#  node_type   :string           not null
#  data        :json             default: {}
#  position_x  :float            default: 0
#  position_y  :float            default: 0
#  created_at  :datetime         not null
#  updated_at  :datetime         not null
#
class Node < ApplicationRecord
  belongs_to :bot
  has_many :outgoing_connections, class_name: 'NodeConnection', foreign_key: 'source_node_id', dependent: :destroy
  has_many :incoming_connections, class_name: 'NodeConnection', foreign_key: 'target_node_id', dependent: :destroy

  validates :node_type, presence: true
  
  # Ensure only one root per bot (DB has unique index, this validates before save)
  validate :only_one_root_per_bot, if: -> { node_type == 'root' }
  
  # Node type helpers
  def root?
    node_type == 'root'
  end
  
  def action?
    node_type == 'action'
  end

  def condition?
    node_type == 'condition'
  end
  
  def connector?
    node_type == 'connector'
  end
  
  # Evaluate this node's condition
  # NOTE: This is a temporary stub implementation for testing traversal order.
  # Currently returns true/false based on structural position in the tree.
  # 
  # TODO: When implementing real condition evaluation:
  #   - Remove children and depth parameters (not needed)
  #   - Access node.data directly for query configuration
  #   - Evaluate against actual chess board state
  #   - Return boolean based on real game conditions
  #
  # @param children [Array<Integer>] IDs of child nodes (temporary param)
  # @param depth [Integer] Current traversal depth (temporary param)
  # @return [Boolean, Symbol] true/false for conditions, :execute for actions
  def evaluate_condition(children = [], depth = 0)
    case node_type
    when 'condition'
      # Temporary: returns false at chain bottom or before actions
      if children.empty?
        false
      elsif children.length == 1
        # Check if only child is an action
        child = bot.nodes.find_by(id: children.first)
        child&.action? ? false : true
      else
        true
      end
    when 'action'
      :execute
    when 'root', 'connector'
      true
    else
      true
    end
  end
  
  private
  
  def only_one_root_per_bot
    existing_root = bot.nodes.where(node_type: 'root').where.not(id: id).exists?
    if existing_root
      errors.add(:node_type, "bot already has a root node")
    end
  end
end

