class AddRootNodes < ActiveRecord::Migration[7.1]
  def up
    # 1. Update check constraint to include root and connector types
    remove_check_constraint :nodes, name: 'node_type_check' rescue nil
    add_check_constraint :nodes, 
      "node_type IN ('condition', 'action', 'root', 'connector')",
      name: 'node_type_check'
    
    # 2. Add partial unique index for root nodes (one per bot)
    add_index :nodes, :bot_id, 
      unique: true, 
      where: "node_type = 'root'",
      name: 'index_nodes_on_bot_id_root_unique'
    
    # 3. Remove is_root column
    remove_column :nodes, :is_root, :boolean, default: false
  end
  
  def down
    # Reverse the changes
    add_column :nodes, :is_root, :boolean, default: false
    remove_index :nodes, name: 'index_nodes_on_bot_id_root_unique'
    remove_check_constraint :nodes, name: 'node_type_check' rescue nil
    add_check_constraint :nodes,
      "node_type IN ('condition', 'action')",
      name: 'node_type_check'
  end
end
