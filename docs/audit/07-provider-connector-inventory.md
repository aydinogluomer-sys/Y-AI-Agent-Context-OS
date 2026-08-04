# 07 — Provider Connector Inventory

- **Model Provider Adapter**: `packages/providers` abstraction supporting:
  - `Google Gemini 2.5 Flash / Pro`: Fast context processing and tool calling.
  - `Claude 3.5 Sonnet`: Advanced reasoning and architectural review.
  - `DeepSeek V3 / Local LLM`: Offline fallback model routing.
- **SaaS Connectors**:
  - `Google Cloud Platform`: Vertex AI & BigQuery Data Transfer Service integration.
  - `Supabase / PostgreSQL`: Unified pool connection manager.
  - `Databricks / AWS Glue`: Lakehouse catalog federation stubs.
