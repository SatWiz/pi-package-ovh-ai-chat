# Pi Package for OVH AI Endpoints

Pi provider for [OVHcloud AI Endpoints](https://www.ovhcloud.com/en/public-cloud/ai-endpoints/) chat models.

**Requires:** Pi coding agent **0.81.0 or newer**.

## Installation

```bash
pi install pi-package-ovh-ai-chat
```

## Setup

Get a token from [endpoints.ai.cloud.ovh.net](https://endpoints.ai.cloud.ovh.net/), then either:

```bash
# Option 1: environment variable
export OVH_AI_TOKEN="your-token"

# Option 2: stored credential (run inside pi)
/login ovhai
```

The extension registers even without a token, so you can install first and authenticate afterward.

## Usage

```bash
# List available models (fetched dynamically from OVH)
pi --list-models | grep ovhai

# Chat with a model
pi --model ovhai/gpt-oss-120b
```

The model catalog is fetched from OVH on startup, on `/model` refresh, and on `pi update --models`. If the fetch fails (missing/expired token, OVH unreachable), the provider registers with an empty catalog and a warning; the next successful refresh populates it automatically.

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OVH_AI_TOKEN` | Yes | — | OVH AI Endpoints API token |
| `OVH_AI_API` | No | `openai-responses` | API type: `openai-responses` or `openai-completions` |
| `OVH_AI_BASE_URL` | No | `https://oai.endpoints.kepler.ai.cloud.ovh.net/v1` | Base URL override |

> **Vision limitation:** OVH's `/v1/responses` backend currently rejects image inputs (HTTP 422). For vision tasks, use a vision-capable model with `OVH_AI_API=openai-completions`:
>
> ```bash
> export OVH_AI_API="openai-completions"
> pi --model ovhai/Qwen3.5-9B
> ```

## License

MIT
