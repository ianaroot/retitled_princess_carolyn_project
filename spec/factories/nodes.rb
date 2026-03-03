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
  end
end
