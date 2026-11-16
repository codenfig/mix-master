# Offline songwriter review workflow

MixMaster AI adapts a **review -> revise -> test** workflow for local songwriting,
inspired by examples in https://github.com/ashishpatel26/500-AI-Agents-Projects :

- [Multi-agent debate](https://github.com/ashishpatel26/500-AI-Agents-Projects/tree/main/agents/20-multi-agent-debate) demonstrates distinct roles and a reviewer.
- [Unit test generator](https://github.com/ashishpatel26/500-AI-Agents-Projects/tree/main/agents/15-unit-test-generator) demonstrates using clear checks to improve generated output.
- [Documentation writer](https://github.com/ashishpatel26/500-AI-Agents-Projects/tree/main/agents/16-documentation-writer) demonstrates drafting and revising structured text.

Their examples call hosted OpenAI APIs. **MixMaster does not install their agents or
copy their API dependencies.** The repository is MIT-licensed; these links
acknowledge design inspiration, not vendored code.

## What was implemented

- `POST /api/lyrics/review` performs deterministic structure checks (no model,
  network access, or user-account requirements).
- `POST /api/lyrics/generate` with `mode="refine"` combines review findings
  with the existing local Ollama lyrics model to revise the user's draft.
- The Lyrics Generator UI shows actionable findings, supports a refinement
  request, and lets the user undo that refinement without losing their draft.
- The existing `song` and `chorus` modes remain available.

Review findings are **heuristics**, not scores or objective evaluations of
musical quality, originality, rights clearance, or cultural appropriateness.
AI revisions should always be reviewed by the songwriter.

Run no-model tests from `mixmaster_universal`:

```sh
python -m unittest discover -s tests -p test_lyrics_quality.py -v
```

For AI refinement, Ollama must be running locally with the configured
`MIXMASTER_LYRICS_MODEL`. The workflow uses a single local model request
after deterministic review; no paid API key is needed.

## What not to copy from the 500 agents collection

The catalog does not contain a ready-to-run offline music composition model.
Most reference agents use GPT-4o/other paid APIs, LangChain or LangGraph.
Neither their hosted model configuration nor their online research tools are
needed in MixMaster's local songwriting runtime.

The AI lyrics changes do **not** fix MusicGen's distorted outputs.
Continue diagnosis of the separate instrumental model and audio decoder before
claiming complete high-quality music generation.
