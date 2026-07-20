# Pi Package for OVH AI Endpoints

Pi provider for [OVHcloud AI Endpoints](https://www.ovhcloud.com/en/public-cloud/ai-endpoints/) chat models.

## Setup

```bash
export OVH_AI_TOKEN="your-token"
```

Get your token from [endpoints.ai.cloud.ovh.net](https://endpoints.ai.cloud.ovh.net/).

## Usage

```bash
# List models
pi -e . --list-models | grep ovhai

# Use a model
pi -e . --model ovhai/gpt-oss-120b
pi -e . --model ovhai/Mistral-7B-Instruct-v0.3
```

## Models

| Model | Context | Reasoning | Images |
|-------|---------|-----------|--------|
| gpt-oss-120b | 131K | Yes | No |
| gpt-oss-20b | 131K | Yes | No |
| Meta-Llama-3_3-70B-Instruct | 131K | No | No |
| Mistral-7B-Instruct-v0.3 | 65K | No | No |
| Mistral-Nemo-Instruct-2407 | 65K | No | No |
| Mistral-Small-3.2-24B-Instruct-2506 | 131K | No | Yes |
| Qwen3-32B | 32K | Yes | No |
| Qwen3.5-9B | 262K | Yes | Yes |
| Qwen3.5-397B-A17B | 262K | Yes | Yes |
| Qwen3.6-27B | 262K | Yes | Yes |
| Qwen3-Coder-30B-A3B-Instruct | 262K | Yes | No |
| Qwen2.5-VL-72B-Instruct | 32K | No | Yes |

## API

- **Base URL**: `https://oai.endpoints.kepler.ai.cloud.ovh.net/v1`
- **Auth**: Bearer token via `OVH_AI_TOKEN`
- **API type**: `openai-completions` (default) or `openai-responses` via `OVH_AI_API`

### Using the Responses API

OVH AI Endpoints also supports the OpenAI Responses API at `/v1/responses`:

```bash
export OVH_AI_API="openai-responses"
pi -e . --model ovhai/gpt-oss-120b
```

The extension normalizes pi's request payload for OVH's stricter `/v1/responses` backend:

- Forces `store: false` because OVH does not manage statefulness for `/v1/responses` (the OpenAI spec defaults to `store: true`)
- Adds `type: "message"` to plain input items
- Adds `status: "completed"` to `function_call_output` items (required by OVH, optional in OpenAI)
- Adds `annotations: []` to `output_text` parts of replayed assistant messages
- Converts remote image URLs and local file paths in `input_image` parts to base64 data URLs (ready for when OVH's Responses API accepts them)
- Removes unsupported top-level params (`include`, `prompt_cache_key`, `prompt_cache_retention`, `stream_options`, `user`, `service_tier`, `truncation`, `max_tool_calls`, `background`, `safety_identifier`, `verbosity`)
- Strips `reasoning.summary` because reasoning summaries are not supported

Basic text, streaming, reasoning, structured outputs, and tool calling all work with `gpt-oss-120b` and `Qwen3.6-27B`.

> **⚠️ Vision / image inputs limitation:** OVH's `/v1/responses` backend currently rejects `input_image` items with HTTP 422, even though the documentation includes a vision example. For vision tasks, use `OVH_AI_API=openai-completions` instead:
>
> ```bash
> export OVH_AI_API="openai-completions"
> pi -e . --model ovhai/Qwen3.5-9B
> ```

### References

- [OVH AI Endpoints - Responses API](https://docs.ovhcloud.com/en/guides/public-cloud/ai-machine-learning/ai-endpoints-responses-api)
- [OVH AI Endpoints - Capabilities and Limitations](https://docs.ovhcloud.com/en/guides/public-cloud/ai-machine-learning/ai-endpoints-capabilities)
- [OVH AI Endpoints - Function Calling](https://docs.ovhcloud.com/en/guides/public-cloud/ai-machine-learning/ai-endpoints-function-calling)
- [OVH AI Endpoints - Structured Outputs](https://docs.ovhcloud.com/en/guides/public-cloud/ai-machine-learning/ai-endpoints-structured-output)
- [OVH AI Endpoints - Batch Mode](https://docs.ovhcloud.com/en/guides/public-cloud/ai-machine-learning/ai-endpoints-batch-mode)

## Development

```bash
npm run typecheck    # TypeScript check
npm run lint         # Lint check
npm run lint:fix     # Auto-fix lint issues
npm run test:quick   # Quick smoke test (30s)
npm test             # Full test suite (5-10 min)
```

## License

MIT
