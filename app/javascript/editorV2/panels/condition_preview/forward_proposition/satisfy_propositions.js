import {
  pieceCode, weightedShuffleSpecies, shuffled
} from 'editorV2/panels/condition_preview/shared/board_utils'
import { materialValue } from 'gameplay/board_query_utils'
import { withPiece, legalPlacementForSpecies } from 'editorV2/panels/condition_preview/shared/piece_placement'
import { materializeRegion } from 'editorV2/panels/condition_preview/forward_proposition/materialize_region'
import { edgeBiasedShuffle } from 'editorV2/panels/condition_preview/forward_proposition/mobility/edge_bias'
import { respectsAllCaps, matches, boardForRegion } from 'editorV2/panels/condition_preview/forward_proposition/respect_caps'

const MAX_PLAN_COUNT = 4
const MAX_PLAN_RESAMPLES = 3

export function satisfyPropositions(ctx, pieces, random) {
  for (const prop of shuffled(ctx.propositions, random)) {
    if (prop.frame !== 'current') { continue }
    const next = satisfyOne(prop, pieces, ctx, random)
    if (next === null) { return null }
    pieces = next
  }
  return pieces
}

function satisfyOne(prop, pieces, ctx, random) {
  let { count, value } = tallyMatching(prop, pieces, ctx)

  const plans = plansIfMultiple(prop, count, value)
  if (plans !== null) {
    for (let s = 0; s < MAX_PLAN_RESAMPLES; s += 1) {
      const planned = trySatisfyOneWithPlan(prop, pieces, ctx, random, plans)
      if (planned !== null) { return planned }
    }
  }

  while (count < prop.count_range.min || value < prop.aggregate_value_range.min) {
    const placed = placeOne(prop, pieces, ctx, random)
    if (placed === null) { return null }
    pieces = placed.pieces
    count += 1
    value += materialValue(placed.species)
  }
  return pieces
}

function plansIfMultiple(prop, currentCount, currentValue) {
  if (!planningQualifies(prop, currentCount, currentValue)) { return null }
  const byK = enumerateProposalPlans(prop, currentCount, currentValue)
  if (byK.length === 0) { return null }
  if (byK.length === 1 && byK[0].length === 1) { return null }
  return byK
}

function planningQualifies(prop, currentCount, currentValue) {
  const needsCount = currentCount < prop.count_range.min
  const needsValue = currentValue < prop.aggregate_value_range.min
  if (!needsCount && !needsValue) { return false }
  return prop.count_range.max !== Infinity ||
         prop.aggregate_value_range.max !== Infinity ||
         prop.aggregate_value_range.min > 0
}

function trySatisfyOneWithPlan(prop, pieces, ctx, random, plans) {
  const plan = pickFromPlans(plans, random)
  if (plan === null) { return null }
  let next = pieces
  for (const species of plan) {
    const result = placeOneOfSpecies(prop, next, ctx, random, species)
    if (result === null) { return null }
    next = result.pieces
  }
  const { count: newCount, value: newValue } = tallyMatching(prop, next, ctx)
  if (newCount < prop.count_range.min || newValue < prop.aggregate_value_range.min) { return null }
  return next
}

function pickFromPlans(byK, random) {
  if (byK.length === 0) { return null }
  const choices = byK[Math.floor(random() * byK.length)]
  return choices[Math.floor(random() * choices.length)]
}

function enumerateProposalPlans(prop, currentCount, currentValue) {
  const species = [...prop.species_set].filter(s => s !== null)
  const cMin = Math.max(prop.count_range.min - currentCount, 0)
  const cMax = Math.min(prop.count_range.max - currentCount, MAX_PLAN_COUNT)
  const kMin = Math.max(cMin, 1)
  const kMax = cMax
  if (kMin > kMax) { return [] }
  const vMin = Math.max(prop.aggregate_value_range.min - currentValue, 0)
  const vMax = prop.aggregate_value_range.max - currentValue
  if (vMin > vMax) { return [] }
  const byK = []
  for (let k = kMin; k <= kMax; k += 1) {
    const multisets = []
    recurseMultisets(species, k, 0, [], 0, vMin, vMax, multisets)
    if (multisets.length > 0) { byK.push(multisets) }
  }
  return byK
}

function recurseMultisets(species, remaining, startIdx, current, currentSum, vMin, vMax, out) {
  if (remaining === 0) {
    if (currentSum >= vMin && currentSum <= vMax) { out.push([...current]) }
    return
  }
  for (let i = startIdx; i < species.length; i += 1) {
    const sp = species[i]
    current.push(sp)
    recurseMultisets(species, remaining - 1, i, current, currentSum + materialValue(sp), vMin, vMax, out)
    current.pop()
  }
}

function placeOneOfSpecies(prop, pieces, ctx, random, species) {
  const board = boardForRegion(prop.region, pieces)
  const code = pieceCode(prop.team, species)
  const region = materializeRegion(prop.region, { singulars: ctx.singulars, board, species, team: prop.team })
  const positions = edgeBiasedShuffle([...region], random, prop.aggregate_mobility_range, ctx.edgeBiasState)
  for (const position of positions) {
    if (!legalPlacementForSpecies(position, species)) { continue }
    if (!respectsAllCaps(prop.team, species, position, ctx, pieces)) { continue }
    const next = withPiece(pieces, position, code)
    if (next !== null) { return { pieces: next, species } }
  }
  return null
}

function tallyMatching(prop, pieces, ctx) {
  let count = 0
  let value = 0
  const board = boardForRegion(prop.region, pieces)
  for (const [pos, piece] of pieces.entries()) {
    if (matches(prop, pos, piece, ctx, board)) {
      count += 1
      value += materialValue(piece.slice(1))
    }
  }
  return { count, value }
}

function placeOne(prop, pieces, ctx, random) {
  const board = boardForRegion(prop.region, pieces)
  const filtered = new Set([...prop.species_set].filter(s => s !== null))
  const speciesPool = weightedShuffleSpecies(filtered, random)
  for (const species of speciesPool) {
    const code = pieceCode(prop.team, species)
    const region = materializeRegion(prop.region, { singulars: ctx.singulars, board, species, team: prop.team })
    const positions = edgeBiasedShuffle([...region], random, prop.aggregate_mobility_range, ctx.edgeBiasState)
    for (const position of positions) {
      if (!respectsAllCaps(prop.team, species, position, ctx, pieces)) { continue }
      const next = withPiece(pieces, position, code)
      if (next !== null) { return { pieces: next, species } }
    }
  }
  return null
}
