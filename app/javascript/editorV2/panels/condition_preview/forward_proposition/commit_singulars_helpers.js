import {
  pieceCode, buildBoardFromLayout, buildLayoutFromPieces
} from 'editorV2/panels/condition_preview/shared/board_utils'
import { withPiece } from 'editorV2/panels/condition_preview/shared/piece_placement'
import { intersectRegions } from 'editorV2/panels/condition_preview/forward_proposition/region'
import { materializeRegion } from 'editorV2/panels/condition_preview/forward_proposition/materialize_region'
import { committedSpecies } from 'editorV2/panels/condition_preview/shared/singular_constraints'

export function applyRelationsToAnchors(singular, singulars, committed, species) {
  for (const r of singular.relationsToAnchors ?? []) {
    if (!committed.has(r.otherActor)) { continue }
    const anchorRole = r.myRole === 'subject' ? 'target' : 'subject'
    const board = buildBoardFromCommittedSingulars(singulars, committed)
    const region = materializeRegion(
      { kind: 'related-to', actor: r.otherActor, role: anchorRole, operator: r.operator },
      { singulars, board, species, team: singular.team }
    )
    singular.region = intersectRegions(singular.region, { kind: 'set', squares: region })
  }
}

function buildBoardFromCommittedSingulars(singulars, committed) {
  let map = new Map()
  for (const name of committed) {
    const s = singulars[name]
    const species = committedSpecies(s)
    if (species === null || s.region.kind !== 'set') { continue }
    const pos = [...s.region.squares][0]
    if (pos === undefined) { continue }
    const next = withPiece(map, pos, pieceCode(s.team, species))
    if (next === null) { continue }
    map = next
  }
  return buildBoardFromLayout(buildLayoutFromPieces(map))
}
