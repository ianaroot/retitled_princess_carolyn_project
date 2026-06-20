import CandidateMoveAnalysisV2 from "bot_execution/candidate_move_analysis_v2"
import profileCollector from "gameplay/profile_collector"
import { SINGULAR_ACTORS } from "bot_execution/actors"
import { compareTotals } from "bot_execution/utils"

const identityCoerce = (value) => value
const zeroCoerce = (value) => value ?? 0
const coerceFor = (isPbs) => isPbs ? zeroCoerce : identityCoerce

class ConditionEvaluatorV2 {
    evaluate(conditionNode, analysis) {
      const v2Analysis = this.v2AnalysisFor(analysis)
      switch (conditionNode.kind) {
        case "relational":
          return this.evaluateRelational(conditionNode, v2Analysis)
        case "census":
          return this.evaluateCensus(conditionNode, v2Analysis)
        case "identity":
          return this.evaluateIdentity(conditionNode, v2Analysis)
        default:
          throw new Error(`Unknown V2 condition kind: ${conditionNode.kind}`)
      }
    }

    v2AnalysisFor(analysis) {
      if (!analysis._v2Analysis) {
        profileCollector.increment('condition.v2.analysis_instances')
        analysis._v2Analysis = new CandidateMoveAnalysisV2({
          board: analysis.board,
          moveObject: analysis.moveObject
        })
      }

      return analysis._v2Analysis
    }

    evaluateUnary(conditionNode, analysis) {
      return profileCollector.measure('condition.v2.unary', () => {
        const operator = conditionNode.operator
        if (!this.unarySideCanEvaluate({
          actor: conditionNode.subject,
          filter: conditionNode.subjectFilter || "any",
          filterMode: conditionNode.subjectFilterMode || null,
          operator,
          role: "subject"
        }, analysis)) { return false }
        if (!this.unaryTargetCanEvaluate(conditionNode, analysis)) { return false }

        const leftTotal = analysis.unaryTotal({
          actor: conditionNode.subject,
          filter: conditionNode.subjectFilter || "any",
          filterMode: conditionNode.subjectFilterMode || null,
          operator
        })
        const rightTotal = this.unaryTargetTotal(conditionNode, analysis)
        const coerce = coerceFor(conditionNode.target === "prior_board_state")
        return compareTotals(conditionNode.comparator, coerce(leftTotal), coerce(rightTotal))
      })
    }

    evaluateRelational(conditionNode, analysis) {
      return profileCollector.measure('condition.v2.relational', () => {
        const operator = conditionNode.operator
        if (!this.relationalSingularActorsCanEvaluate(conditionNode, analysis)) {
          profileCollector.increment('condition.v2.relational.failed.singular_actors')
          return false
        }
        const result = analysis.relationalResult({
          subject: conditionNode.subject, subjectFilter: conditionNode.subjectFilter || "any",
          subjectFilterMode: conditionNode.subjectFilterMode || null, operator,
          target: conditionNode.target, targetFilter: conditionNode.targetFilter || "any",
          targetFilterMode: conditionNode.targetFilterMode || null
        })
        const subjectComparisonPresent = this.relationalComparisonPresent(conditionNode, "subject")
        const targetComparisonPresent = this.relationalComparisonPresent(conditionNode, "target")
        if (!subjectComparisonPresent && !targetComparisonPresent) {
          const passed = result.pairs.length > 0
          if (!passed) { profileCollector.increment('condition.v2.relational.failed.no_pairs_no_comparison') }
          return passed
        }
        const subjectMetric = conditionNode.subjectComparisonMetric
        const targetMetric = conditionNode.targetComparisonMetric
        if (subjectMetric === "individual_value" || subjectMetric === "aggregate_value" ||
            targetMetric === "individual_value" || targetMetric === "aggregate_value") {
          const subjectCoerce = coerceFor(conditionNode.subjectComparisonSource === "prior_board_state")
          const targetCoerce = coerceFor(conditionNode.targetComparisonSource === "prior_board_state")
          const subjectReference = subjectComparisonPresent
            ? subjectCoerce(this.relationalComparisonReferenceTotal({ side: "subject", conditionNode, analysis }))
            : null
          const targetReference = targetComparisonPresent
            ? targetCoerce(this.relationalComparisonReferenceTotal({ side: "target", conditionNode, analysis }))
            : null
          const passed = analysis.evaluateRelationalValueMetrics({
            pairs: result.pairs,
            subjectMetric: subjectComparisonPresent ? subjectMetric : null,
            subjectComparator: conditionNode.subjectComparator,
            subjectReference,
            subjectCoerce,
            targetMetric: targetComparisonPresent ? targetMetric : null,
            targetComparator: conditionNode.targetComparator,
            targetReference,
            targetCoerce
          })
          if (!passed) {
            const subCause = result.pairs.length === 0 ? 'no_pairs' : 'comparison'
            profileCollector.increment(`condition.v2.relational.failed.value_metrics.${subCause}`)
            if (subCause === 'comparison') {
              const priorPairs = analysis.relationalResult({
                subject: conditionNode.subject, subjectFilter: conditionNode.subjectFilter || "any",
                subjectFilterMode: conditionNode.subjectFilterMode || null, operator,
                target: conditionNode.target, targetFilter: conditionNode.targetFilter || "any",
                targetFilterMode: conditionNode.targetFilterMode || null,
                boardScope: 'prior'
              }).pairs
              profileCollector.increment(`condition.v2.relational.failed.value_metrics.comparison.prior_pairs_${priorPairs.length === 0 ? 'zero' : 'nonzero'}`)
            }
          }
          return passed
        }
        const subjectPasses = subjectComparisonPresent ? this.evaluateRelationalSubjectComparison(conditionNode, analysis, result) : true
        const targetPasses = targetComparisonPresent ? this.evaluateRelationalTargetComparison(conditionNode, analysis, result) : true
        const passed = subjectPasses && targetPasses
        if (!passed) {
          const subCause = result.pairs.length === 0 ? 'no_pairs' : 'comparison'
          profileCollector.increment(`condition.v2.relational.failed.non_value_metrics.${subCause}`)
        }
        return passed
      })
    }

