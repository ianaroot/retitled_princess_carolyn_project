import { materialValue } from 'gameplay/board_query_utils'
import {
  buildBoardFromLayout, buildLayoutFromPieces, pieceCode
} from 'editorV2/panels/condition_preview/shared/board_utils'
import { withPiece } from 'editorV2/panels/condition_preview/shared/piece_placement'
import { materializeRegion } from 'editorV2/panels/condition_preview/forward_proposition/materialize_region'
import { activeAttackOrDefendSets } from 'editorV2/panels/condition_preview/forward_proposition/relations/attack_or_defend'
import { activeShieldSets } from 'editorV2/panels/condition_preview/forward_proposition/relations/shield'
import { activeAdjacentSets } from 'editorV2/panels/condition_preview/forward_proposition/relations/adjacent'

export function respectsAllCaps(team, species, position, ctx, pieces, options = {}) {
  if (!propositionCapsRespected(team, species, position, ctx, pieces)) { return false }
  if (!relationCapsRespected(team, species, position, ctx, pieces, options.skipRelation ?? null)) { return false }
  return true
}

export function placeWithCaps(pieces, position, piece, ctx, options = {}) {
  const team = piece.charAt(0)
  const species = piece.slice(1)
  if (!respectsAllCaps(team, species, position, ctx, pieces, options)) { return null }
  return withPiece(pieces, position, piece)
}

function propositionCapsRespected(team, species, position, ctx, pieces) {
  const speciesValue = materialValue(species)
  for (const other of ctx.propositions) {
    if (other.frame !== 'current') { continue }
    if (other.team !== team) { continue }
    if (!other.species_set.has(species)) { continue }
    if (propositionHasNoMaxes(other)) { continue }
    const board = boardForRegion(other.region, pieces)
    const regionBySpecies = new Map()
    const getRegion = (s) => {
      let r = regionBySpecies.get(s)
      if (r === undefined) {
        r = materializeRegion(other.region, { singulars: ctx.singulars, board, species: s, team: other.team })
        regionBySpecies.set(s, r)
      }
      return r
    }
    if (!getRegion(species).has(position)) { continue }

    let count = 0
    let value = 0
    for (const [pos, piece] of pieces.entries()) {
      if (piece.charAt(0) !== other.team) { continue }
      const pieceSpecies = piece.slice(1)
      if (!other.species_set.has(pieceSpecies)) { continue }
      if (!getRegion(pieceSpecies).has(pos)) { continue }
      count += 1
      value += materialValue(pieceSpecies)
    }
    if (count + 1 > other.count_range.max) { return false }
    if (value + speciesValue > other.aggregate_value_range.max) { return false }
  }
  return true
}

function relationCapsRespected(team, species, position, ctx, pieces, skipRelation = null) {
  const relations = ctx.relations ?? []
  if (relations.length === 0) { return true }
  let hypotheticalPieces = null
  let hypotheticalBoard = null
  for (const relation of relations) {
    if (relation === skipRelation) { continue }
    if (relationHasNoMaxes(relation)) { continue }
    if (hypotheticalPieces === null) {
      hypotheticalPieces = withPiece(new Map(pieces), position, pieceCode(team, species))
      if (hypotheticalPieces === null) { return false }
      hypotheticalBoard = buildBoardFromLayout(buildLayoutFromPieces(hypotheticalPieces))
    }
    const sets = activeSetsForRelation(relation, hypotheticalPieces, hypotheticalBoard)
    if (sets === null) { continue }
    if (sets.activeSubjects.size > relation.subjectSide.count_range.max) { return false }
    if (sets.activeTargets.size  > relation.targetSide.count_range.max)  { return false }
    if (sumValues(sets.activeSubjects, hypotheticalPieces) > relation.subjectSide.aggregate_value_range.max) { return false }
    if (sumValues(sets.activeTargets,  hypotheticalPieces) > relation.targetSide.aggregate_value_range.max)  { return false }
  }
  return true
}

function propositionHasNoMaxes(prop) {
  return prop.count_range.max === Infinity && prop.aggregate_value_range.max === Infinity
}

function relationHasNoMaxes(relation) {
  return relation.subjectSide.count_range.max === Infinity &&
         relation.targetSide.count_range.max === Infinity &&
         relation.subjectSide.aggregate_value_range.max === Infinity &&
         relation.targetSide.aggregate_value_range.max === Infinity
}

function activeSetsForRelation(relation, pieces, board) {
  switch (relation.operator) {
    case 'attack':
    case 'defend':
      return activeAttackOrDefendSets(relation, pieces, board)
    case 'shield':
      return activeShieldSets(relation, pieces, board)
    case 'adjacent':
      return activeAdjacentSets(relation, pieces, board)
    default:
      return null
  }
}

function sumValues(positions, pieces) {
  let total = 0
  for (const pos of positions) {
    const piece = pieces.get(pos)
    if (piece) { total += materialValue(piece.slice(1)) }
  }
  return total
}

export function matches(prop, pos, piece, ctx, board) {
  if (piece.charAt(0) !== prop.team) { return false }
  const species = piece.slice(1)
  if (!prop.species_set.has(species)) { return false }
  const region = materializeRegion(prop.region, { singulars: ctx.singulars, board, species, team: prop.team })
  return region.has(pos)
}

export function boardForRegion(region, pieces) {
  if (region.kind !== 'related-to') { return null }
  return buildBoardFromLayout(buildLayoutFromPieces(pieces))
}
