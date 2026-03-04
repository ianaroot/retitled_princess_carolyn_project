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

  validate :source_and_target_must_be_different
  validate :bidirectional_connection_must_not_exist

  private

  def source_and_target_must_be_different
    return unless source_node_id.present? && target_node_id.present?
    return unless source_node_id == target_node_id

    errors.add(:target_node_id, "cannot connect a node to itself")
  end

  def bidirectional_connection_must_not_exist
    return unless source_node_id.present? && target_node_id.present?
    return if source_node_id == target_node_id

    reverse_connection = NodeConnection.find_by(
      source_node_id: target_node_id,
      target_node_id: source_node_id
    )

    return unless reverse_connection

    errors.add(:base, "cannot create bidirectional connection (reverse connection already exists)")
  end
end
