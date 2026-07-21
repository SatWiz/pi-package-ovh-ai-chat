/**
 * OVH AI Endpoints Provider for Pi
 *
 * Provides access to OVHcloud AI Endpoints chat models through OpenAI-compatible API.
 * Models are fetched dynamically from the OVH catalog on startup.
 *
 * Configuration:
 * - OVH_AI_TOKEN: required API token
 * - OVH_AI_BASE_URL: optional base URL override
 * - OVH_AI_API: optional API type, "openai-completions" (default) or "openai-responses"
 *
 * @see https://www.ovhcloud.com/en/public-cloud/ai-endpoints/
 * @see https://endpoints.ai.cloud.ovh.net/
 * @see https://docs.ovhcloud.com/en/guides/public-cloud/ai-machine-learning/ai-endpoints-responses-api
 * @see https://docs.ovhcloud.com/en/guides/public-cloud/ai-machine-learning/ai-endpoints-capabilities
 * @see https://docs.ovhcloud.com/en/guides/public-cloud/ai-machine-learning/ai-endpoints-function-calling
 * @see https://docs.ovhcloud.com/en/guides/public-cloud/ai-machine-learning/ai-endpoints-structured-output
 *
 * @example
 * ```bash
 * export OVH_AI_TOKEN="your-token-here"
 * pi -e . --model ovhai/gpt-oss-120b
 * ```
 */

import { appendFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { Api, RefreshModelsContext } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ProviderModelConfig } from "@earendil-works/pi-coding-agent";

/** Debug log file path for troubleshooting OVH request normalization. */
const DEBUG_LOG_FILE = `${process.cwd()}/ovh-ai-debug.log`;

/** Default OVH AI Endpoints base URL (Kepler region) */
const DEFAULT_BASE_URL = "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1";

/** Base URL for API calls. Override with OVH_AI_BASE_URL env var. */
const BASE_URL = process.env.OVH_AI_BASE_URL ?? DEFAULT_BASE_URL;

/** Default API type for OVH AI Endpoints. */
const DEFAULT_API_TYPE: Api = "openai-completions";

/** Allowed API type values for OVH_AI_API. */
const ALLOWED_API_TYPES: readonly Api[] = ["openai-completions", "openai-responses"];

/** API type for provider. Override with OVH_AI_API env var. */
const API_TYPE = resolveApiType();

/** Maximum image size (bytes) to embed as base64 before warning about payload limits. */
const MAX_IMAGE_SIZE_BYTES = 9 * 1024 * 1024;

/**
 * Fetch a remote image and return it as a base64 data URL.
 *
 * OVH AI Endpoints does not support remote image URLs for `input_image`;
 * images must be provided as base64 data URLs. This helper downloads the
 * image and converts it.
 *
 * @see https://docs.ovhcloud.com/en/guides/public-cloud/ai-machine-learning/ai-endpoints-responses-api
 */
