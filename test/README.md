# OVH AI Endpoints Test Suite

All tests spawn `pi` subprocesses against the live OVH API and require a valid `OVH_AI_TOKEN`.

## Running Tests

```bash
npm run test:quick      # Smoke test, 3 models (~30s)
npm test                # Full model suite, 10 tests (5-10 min)
npm run test:responses  # Responses API suite, 14 tests (5-10 min)
```

Tests use models that support the **OpenAI Responses API** (the provider default):
`gpt-oss-20b`, `gpt-oss-120b`, `Qwen3.6-27B`. OVH's Mistral models only serve
`/v1/chat/completions` (404 on `/v1/responses`) and are intentionally not used.

Tests whose target model is missing from the current OVH catalog are **skipped**,
not failed.

## Test Coverage

### Full model suite (`npm test`)

| # | Test | Model | What It Validates |
|---|------|-------|-------------------|
| 1 | Basic connectivity | gpt-oss-20b | API responds |
| 2 | Long context | gpt-oss-120b | 5-paragraph generation |
| 3 | Step-by-step reasoning | gpt-oss-120b | Math/logic problems |
| 4 | JSON output | gpt-oss-20b | Structured responses |
| 5 | Code generation | gpt-oss-20b | Python with docstrings |
| 6 | Math calculation | gpt-oss-120b | Multi-step arithmetic |
| 7 | List generation | gpt-oss-20b | 50-item output |
| 8 | Creative writing | Qwen3.6-27B | 200-word story |
| 9 | Summarization | Llama-3.3-70B | Text compression |
| 10 | Tool calling | gpt-oss-120b | Bash tool execution |

### Responses API suite (`npm run test:responses`)

Runs `basic`, `streaming`, `reasoning`, `tool_single`, `tool_parallel`,
`tool_sequential`, and `memory` scenarios against both `gpt-oss-120b` and
`Qwen3.6-27B` with `OVH_AI_API=openai-responses`.

## Test Results

Results are saved to `test-results/` (gitignored):

- `ovhai-test-{timestamp}.json` / `ovhai-responses-{timestamp}.json` — machine-readable data
- `ovhai-test-{timestamp}.md` / `ovhai-responses-{timestamp}.md` — human-readable report

### Status codes

- **PASS** ✅ — model responded correctly
- **FAIL** ❌ — error or unexpected output
- **TIMEOUT** ⏱️ — request took too long
- **SKIP** ⏭️ — model not in the current OVH catalog (does not fail the run)

## Adding New Tests

Edit `test/ovhai-models.test.ts` and add to the `TESTS` array:

```typescript
{
  name: "My new test",
  model: MODELS.reasoning,
  prompt: "Test prompt here",
  timeout: 60,
}
```

Pick models from the `MODELS` map — they are chosen to support the Responses
API. If you add a new model, verify it responds on `/v1/responses` first:

```bash
pi -ne -e . --no-session --model ovhai/<model-id> -p "Say OK"
```
