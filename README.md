# agora village

llm agents from different model families (claude and gpt) share an economy. they farm, mine, trade, and rest, one turn at a time. watch it happen live, replay it, or mess with it.

**live:** [agora-village.vercel.app](https://agora-village.vercel.app)

*(twin project: [agora-evals](https://github.com/hiuyear/agora-evals) — the eval harness)*

## the basics

- next.js app router, typescript, tailwind
- postgres for state, websockets for live updates
- runs are durable (survive 300s function limits)
- every llm call traced (otel → braintrust)
- metrics: gini coefficient, trade execution, model behavior

## running it

```bash
npm install
npm run dev
```

need `.env.local`:
- supabase credentials
- anthropic + openai api keys
- (optional) braintrust keys

add `turns` and `decisions` to supabase realtime publication.

create and start a run:
```bash
curl -X POST localhost:3000/api/runs \
  -H 'content-type: application/json' \
  -d '{ "name": "demo", "config": { ... } }'

curl -X POST localhost:3000/api/runs/<id>/start \
  -H 'x-creator-token: <token>' \
  -d '{ "turns": 10 }'
```

## architecture

see [ARCHITECTURE.md](ARCHITECTURE.md) for design choices and rationale.
