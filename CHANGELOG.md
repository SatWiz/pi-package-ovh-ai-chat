# Changelog

## 1.0.0 (2026-08-02)


### ⚠ BREAKING CHANGES

* default API type is now openai-responses

### Features

* add dynamic model catalog refresh and graceful token handling ([90483d0](https://github.com/SatWiz/pi-package-ovh-ai-chat/commit/90483d00c2db74f85bfd20dd287c4ffea8a0546b))
* add OVH_AI_API switch for openai-responses API support ([6b9f3e1](https://github.com/SatWiz/pi-package-ovh-ai-chat/commit/6b9f3e15649bd59d433f6a7e833343c217dc51ab))
* default OVH_AI_API to openai-responses ([1e1486c](https://github.com/SatWiz/pi-package-ovh-ai-chat/commit/1e1486c6835aec85512a6a3d1c61e1e5a0627921))
* initial OVH AI Endpoints provider for Pi ([18a2dc7](https://github.com/SatWiz/pi-package-ovh-ai-chat/commit/18a2dc7886c6ce278bdde8260f8fa55cf44551d2))
* normalize OVH Responses API payloads for compatibility ([3aa3a09](https://github.com/SatWiz/pi-package-ovh-ai-chat/commit/3aa3a09c3f0e03dea36c19e7f0d1b27ddd334d82))
* update VISION_MODELS with correct multimodal models per OVH catalog ([a778242](https://github.com/SatWiz/pi-package-ovh-ai-chat/commit/a7782422e8e5b4d2382cdfd1d8e9ceffcec1554a))


### Bug Fixes

* default strict=false on Responses-API function tools for OVH ([779ef9a](https://github.com/SatWiz/pi-package-ovh-ai-chat/commit/779ef9a89ab3192471be35b754f5cef69055ec7f))
* omit reasoning_effort for models whose OVH backend rejects it ([1d06c6b](https://github.com/SatWiz/pi-package-ovh-ai-chat/commit/1d06c6bd9a1ef1a294375ff8f2679f2c6676e5d5))
* treat Qwen3-Coder-30B-A3B-Instruct as non-reasoning on OVH ([5006602](https://github.com/SatWiz/pi-package-ovh-ai-chat/commit/500660239831f5e393c3c9ed4f91f78d1a823c3d))
* use Responses-capable models in tests, fix quick-test counter bug ([99e0660](https://github.com/SatWiz/pi-package-ovh-ai-chat/commit/99e06604d5fbbb8a09eb4d3d4ddc0c2cece30eec))


### Documentation

* simplify README for OSS users and release 1.0.0 ([8c9730c](https://github.com/SatWiz/pi-package-ovh-ai-chat/commit/8c9730cb0d681966a4621ce42a1885cca4cf2a15))

## [1.0.0]

- Default API type changed to `openai-responses` (override with `OVH_AI_API=openai-completions`).
- Dynamic model catalog refresh using Pi 0.81.0's `refreshModels` provider API. Models are re-fetched on startup, `/model` refresh, and `pi update --models`.
- Extension registers successfully when `OVH_AI_TOKEN` is missing or invalid, allowing install first and authentication afterward via env var or `/login ovhai`.
- Test suite skips tests for models not present in the current OVH catalog.
- Requires Pi 0.81.0 or newer.
