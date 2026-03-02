FactoryBot.define do
  factory :bot do
    sequence(:name) { |n| "Bot #{n}" }
    description { "A test bot for playing chess" }
    association :user

    trait :with_nodes do
      after(:create) do |bot|
        create_list(:node, 3, bot: bot)
      end
    end
  end
end
