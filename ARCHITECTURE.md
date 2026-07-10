# Architecture decisions

Why this project is built the way it is. I started keeping these so I'd stop re-arguing the same choices with myself, and because "why did you use X" is easier to answer if you wrote it down at the time.

Each entry says what I picked, what I turned down, and why. Status is one of **done**, **in progress**, **planned**, or **on hold**.

---

## Next.js, one app instead of two

**done**

Single Next.js app serving both the UI and the API, rather than a React frontend talking to a separate backend.

I looked at React + Express and React + Django. Both mean two repos, two deploys, and CORS config. That split earns its keep when different people own the frontend and the backend. I'm one person. Remix does roughly what Next does with a smaller ecosystem.

So: one repo, TypeScript on both sides, and the App Router turns the folder tree into the URL structure, which means you can read the API surface off `src/app/api`.

---

## Supabase for Postgres

**done**

The research queries are relational. "Group every decision by model across every run" is a `GROUP BY`, and it's painful in a document store, which ruled out Firestore and Mongo early.

Self-hosted Postgres would work but I'd be running a server and building a WebSocket layer for no benefit. PlanetScale is fine, but Postgres is the better default for the analytical side.

Supabase gives me real Postgres, Realtime over WebSockets without writing socket code, and a free tier that covers this.

---

## Two LLM providers, called directly

**done**

Claude agents go through `@anthropic-ai/sdk`, GPT agents through `openai`. One `callAgent(model, prompt)` branches on the model prefix and throws on anything it doesn't recognize.

OpenRouter was tempting: one key, one schema, less integration code. But it collapses both providers into one interface, and comparing the two families *is* the project. Using a single provider would be simpler and would turn this from a comparison into just a simulation.

The cost of doing it directly is two response shapes. Anthropic takes `system` as a top-level param and puts text at `content[0].text`. OpenAI takes system as the first message and puts text at `choices[0].message.content`, which can be null. Both of them ignore "return raw JSON" often enough that I strip Markdown fences before parsing, then validate with Zod.

About $0.27 per run (5 agents, 30 turns) at Haiku 4.5 and GPT-4o-mini prices, so iterating on experiments is basically free.

---

## The server drives the turn loop

**done**

`POST /api/runs/[id]/start` advances the simulation server-side. There's a single-step `/advance` endpoint too, but only for debugging.

The alternative was letting the browser request one turn at a time in a loop, which means the run dies when you close the tab. An external scheduler would be more infrastructure for nothing.

One thing that took me a moment: agents *inside* a turn are independent, so they resolve under `Promise.all`. Turns are not, because turn N reads what turn N−1 wrote. Running those in parallel wouldn't be faster, it'd be a race condition.

---

## Long runs go in a durable workflow

**in progress**

Vercel compiles each route into a serverless function with a 300-second ceiling. A turn makes several LLM calls, so a long run blows through that. The general version of the problem is that long work doesn't belong inside one HTTP request.

Three ways out:

| | how | tradeoff |
|---|---|---|
| Batch it | `/start` runs 5 turns, returns, browser calls again | smallest change, resumable, but something has to keep calling — the run is tied to an open tab |
| **Durable worker** | `/start` hands off, returns `202`; worker advances turns; Realtime pushes to viewers | survives a closed tab, but more machinery and a newer toolchain |
| Replay only | generate runs locally, deploy only the viewer | no timeout risk, but nobody can start a run from the site |

I went with the durable worker, using Vercel's Workflow DevKit rather than a raw queue. The problem is literally "do turn 1, then 2, then 3, and don't lose progress." WDK's `"use step"` boundary persists each step's result and replays on resume, so a turn that already finished never runs twice. With a raw queue I'd be hand-rolling that idempotency myself, and at-least-once delivery is the part that's easy to get wrong.

Fallout from this:

- `advanceTurn` stays workflow-agnostic in `lib/`. `advanceTurnStep` is a thin durable wrapper around it, so `/advance` and unit tests still call the plain function.
- `/start` now returns before the run finishes, so writing `completed` / `error` moved out of the route and into the workflow. Whoever finishes the work writes the status.
- The workflow sandbox can't reach Supabase, so even the status write has to be its own step.

