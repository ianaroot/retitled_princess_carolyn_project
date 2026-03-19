class RemoveBranchTypeFromNodeConnections < ActiveRecord::Migration[7.1]
  def change
    remove_column :node_connections, :branch_type
  end
end