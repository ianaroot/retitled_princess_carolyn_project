# stylesheets rules

## Runtime-assembled selectors — searching for the name finds nothing

These selectors' full names are assembled at runtime, so searching for the
literal name finds nothing even though they're in use. Treat a "no matches"
result as *check here*, not *dead*.

- `pill--{success,warning,danger,info,muted,violet}` — suffix from
  `ApplicationHelper#pill_tint` (`app/helpers/application_helper.rb`),
  interpolated as `pill--<%= pill_tint(...) %>` in
  `app/views/bots/index.html.erb` and `app/views/matches/index.html.erb`.
- `status-option--{success,warning,danger,info,muted,violet}` — same
  `pill_tint`, as `status-option--#{pill_tint(...)}` in
  `app/views/tournaments/index.html.erb` and `app/views/bots/index.html.erb`.
- `match-replay-trace-pill--{pass,fail,score,skip,type}` — built in `pill()`
  in `app/javascript/gameplay/replay_trace_view.js` as
  `` `match-replay-trace-pill--${type}` ``.
- `ce-badge--{eligible,ineligible}` — built in `renderRow()` in
  `app/javascript/controllers/constraints_eligibility_controller.js` as
  `` `ce-badge--${result.eligible ? 'eligible' : 'ineligible'}` ``.
- `pagy-*` (e.g. `pagy-gap`) — emitted by the Pagy gem's `pagy_nav` helper,
  not written in this codebase.

## Maintaining this list

Add an entry whenever you introduce a class or id whose full name never
appears as a literal — string-interpolated (`"foo--#{x}"`), assembled in JS,
or emitted by a gem. A selector applied with its full literal name
(`classList.add("flipped")`, or `"x #{'x--active' if …}"`) can be found by
searching and does **not** belong here.

## Browser-support floor: ~2017

The baseline is CSS custom properties (CSS variables): Edge 15 (April 2017) is
the laggard, IE is unsupported. Don't introduce a feature newer than that floor
without explicit sign-off — an unsupported rule is silently dropped on older
targets. Off-limits by default: `color-mix()` and relative color (2023),
`:where()`/`:is()` zero-specificity (2021), `@layer` (2022).

## Transparency uses channel tokens, not modern color functions

For a translucent variant of a token color, compose it from the matching
`--X-rgb` channel token: `rgba(var(--X-rgb), a)` (e.g.
`rgba(var(--error-rgb), 0.1)`). Don't reach for `color-mix()` or relative
color (`rgb(from …)`) — they are unsupported below the ~2017 floor (above),
where transparency must keep working.

## Finding dead compound/descendant rules

Grep catches dead top-level classes but can't judge dead compound or
descendant rules (`.a .b`, `.a:hover`) — where the parts exist but the
combination matches nothing. For those, run PurgeCSS as a one-off audit
(there is no CSS build step, so it is not pipeline-wired):

    npx --yes purgecss \
      --css app/assets/stylesheets/<sheet>.css \
      --content 'app/**/*.erb' 'app/**/*.js' 'app/**/*.rb' \
      --rejected

Its `rejected` list is candidates, not a delete list: it also rejects every
runtime-assembled selector above (PurgeCSS can't see those either) and
gem-emitted ones (`pagy-*`, `[aria-current]`). Cross-reference this file and
verify each candidate by hand — never apply PurgeCSS output directly.
