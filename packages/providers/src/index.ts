import { GoogleGenAI } from "@google/genai";

export type ProviderPrivacyBoundary =
  | "local_only"
  | "external_processor"
  | "customer_managed";

export interface ModelDescriptor {
  id: string;
  displayName: string;
  maxInputTokens: number | null;
  supportsStructuredJson: boolean;
  inputCostUsdPerMillionTokens: number | null;
  outputCostUsdPerMillionTokens: number | null;
  pricingLastVerifiedAt: string | null;
}

export interface ModelProviderCapabilities {
  providerId: string;
  displayName: string;
  privacyBoundary: ProviderPrivacyBoundary;
  sendsPromptsOffDevice: boolean;
  supportsStreaming: boolean;
  supportsStructuredJson: boolean;
  models: ModelDescriptor[];
}

export interface ModelProviderHealth {
  providerId: string;
  configured: boolean;
  status: "ready" | "not_configured" | "error";
  checkedAt: string;
  message: string;
}

export interface ModelGenerationRequest {
  model: string;
  prompt: string;
  responseMimeType?: "application/json" | "text/plain";
}

export interface ModelGenerationResult {
  providerId: string;
  model: string;
  text: string;
}

export interface ModelProvider {
  readonly id: string;
  connect(): Promise<ModelProviderHealth>;
  getCapabilities(): ModelProviderCapabilities;
  generate(request: ModelGenerationRequest): Promise<ModelGenerationResult>;
}

export class ProviderRegistry {
  private readonly providers = new Map<string, ModelProvider>();

  register(provider: ModelProvider): this {
    if (this.providers.has(provider.id)) {
      throw new Error(`Model provider '${provider.id}' is already registered.`);
    }
    this.providers.set(provider.id, provider);
    return this;
  }

  resolve(providerId: string): ModelProvider | null {
    return this.providers.get(providerId) || null;
  }

  listCapabilities(): ModelProviderCapabilities[] {
    return Array.from(this.providers.values(), (provider) =>
      provider.getCapabilities(),
    );
  }

  async health(): Promise<ModelProviderHealth[]> {
    return Promise.all(
      Array.from(this.providers.values(), (provider) => provider.connect()),
    );
  }
}

export class GoogleGeminiProvider implements ModelProvider {
  readonly id = "google-gemini";
  private client: GoogleGenAI | null = null;

  constructor(private readonly apiKey: string | undefined) {}

  private isConfigured(): boolean {
    return Boolean(
      this.apiKey?.trim() && this.apiKey.trim() !== "MY_GEMINI_API_KEY",
    );
  }

  private getClient(): GoogleGenAI {
    if (!this.isConfigured()) {
      throw new Error("Google Gemini provider is not configured.");
    }
    if (!this.client) {
      this.client = new GoogleGenAI({
        apiKey: this.apiKey!,
        httpOptions: {
          headers: { "User-Agent": "y-context-os" },
        },
      });
    }
    return this.client;
  }

  async connect(): Promise<ModelProviderHealth> {
    const configured = this.isConfigured();
    return {
      providerId: this.id,
      configured,
      status: configured ? "ready" : "not_configured",
      checkedAt: new Date().toISOString(),
      message: configured
        ? "Credentials are configured; connectivity is checked on generation."
        : "GEMINI_API_KEY is not configured.",
    };
  }

  getCapabilities(): ModelProviderCapabilities {
    return {
      providerId: this.id,
      displayName: "Google Gemini",
      privacyBoundary: "external_processor",
      sendsPromptsOffDevice: true,
      supportsStreaming: false,
      supportsStructuredJson: true,
      models: [
        {
          id: "gemini-3.5-flash",
          displayName: "Gemini 3.5 Flash",
          maxInputTokens: null,
          supportsStructuredJson: true,
          inputCostUsdPerMillionTokens: null,
          outputCostUsdPerMillionTokens: null,
          pricingLastVerifiedAt: null,
        },
      ],
    };
  }

  async generate(
    request: ModelGenerationRequest,
  ): Promise<ModelGenerationResult> {
    const response = await this.getClient().models.generateContent({
      model: request.model,
      contents: request.prompt,
      config: request.responseMimeType
        ? { responseMimeType: request.responseMimeType }
        : undefined,
    });
    return {
      providerId: this.id,
      model: request.model,
      text: response.text || "",
    };
  }
}

export function createDefaultProviderRegistry(
  env: NodeJS.ProcessEnv = process.env,
): ProviderRegistry {
  return new ProviderRegistry().register(
    new GoogleGeminiProvider(env.GEMINI_API_KEY),
  );
}