    unarySideCanEvaluate({ actor, filter = "any", filterMode = null, operator, role = "subject" }, analysis) {
      if (!SINGULAR_ACTORS.has(actor)) { return true }
      if (role === "subject" && operator === "count") { return true }
      if (operator === "mobility") {
        return analysis.singularActorPresentForMobility({
          actor,
          filter,
          filterMode
        })
      }
      if (filter === "any") { return true }
      return analysis.singularActorMatchesFilter({
        actor,
        filter,
        filterMode
      })
    }

    unaryTargetCanEvaluate(conditionNode, analysis) {
      if (conditionNode.target === "exact_number" || conditionNode.target === "prior_board_state") { return true }
      return this.unarySideCanEvaluate({
        actor: conditionNode.target,
        filter: conditionNode.targetFilter || "any",
        filterMode: conditionNode.targetFilterMode || null,
        operator: conditionNode.operator,
        role: "target"
      }, analysis)
    }

    unaryTargetTotal(conditionNode, analysis) {
      if (conditionNode.target === "exact_number") { return conditionNode.targetTotal }
      if (conditionNode.target === "prior_board_state") {
        return analysis.unaryTotal({
          actor: conditionNode.subject,
          filter: conditionNode.subjectFilter || "any",
          filterMode: conditionNode.subjectFilterMode || null,
          operator: conditionNode.operator,
          boardScope: "prior"
        })
      }

      return analysis.unaryTotal({
        actor: conditionNode.target,
        filter: conditionNode.targetFilter || "any",
        filterMode: conditionNode.targetFilterMode || null,
        operator: conditionNode.operator
      })
    }

    relationalSingularActorsCanEvaluate(conditionNode, analysis) {
      return analysis.relationalSingularActorResolves({
        actor: conditionNode.subject,
        filter: conditionNode.subjectFilter || "any",
        filterMode: conditionNode.subjectFilterMode || null
      }) && analysis.relationalSingularActorResolves({
        actor: conditionNode.target,
        filter: conditionNode.targetFilter || "any",
        filterMode: conditionNode.targetFilterMode || null
      })
    }

    evaluateRelationalSubjectComparison(conditionNode, analysis, result) {
      const subjectTotal = analysis.metricForPositions({ metric: conditionNode.subjectComparisonMetric, positions: result.subjectPositions })
      const referenceTotal = this.relationalComparisonReferenceTotal({ side: "subject", conditionNode, analysis })
      const coerce = coerceFor(conditionNode.subjectComparisonSource === "prior_board_state")
      return compareTotals(conditionNode.subjectComparator, coerce(subjectTotal), coerce(referenceTotal))
    }

    evaluateRelationalTargetComparison(conditionNode, analysis, result) {
      const targetTotal = analysis.metricForPositions({ metric: conditionNode.targetComparisonMetric, positions: result.targetPositions })
      const referenceTotal = this.relationalComparisonReferenceTotal({ side: "target", conditionNode, analysis })
      const coerce = coerceFor(conditionNode.targetComparisonSource === "prior_board_state")
      return compareTotals(conditionNode.targetComparator, coerce(targetTotal), coerce(referenceTotal))
    }

