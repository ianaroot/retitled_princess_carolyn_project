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
  
  private
  
  def only_one_root_per_bot
    existing_root = bot.nodes.where(node_type: 'root').where.not(id: id).exists?
    if existing_root
      errors.add(:node_type, "bot already has a root node")
    end
  end
end

