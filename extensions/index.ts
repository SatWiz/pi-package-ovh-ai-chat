/**
 * OVH AI Endpoints Provider for Pi
 *
 * Provides access to OVHcloud AI Endpoints chat models through OpenAI-compatible API.
 * Models are fetched dynamically from the OVH catalog on startup.
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

import type { ExtensionAPI, ProviderModelConfig } from "@earendil-works/pi-coding-agent";

/** Default OVH AI Endpoints base URL (Kepler region) */
const DEFAULT_BASE_URL = "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1";

/** Base URL for API calls. Override with OVH_AI_BASE_URL env var. */
const BASE_URL = process.env.OVH_AI_BASE_URL ?? DEFAULT_BASE_URL;

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
const VISION_MODELS = new Set(["gpt-oss-120b", "gpt-oss-20b", "Qwen2.5-VL-72B-Instruct"]);

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
    api: "openai-completions",
    authHeader: true,
    models,
  });
}