async function fetchImageAsDataUrl(imageUrl: string): Promise<string> {
  const response = await fetch(imageUrl, {
    headers: {
      "User-Agent": "pi-ovh-ai-chat/1.0",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch image for OVH vision input: ${response.status} ${response.statusText} (${imageUrl})`,
    );
  }

  const contentType = response.headers.get("content-type") ?? guessMimeType(imageUrl);
  const buffer = await response.arrayBuffer();

  return encodeImageBuffer(Buffer.from(buffer), contentType, imageUrl);
}

/**
 * Read a local image file and return it as a base64 data URL.
 */
async function readLocalImageAsDataUrl(filePath: string): Promise<string> {
  const resolvedPath = filePath.startsWith("file://") ? filePath.slice(7) : filePath;
  const buffer = await readFile(resolvedPath);
  const contentType = guessMimeType(resolvedPath);
  return encodeImageBuffer(buffer, contentType, filePath);
}

/**
 * Encode an image buffer as a base64 data URL, enforcing size limits.
 */
function encodeImageBuffer(buffer: Buffer, contentType: string, source: string): string {
  if (buffer.byteLength > MAX_IMAGE_SIZE_BYTES) {
    throw new Error(
      `Image too large for OVH vision input: ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB ` +
        `(max ${(MAX_IMAGE_SIZE_BYTES / 1024 / 1024).toFixed(0)} MB). Source: ${source}`,
    );
  }

  const base64 = buffer.toString("base64");
  return `data:${contentType};base64,${base64}`;
}

/**
 * Guess MIME type from a URL path when the server does not provide one.
 */
function guessMimeType(url: string): string {
  const lower = url.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "image/jpeg";
}

/**
 * Returns true if the given string looks like a remote HTTP(S) URL.
 */
function isRemoteImageUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) && !value.startsWith("data:");
}

/**
 * Returns true if the given string looks like a local file path or file:// URL.
 */
function isLocalImagePath(value: string): boolean {
  return (
    value.startsWith("file://") || (!value.startsWith("data:") && !/^https?:\/\//i.test(value))
  );
}

/**
 * Normalize OpenAI Responses payload for OVH AI Endpoints compatibility.
 *
 * OVH's /v1/responses backend is stricter than OpenAI's. Verified quirks:
 * - Statefulness is not managed; always send `store: false`.
 * - Plain role-based input items need an explicit `type: "message"`.
 * - `function_call_output` items need `status: "completed"`.
 * - `output_text` parts of replayed assistant messages need `annotations`.
 * - Image inputs must be base64 data URLs; remote HTTP(S) URLs are not supported.
 * - Unsupported top-level params must be removed (`include`, `prompt_cache_key`,
 *   `prompt_cache_retention`, `stream_options`, `user`, `service_tier`, `truncation`,
 *   `max_tool_calls`, `background`, `safety_identifier`, `verbosity`), and
 *   `reasoning.summary` is not supported.
 *
 * @see https://docs.ovhcloud.com/en/guides/public-cloud/ai-machine-learning/ai-endpoints-responses-api
 */
async function normalizeOvhResponsesPayload(payload: unknown): Promise<unknown> {
  const p = payload as Record<string, unknown>;
  const {
    include: _include,
    prompt_cache_key: _key,
    prompt_cache_retention: _retention,
    background: _background,
    max_tool_calls: _maxToolCalls,
    truncation: _truncation,
    safety_identifier: _safetyIdentifier,
    service_tier: _serviceTier,
    stream_options: _streamOptions,
    user: _user,
    verbosity: _verbosity,
    ...rest
  } = p;

  // OVH does not manage statefulness for /v1/responses; OpenAI defaults to store: true,
  // so force store: false to avoid unexpected behaviour.
  if (rest.store !== false) {
    rest.store = false;
  }

  if (Array.isArray(rest.input)) {
    rest.input = await Promise.all(
      (rest.input as Array<Record<string, unknown>>).map(async (item) => {
        const type = item.type as string | undefined;

        // OVH requires `status` on function_call_output items.
        if (type === "function_call_output" && item.status === undefined) {
          return { ...item, status: "completed" };
        }

        // Plain role-based items need an explicit `type: "message"`.
        if (type === undefined && typeof item.role === "string") {
          return { ...item, type: "message" };
        }

        // Replayed assistant messages: `output_text` parts need `annotations`.
        if (type === "message" && item.role === "assistant" && Array.isArray(item.content)) {
          return {
            ...item,
            content: (item.content as unknown[]).map((part) => {
              const c = part as Record<string, unknown>;
              if (c.type === "output_text" && c.annotations === undefined) {
                return { ...c, annotations: [] };
              }
              return part;
            }),
          };
        }

        // Convert remote/local image URLs to base64 data URLs for OVH vision inputs.
        if (type === "input_image" && typeof item.image_url === "string") {
          if (isRemoteImageUrl(item.image_url)) {
            return { ...item, image_url: await fetchImageAsDataUrl(item.image_url) };
          }
          if (isLocalImagePath(item.image_url)) {
            return { ...item, image_url: await readLocalImageAsDataUrl(item.image_url) };
          }
        }

        if (type === "message" && item.role === "user" && Array.isArray(item.content)) {
          const normalizedContent = await Promise.all(
            (item.content as Array<Record<string, unknown>>).map(async (part) => {
              if (part.type === "input_image" && typeof part.image_url === "string") {
                if (isRemoteImageUrl(part.image_url)) {
                  return { ...part, image_url: await fetchImageAsDataUrl(part.image_url) };
                }
                if (isLocalImagePath(part.image_url)) {
                  return { ...part, image_url: await readLocalImageAsDataUrl(part.image_url) };
                }
              }
              return part;
            }),
          );
          return { ...item, content: normalizedContent };
        }

        return item;
      }),
    );
  }

  if (typeof rest.reasoning === "object" && rest.reasoning !== null) {
    const reasoning = rest.reasoning as Record<string, unknown>;
    const { summary: _summary, ...reasoningRest } = reasoning;
    rest.reasoning = reasoningRest;
  }

  // previous_response_id is also unsupported on OVH, but Pi does not send it by
  // default when store is false. Keep it explicit here for safety.
  if (rest.previous_response_id !== undefined) {
    delete rest.previous_response_id;
  }

  return rest;
}

/**
 * Resolve API type from OVH_AI_API environment variable.
 * Defaults to openai-completions.
 */
function resolveApiType(): Api {
  const envApi = process.env.OVH_AI_API;
  if (!envApi) {
    return DEFAULT_API_TYPE;
  }
  if (!ALLOWED_API_TYPES.includes(envApi as Api)) {
    throw new Error(
      `Invalid OVH_AI_API value: "${envApi}".\n` +
        `Allowed values: ${ALLOWED_API_TYPES.join(", ")}\n` +
        `Example: export OVH_AI_API="openai-responses"`,
    );
  }
  return envApi as Api;
}

/** OVH API model response shape */
interface OvhaiApiModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
  pricing?: {
    prompt: string;
    completion: string;
    image?: string;
    request?: string;
  };
  context_length?: number;
  max_completion_tokens?: number;
}

/** API response from /v1/models */
interface OvhaiModelsResponse {
  object: string;
  data: OvhaiApiModel[];
}

/** Models that support reasoning/thinking */
const REASONING_MODELS = new Set([
  "gpt-oss-120b",
  "gpt-oss-20b",
  "Qwen3-32B",
  "Qwen3.5-9B",
  "Qwen3.5-397B-A17B",
  "Qwen3.6-27B",
  "Qwen3-Coder-30B-A3B-Instruct",
]);

/** Models that support image input */
const VISION_MODELS = new Set([
  "Qwen2.5-VL-72B-Instruct",
  "Qwen3.5-9B",
  "Qwen3.5-397B-A17B",
  "Qwen3.6-27B",
  "Mistral-Small-3.2-24B-Instruct-2506",
]);

/** Models to exclude (embeddings, audio, etc.) */
const EXCLUDED_MODELS = new Set([
  "bge-m3",
  "bge-multilingual-gemma2",
  "Qwen3-Embedding-8B",
  "whisper-large-v3",
  "whisper-large-v3-turbo",
  "stable-diffusion-xl-base-v10",
  "stabilityai/stable-diffusion-xl-base-1.0",
  "ppl",
]);

/**
 * Validates that required environment variable is set.
 * Logs a helpful warning instead of throwing so the extension still registers
 * for new users who have not yet configured their token.
 */
function validateConfig(): boolean {
  if (!process.env.OVH_AI_TOKEN) {
    console.error(
      "[OVH AI] OVH_AI_TOKEN environment variable is not set.\n" +
        "Get your token from https://endpoints.ai.cloud.ovh.net/\n" +
        "Then run: export OVH_AI_TOKEN='your-token-here'\n" +
        "Or use `/login ovhai` in pi to store a credential.",
    );
    return false;
  }
  return true;
}

/**
 * Convert OVH API pricing (per token) to our cost format (per million tokens).
 * Prices from API are like "0.00000009" (per token).
 */
function convertCost(pricePerToken: string | undefined): number {
  if (!pricePerToken) return 0;
  const perToken = Number.parseFloat(pricePerToken);
  return Number.isNaN(perToken) ? 0 : perToken * 1_000_000;
}

/**
 * Map OVH API model to Pi ProviderModelConfig.
 */
function mapModel(apiModel: OvhaiApiModel): ProviderModelConfig | null {
  // Skip excluded model types
  if (EXCLUDED_MODELS.has(apiModel.id)) {
    return null;
  }

  // Determine capabilities
  const hasVision = VISION_MODELS.has(apiModel.id);
  const hasReasoning = REASONING_MODELS.has(apiModel.id);

  // Build input types
  const input: ("text" | "image")[] = ["text"];
  if (hasVision) input.push("image");

  // Use API pricing if available, otherwise defaults
  const pricing = apiModel.pricing;
  const inputCost = convertCost(pricing?.prompt);
  const outputCost = convertCost(pricing?.completion);

  // Extract readable name from ID
  const name = formatModelName(apiModel.id);

  return {
    id: apiModel.id,
    name,
    reasoning: hasReasoning,
    input,
    cost: {
      input: inputCost,
      output: outputCost,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: apiModel.context_length ?? 32768,
    maxTokens: apiModel.max_completion_tokens ?? 32768,
    compat: API_TYPE === "openai-responses" ? { supportsDeveloperRole: false } : undefined,
  };
}

/**
 * Format model ID into readable name.
 * e.g., "Meta-Llama-3_3-70B-Instruct" -> "Llama 3.3 70B Instruct"
 */
function formatModelName(id: string): string {
  // Remove common prefixes and suffixes
  let name = id
    .replace(/^Meta-/, "")
    .replace(/^Mistral-/, "Mistral ")
    .replace(/^Qwen/, "Qwen ")
    .replace(/-Instruct$/g, "")
    .replace(/-/g, " ");

  // Replace underscores with dots for version numbers
  name = name.replace(/_/g, ".");

  return name.trim();
}

/**
 * Fetch available models from OVH AI Endpoints API.
 */
async function fetchModels(token: string): Promise<ProviderModelConfig[]> {
  const response = await fetch(`${BASE_URL}/models`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as OvhaiModelsResponse;

  // Map and filter models
  const models = data.data
    .map(mapModel)
    .filter((m): m is ProviderModelConfig => m !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  return models;
}

/**
 * Register OVH AI Endpoints provider with Pi.
 * Fetches models dynamically from OVH catalog.
 *
 * @param pi - Pi Extension API
 */
export default async function (pi: ExtensionAPI) {
  // Validate configuration at load time, but do not block extension registration
  // so new users can install the extension and authenticate afterward.
  const configured = validateConfig();

  // Fetch models from OVH API when a token is available.
  let models: ProviderModelConfig[] = [];
  if (configured && process.env.OVH_AI_TOKEN) {
    try {
      models = await fetchModels(process.env.OVH_AI_TOKEN);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[OVH AI] Failed to fetch initial model catalog: ${message}\n` +
          "[OVH AI] The provider is registered with an empty catalog; " +
          "run `/model` refresh or `pi update --models` after configuring your token.",
      );
    }
  }

  if (models.length === 0) {
    console.error(
      "[OVH AI] No chat models available from OVH AI Endpoints. " +
        "Check your token permissions or OVH account status.",
    );
  }

  pi.registerProvider("ovhai", {
    name: "OVH AI Endpoints",
    baseUrl: BASE_URL,
    apiKey: "$OVH_AI_TOKEN",
    api: API_TYPE,
    authHeader: true,
    models,
    /**
     * Dynamic model refresh. Called during startup, `/model` refresh, and
     * `pi update --models`. Re-fetches the OVH catalog so newly available
     * models appear without restarting pi.
     */
    async refreshModels(context: RefreshModelsContext): Promise<ProviderModelConfig[]> {
      if (!context.allowNetwork || context.signal?.aborted) {
        return models;
      }

      const refreshToken =
        context.credential?.type === "api_key" ? context.credential.key : process.env.OVH_AI_TOKEN;

      if (!refreshToken) {
        console.error("[OVH AI] Cannot refresh models: OVH_AI_TOKEN is not configured.");
        return models;
      }

      try {
        const refreshed = await fetchModels(refreshToken);
        if (refreshed.length === 0) {
          console.error(
            "[OVH AI] Model refresh returned no chat models; keeping existing catalog.",
          );
          return models;
        }
        return refreshed;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[OVH AI] Model refresh failed: ${message}`);
        return models;
      }
    },
  });

  // OVH's Responses API requires explicit `type: "message"` on input items
  // and remote image URLs must be converted to base64 data URLs.
  if (API_TYPE === "openai-responses") {
    pi.on("before_provider_request", async (event, ctx) => {
      const model = ctx.model;
      if (model?.provider !== "ovhai" || model?.api !== "openai-responses") {
        return;
      }
      const input = (event.payload as Record<string, unknown>).input;
      const hasImage =
        Array.isArray(input) &&
        input.some((item) =>
          Array.isArray(item.content)
            ? item.content.some((part: Record<string, unknown>) => part.type === "input_image")
            : item.type === "input_image",
        );

      // OVH's /v1/responses backend currently rejects input_image items (422), even though
      // the documentation shows an example. Log payloads for diagnostics and warn users.
      if (hasImage) {
        const timestamp = new Date().toISOString();
        appendFileSync(
          DEBUG_LOG_FILE,
          `[${timestamp}] [OVH DEBUG] image payload input:\n${JSON.stringify(input, null, 2)}\n\n`,
        );
        console.error(
          "[OVH AI Warning] Image input detected for /v1/responses. " +
            "OVH's Responses API currently rejects image inputs (HTTP 422). " +
            "Use OVH_AI_API=openai-completions for vision tasks.",
        );
      }

      return normalizeOvhResponsesPayload(event.payload);
    });
  }
}
