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
