require 'rails_helper'

RSpec.describe NodeGrammarRules, type: :model do
  describe '.valid_filter_mode_for_filter?' do
    it 'treats major and minor as concrete filters' do
      expect(NodeGrammarV2.valid_filter?('major')).to be(true)
      expect(NodeGrammarV2.valid_filter?('minor')).to be(true)
      expect(described_class.valid_filter_mode_for_filter?(filter: 'major', filter_mode: 'include')).to be(true)
      expect(described_class.valid_filter_mode_for_filter?(filter: 'major', filter_mode: 'exclude')).to be(true)
      expect(described_class.valid_filter_mode_for_filter?(filter: 'major', filter_mode: nil)).to be(false)
      expect(described_class.valid_filter_mode_for_filter?(filter: 'minor', filter_mode: 'include')).to be(true)
      expect(described_class.valid_filter_mode_for_filter?(filter: 'minor', filter_mode: 'exclude')).to be(true)
      expect(described_class.valid_filter_mode_for_filter?(filter: 'minor', filter_mode: nil)).to be(false)
    end
  end

  describe '.valid_relational_target_for?' do
    it 'rejects same_piece as a relational operator (it is now the identity kind)' do
      expect(described_class.valid_relational_target_for?(subject: 'enemy_moved_piece', operator: 'same_piece', target: 'captured_piece')).to be(false)
      expect(NodeGrammarV2.valid_relational_operator?('same_piece')).to be(false)
    end

    it 'allows attack targets only across teams' do
      expect(described_class.valid_relational_target_for?(subject: 'allied', operator: 'attack', target: 'enemy')).to be(true)
      expect(described_class.valid_relational_target_for?(subject: 'moved_piece', operator: 'attack', target: 'enemy_moved_piece')).to be(true)
      expect(described_class.valid_relational_target_for?(subject: 'enemy', operator: 'attack', target: 'allied')).to be(true)
      expect(described_class.valid_relational_target_for?(subject: 'enemy_moved_piece', operator: 'attack', target: 'moved_piece')).to be(true)

      expect(described_class.valid_relational_target_for?(subject: 'allied', operator: 'attack', target: 'moved_piece')).to be(false)
      expect(described_class.valid_relational_target_for?(subject: 'enemy', operator: 'attack', target: 'enemy_moved_piece')).to be(false)
    end

    it 'allows defend cover and shield targets only within the same team' do
      %w[defend cover shield].each do |operator|
        expect(described_class.valid_relational_target_for?(subject: 'allied', operator:, target: 'moved_piece')).to be(true)
        expect(described_class.valid_relational_target_for?(subject: 'enemy', operator:, target: 'enemy_moved_piece')).to be(true)
        expect(described_class.valid_relational_target_for?(subject: 'allied', operator:, target: 'enemy')).to be(false)
        expect(described_class.valid_relational_target_for?(subject: 'enemy_moved_piece', operator:, target: 'moved_piece')).to be(false)
      end
    end

    it 'keeps adjacent targets unrestricted among regular relational targets' do
      expect(described_class.valid_relational_target_for?(subject: 'allied', operator: 'adjacent', target: 'enemy')).to be(true)
      expect(described_class.valid_relational_target_for?(subject: 'enemy', operator: 'adjacent', target: 'moved_piece')).to be(true)
    end
  end

  describe '.valid_comparison_source_for_metric?' do
    it 'allows exact numbers and prior board state for count comparisons' do
      expect(described_class.valid_comparison_source_for_metric?(metric: 'count', source: 'exact_number')).to be(true)
      expect(described_class.valid_comparison_source_for_metric?(metric: 'count', source: 'prior_board_state')).to be(true)
      expect(described_class.valid_comparison_source_for_metric?(metric: 'count', source: 'moved_piece')).to be(false)
    end

    it 'allows distinct piece sources for individual_value but not for aggregate_value' do
      expect(described_class.valid_comparison_source_for_metric?(metric: 'individual_value', source: 'moved_piece')).to be(true)
      expect(described_class.valid_comparison_source_for_metric?(metric: 'aggregate_value', source: 'moved_piece')).to be(false)
    end
  end

  describe '.valid_unary_target_for_operator?' do
    it 'allows exact numbers and prior board state for every unary operator' do
      expect(described_class.valid_unary_target_for_operator?(target: 'exact_number', operator: 'mobility')).to be(true)
      expect(described_class.valid_unary_target_for_operator?(target: 'prior_board_state', operator: 'mobility')).to be(true)
    end

    it 'allows actor targets when the target actor supports the unary operator' do
      expect(described_class.valid_unary_target_for_operator?(target: 'enemy', operator: 'mobility')).to be(true)
      expect(described_class.valid_unary_target_for_operator?(target: 'enemy_moved_piece', operator: 'mobility')).to be(true)
      expect(described_class.valid_unary_target_for_operator?(target: 'captured_piece', operator: 'value')).to be(true)
    end

    it 'rejects captured-piece actor targets for mobility' do
      expect(described_class.valid_unary_target_for_operator?(target: 'captured_piece', operator: 'mobility')).to be(false)
      expect(described_class.valid_unary_target_for_operator?(target: 'enemy_captured_piece', operator: 'mobility')).to be(false)
    end
  end

  describe 'NodeGrammarV2.valid_comparison_metric?' do
    it 'accepts count and individual_value but not aggregate_value' do
      expect(NodeGrammarV2.valid_comparison_metric?('count')).to be(true)
      expect(NodeGrammarV2.valid_comparison_metric?('individual_value')).to be(true)
      expect(NodeGrammarV2.valid_comparison_metric?('aggregate_value')).to be(false)
    end
  end

  describe '.editor_config' do
    it 'routes captured pieces to the captures tab, not census whole-board' do
      config = described_class.editor_config

      expect(config['capturesSubjects']).to eq(%w[captured_piece enemy_captured_piece])
      expect(config['census']['wholeBoardSubjects']).not_to include('captured_piece', 'enemy_captured_piece')
    end
  end
end
