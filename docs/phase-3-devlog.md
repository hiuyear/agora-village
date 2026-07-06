# Phase 3 — Research Layer: Dev Log

Phase 3 turned the simulation from "it runs" into "it can be *measured*" — the half
that makes this a research instrument rather than a toy. This log walks each commit:
what it did, the architectural decision behind it (and the alternatives I rejected),
the bugs I hit, and the concept I took away.

> These are my working notes. Where I say "I decided X over Y," the point isn't that
> X is objectively right — it's that I can explain the tradeoff. That's the bar I'm
> holding myself to: be able to answer *"why X instead of Y"* for every choice here.

---

## `1beb746` — record per-decision outcomes (`resolveDecisions -> { next, outcomes }`)

**What:** Changed `resolveDecisions` to return `{ next, outcomes }` instead of just the
next state, and persisted a per-decision `outcome` string to the `decisions` table
(finally populating a column that had been `null` since Phase 1).

**Decision — measure *executed* trades, not attempted.** With the (weak) mirror-trade
resolution, "how many agents *tried* to trade" and "how many trades *happened*" are very
different numbers. I chose to record executed outcomes because once I build the planned
negotiation layer, *proposing* and *executing* a trade become distinct events. Execution
rate means the same thing before and after that upgrade; attempt rate silently changes
meaning. So I designed for the metric that survives the change.

**Decision — return a named object, not a tuple.** `{ next, outcomes }` over
`[next, outcomes]`: a tuple is positional, so adding a third return value later shifts
every caller silently. A named object is additive. (Same reason Supabase returns
`{ data, error }`.) Changing the return type also made TypeScript flag the one caller
that used the old shape — a free checklist.

**Gotcha — the coverage hole.** `FARM/MINE/REST` are handled in one loop; `TRADE` is
resolved in a *separate* loop. If I only wrote an outcome where a trade *succeeded*, an
agent who *tried* to trade but found no partner would have no outcome at all.

**Concept — default-then-upgrade.** Fix: seed *every* agent to `"no_trade"` in one
unconditional statement up front, then let success paths overwrite (`"ok"`, `"traded"`).
Coverage is guaranteed because the default is unconditional; every early-`continue` in the
trade loop safely leaves the default in place. Same instinct as `let winner = null` before
a search loop.

---

## `e5adf07` — add `computeMetrics` (gini / tradeRate / actionDist)

**What:** A pure function computing three per-turn metrics.

**Decision — wealth = gold only.** Gini needs one number per agent, but agents hold three
resources. Options: sum all three (meaningless — treats 1 food = 1 gold), price-weighted
(the "correct" answer, but there's no market in state — scope creep), or gold only. Gold is
the trade medium and it's one-sentence defensible, so: gold. The `computeMetrics` signature
doesn't change if I upgrade the wealth definition later — only the extractor inside does.

**Concept — the Gini coefficient.** Inequality in `[0,1]`: 0 = everyone equal, 1 = one
holder has everything. Closed form over ascending-sorted values, 1-based rank `i`:
`G = 2·Σ(i·xᵢ)/(n·Σxᵢ) − (n+1)/n`. Two edge cases that would `NaN`: everyone at 0 (`Σx=0`)
and `n=0` — both guarded to return 0. The tell that the formula's right: max inequality for
`n` agents is `(n−1)/n`, not 1, so Gini only *approaches* 1 with a finite population. My test
of `[0,0,0,20]` returned exactly `0.75` = `3/4`.

**Gotcha — the double-count trap in trade rate.** A mirror trade marks *two* agents
`"traded"`, so `count("traded")` counts participants, not trades. I defined trade rate as
**participation** (`traded / nAgents`) — which needs no `/2` because counting participants
is exactly the intent. Choosing this deliberately avoided an off-by-two bug.

**Verification:** unit-tested against known values (perfect equality → 0, one-has-all →
`(n-1)/n`, all-zero → 0 not NaN) before wiring it in.

---

## `1e86251` — persist per-turn metrics to `turns.metrics` in `advanceTurn`

**What:** Call `computeMetrics` after resolution each turn and store the result on the
turn row.

**Decision — metrics describe the *resulting* turn.** Gini is computed over the
post-resolution gold distribution; action/trade stats over that turn's decisions. So the
snapshot and its metrics always agree.

**Note — schema lives only in Supabase.** `turns.metrics` (a `jsonb` column) has no
migration file in the repo — a real gap I'm aware of. It bit me as a "will this write even
land?" question, which is exactly why I later proved the whole pipeline against the live DB
rather than trusting that it typechecks.

---

## `dc2b4e3` / `a657633` — `GET /api/runs/[id]/metrics` (+ annotate response shape)

**What:** One endpoint feeding the whole dashboard: a per-turn `timeline` (read from
`turns.metrics`) and a `byModel` action breakdown (aggregated from `decisions`).

**Decision — aggregate on read, no `run_metrics` table.** The original plan had a
precomputed summary row. I skipped it: at this scale (dozens of turns) recomputing on read
costs nothing, and a denormalized summary table is premature optimization — the exact thing
a senior reviewer pushes back on ("why cache what you can compute in 2ms?"). On-read is
always fresh and single-source-of-truth. I can add the table later as a documented
optimization if a run ever gets slow. Knowing *why not* to build it is the stronger answer.

**Concept — group-by in JS vs SQL.** The Supabase client has no `GROUP BY`, so I pulled the
decision rows and tallied them in a nested accumulator (`byModel[m] ??= {}; byModel[m][a] =
(…??0)+1`). The tradeoff: this ships every row over the wire and aggregates app-side — fine
for a tiny dataset, wrong for millions (there you'd push the group-by into a Postgres
view/RPC). A deliberate choice by data size, same reasoning as skipping `run_metrics`.

**Decisions — empty run returns `{ timeline: [], byModel: {} }` with 200** (an empty result
is a success, not a 404), and **no auth** (reads are public; only mutating routes get the
creator-token check).

**Git note (`a657633`):** I annotated the route with response-shape examples and folded
them into the route's commit with `git commit --amend --no-edit` (safe only because it was
unpushed — amending shared history rewrites what others pulled). Also learned the hard way
that in interactive zsh a trailing `# comment` is passed as *arguments*, not stripped — a
pasted `git reset  # ...` silently failed and swept three files into one commit, which I
undid with `git reset --soft`.

