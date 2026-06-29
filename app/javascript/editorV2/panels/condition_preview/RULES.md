# condition_preview rules

## Condition kinds

Condition `kind` is `relational | census | identity` only. **`unary` and
`position` are retired** — no `plan.kind`/`data.kind`/`source` will ever be
those again; do not reason from or reintroduce them.

- Region vs whole-board is detected by **`positionAxis` presence, not by
  kind**: census with no spatial keys ≡ the old unary (whole-board; the
  evaluator delegates to `evaluateUnary`); census with `positionAxis` ≡ the
  old position (region-restricted).
- A cross-frame `entry.source` **is `plan.kind`** — so it's `'census'`,
  never `'unary'`.
## Goals

Generate a wide variety of legal chess positions + moves in which the condition(s) are satisfied. Variety means:

- Diversity of piece types involved
- Variety of whether the subject/target is the moving piece or a bystander
- Variety of whether kings are subject target or bystander
- Captures and non-captures both represented
- Check and non-check both represented
- Promotion (simple and capture, all four promoted species), castling, and en passant represented when feasibly satisfiable
- For value conditions: multiple value combinations that satisfy the condition (not just the minimum)
- For mobility conditions: different mobility values and the mechanisms that produce them (edge of board, blocking pieces, pins, check restricting moves, attacks on adjacent squares limiting king mobility)
- For relation conditions: both single-pair and multi-pair examples where the condition allows it
- For prior board state conditions: a variety of delta magnitudes (0→1, 1→2, 2→0 etc.)
- For position conditions: variety of what else is happening on the board (attacked, defended, pinned, etc.)

Rare-but-meaningful move types (castling, promotion, en passant) should be deliberately surfaced even though they are unlikely to appear by pure chance.

---

## Legality Rules

All generated boards must satisfy:

- No illegal moves (enforced by `Rules.getMoveObject` returning `illegal: false`)
- Opponent not in check at the start of the current player's turn (`legalPriorTurnState`)
- Pawns not on rank 1 or rank 8 (enforced at construction time via `legalPlacementForSpecies`)
- No more than 8 pawns per team (enforced at construction time via pawn count tracking)
- Exactly one king per team (enforced at construction time)
- No two pieces on the same square except via legal capture (`mergeRelationPieces` and move legality)
- No same team moving twice in a row (enforced by `allowedToMove` on the board and `legalPriorTurnState`)

Note: most of these are construction-time constraints, not verified by the evaluation chain. The verification chain covers illegal moves and opponent-in-check-before-move only.

## Team vocabulary

See `app/javascript/bot_execution/RULES.md` for the canonical definitions of `movingTeam`, `enemyTeam`, `subjectTeam`, `moved_piece`, `enemy_moved_piece`, `captured_piece`, `enemy_captured_piece`, and `prior_board_state` (PBS).

## Placement discipline

Placement discipline. Add a piece to a pieces Map<position, pieceCode> only through withPiece (shared/piece_placement.js) — it carries the placement rules (pawn rank, one king per team, pawn cap) and returns a new Map. Writing the Map directly to place a piece (.set, or any helper that does) bypasses thoserules and has crashed the verifier via invalid priorBoards.(.delete/copy are fine — only placement must go through withPiece.)

**In-progress transition:** `placeWithCaps` in `forward_proposition/respect_caps.js` is being introduced as the canonical wrapper for ctx-having callers — it does `respectsAllCaps` then `withPiece` in one call. Once all forward_proposition callsites use `placeWithCaps`, `withPiece`'s local guards will be stripped and legality enforcement will live entirely in `ctx.propositions` as structural caps (already seeded by `forward_proposition/structural_invariants.js`). Until the refactor lands, both layers run — `withPiece`'s guards remain authoritative for callers without ctx. New ctx-having callsites should prefer `placeWithCaps`; new ctx-less callsites should continue using `withPiece` directly.

## Singular constraint discipline

