FactoryBot.define do
  factory :node do
    node_type { "condition" }
    position_x { 100.0 }
    position_y { 100.0 }
    data { {} }
    association :bot

    trait :condition do
      node_type { "condition" }
      data { { context: "self", query: "is_attacked" } }
    end

    trait :action do
      node_type { "action" }
      data { { action_type: "move" } }
    end

    trait :root do
      node_type { "root" }
      data { {} }
    end
    
    trait :connector do
      node_type { "connector" }
      data { {} }
    end
    
    # Marker traits for test stubbing
    # Use with: allow(node).to receive(:evaluate_condition).and_return(true/false)
    trait :stub_true do
    end
    
    trait :stub_false do
    end
  end
end