Current state: `next build` fails locally while collecting page data for a route WDK injects. Our workflow itself compiles (5 steps, 1 workflow). The evidence points at a build-environment dependency rather than a bug in the workflow, so I'm testing it on a preview deploy before falling back to batching.

While debugging this I anchored on a warning instead of the actual error, decided it was a Next version mismatch, and did a whole 14→16 upgrade that wasn't the fix. The same fatal error had been there on 14 the entire time. The upgrade was worth keeping on its own merits, but that's not why I did it.

---

## Trades are a two-round negotiation

**planned**

The original rule needed two agents to independently propose exactly mirrored trades — same partner, same resource pair, same amounts — in the same blind parallel round. The odds of that are terrible, so trades would basically never fire and the whole trade path would be dead code I couldn't test.

The mistake is conceptual. Real trading is asynchronous: you propose, then someone responds. The original design forced it to be simultaneous.

So a turn now resolves in two rounds. Everyone decides blind in round one. In round two, any agent that got a trade offer gets a second LLM call showing all offers aimed at it, and either accepts one or keeps its original plan.

I considered a standing offer book across turns, which is closer to how markets actually work, but the proposer wastes its turn waiting and I'd have to persist offer state. I also considered letting both agents just name each other with the proposer's terms winning, but then the receiving agent has no say in terms it's bound by.

Rules that fell out of it:

- All offers to one agent go in a single round-two prompt, so cost scales with the number of *targets*, not offers.
- Accepting replaces your round-one action.
- If nobody accepts your offer, you rest that turn. Proposing costs something.
- One trade per agent per turn, resolved in a fixed order so tests are deterministic.

The nice side effect is that `resolveDecisions` gets *simpler*. Consent now comes from the acceptance round, so it no longer has to hunt for a matching counter-offer. It just checks affordability and swaps.

---

## Auth is a function, not middleware

**done**

`requireCreator(request, runId)` reads an `x-creator-token` header, bcrypt-compares it against the run's stored hash, and returns either a rejection response or `null`. Protected handlers call it on line one.

Inlining the check in each handler would put the policy in three places, and eventually one of them drifts. `middleware.ts` is the idiomatic spot for blanket auth, but this check needs a per-run database read, which is heavier than middleware should be, and it hides the guard from the handler it's guarding.

Missing token is a **401**, wrong token is a **403**. Tokens are stored as bcrypt hashes and never sent back to a client.

Watch out: the success case has to `return null`, not `NextResponse.json(null)`. The latter is truthy and would reject every valid request.

---

## Auth before delete

**done**

I built the auth helper before the `DELETE` endpoint, swapping the order I'd originally planned.

Shipping deletion before authentication exists, even for an afternoon, even locally, means there's a window where anyone can wipe any run. Build the lock before you hang the door. Same rule applied later to `/intervene`.

---

## Pagination: clamped offset and limit

**done**

`GET /api/runs?limit=&offset=`, sanitized server-side, limit defaulting to 10 and capped at 50.

Cursor pagination is faster at depth and doesn't drift when rows are inserted mid-scroll, but you can't jump to page N, and at a few dozen runs its advantages are theoretical. Page-based params (`?page=&pageSize=`) are convenient but bake a page size into the API. Offset/limit is the lower primitive; a paged UI can be built on top of it, and the frontend can do the page → offset math.

The part that actually matters: query params come from the client, so they get clamped on the server. `?limit=100000` would force a huge read. `?limit=abc` reaches `.range()` as `NaN`. Both have to land somewhere sane.

---

## `DELETE` returns 200 with a body

**done**

Not `204 No Content`. The only client for these routes is this project's own frontend, and it always parses a JSON body, so a bodyless response is a trap. Strict REST semantics are worth it for a public API. This isn't one.

The cascade to turns and decisions is enforced by `ON DELETE CASCADE` in Postgres, not by application code. I confirmed that by deleting a run with 2 turns and checking they were gone, rather than assuming.

---

## `maybeSingle()`, not `single()`

**done**

