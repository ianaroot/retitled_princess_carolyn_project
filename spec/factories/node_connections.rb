FactoryBot.define do
  factory :node_connection do
    transient do
      bot { nil }
    end

    trait :with_nodes do
      after(:build) do |connection, evaluator|
        target_bot = evaluator.bot || create(:bot)
        connection.source_node ||= create(:node, bot: target_bot)
        connection.target_node ||= create(:node, bot: target_bot)
      end
    end
  end
end
