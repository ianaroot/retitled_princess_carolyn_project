import { ALL_POSITIONS, pieceCode, pickWeightedSpecies, shuffled } from 'editorV2/panels/condition_preview/shared/board_utils'
import { withPiece, legalPlacementForSpecies } from 'editorV2/panels/condition_preview/shared/piece_placement'
import { isEdgePosition } from 'editorV2/panels/condition_preview/forward_proposition/mobility/edge_bias'
import { respectsAllCaps } from 'editorV2/panels/condition_preview/forward_proposition/respect_caps'
import { commitSingularRegion } from 'editorV2/panels/condition_preview/shared/singular_constraints'

export const edgeStrategy = {
  name: 'edge',
  constraintKind: 'mobility',

  appliesTo(constraint, ctx, pieces, pool) {
    if (ctx.edgeBiasState.count >= ctx.edgeBiasState.max) { return false }
    if (constraint.region.kind === 'related-to') { return false }
    return true
  },

  apply(constraint, ctx, pieces, pool, random) {
    if (ctx.edgeBiasState.count >= ctx.edgeBiasState.max) { return null }
    const edgeSquares = edgeSquaresIn(constraint.region)
    if (edgeSquares.length === 0) { return null }

    const candidates = filterPoolForConstraint(pool, constraint)
    for (const entry of shuffled(candidates, random)) {
      const next = tryPlaceAtEdge(entry, constraint, edgeSquares, ctx, pieces, random)
      if (next !== null) {
        ctx.edgeBiasState.count += 1
        return next
      }
    }
    return null
  }
}

function edgeSquaresIn(region) {
  if (region.kind === 'all') {
    return ALL_POSITIONS.filter(isEdgePosition)
  }
  if (region.kind === 'set') {
    return [...region.squares].filter(isEdgePosition)
  }
  return []
}

function filterPoolForConstraint(pool, constraint) {
  if (constraint.boundSingularActor) {
    return pool.filter(entry =>
      entry.source === 'singular' && entry.actorKey === constraint.boundSingularActor
    )
  }
  return pool.filter(entry => {
    if (entry.team !== constraint.team) { return false }
    return speciesOverlap(entry.speciesOptions, constraint.species_set)
  })
}

function speciesOverlap(a, b) {
  for (const species of a) {
    if (species === null) { continue }
    if (b.has(species)) { return true }
  }
  return false
}

function tryPlaceAtEdge(entry, constraint, edgeSquares, ctx, pieces, random) {
  const species = pickSpeciesForPlacement(entry, constraint, random)
  if (species === null) { return null }

  for (const square of shuffled(edgeSquares, random)) {
    if (!legalPlacementForSpecies(square, species)) { continue }
    if (!respectsAllCaps(constraint.team, species, square, ctx, pieces)) { continue }
    const code = pieceCode(constraint.team, species)
    const nextPieces = withPiece(pieces, square, code)
    if (nextPieces === null) { continue }

    if (entry.source === 'singular') {
      const narrowed = commitSingularRegion(ctx.singulars[entry.actorKey], square)
      if (!narrowed) { continue }
    }

    return nextPieces
  }
  return null
}

function pickSpeciesForPlacement(entry, constraint, random) {
  const eligible = new Set()
  for (const species of entry.speciesOptions) {
    if (species === null) { continue }
    if (!constraint.species_set.has(species)) { continue }
    eligible.add(species)
  }
  if (eligible.size === 0) { return null }
  return pickWeightedSpecies(eligible, random)
}
