# OVH AI Endpoints Pi Package — Agent Context

## Project Overview

This is a **pi package** that registers an `ovhai` provider for [OVHcloud AI Endpoints](https://www.ovhcloud.com/en/public-cloud/ai-endpoints/) chat models. The model catalog is fetched dynamically from the OVH API.

**Tech Stack:** TypeScript (no build step — pi loads `.ts` directly via jiti), biome for lint/format.

### Structure

```
extensions/index.ts        # Provider registration (single file, the whole extension)
test/ovhai-models.test.ts  # Model test suite (npm test)
test/ovhai-responses.test.ts # Responses API test suite (npm run test:responses)
test/quick-test.sh         # Smoke test (npm run test:quick)
package.json               # Pi manifest + npm publish config
biome.json                 # Linter/formatter config
tsconfig.json              # Type checking only (noEmit)
```

There are no skills, prompt templates, or themes in this package — the `files` array in `package.json` lists them only because the template did; they are absent from the tarball.

### Key Constraints

- **No build step** — pi loads `.ts` via jiti. Never add a build/compile step.
- **Peer dependencies** — `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `@earendil-works/pi-agent-core`, `typebox` are provided by pi at runtime. Keep them as `peerDependencies` with `"*"` range. Do not bundle them.
- **Requires pi ≥ 0.81.0** — uses the `refreshModels` provider API.
- **2-space indentation** — enforced by biome.

### Provider behavior (important before editing `extensions/index.ts`)

- **Default API type is `openai-responses`** (`DEFAULT_API_TYPE`); override via `OVH_AI_API`.
- The `before_provider_request` hook normalizes payloads for OVH's stricter `/v1/responses` backend (forced `store: false`, explicit `type: "message"`, `status` on `function_call_output`, `annotations` on `output_text`, image URLs → base64 data URLs, removal of unsupported params). Preserve this normalization when changing the hook.
- Model capabilities (reasoning, vision, no-reasoning-effort) come from hard-coded sets (`REASONING_MODELS`, `VISION_MODELS`, `NO_REASONING_EFFORT_MODELS`) — OVH's API does not expose them. Update these sets when OVH adds/changes models.
- The extension must register successfully even without `OVH_AI_TOKEN` (warn, don't throw) so users can install first and authenticate later.

---

## Development Commands

```bash
npm run typecheck      # TypeScript type checking (tsc --noEmit)
npm run lint           # Check lint + formatting (biome check)
npm run lint:fix       # Auto-fix lint + formatting issues
npm test               # Full model test suite (needs OVH_AI_TOKEN; skips unavailable models)
npm run test:responses # Responses API test suite
npm run test:quick     # Quick smoke test (~30s)
```

The model tests spawn `pi` subprocesses and require a valid `OVH_AI_TOKEN`. Tests whose target model is not in the current OVH catalog are skipped, not failed.

### Testing the extension with pi

```bash
# Quick provider check (use -ne to skip globally installed extensions)
pi -ne -e . --no-session -p "List the tools you have available."

# Chat with a model
pi -ne -e . --no-session --model ovhai/gpt-oss-120b -p "Say hello"

# Verify npm tarball contents
npm pack --dry-run
```

---

## Git and Release Conventions

- **Conventional commits** — `feat:`, `fix:`, `docs:`, `chore:`, `ci:`, `refactor:` prefixes.
- Releases are automated via release-please (`.github/workflows/release.yml`): conventional commits on `main` open a Release PR; merging it (rebase only) triggers the GitHub Release and `npm publish`.

---

## Common Pitfalls

- **Importing from wrong package** — Use `import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"` (type import).
- **Pinning peer deps** — Peer dependencies must use `"*"` range.
- **Breaking the no-token path** — `validateConfig()` must warn and return `false`, never throw; registration must continue with an empty catalog.
- **Vision via Responses API** — OVH's `/v1/responses` rejects `input_image` (HTTP 422). Vision tasks require `OVH_AI_API=openai-completions`.
