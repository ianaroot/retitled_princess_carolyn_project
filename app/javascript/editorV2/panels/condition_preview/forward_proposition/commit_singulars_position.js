import { ALL_POSITIONS, pieceCode } from 'editorV2/panels/condition_preview/shared/board_utils'
import { withPiece, legalPlacementForSpecies } from 'editorV2/panels/condition_preview/shared/piece_placement'
import { aggregateMobilityRangeForSingular, edgeBiasedShuffle } from 'editorV2/panels/condition_preview/forward_proposition/mobility/edge_bias'
import { applyRelationsToAnchors } from 'editorV2/panels/condition_preview/forward_proposition/commit_singulars_helpers'
import { respectsAllCaps } from 'editorV2/panels/condition_preview/forward_proposition/respect_caps'
import { ACTOR_PRIORITY } from 'editorV2/panels/condition_preview/forward_proposition/singulars'
import { committedSpecies } from 'editorV2/panels/condition_preview/shared/singular_constraints'

const ACTOR_KEYS = Object.freeze(
  Object.keys(ACTOR_PRIORITY).sort((a, b) => ACTOR_PRIORITY[a] - ACTOR_PRIORITY[b])
)
const CAPTURED_ACTORS = new Set(['captured_piece', 'enemy_captured_piece'])

export function commitSingularsPosition(ctx, random, earlyPieces = new Map()) {
  const singulars = ctx.singulars
  const seen = new Set()
  const committed = new Set()
  for (const key of ACTOR_KEYS) {
    const singular = singulars[key]
    if (seen.has(singular)) {
      committed.add(key)
      continue
    }
    seen.add(singular)
    if (isAlreadyPositioned(singular)) {
      committed.add(key)
      continue
    }
    commitPositionFor(singular, singulars, committed, random, ctx, key, earlyPieces)
    committed.add(key)
  }
}

function isAlreadyPositioned(singular) {
  return singular.region.kind === 'set' && singular.region.squares.size === 1
}

function commitPositionFor(singular, singulars, committed, random, ctx, key, earlyPieces) {
  const species = committedSpecies(singular)
  if (species === null) { return }

  applyRelationsToAnchors(singular, singulars, committed, species)

  const candidates = singular.region.kind === 'all' ? ALL_POSITIONS : [...singular.region.squares]
  if (candidates.length === 0) { return }
  const mobilityRange = aggregateMobilityRangeForSingular(singular, ctx.propositions)
  const ordered = edgeBiasedShuffle(candidates, random, mobilityRange, ctx.edgeBiasState)

  if (CAPTURED_ACTORS.has(key)) {
    if (key === 'captured_piece' && singular.region.kind === 'all') {
      const moved = singulars.moved_piece
      if (moved.region.kind === 'set' && moved.region.squares.size === 1) {
        const movedDestination = [...moved.region.squares][0]
        if (legalPlacementForSpecies(movedDestination, species)) {
          singular.region = { kind: 'set', squares: new Set([movedDestination]) }
          return
        }
      }
    }
    for (const candidate of ordered) {
      if (!legalPlacementForSpecies(candidate, species)) { continue }
      singular.region = { kind: 'set', squares: new Set([candidate]) }
      return
    }
    singular.region = { kind: 'set', squares: new Set() }
    return
  }

  const virtualPieces = virtualPiecesFor(singulars, committed, earlyPieces)
  for (const candidate of ordered) {
    if (!legalPlacementForSpecies(candidate, species)) { continue }
    if (respectsAllCaps(singular.team, species, candidate, ctx, virtualPieces)) {
      singular.region = { kind: 'set', squares: new Set([candidate]) }
      return
    }
  }
  singular.region = { kind: 'set', squares: new Set() }
}

function virtualPiecesFor(singulars, committed, earlyPieces) {
  let map = new Map(earlyPieces)
  for (const name of committed) {
    const s = singulars[name]
    const species = committedSpecies(s)
    if (species === null || s.region.kind !== 'set') { continue }
    const pos = [...s.region.squares][0]
    if (pos === undefined) { continue }
    if (map.has(pos)) { continue }
    const next = withPiece(map, pos, pieceCode(s.team, species))
    if (next === null) { continue }
    map = next
  }
  return map
}