`ctx.singulars` is built up in three phases that may write unconditionally: **merge** (`scenarios/merge_ctx_delta.js`), **narrow** (`narrow_for_crossframe.js`, `narrow_moved_piece_for_region.js`), and **commit** (`commit_singulars_species.js`, `commit_singulars_position.js`, `commit_singulars_helpers.js`). Every other writer — early-placement strategies, mate / stalemate patterns, anything downstream of `commitSingulars*` — must go through `shared/singular_constraints.js` (`commitSingularRegion` / `commitSingular` / `commitMovedPiece`), which intersect with the existing value and return `false` on empty intersection. Scenario deltas establish constraints; downstream code may refuse an attempt but must never overwrite them. Slot reassignments (e.g. `ctx.singulars.captured_piece = enemyMoved`) must verify the incoming singular's committed species is in the existing slot's `species_set` before reassigning.

To read a singular's committed species, use `committedSpecies(singular)` from `shared/singular_constraints.js` — it throws on non-singleton sets. The bare `[...singular.species_set][0]` pattern silently returns iteration-order garbage when called pre-commit (e.g. `null` for actors whose initial set is `[null, …species]`).

## Diversity tuning knobs

Code-side constants that affect generation diversity live at their
point of use, not in a central config file. When investigating a
diversity regression, look here:

- `forward_proposition/pbs_relaxation.js` → `RELAX_PROBABILITY` —
chance of relaxing `count_range` on stability-style PBS relations.
Higher = more 0=0 vacuous-truth examples.
- `forward_proposition/mobility/edge_bias.js` → `EDGE_BIAS_PROBABILITY`,
`LOW_MOBILITY_THRESHOLD` — bias toward edge placement for
low-mobility scenarios.
- `shared/enrichment.js` → `MAX_ENRICHED_EXTRA_PIECES`,
`ENRICHMENT_END_POSITION_WEIGHT` — how many extra pieces enrichment
adds and how much it weights end-positions.
- `orchestrator.js` → `ENRICHMENT_PROBABILITY`,
`FORWARD_PROPOSITION_ATTEMPTS`, `MAX_SEEDS_PER_VARIANT` — attempt
budgets and enrichment frequency.

Semantic sets (`RELAXABLE_PBS_COMPARATORS`, etc.) and performance knobs
(plan-cache size, plan-count caps, timeouts) are intentionally not
listed — changing those is a behavior change, not a tuning operation.

## Cross-frame mechanism role detection

Mechanisms in `forward_proposition/cross_frame/mechanisms/` read
moved_piece's role from the chain-global binding via
`roleForPlan(ctx, entry.sourcePlan)` from `moved_binding`. The return is
`'subject'`, `'target'`, `'attacker'` (shield only), or `null` (moved_piece
is not bound to this plan — bystander).

`participates_*` mechanisms fire when role is non-null; `obstructs_*`
mechanisms fire when role is null.

## Forward-proposition diversity benchmark

  `npm run bench:forward-proposition -- 5000` runs each payload and
  prints VERIFIED (count) / RATE (percent) / BASELINE (percent) / Δ% /
  ms-per-attempt per payload. The `baseline:` fields in
  `forward_proposition_benchmark.js` are stored as verified-as-percent
  (e.g. `baseline: 41.98`), so the gate is N-independent. A leading `!`
  on Δ% marks payloads outside the ±20% gate enforced by
  `forward_proposition_baselines.test.js` (which runs at N=5000). Re-record
  the `baseline:` fields after intended mechanism or phase-ordering
  changes — the BASELINE column in the friendly output shows what to
  paste back in.

  `BENCH_JSON=1 npm run bench:forward-proposition -- 5000` switches the
  output to JSON; timings and counters group under each payload.

  To extend the bench with a new diagnostic: call
  `profileCollector.increment('forward_proposition.<area>.<event>')` at
  the site you care about. Any counter whose label starts with a
  `PROFILE_LABEL_PREFIXES` entry in `forward_proposition_benchmark.js`
  is picked up by `relevantCounters` and printed per payload. Use
  `profileCollector.measure(label, fn)` for timing instead. Both are
  no-ops unless `MATCH_PROFILE=1` (set automatically by the bench).