    relationalComparisonReferenceTotal({ side, conditionNode, analysis }) {
      const comparisonSourceKey = side === "subject" ? "subjectComparisonSource" : "targetComparisonSource"
      const comparisonSourceTotalKey = side === "subject" ? "subjectComparisonSourceTotal" : "targetComparisonSourceTotal"
      const comparisonMetricKey = side === "subject" ? "subjectComparisonMetric" : "targetComparisonMetric"
      const comparisonSource = conditionNode[comparisonSourceKey]
      const operator = conditionNode.operator
      if (comparisonSource === "exact_number") {
        return conditionNode[comparisonSourceTotalKey]
      }
      if (comparisonSource === "prior_board_state") {
        const priorResult = analysis.relationalResult({
          subject: conditionNode.subject,
          subjectFilter: conditionNode.subjectFilter || "any",
          subjectFilterMode: conditionNode.subjectFilterMode || null,
          operator,
          target: conditionNode.target,
          targetFilter: conditionNode.targetFilter || "any",
          targetFilterMode: conditionNode.targetFilterMode || null,
          boardScope: "prior"
        })
        const priorPositions = side === "subject" ? priorResult.subjectPositions : priorResult.targetPositions
        return analysis.metricForPositions({ metric: conditionNode[comparisonMetricKey], positions: priorPositions, boardScope: "prior" })
      } else {
        return analysis.comparisonSourceTotal({
          comparisonSource,
          subject: conditionNode.subject,
          subjectFilter: conditionNode.subjectFilter || "any",
          subjectFilterMode: conditionNode.subjectFilterMode || null,
          operator
        })
      }
    }

    evaluateCensus(conditionNode, analysis) {
      const hasRegion = conditionNode.positionAxis !== undefined && conditionNode.positionAxis !== null
      if (!hasRegion) {
        return this.evaluateUnary(conditionNode, analysis)
      }
      return profileCollector.measure('condition.v2.census', () => {
        if (conditionNode.subject === "enemy_moved_piece") {
          const resolved = analysis.resolvedEnemyMovedPiece()
          if (!resolved || !resolved.presentOnBoard) { return false }
        }
        if (!this.unaryTargetCanEvaluate(conditionNode, analysis)) { return false }

        const operator = conditionNode.operator
        const leftTotal = analysis.positionMetricTotal({
          positions: this.censusRegionPositions(conditionNode, analysis),
          operator
        })
        const rightTotal = this.censusTargetTotal(conditionNode, analysis)
        const coerce = coerceFor(conditionNode.target === "prior_board_state")
        return compareTotals(conditionNode.comparator, coerce(leftTotal), coerce(rightTotal))
      })
    }

    censusRegionPositions(conditionNode, analysis, boardScope = "after") {
      return analysis.actorPositionsInRegion({
        actor: conditionNode.subject,
        filter: conditionNode.subjectFilter || "any",
        filterMode: conditionNode.subjectFilterMode || null,
        positionAxis: conditionNode.positionAxis,
        positionComparator: conditionNode.positionComparator,
        positionTarget: conditionNode.positionTarget,
        boardScope
      })
    }

    censusTargetTotal(conditionNode, analysis) {
      const operator = conditionNode.operator
      if (conditionNode.target === "exact_number") { return conditionNode.targetTotal }
      if (conditionNode.target === "prior_board_state") {
        return analysis.positionMetricTotal({
          positions: this.censusRegionPositions(conditionNode, analysis, "prior"),
          operator,
          boardScope: "prior"
        })
      }
      // Distinct-actor target: read board-wide. The region filters the
      // subject only; the comparison piece lives elsewhere on the board.
      return analysis.unaryTotal({
        actor: conditionNode.target,
        filter: conditionNode.targetFilter || "any",
        filterMode: conditionNode.targetFilterMode || null,
        operator
      })
    }

    evaluateIdentity(conditionNode, analysis) {
      return profileCollector.measure('condition.v2.identity', () => {
        return analysis.samePiece({
          subject: conditionNode.subject,
          target: conditionNode.target,
          subjectFilter: conditionNode.subjectFilter,
          subjectFilterMode: conditionNode.subjectFilterMode
        })
      })
    }

    relationalComparisonPresent(conditionNode, side) {
      const metricKey = side === "subject" ? "subjectComparisonMetric" : "targetComparisonMetric"
      const comparatorKey = side === "subject" ? "subjectComparator" : "targetComparator"
      const comparisonSourceKey = side === "subject" ? "subjectComparisonSource" : "targetComparisonSource"
      const comparisonSourceTotalKey = side === "subject" ? "subjectComparisonSourceTotal" : "targetComparisonSourceTotal"
      return Boolean(
        conditionNode[metricKey] && conditionNode[comparatorKey] &&
        (
          conditionNode[comparisonSourceKey] ||
          conditionNode[comparisonSourceTotalKey] !== undefined
        )
      )
    }
  }

export default ConditionEvaluatorV2
