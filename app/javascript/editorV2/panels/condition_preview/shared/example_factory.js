import { soundForMove, moveKindForMoveObject } from 'editorV2/panels/condition_preview/shared/example_utils'
import { buildAggregatedResult, buildAggregatedHighlights } from 'editorV2/panels/condition_preview/shared/move_collection'
import { bindingComboKey } from 'editorV2/panels/condition_preview/forward_proposition/moved_binding'

// Packages a verified Candidate into the example object that downstream
// rendering and diversity selection consume. One factory is created per
// pipeline call and reused across every candidate. Each call composes the
// chain-level aggregated result + highlights with the candidate's own state.

export class ExampleFactory {
  constructor({ combinedPlan }) {
    this.combinedPlan = combinedPlan
  }

  build(candidate, { generationPath, moveKind = null, binding = null }) {
    const aggregatedResult = buildAggregatedResult(this.combinedPlan, candidate.analysis)
    if (!aggregatedResult) { return null }

    const highlights = buildAggregatedHighlights(
      this.combinedPlan, candidate.moveObject, aggregatedResult, candidate.priorBoard, candidate.afterBoard
    )
    const movedPieceInRelation = (
      aggregatedResult.subjectPositions.includes(candidate.moveObject.endPosition) ||
      aggregatedResult.targetPositions.includes(candidate.moveObject.endPosition)
    )

    return {
      priorBoard: candidate.priorBoard,
      afterBoard: candidate.afterBoard,
      moveObject: candidate.moveObject,
      result: aggregatedResult,
      highlights,
      variantType: movedPieceInRelation ? 'involved' : 'separate',
      movedPieceInRelation,
      moveKind: moveKind ?? moveKindForMoveObject(candidate.moveObject),
      sound: soundForMove(candidate.priorBoard, candidate.afterBoard, candidate.moveObject),
      generationPath,
      binding,
      bindingComboKey: binding ? bindingComboKey(binding, this.combinedPlan) : ''
    }
  }
}
