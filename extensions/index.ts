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
 *
 * @example
 * ```bash
 * export OVH_AI_TOKEN="your-token-here"
 * pi -e . --model ovhai/gpt-oss-120b
 * ```
 */

import type { Api } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ProviderModelConfig } from "@earendil-works/pi-coding-agent";

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

/**
 * Normalize OpenAI Responses payload for OVH AI Endpoints compatibility.
 *
 * OVH's /v1/responses backend is stricter than OpenAI's. Verified quirks:
 * - Plain role-based input items need an explicit `type: "message"`.
 * - `function_call_output` items need `status: "completed"`.
 * - `output_text` parts of replayed assistant messages need `annotations`.
 * - Unsupported top-level params must be removed (`include`, `prompt_cache_key`,
 *   `prompt_cache_retention`), and `reasoning.summary` is not supported.
 */
function normalizeOvhResponsesPayload(payload: unknown): unknown {
  const p = payload as Record<string, unknown>;
  const {
    include: _include,
    prompt_cache_key: _key,
    prompt_cache_retention: _retention,
    ...rest
  } = p;

  if (Array.isArray(rest.input)) {
    rest.input = (rest.input as Array<Record<string, unknown>>).map((item) => {
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

      return item;
    });
  }

  if (typeof rest.reasoning === "object" && rest.reasoning !== null) {
    const reasoning = rest.reasoning as Record<string, unknown>;
    const { summary: _summary, ...reasoningRest } = reasoning;
    rest.reasoning = reasoningRest;
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
 * Throws helpful error if OVH_AI_TOKEN is missing.
 */
function validateConfig(): void {
  if (!process.env.OVH_AI_TOKEN) {
    throw new Error(
      "OVH_AI_TOKEN environment variable is not set.\n" +
        "Get your token from https://endpoints.ai.cloud.ovh.net/\n" +
        "Then run: export OVH_AI_TOKEN='your-token-here'",
    );
  }
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
  // Validate configuration at load time
  validateConfig();

  // Token is guaranteed to exist after validateConfig()
  const token = process.env.OVH_AI_TOKEN as string;

  // Fetch models from OVH API
  const models = await fetchModels(token);

  if (models.length === 0) {
    throw new Error(
      "No chat models available from OVH AI Endpoints. " +
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
  });

  // OVH's Responses API requires explicit `type: "message"` on input items.
  if (API_TYPE === "openai-responses") {
    pi.on("before_provider_request", (event, ctx) => {
      const model = ctx.model;
      if (model?.provider !== "ovhai" || model?.api !== "openai-responses") {
        return;
      }
      return normalizeOvhResponsesPayload(event.payload);
    });
  }
}