---

## `45936c9` — add `applyIntervention` + schema; apply scheduled shocks in `advanceTurn`

**What:** The intervention *mechanic* — a Zod schema (the contract), a pure
`applyIntervention(state, event)`, and wiring in `advanceTurn` that applies scheduled shocks
before agents decide. **I wrote `applyIntervention` myself.**

**Decision — deferred effect, not in-place mutation.** `/intervene` only *records* a shock;
`advanceTurn` applies it. This keeps `advanceTurn` the single place the world ever mutates
(a clean invariant), turns the `interventions` table into a real causal audit trail
("drought at turn 7", queryable and replayable), and makes the effect a pure, testable
function. Cost: ~10 lines of wiring. Worth it for a tool whose whole framing is *causal
observation*. Shocks apply *before* agents decide, so they actually experience the drought
that turn.

**Concept + the bug I'm proudest of catching — purity via deep-enough copy.** A pure
function must not mutate its input. The trap: `{ ...state.agents }` copies the outer map but
the inner inventory objects are still shared references (a *shallow* copy) — mutating
`next.agents[x].food` would reach back into the original. The fix is to copy each inventory
too (`{ ...inv }` per agent). My test asserts the input state is byte-for-byte unchanged
after the call; that assertion only passes because the copy goes deep enough. (Python
analogue: `copy.copy` vs `copy.deepcopy` on a dict of dicts.)

**Concept — this is a fold.** Multiple shocks can hit one turn; `advanceTurn` threads them
`workingState = applyIntervention(workingState, ev)` per row — a left-reduce. Purity is
exactly what makes folding immutable values safe.

**Bugs I hit writing the function** (all fixed): looping `for (const ev of event)` when
`event` is a *single* object (I'd crossed the two levels — the loop-over-many lives in
`advanceTurn`, not here); `for...of` over `next.agents` which is a `Record`, not iterable
(same trap as the outcomes seeding — use `Object.keys`); and a placeholder `x` that isn't a
real variable.

**Known gap (TODO in code):** shocks apply in Supabase's arbitrary return order, and
`Math.floor` makes stacked shocks non-commutative — so for reproducible replay I should
`.order('created_at')`. Noted, not yet fixed.

---

## `21a737f` — `POST /api/runs/[id]/intervene` (auth + Zod `safeParse`, records shock)

**What:** The HTTP surface that records an intervention. **I wrote this one myself too, and
debugged seven bugs doing it.**

**Concept — an API handler is a funnel of guards.** An untrusted, mutating request passes
through narrowing gates, each returning early: **auth → parse → validate → write → respond**.
By the DB write, every assumption is checked. The *order* is the lesson — auth first (never
do work for someone you'll reject), parse before validate, validate before you touch the DB.

**The two new gates vs my earlier routes:**
- `request.json()` **throws** on a malformed body → wrap it in `try/catch` → `400`. (This is
  the returned-vs-thrown error split: you can't `if`-check a thrown error.)
- Zod `.safeParse()` (**returns** `{ success, data|error }`) instead of `.parse()` (throws).
  At a boundary a bad body is an *expected* outcome I want to turn into a clean `400`, not an
  uncaught `500`. Rule: `parse` when failure is a bug to blow up; `safeParse` when it's an
  outcome to handle.

**The turn handshake:** the shock is scheduled for `(latest stored turn) + 1`, which is
exactly the turn `advanceTurn` produces next — so it lands on one tick and never
double-applies.

**Bugs I hit (four were my own previously-logged traps):**
1. `const body` *inside* the `try` block — block-scoped, gone by the next line (declare `let
   body` outside).
2. `.eq('id', id)` on `turns` — should be the foreign key `.eq('run_id', id)`.
3. `lastTurn` used directly — it's the `{ data, error }` wrapper; destructure `{ data:
   lastTurn }`.
4. `status: 400` placed *inside* the JSON body instead of the second argument.
5. `.order(ascending: false)` — invalid; it's `.order('turn_number', { ascending: false })`.
6. A stray `)` and a malformed return object.
7. An unnecessary `.select()` on the insert to read back values I already had.

**Semantic nuance:** a nonexistent run id doesn't return a clean `404` here — `requireCreator`
runs first, can't match a token, and rejects with `401/403`. That's arguably better (doesn't
leak whether a run exists), but it's the honest answer to "what happens on a bad id?"

---

## Proving it live

Typechecking isn't proof. I ran the whole pipeline once against the real database: created a
2-agent / 2-turn run (one Claude agent, one GPT agent), scheduled a drought, started the run,
and read `/metrics`.

- Metrics persisted and read back correctly (proving the `turns.metrics` column exists and
  Stages 3–4 work end-to-end).
- `byModel` showed each agent playing its specialty (Claude farmer → FARM, GPT miner → MINE).
- The drought landed on **turn 1 only**: starting food 10 → halved to 5 → the turn-1 snapshot
  matched the mechanics to the unit, and turn 2 showed the shock did **not** re-apply (proving
  the deferred, single-turn effect).

Every number the DB returned was exactly what the mechanics predicted. That's the difference
between "it compiles" and "it works."
