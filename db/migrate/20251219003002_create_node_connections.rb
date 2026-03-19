class CreateNodeConnections < ActiveRecord::Migration[7.1]
  def change
    create_table :node_connections do |t|
      t.belongs_to :source_node, null: false, foreign_key: { to_table: :nodes }
      t.belongs_to :target_node, null: false, foreign_key: { to_table: :nodes }
      t.string :branch_type, default: 'true' # 'true', 'false', 'default' for conditions

      t.timestamps
    end
  end
end