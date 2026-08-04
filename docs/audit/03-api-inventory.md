# 03 — API Inventory

- `GET /api/health`: System health & readiness status.
- `POST /api/auth/dev-session`: Dev session authentication & role assignment.
- `GET /api/projects`: List active workspace projects.
- `POST /api/projects`: Create new workspace project.
- `GET /api/tasks`: List tasks for active project.
- `POST /api/tasks`: Create new task in FSM lifecycle.
- `PATCH /api/tasks/:id/transition`: FSM state transition handler.
- `GET /api/artifacts`: List artifacts in Content Addressed Storage.
- `POST /api/artifacts`: Register binary payload into CAS.
- `POST /api/impact-analysis`: Query AST graph impact radius for code changes.
- `POST /api/db/configure`: Save & test PostgreSQL / Supabase connection strings.
- `POST /api/simulate-task`: Execute task execution simulation.