`single()` treats zero rows as an error (`PGRST116`). So a request for a run that doesn't exist fell into the 500 branch, and the `if (!data) return 404` I'd written underneath was unreachable. Which is backwards: 500 means I broke something, but a missing row is a perfectly ordinary outcome.

Rule I use now: `single()` only when the row must exist by construction, like right after an insert. `maybeSingle()` for anything that might legitimately miss.

A test of the delete endpoint surfaced this, not reading the code. It came back later in a different handler, where a `if (error || !run)` guard called `error.message` on a null error.

---

## Server components fetch, client components hold state

**done**

Pages stay server components and do all the Supabase reads. The interactive parts — the replay slider, the live village — are `'use client'` and get data as props.

A slider has to remember which turn it's on, and that's React state, which only exists on the client. But making the whole page a client component would ship query logic to the browser and give up server rendering.

Two constraints this forces:

Props have to survive serialization across the boundary, so a `Map` I was using for decision grouping had to become a plain object. Types are fine to import from a client file into a server file, since they're erased before runtime and pull no client code along with them.

---

## Two Supabase clients

**done**

A service-role client that only ever runs on the server, and a separate anon-key client that only client components import.

The service key bypasses row-level security completely. That's fine in server-only code. But Realtime runs in the browser, and importing the service client into a `'use client'` file would inline that key into the JavaScript bundle and hand every visitor full database access. The anon key is public on purpose and RLS is what guards what's behind it. Next's `NEXT_PUBLIC_` prefix is the opt-in for browser exposure; without it a variable never reaches the bundle at all.

The rule is that the service client never crosses the server/client boundary. That also decides where shared types live: `LiveVillage` imports its `SimState` type from another client module rather than from `simulation.ts`, because `simulation.ts` imports the service client at runtime.

On Realtime itself: Postgres logical replication forwards row changes over a WebSocket, and the browser subscribes to inserts filtered to one `run_id`. The filter runs server-side, so a client only wakes for rows it cares about. Channels get torn down on unmount or the listener leaks. The tables have to be in the `supabase_realtime` publication or nothing broadcasts, which is dashboard config, not code.

Delivery isn't ordered, so a live update only moves state forward: ignore an arriving turn if it's older than the one on screen.

---

## Creator token in localStorage, never the URL

**done**

The intervention buttons send the token in a header, read from `localStorage`. Someone opening the shared link has no token and gets a read-only view.

Putting it in a query param would have been the easy version, and it leaks the secret into browser history, `Referer` headers, and every link anyone pastes anywhere. The whole point is a URL you can share with strangers.

`localStorage` doesn't exist during SSR, so it's read in a mount effect and the component renders nothing until mounted. Reading it during render gives you a hydration mismatch, and it'd flash "view only" at the actual creator for a frame.

---

## Gini over gold only

**done**

Not total resources. Adding food + ore + gold quietly claims one food is worth one gold, and nothing in the simulation says that.

The economically correct answer is a price-weighted basket, but there are no market prices in the world state, and inventing a price system to compute one metric is scope creep into code that doesn't exist yet. Gold is the designated medium of exchange, so it's the one wealth number the economy actually tracks.

If a market ever gets built, the function signature doesn't change. Only the wealth extractor inside it does.

Both degenerate cases (no agents, no wealth) return 0, not `NaN`.

---

## Trade rate counts executed trades, not attempted ones

**done**

Measured from a per-decision `outcome`, not from "how many decisions had action = TRADE".

Once the two-round negotiation lands, proposing and executing stop being the same event, because you can propose and get declined. Execution rate means the same thing before and after that change. Attempt rate silently stops meaning anything happened. I'd rather define the metric that survives.

This meant finally populating a `decisions.outcome` column that had been null since Phase 1, and changing `resolveDecisions` to return `{ next, outcomes }` instead of a bare state. I made that a named object rather than a tuple on purpose: adding a third field later would shift positional meaning, and this way TypeScript hands me a list of every caller I need to fix.

---

## Interventions are recorded, then applied

**done**

`POST /intervene` writes a row to `interventions`. It doesn't touch world state. The next turn transition picks it up and applies it through a pure `applyIntervention(state, event)`.

