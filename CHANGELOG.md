# Changelog

## [1.0.0]

- Default API type changed to `openai-responses` (override with `OVH_AI_API=openai-completions`).
- Dynamic model catalog refresh using Pi 0.81.0's `refreshModels` provider API. Models are re-fetched on startup, `/model` refresh, and `pi update --models`.
- Extension registers successfully when `OVH_AI_TOKEN` is missing or invalid, allowing install first and authentication afterward via env var or `/login ovhai`.
- Test suite skips tests for models not present in the current OVH catalog.
- Requires Pi 0.81.0 or newer.
