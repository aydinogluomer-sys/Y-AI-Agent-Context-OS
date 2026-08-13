# 07 — Şema ↔ Kod Drift'i

> Kodun okuduğu/yazdığı ama şemada bulunmayan alanlar. Her biri gerçek Postgres'te
> `42703 undefined_column` üretir.

| # | Kod beklentisi | Konum | Şema gerçeği | Sonuç |
|---|---|---|---|---|
| D-1 | `projects.organization_id` | `apps/api/src/index.ts:189-191` | kolon yok | `GET /api/projects` — `org_id` taşıyan her JWT principal için **500** |
| D-2 | `tasks.assigned_to` | `apps/api/src/index.ts:237` | kolon yok | `PATCH .../tasks/:id` → 500 |
| D-3 | `permission_policies.project_id`, `.is_system` | `apps/api/src/index.ts:4377` | ikisi de yok | `GET .../permission-policies` gerçek PG'de **her zaman 500** (UI bunu çağırıyor) |
| D-4 | `audit_logs(category, actor_role, is_approved_by_human)` | `packages/core/src/repo-adapter-service.ts:104-120` | kolonlar yok, `await` try/catch'siz | `/repo/file`, `/repo/files` gerçek PG'de 500 (yalnız mock DB'de çalışıyor) |
| D-5 | `project_memberships(project_id, user_id)` | `apps/api/src/auth.ts:419` | yalnız `memberships(user_email)` | DB-backed authz kalıcı `false`, hata yutuluyor |

## Tenant izolasyonu

`04-db-inventory.csv`: **48 tablonun 42'inde**
`organization_id`/`tenant_id` kolonu yok. Cross-tenant izolasyon şema
seviyesinde mümkün değil.

## Ölü şema

| Sınıf | Tablolar |
|---|---|
| DEAD (0 okuma, 0 yazma) | `memberships`, `artifacts`, `connections`, `context_summaries`, `service_identities`, `orphaned_memberships` |
| WRITE-ONLY (hiç okunmuyor) | `durable_memories`, `boundary_checks`, `repo_access_logs`, `permission_overrides` |

> Not: `schema_migrations` runner tarafından `db.ts` içinden kullanılır
> (tarama `db.ts`'i hariç tuttuğu için DEAD görünür) — yanlış pozitiftir.
> `permission_policies` migration seed'i ile yazılır, aynı sebeple WRITE sayılmaz.
