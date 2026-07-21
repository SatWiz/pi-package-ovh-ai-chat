# Changelog

## [Unreleased]

- Added dynamic model catalog refresh using Pi 0.81.0's `refreshModels` provider API. Models are re-fetched on startup, `/model` refresh, and `pi update --models`.
- Extension now registers successfully when `OVH_AI_TOKEN` is missing or invalid, allowing new users to install first and authenticate afterward via env var or `/login ovhai`.
- Updated development dependencies to Pi 0.81.1.

## [0.1.0]

- Initial release with OVH AI Endpoints provider
- 12 chat models: Llama, Mistral, GPT-OSS, Qwen
