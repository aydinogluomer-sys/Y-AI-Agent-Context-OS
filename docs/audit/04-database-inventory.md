# 04 — Database Inventory

## Core Tables
- `projects`: Workspace project boundaries, slugs, owners, metadata (`id`, `name`, `slug`, `owner_id`, `created_at`).
- `tasks`: Task lifecycle records and FSM states (`id`, `project_id`, `title`, `status`, `fsm_state`, `priority`, `created_at`).
- `artifacts`: Logical artifact versions (`id`, `project_id`, `task_id`, `relative_path`, `version_number`, `artifact_status`, `detail`).
- `cas_blobs`: Physical binary blobs indexed by SHA-256 (`hash`, `byte_size`, `content`, `created_at`).
- `audit_logs`: Chained event logs for security audit (`id`, `project_id`, `actor_role`, `action`, `detail`, `created_at`).
- `context_objects`: Source code AST symbols and context packs (`id`, `project_id`, `object_type`, `payload`, `created_at`).
