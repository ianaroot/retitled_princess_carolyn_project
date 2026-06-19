class NodeGrammarRules
  UNARY_OPERATORS_BY_SUBJECT = {
    'allied' => NodeGrammarV2::UNARY_OPERATORS,
    'enemy' => NodeGrammarV2::UNARY_OPERATORS,
    'moved_piece' => NodeGrammarV2::UNARY_OPERATORS,
    'enemy_moved_piece' => NodeGrammarV2::UNARY_OPERATORS,
    'captured_piece' => %w[count value],
    'enemy_captured_piece' => %w[count value]
  }.freeze

  REGULAR_RELATIONAL_SUBJECTS = %w[
    moved_piece
    allied
    enemy
    enemy_moved_piece
  ].freeze

  REGULAR_RELATIONAL_TARGETS = %w[
    moved_piece
    allied
    enemy
    enemy_moved_piece
  ].freeze

  SAME_PIECE_TARGETS = {
    'enemy_moved_piece' => %w[captured_piece],
    'captured_piece' => %w[enemy_moved_piece]
  }.freeze

  RELATIONAL_OPERATOR_TARGET_RULES = {
    'attack' => 'opposing_team',
    'defend' => 'same_team',
    'cover' => 'same_team',
    'shield' => 'same_team',
    'adjacent' => 'any_regular'
  }.freeze

  TEAM_SUBJECT_GROUPS = {
    'allied' => %w[allied moved_piece],
    'enemy' => %w[enemy enemy_moved_piece]
  }.freeze

  OPPOSING_TEAM_GROUPS = {
    'allied' => 'enemy',
    'enemy' => 'allied'
  }.freeze

  POSITION_OPERATORS_BY_SUBJECT = {
    'allied' => NodeGrammarV2::POSITION_OPERATORS,
    'enemy' => NodeGrammarV2::POSITION_OPERATORS,
    'moved_piece' => NodeGrammarV2::POSITION_OPERATORS,
    'enemy_moved_piece' => NodeGrammarV2::POSITION_OPERATORS
  }.freeze

  COMPARISON_SOURCES_BY_METRIC = {
    'count' => %w[exact_number prior_board_state],
    'individual_value' => NodeGrammarV2::COMPARISON_SOURCES
  }.freeze

  class << self
    def valid_filter_mode_for_filter?(filter:, filter_mode:)
      return false unless NodeGrammarV2.valid_filter?(filter)

      if NodeGrammarV2::CONCRETE_FILTERS.include?(filter)
        NodeGrammarV2.valid_filter_mode?(filter_mode)
      else
        filter_mode.blank?
      end
    end

    def valid_unary_operator_for_subject?(subject, operator)
      UNARY_OPERATORS_BY_SUBJECT.fetch(subject, []).include?(operator)
    end

    def valid_unary_target_for_operator?(target:, operator:)
      return false unless NodeGrammarV2.valid_unary_target?(target)
      return true if NodeGrammarV2::SPECIAL_UNARY_TARGETS.include?(target)

      valid_unary_operator_for_subject?(target, operator)
    end

    def valid_relational_operator_for_subject?(subject:, operator:)
      return false unless NodeGrammarV2.valid_subject?(subject)
      return false unless NodeGrammarV2.valid_relational_operator?(operator)

      REGULAR_RELATIONAL_SUBJECTS.include?(subject)
    end

    def valid_relational_target_for?(subject:, operator:, target:)
      return false unless NodeGrammarV2.valid_subject?(target)
      return false unless valid_relational_operator_for_subject?(subject:, operator:)

      regular_relational_targets_for(subject:, operator:).include?(target)
    end

    def regular_relational_targets_for(subject:, operator:)
      case RELATIONAL_OPERATOR_TARGET_RULES.fetch(operator, 'any_regular')
      when 'opposing_team' then opposing_team_targets_for(subject)
      when 'same_team' then same_team_targets_for(subject)
      else REGULAR_RELATIONAL_TARGETS
      end
    end

    def valid_position_operator_for_subject?(subject, operator)
      POSITION_OPERATORS_BY_SUBJECT.fetch(subject, []).include?(operator)
    end

    def valid_identity_pair?(subject:, target:)
      SAME_PIECE_TARGETS.fetch(subject, []).include?(target)
    end

    def editor_config
      {
        'editorSubjects' => NodeGrammarV2::EDITOR_SUBJECTS,
        'regularRelationalSubjects' => REGULAR_RELATIONAL_SUBJECTS,
        'regularRelationalTargets' => REGULAR_RELATIONAL_TARGETS,
        'relationalOperatorTargetRules' => RELATIONAL_OPERATOR_TARGET_RULES,
        'samePieceTargets' => SAME_PIECE_TARGETS,
        'teamSubjectGroups' => TEAM_SUBJECT_GROUPS,
        'opposingTeamGroups' => OPPOSING_TEAM_GROUPS,
        'positionSubjects' => NodeGrammarV2::POSITION_SUBJECTS,
        'capturesSubjects' => NodeGrammarV2::OFF_BOARD_SUBJECTS,
        'census' => {
          'regionSubjects' => NodeGrammarV2::POSITION_SUBJECTS,
          'wholeBoardSubjects' => NodeGrammarV2::POSITION_SUBJECTS,
          'operators' => NodeGrammarV2::POSITION_OPERATORS,
          'axes' => NodeGrammarV2::POSITION_AXES,
          'wholeBoardTargets' => NodeGrammarV2::UNARY_TARGETS
        }
      }
    end

    def comparison_sources_for_metric(metric)
      COMPARISON_SOURCES_BY_METRIC.fetch(metric, [])
    end

    def valid_comparison_source_for_metric?(metric:, source:)
      comparison_sources_for_metric(metric).include?(source)
    end

    private

    def same_team_targets_for(subject)
      team = team_group_for_subject(subject)
      team ? TEAM_SUBJECT_GROUPS.fetch(team) : []
    end

    def opposing_team_targets_for(subject)
      team = team_group_for_subject(subject)
      opposing_team = OPPOSING_TEAM_GROUPS[team]
      opposing_team ? TEAM_SUBJECT_GROUPS.fetch(opposing_team) : []
    end

    def team_group_for_subject(subject)
      TEAM_SUBJECT_GROUPS.find { |_team, subjects| subjects.include?(subject) }&.first
    end
  end
end
