import Board from 'gameplay/board'
import { nextPositionOnRay } from 'gameplay/board_query_utils'
import { shuffled, pieceCode } from 'editorV2/panels/condition_preview/shared/board_utils'
import { raySliderSpeciesForStep } from 'editorV2/panels/condition_preview/shared/geometry_utils'
import { withPiece, legalPlacementForSpecies } from 'editorV2/panels/condition_preview/shared/piece_placement'
import { respectsAllCaps } from 'editorV2/panels/condition_preview/forward_proposition/respect_caps'

// Place a slider on a ray from targetPos in `step` direction (the side the
// pinning attacker should be on). Path between target and slider must be
// clear. If a compatible attacker already sits on this ray, returns pieces
// unchanged. If the path is blocked by a non-compatible piece, returns null.
// Otherwise places a new slider on an empty square in the ray (legal +
// cap-respecting).
export function placeSliderBeyondTarget({ pieces, attackerTeam, targetPos, step, ctx, random }) {
  const compatibleSliders = raySliderSpeciesForStep(step)

  const candidates = []
  let current = nextPositionOnRay(targetPos, step)
  while (current !== null) {
    const occupant = pieces.get(current)
    if (occupant) {
      const team = Board.parseTeam(occupant)
      const species = Board.parseSpecies(occupant)
      if (team === attackerTeam && compatibleSliders.has(species)) { return pieces }
      return null
    }
    candidates.push(current)
    current = nextPositionOnRay(current, step)
  }

  for (const pos of shuffled(candidates, random)) {
    for (const species of shuffled(compatibleSliders, random)) {
      if (!legalPlacementForSpecies(pos, species)) { continue }
      if (!respectsAllCaps(attackerTeam, species, pos, ctx, pieces)) { continue }
      const next = withPiece(pieces, pos, pieceCode(attackerTeam, species))
      if (next === null) { continue }
      return next
    }
  }
  return null
}
