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
#  is_root     :boolean          default: false
#  created_at :datetime         not null
#  updated_at :datetime         not null
#
class Node < ApplicationRecord
  belongs_to :bot
  has_many :outgoing_connections, class_name: 'NodeConnection', foreign_key: 'source_node_id', dependent: :destroy
  has_many :incoming_connections, class_name: 'NodeConnection', foreign_key: 'target_node_id', dependent: :destroy

  validates :node_type, presence: true
end
