class AddUniqueIndexToNodeConnections < ActiveRecord::Migration[7.0]
  def change
    add_index :node_connections, [:source_node_id, :target_node_id], unique: true
  end
end