The obvious alternative is having the endpoint edit the latest stored state directly. It's simpler, and it means two different code paths can change the world, and there's no record afterward that anything happened.

Doing it this way buys three things. Only `advanceTurn` ever mutates state, which is an invariant I can state in one sentence and rely on. The `interventions` table becomes a causal event log I can query and replay ("drought at turn 7"), which is the entire point of framing this as a research instrument. And `applyIntervention` is pure, so I can test it without a database.

Cost is about ten lines in `advanceTurn` to check for pending interventions.

---

## Metrics computed on read

**done**

Per-turn metrics get written as each turn is written. Everything run-level — the Gini timeline, average trade rate, per-model action breakdown — is aggregated on demand inside `GET /api/runs/[id]/metrics` from rows that already exist. There's no `run_metrics` summary table, even though my original plan had one.

A materialized summary gives you an O(1) dashboard read. It's also only correct at the instant a run finishes, goes stale the moment someone intervenes or a run is interrupted, duplicates data that's already sitting in `turns` and `decisions`, and introduces the possibility of two tables disagreeing about the same run.

At tens of turns and a handful of agents, recomputing costs nothing. Building the summary table would be optimizing something that isn't slow. If a real run ever gets slow I'll add it back and write down why.

Related: the Supabase client has no `GROUP BY`, so the aggregation is a tally in JS. That's fine at this size. If the dataset grew I'd push the grouping into a Postgres view or RPC so only the aggregate crosses the wire.

---

## Symmetric starts

**planned**

Right now each agent is seeded with a different specialty. That's a confound. If the Claude agent is handed the farmer role and finishes richest, I can't tell whether that's the model or the role. The comparison the project exists to make doesn't survive it.

So: a mode where every agent starts identical. Same inventory, same actions, no assigned specialty. Then if an agent specializes, it's because it chose to, and the choice is itself a measurement. That's a more interesting result than "the model I gave the good job to did well."

Both modes run the same engine and the same action set. What changes is which knobs the setup form exposes.

This needs an explicit objective function first — what "doing well" even means, whether that's gold, survival, or total group welfare — because that's what any behavioral scoring gets measured against.

---

## Two-phase turns: talk, then act

**on hold**

Each turn would run a communication phase before the action phase. Agents can broadcast, DM one agent, or say nothing, and the messages get injected into the action prompts.

Making messaging an *action* doesn't work, because an agent needs to talk and act in the same turn. Making messages visible only on the following turn is easier to build, but then nobody can answer a question in the turn it was asked, which suppresses the exact behavior worth watching.

Two phases means an agent can propose a trade in chat and another can accept it with a `TRADE` action, inside one turn. It roughly doubles LLM calls per turn.

On hold until the core sim and the negotiation protocol settle. The two-round trade design is a narrow early version of the same idea.

---

## Things I'd fix

Known, not overlooked.

- **The schema isn't in this repo.** It lives in the hosted Supabase project. There are no migration files, so you can't rebuild the database from a clone. This is the one that bothers me most.
- **Run config isn't validated.** It's read back as `run.config as RunConfig`, which is a compile-time assertion about runtime data. Zod is already in the project for LLM output; it belongs at this boundary too.
- **Metrics aggregate in JS, not Postgres.** Correct for the current data volume, wrong if it grows.
- **Realtime is enabled by clicking around a dashboard**, not declared in code, so it doesn't travel with the repo.

---

## Data model

Three levels, linked by foreign keys.

```
runs          one row per experiment    (name, config, status, creator token)
  turns       many per run              (world state at turn N)
    decisions many per turn             (one agent's action, reasoning, outcome)
```

A run is a chess game, a turn is the board after a move, a decision is a move. Deleting a run cascades to both.

Config is JSONB on `runs`:

```
RunConfig
├── agents[]            { name, model, personality, specialty }
├── startingInventory   { food, ore, gold }
└── turns
```

---

## Stack

Next.js (App Router) and TypeScript, Tailwind, Supabase for Postgres and Realtime, Anthropic and OpenAI APIs called directly, Zod for runtime validation, Vercel Workflow DevKit for durable execution, deployed on Vercel.
