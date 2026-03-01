class RemoveCategoryFromNodes < ActiveRecord::Migration[7.1]
  def change
    Node.where(node_type: 'action').where.not(category: nil).each do |node|
      data = node.data.is_a?(Hash) ? node.data : {}
      data['action_type'] = node.category
      node.update_column(:data, data)
    end

    remove_column :nodes, :category
  end
end
