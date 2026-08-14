import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createDefaultProviderRegistry, type ModelProvider } from "@y/providers";
import dotenv from "dotenv";
import { apiReady, apiRouter } from "./apps/api/src/index";
import { createApp, installErrorHandler } from "./apps/api/src/app";

dotenv.config();

const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "127.0.0.1";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * P01 / Y-P01-003: express kurulumu `createApp()`'e devredildi.
 * Öncesinde helmet, CORS, rate limit ve body limiti hiç yoktu (P00 bulgusu P1-6).
 */
const app = createApp({
  apiRouter,
  isProduction: IS_PRODUCTION,
  corsOrigins: (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  bodyLimit: process.env.BODY_LIMIT || "1mb"
});

const providerRegistry = createDefaultProviderRegistry(process.env);

function getSimulationProvider(): ModelProvider | null {
  const provider = providerRegistry.resolve("google-gemini");
  const configured = provider
    ?.getCapabilities()
    .models.some((model) => model.id === "gemini-3.5-flash");
  return configured && process.env.GEMINI_API_KEY &&
    process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY"
    ? provider
    : null;
}

// REST API for Context OS task simulations
app.post("/api/simulate-task", async (req, res) => {
  const { taskName, repoUrl, customInputs } = req.body;
  const targetTask = taskName || "Create user login flow with passport-jwt and store token in local secure cookies";
  const targetRepo = repoUrl || "https://github.com/alchaincyf/huashu-design.git";

  const provider = getSimulationProvider();

  if (!provider) {
    // Elegant fallback simulation generator when no API key is specified - makes the product perfectly demonstrative, safe, and stable
    const mockResponse = generateFallbackSimulation(targetTask, targetRepo);
    return res.json(stripFabricatedMetrics(mockResponse, "local"));
  }

  try {
    const prompt = `
You are the brain of "Y" — the AI Agent Context Operating System.
The user wants to execute a task: "${targetTask}"
They may be using repository study reference: "${targetRepo}".

Perform a deep context analysis for this task and output a strictly valid JSON object matching the following TypeScript structure. Ensure there is NO markdown wrapping in the response if possible, or return raw JSON. If markdown wrapper is present, we will parse it.

Interface expected:
{
  "taskSummary": {
    "title": "Clean concise task layout",
    "category": "Coding" | "Review" | "UI/UX" | "Research" | "Data/SQL",
    "riskLevel": "Low" | "Medium" | "High",
    "difficulty": "Easy" | "Medium" | "Hard"
  },
  "contextOS": {
    "confidenceScore": null,
    "totalScannedDocs": null,
    "tokensInvolved": null,
    "compressedPackTokens": null,
    "primaryFiles": [
      { "path": "string", "reason": "string", "role": "string" }
    ],
    "relatedFiles": [
      { "path": "string", "reason": "string", "role": "string" }
    ]
  },
  "knowledgeGraph": {
    "nodes": [
      { "id": "string", "label": "string", "type": "code" | "doc" | "test" | "decision", "status": "active" | "related" }
    ],
    "edges": [
      { "source": "string", "target": "string", "label": "string" }
    ]
  },
  "agentHandoff": {
    "activeAgent": "Claude Code",
    "stateSummary": "string",
    "nextPrimaryAction": "string",
    "timeline": [
      { "time": "string", "agent": "string", "event": "string", "outcome": "string" }
    ]
  },
  "decisionEnforcement": {
    "applicableDecisions": [
      { "decision": "string", "source": "string", "enforceable": true }
    ],
    "unsupportedClaims": [
      { "claim": "string", "reason": "string" }
    ]
  },
  "capabilityAdvisor": {
    "recommendedSkills": ["string"],
    "recommendedCommands": ["string"],
    "recommendedMCPs": ["string"]
  },
  "modelCouncil": {
    "recommendedModel": "string",
    "comparisons": [
      { "model": "string", "strength": "string", "weakness": "string", "hallucinationRisk": "Low" | "Medium" | "High", "costEstimate": 0.05 }
    ]
  },
  "connectAdvisor": {
    "missingContextAlert": "string",
    "recommendedConnects": [
      { "tool": "string", "reason": "string", "score": null }
    ]
  },
  "costGovernance": {
    "tokenBudget": null,
    "estimatedCost": "string"
  }
}

Be creative, hyper-detailed, and technically accurate relative to the requested task. Retain architectural honesty. Do not return generic responses. Use real code file paths relevant to the technologies they would write (like index.html, App.tsx, server.ts, userModel.ts, authMiddleware.ts, loginForm.tsx, passport.ts depending on the tech).
`;

    const response = await provider.generate({
      model: "gemini-3.5-flash",
      prompt,
      responseMimeType: "application/json",
    });

    const parsedData = JSON.parse(response.text || "{}");

    // [P17 / ADR-032 · spec §37] MODELIN URETTIGI SAYI OLCUM DEGILDIR.
    //
    // Onceki hali yanitinin tamamini dogrulamadan istemciye geciriyordu.
    // Model, prompt'ta ornegi verilen `confidenceScore` / `totalScannedDocs`
    // gibi alanlari doldurmakta serbest — ve doldurdugunda bu sayilar
    // arayuzde Y'nin OLCUMU gibi gorunuyordu.
    //
    // Prompt'tan ornekleri cikarmak yetmez: model yine de bir sayi
    // uretebilir. Bu yuzden alanlar SUNUCUDA zorla null'lanir. Tek yonlu
    // bir kural: model bu alanlari dolduramaz.
    return res.json(stripFabricatedMetrics(parsedData, "llm"));
  } catch (error: any) {
    console.error("Gemini context analysis failed:", error);
    // Gracefully fallback to structured mockup if there is a rate limit or runtime error
    return res.json(
      stripFabricatedMetrics(
        generateFallbackSimulation(targetTask, targetRepo, true, error.message),
        "local"
      )
    );
  }
});

/**
 * [P17 / ADR-032 · spec §37] OLCULMEMIS ALANLARI ZORLA null YAPAR.
 *
 * `/api/simulate-task` ucunun URETTIGI HICBIR SEY OLCUM DEGILDIR:
 *
 *   - Dosya yollari repository indeksinden okunmuyor; prompt modele
 *     acikca "ilgili gorunen gercek dosya yollari kullan" diyor.
 *   - Skorlar ve sayilar ya sabit ya model uretimi.
 *
 * Bu yuzden yanit, kaynagindan bagimsiz olarak simulasyon isaretiyle ve
 * olculmemis alanlari null'lanmis halde doner. Alanin silinmesi degil
 * `null` + sebep olmasi bilincli: tuketici alanin VAR ama OLCULMEMIS
 * oldugunu gorur (ADR-032).
 */
function stripFabricatedMetrics(
  body: any,
  simulationSource: "local" | "llm"
): any {
  const out = { ...(body ?? {}) };

  out.origin = "simulation";
  out.simulationSource = simulationSource;
  out.simulationReason =
    simulationSource === "llm"
      ? "Sunucu tarafi dil modeli simulasyonu. Dosya yollari ve skorlar " +
        "repository indeksinden OKUNMADI."
      : "Yerel deterministik simulasyon ureteci. Saglayici yapilandirilmamis " +
        "ya da cagri basarisiz.";

  const UNAVAILABLE =
    "Bu bir SIMULASYONDUR. Deger olculmedi; olculmus context derlemesi " +
    "P08 derleyicisinden gelir.";

  out.contextOS = {
    ...(out.contextOS ?? {}),
    confidenceScore: null,
    totalScannedDocs: null,
    tokensInvolved: null,
    compressedPackTokens: null,
    measured: false,
    unavailableReason: UNAVAILABLE
  };

  out.costGovernance = {
    ...(out.costGovernance ?? {}),
    tokenBudget: null,
    estimatedCost: null,
    measured: false,
    unavailableReason: UNAVAILABLE
  };

  // connectAdvisor.recommendedConnects[].score de bir olcum degildir.
  const connects = out.connectAdvisor?.recommendedConnects;
  if (Array.isArray(connects)) {
    out.connectAdvisor = {
      ...out.connectAdvisor,
      recommendedConnects: connects.map((c: any) => ({ ...c, score: null }))
    };
  }

  return out;
}

// Mock simulation generator for Y OS
function generateFallbackSimulation(task: string, repo: string, isError = false, errorMsg = ""): any {
  // Try to analyze technology keywords from task string to customize file paths
  const text = task.toLowerCase();
  const tech = text.includes("auth") || text.includes("login") || text.includes("jwt") ? "auth" :
               text.includes("db") || text.includes("sql") || text.includes("prisma") || text.includes("database") ? "database" :
               text.includes("ui") || text.includes("css") || text.includes("animation") || text.includes("tailwind") ? "ui" : "general";

  let primary: any[] = [];
  let related: any[] = [];
  let nodes: any[] = [];
  let edges: any[] = [];

  if (tech === "auth") {
    primary = [
      { path: "src/middleware/auth.ts", reason: "Parses headers, validates bearer passport-jwt signatures", role: "Security Boundary" },
      { path: "src/controllers/authController.ts", reason: "Endpoints for login, token refresh and session invalidation", role: "Logic Engine" },
      { path: "src/models/User.ts", reason: "Defines password hashing rules and profile schema", role: "Data Schema" }
    ];
    related = [
      { path: "src/server.ts", reason: "Registers jwt strategy and middleware pipelines", role: "App Entry" },
      { path: "src/tests/auth.test.ts", reason: "E2E assertions for login workflows and token expirations", role: "Verification Gateway" },
      { path: "docs/architecture/ADR-004-JWT-Auth.md", reason: "Explicitly outlines decision to store tokens in secure cookies", role: "Decision Log" }
    ];
  } else if (tech === "database") {
    primary = [
      { path: "src/db/client.ts", reason: "Initializes pool connectivity configurations and cluster hooks", role: "DB Connection Pool" },
      { path: "prisma/schema.prisma", reason: "Entity structural blueprints and index mappings", role: "DB Schema" },
      { path: "src/services/queryService.ts", reason: "Handles transactional indexing with failovers", role: "Query Logic" }
    ];
    related = [
      { path: "src/config/database.json", reason: "Environment constraints and connection details", role: "Configuration" },
      { path: "src/tests/db.test.ts", reason: "Runs local SQLite migration tests during compilation hooks", role: "Test Gate" }
    ];
  } else if (tech === "ui") {
    primary = [
      { path: "src/components/Dashboard.tsx", reason: "Aesthetic dashboard container, handles responsive sidebar layout", role: "UI Container" },
      { path: "src/App.tsx", reason: "Root router and global coordinate navigation parameters", role: "Router Entry" },
      { path: "src/index.css", reason: "Defines design system tokens and Tailwind rules", role: "Design Styles" }
    ];
    related = [
      { path: "src/components/Sidebar.tsx", reason: "Collapsible drawer, responds to hover states", role: "UI Accessory" },
      { path: "huashu-design/components/Layout.html", reason: "Direct copy-study source for Swiss typography alignments", role: "Swiss Grid Template" }
    ];
  } else {
    // general
    primary = [
      { path: "src/routes/api.ts", reason: "Exposes route coordinates and binds validation schema", role: "API Gateway" },
      { path: "src/services/taskService.ts", reason: "Main business logic handling calculation bounds", role: "Core Service" }
    ];
    related = [
      { path: "src/server.ts", reason: "Mounts API controller logic", role: "Server Orchestrator" },
      { path: "docs/spec.md", reason: "User requirement spec detailing core flows", role: "Specification Document" }
    ];
  }

  // Generate nodes
  nodes = [
    ...primary.map(p => ({ id: p.path, label: p.path.split("/").pop(), type: "code", status: "active" })),
    ...related.map(r => ({ id: r.path, label: r.path.split("/").pop(), type: r.path.endsWith(".md") ? "decision" : (r.path.includes("test") ? "test" : "doc"), status: "related" }))
  ];

  // Generate edges connecting primary paths to entry files or docs
  if (primary.length > 0 && related.length > 0) {
    edges = [
      { source: primary[0].path, target: related[0].path, label: "imported_by" },
    ];
    if (primary[1] && related[1]) {
      edges.push({ source: primary[1].path, target: related[1].path, label: "tested_by" });
    }
    if (primary[0] && primary[1]) {
      edges.push({ source: primary[0].path, target: primary[1].path, label: "resolves_token_via" });
    }
  }

  return {
    isFallback: true,
    fallbackReason: isError ? `Gemini API Error: ${errorMsg}` : "No server-side GEMINI_API_KEY detected. Loaded precision local rules engine.",
    taskSummary: {
      title: task,
      category: tech === "ui" ? "UI/UX" : tech === "database" ? "Data/SQL" : "Coding",
      riskLevel: tech === "auth" ? "High" : "Medium",
      difficulty: "Medium"
    },
    contextOS: {
      // [P17 / ADR-032] UYDURMA METRIKLER KALDIRILDI.
      //
      // Eski degerler: confidenceScore 96.2/94.1, totalScannedDocs 840,
      // tokensInvolved 4.250.000, compressedPackTokens 38.200. Hicbiri
      // olculmuyordu; gorev metnindeki bir kelimeye gore secilen
      // sabitlerdi. Bir guven skorunun 96.2 gibi ONDALIKLI olmasi,
      // okuyanin arkasinda hesap oldugunu varsaymasina yol acar.
      confidenceScore: null,
      totalScannedDocs: null,
      tokensInvolved: null,
      compressedPackTokens: null,
      measured: false,
      unavailableReason:
        "Bu bir SIMULASYONDUR. Dosya listesi repository indeksinden " +
        "okunmadi; olculmus bir context derlemesi yapilmadi.",
      primaryFiles: primary,
      relatedFiles: related
    },
    knowledgeGraph: {
      nodes,
      edges
    },
    agentHandoff: {
      activeAgent: "Claude Code",
      stateSummary: `Handoff snapshot initialized for task. Local branch tracking established, verification metrics compiling successfully.`,
      nextPrimaryAction: `Execute incremental build compilation of ${primary[0]?.path || 'source files'} and verify integrity constraint gates.`,
      timeline: [
        { time: "10:42 AM", agent: "Supervisor", event: "Task initialized", outcome: "Context pack compiled" },
        { time: "10:44 AM", agent: "Claude Code", event: "Import Analysis", outcome: "Recognized target directories and structural bounds" }
      ]
    },
    decisionEnforcement: {
      applicableDecisions: [
        { decision: "Must use secure cookie storage flags (HTTPOnly, SameSite) for token containment", source: "docs/architecture/ADR-004-JWT-Auth.md", enforceable: true },
        { decision: "Strictly run database integration checks prior to local deployment commits", source: "company/policy/security.md", enforceable: true }
      ],
      unsupportedClaims: tech === "auth" ? [
        { claim: "Saving secret keys directly in public-facing config files", reason: "Direct breach of Vault storage decision guidelines" }
      ] : []
    },
    capabilityAdvisor: {
      recommendedSkills: ["auth-security-hardening", "crypto-hashing-verification", "express-middleware-scaffold"],
      recommendedCommands: ["/context compile src/middleware", "/test verify all auth controllers"],
      recommendedMCPs: ["github-context-mcp", "secure-vault-token-mcp", "sqlite-mcp"]
    },
    modelCouncil: {
      recommendedModel: "Anthropic Claude 3.5 Sonnet",
      comparisons: [
        { model: "Claude 3.5 Sonnet / Code", strength: "Exceptional code synthesis, deep AST structural understanding, obeys decision priority", weakness: "Marginally higher execution latency under highly dense contexts", hallucinationRisk: "Low", costEstimate: 0.08 },
        { model: "Google Gemini 1.5 Pro / Flash", strength: "Enmormous 2M token context window, extremely fast token-to-second pipeline", weakness: "Can occasionally overlook silent file deletions in highly fragmented commits", hallucinationRisk: "Medium", costEstimate: 0.02 },
        { model: "DeepSeek Coder v2", strength: "Incredibly competitive cost bounds, solid performance on vanilla SQL execution", weakness: "Higher hallucination metrics on custom structural design conventions", hallucinationRisk: "High", costEstimate: 0.01 }
      ]
    },
    connectAdvisor: {
      missingContextAlert: tech === "ui" ? "Warning: Component visual specification missing. Connecting ProtoPie/Figma recommended." : "Verification metadata successfully aligned. All pipelines clear.",
      recommendedConnects: [
        { tool: "GitHub Repository Connect", reason: "Required to trace active commits, PR status and code diff timelines", score: 98 },
        { tool: "Figma UX Workspace Connect", reason: "Grants agent accessibility to the interactive design patterns checklist", score: 85 },
        { tool: "Notion Knowledgebase Connect", reason: "Establishes contextual bridging to team decision logs and specifications", score: 90 }
      ]
    },
    costGovernance: {
      // P16 — UYDURMA MALIYET IDDIASI KALDIRILDI.
      //
      // Eski deger: "$0.14 USD (92% cheaper than vanilla GPT-4 complete
      // workspace scans)". Bu sayi HICBIR olcume dayanmiyordu; sabitti.
      // Bir urunun rakibinden %92 ucuz oldugunu iddia etmesi, o iddiayi
      // olcmus olmasini gerektirir.
      tokenBudget: null,
      estimatedCost: null,
      measured: false,
      unavailableReason:
        "Maliyet ve butce olculmedi. Karsilastirma harness'i P16'nin konusu."
    }
  };
}

// Start the server
async function startServer() {
  await apiReady;
  const serveStaticAssets = process.env.SERVE_STATIC === "true" || process.env.NODE_ENV === "production";

  // Vite middleware for development
  if (!serveStaticAssets) {
    const vite = await createViteServer({
      configLoader: "runner",
      server: {
        middlewareMode: true,
        fs: {
          strict: true,
          allow: [process.cwd()],
        },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite development server middleware loaded.");
  } else {
    // Serve static files in production or local preview mode.
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log(`Serving static assets from ${distPath}.`);
  }

  // Hata yakalayıcı EN SON kaydedilir: legacy router kendi handler'ını
  // /providers/health route'undan önce kaydettiği için o route korumasızdı.
  installErrorHandler(app, IS_PRODUCTION);

  await new Promise<void>((resolve, reject) => {
    const server = app.listen(PORT, HOST, () => {
    console.log(`Y — Context OS Server started successfully on host ${HOST}, port ${PORT}`);
      resolve();
    });
    server.once("error", reject);
  });
}

startServer().catch((error) => {
  console.error(`Y Context OS failed to start: ${error?.message || error}`);
  process.exitCode = 1;
});
