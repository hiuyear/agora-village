# Agora Village
### STILL IN ACTIVE DEVELOPMENT! see its twin sister "agora evals" [HERE](https://github.com/hiuyear/agora-evals.git)

LLM agents from different model families — Claude and GPT — share a small economy. They farm, mine, trade, and rest, one turn at a time, and a research layer watches what happens: where the wealth ends up, whether they cooperate, and how the two families make decisions differently.

**Live:** [agora-village.vercel.app](https://agora-village.vercel.app)

You can watch a run happen, replay it turn by turn afterward, or interrupt it. Inject a drought and see what the agents do about it.

## What's in it

Every turn, each agent gets the world state and returns a structured decision plus its reasoning. Anthropic and OpenAI models are called through their own SDKs rather than a proxy, so the two families stay distinguishable and can be compared.

Every turn is written to Postgres as it happens, so nothing is ephemeral: a run is a sequence of world snapshots, and each snapshot has the decisions that produced it. Turns are pushed to any open browser over WebSockets while the run is still going. Completed runs get a turn slider.

The person who created a run can inject shocks into it. Those get recorded as a causal event log, then applied by the next turn transition rather than by writing directly to the world.

Behavior gets measured on the way out: inequality (Gini over gold), how many proposed trades actually executed, and what each model family spent its turns doing.

## How it fits together

One Next.js app. App Router pages for the UI, route handlers for the API, Postgres for state, WebSockets for live updates.

```
POST /api/runs                  create a run from a config
POST /api/runs/[id]/start       hand off to a durable worker, return 202
     └── workflow: advance turn 1..N, write each to Postgres
                    └── Realtime pushes each turn to open browsers
POST /api/runs/[id]/intervene   record a shock (creator only)
GET  /api/runs/[id]/metrics     aggregate on read
```

A run can outlive the 300-second limit on a serverless function, so `/start` doesn't run it. It hands the run to a durable workflow and returns immediately. The workflow advances each turn as a persisted, individually retryable step, and writes the final status when it's done. Close the tab and the run keeps going.

The reasoning behind the choices here, including the ones I rejected, is in [ARCHITECTURE.md](ARCHITECTURE.md).

## Stack

Next.js (App Router), TypeScript, Tailwind. Supabase for Postgres and Realtime. Anthropic and OpenAI APIs. Zod for validating anything that crosses a runtime boundary. Vercel Workflow DevKit for durable execution. Deployed on Vercel.

## Running it

```bash
npm install
npm run dev
```

You'll need a `.env.local` with Supabase credentials (both the service-role and anon keys) and API keys for both LLM providers. For live updates to broadcast, `turns` and `decisions` have to be added to the `supabase_realtime` publication in the Supabase dashboard.

Create a run, then start it:

```bash
curl -X POST localhost:3000/api/runs \
  -H 'content-type: application/json' \
  -d '{ "name": "demo", "config": { ... } }'

curl -X POST localhost:3000/api/runs/<id>/start \
  -H 'x-creator-token: <token>' \
  -d '{ "turns": 10 }'
```

Five agents over thirty turns costs about $0.27 in API calls.

## Where it's at

The simulation engine, persistence, replay, metrics, and the live UI are built and deployed. I'm currently working on durable execution for long runs and a two-round trade negotiation protocol.

Next after that: symmetric agent starts, so that if an agent specializes it's because it chose to, not because I handed it a role. [Why that matters.](ARCHITECTURE.md#symmetric-starts)
