# OVH AI Endpoints Test Suite

## Running Tests

### Quick Smoke Test (30 seconds)
Tests basic connectivity for 3 key models:

```bash
npm run test:quick
```

### Full Test Suite (5-10 minutes)
Runs 10 comprehensive tests across all models:

```bash
npm test
```

## Test Coverage

| # | Test | Model | What It Validates |
|---|------|-------|-------------------|
| 1 | Basic connectivity | Mistral-7B | API responds |
| 2 | Long context | gpt-oss-120b | 5-paragraph generation |
| 3 | Step-by-step reasoning | gpt-oss-120b | Math/logic problems |
| 4 | JSON output | gpt-oss-20b | Structured responses |
| 5 | Code generation | gpt-oss-20b | Python with docstrings |
| 6 | Math calculation | gpt-oss-120b | Multi-step arithmetic |
| 7 | List generation | Mistral-7B | 50-item output |
| 8 | Creative writing | Mistral-Small | 200-word story |
| 9 | Summarization | Llama-3.3-70B | Text compression |
| 10 | Tool calling | gpt-oss-120b | Bash tool execution |

## Test Results

Results are saved to `test-results/`:
- `ovhai-test-{timestamp}.json` - Machine-readable data
- `ovhai-test-{timestamp}.md` - Human-readable report

## Interpreting Results

### Status Codes
- **PASS** ✅ - Model responded correctly
- **FAIL** ❌ - Error or unexpected output
- **TIMEOUT** ⏱️ - Request took too long

### Performance Benchmarks
Based on previous runs:

| Model | Avg Response Time | Best For |
|-------|-------------------|----------|
| Mistral-7B | 5-10s | Fast queries, lists |
| gpt-oss-20b | 10-20s | Code, JSON, quick tasks |
| gpt-oss-120b | 20-40s | Complex reasoning, long content |
| Llama-3.3-70B | 15-30s | General purpose |
| Qwen3-Coder | 30-60s+ | Code (when available) |

## Known Issues

- **Qwen3-Coder-30B** occasionally times out (API load)
- Context retention requires interactive mode (`--no-session` isolates calls)

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
