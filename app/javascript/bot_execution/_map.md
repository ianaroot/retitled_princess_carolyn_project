# bot_execution

Evaluates V2 condition nodes against a candidate chess move.

---

## Entry point

### `condition_evaluator_v2.js`
Routes a condition node by `kind` to `evaluateUnary`, `evaluateRelational`, or `evaluatePosition`. Also owns the guard logic that short-circuits before evaluation when a singular actor isn't present (e.g. no enemy move context). Constructs a `CandidateMoveAnalysisV2` on first use and memoizes it on the legacy analysis object.

---

## Analysis hub

### `candidate_move_analysis_v2.js` — `CandidateMoveAnalysisV2`
Central analysis object for one (board, move) pair. Everything else receives an instance of this class as `analysis`.

Responsibilities:
- **Board management**: lazily builds `afterBoard` (a light-cloned board with the move applied); `boardForScope` switches between prior and after.
- **Piece resolution**: `resolvedMovedPiece`, `resolvedCapturedPiece`, `resolvedEnemyMovedPiece`, `resolvedEnemyCapturedPiece` — translate move data and `recentMoveContext` into `{ species, position }` structs.
- **Filter matching**: `matchesFilter` / `matchesSpeciesFilter` / `singularActorMatchesFilter` — apply include/exclude species filters.
- **Mobility**: `positionMobility` (move-count for a square), `availableMovesFrom` (cached rule lookup).
- **Caching**: five `Map`/object caches (`_relationalResultCache`, `_relationalActorPositionsCache`, `_relatedTargetPositionsCache`, `_availableMovesCache`, `_boardQueryCache`) — all keyed by `boardScope:...` strings.
- **Delegates**: thin one-line methods (`unaryTotal`, `relationalResult`, `actorPositionsInRegion`, etc.) that forward to the analysis modules below. This keeps callers from importing those modules directly.

---

## Shared utility

### `actor_positions.js` — `actorPositions(analysis, { actor, filter, filterMode, boardScope })`
Resolves a set of board positions for a named actor (`"allied"`, `"enemy"`, `"moved_piece"`, `"enemy_moved_piece"`) with optional species filter. Returns an array of square indices.

Used by both `relational_analysis.js` and `position_analysis.js` to avoid duplicating the same four-branch switch.

---

## Condition-kind modules

### `unary_analysis.js`
Computes a scalar total for one actor under one operator (`count`, `value`, `mobility`). Handles all five actor types in separate private functions; singular actors (`moved_piece`, etc.) return 0 when absent rather than throwing.

Exports: `unaryTotal`, `priorComparisonSourceTotal`.

### `relational_analysis.js`
Finds (subject, target) pairs linked by a spatial operator (`attack`, `defend`, `adjacent`, `shield`, `cover`) and optionally compares aggregate metrics against a reference total.

Key exports:
- `relationalResult` — returns `{ pairs, subjectPositions, targetPositions }`, heavily cached.
- `relationalActorPositions` — thin cached wrapper around `actorPositions`.
- `metricForPositions` — `count` or `value` over a position list.
- `comparisonSourceTotal` — resolves the reference-side total for a relational comparison.
- `samePiece` — checks whether the enemy's last moved piece is the same piece that was captured.

### `position_analysis.js`
Filters actor positions by a board-axis predicate (`rank`, `file`, or `square`) and then measures the survivors (`count`, `value`, `mobility`).

Exports: `actorPositionsInRegion`, `positionMetricTotal`.

---

## Tests

### `__tests__/`
Jest test suite for the modules above.
