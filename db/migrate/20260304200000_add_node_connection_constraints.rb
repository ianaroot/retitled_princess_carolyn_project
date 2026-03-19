# frozen_string_literal: true

class AddNodeConnectionConstraints < ActiveRecord::Migration[7.1]
  def change
    # Prevent self-loops (A -> A)
    add_check_constraint :node_connections,
                         "source_node_id != target_node_id",
                         name: "no_self_loops"

    # Prevent bidirectional connections (A -> B when B -> A exists)
    add_index :node_connections,
              "LEAST(source_node_id, target_node_id), GREATEST(source_node_id, target_node_id)",
              unique: true,
              name: "idx_no_bidirectional_connections"
  end
end
