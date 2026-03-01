# == Schema Information
#
# Table name: node_connections
#
#  id            :bigint           not null, primary key
#  source_node_id :bigint          not null
#  target_node_id :bigint          not null
#  created_at    :datetime         not null
#  updated_at    :datetime         not null
#
class NodeConnection < ApplicationRecord
  belongs_to :source_node, class_name: 'Node'
  belongs_to :target_node, class_name: 'Node'

  validates :source_node_id, presence: true
  validates :target_node_id, presence: true
  validates :source_node_id, uniqueness: { scope: :target_node_id, message: "connection already exists" }
end
