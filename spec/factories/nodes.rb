FactoryBot.define do
  factory :node do
    node_type { "condition" }
    position_x { 100.0 }
    position_y { 100.0 }
    is_root { false }
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
      is_root { true }
    end
  end
end
