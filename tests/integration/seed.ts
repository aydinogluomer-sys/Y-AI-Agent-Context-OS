/**
 * P19 / T4 — ORTAK SEED YARDIMCILARI.
 *
 * Şema gerçek yabancı anahtar zincirleri taşıyor:
 *
 *     organizations → projects → repositories → repository_snapshots
 *                                             → files → symbols/chunks
 *                                             → graph_nodes/graph_edges
 *
 * Her spec bu zinciri yeniden kurarsa, zincir değiştiğinde N dosya
 * güncellenir ve biri unutulur. Ortak yardımcı, şema değişikliğini **tek
 * yerde** karşılar.
 *
 * Seed **gerçek kısıtlara uyar**: FK'ları devre dışı bırakıp veri
 * uydurmak, testin şemanın gerçekten tutarlı olduğunu doğrulamasını
 * engellerdi.
 */

import type { IntegrationDb } from "./setup";

export interface TenantFixture {
  readonly organizationId: string;
  readonly projectId: string;
  readonly repositoryId: string;
  readonly snapshotId: string;
}

/** Bir tenant'ın tam zincirini kurar. */
export async function seedTenant(
  db: IntegrationDb,
  organizationId: string,
  snapshotId = `snap_${organizationId}`
): Promise<TenantFixture> {
  const projectId = `proj_${organizationId}`;
  const repositoryId = `repo_${organizationId}`;

  await db.query(
    `INSERT INTO organizations (id, slug, name) VALUES ($1,$1,$1)
       ON CONFLICT (id) DO NOTHING;`,
    [organizationId]
  );

  await db.query(
    // 0041 organization_id'yi NOT NULL yapiyor; seed gercek kisitlara
    // uyar. FK'lari devre disi birakip veri uydurmak, testin semanin
    // gercekten tutarli oldugunu dogrulamasini engellerdi.
    `INSERT INTO projects (id, name, organization_id) VALUES ($1,$1,$2)
       ON CONFLICT (id) DO NOTHING;`,
    [projectId, organizationId]
  );

  await db.query(
    `INSERT INTO repositories (id, organization_id, project_id, kind, display_name, created_by)
     VALUES ($1,$2,$3,'local',$1,'test')
       ON CONFLICT (id) DO NOTHING;`,
    [repositoryId, organizationId, projectId]
  );

  await db.query(
    `INSERT INTO repository_snapshots (id, organization_id, repository_id, commit_sha, status)
     VALUES ($1,$2,$3,$4,'ready')
       ON CONFLICT (id) DO NOTHING;`,
    [snapshotId, organizationId, repositoryId, "a".repeat(40)]
  );

  return { organizationId, projectId, repositoryId, snapshotId };
}

export async function seedGraphNode(
  db: IntegrationDb,
  tenant: TenantFixture,
  nodeId: string
): Promise<void> {
  await db.query(
    `INSERT INTO graph_nodes
       (id, node_identifier, organization_id, snapshot_id, node_kind, label, type, status, path)
     VALUES ($1,$1,$2,$3,'symbol',$1,'symbol','active',$4);`,
    [nodeId, tenant.organizationId, tenant.snapshotId, `src/${nodeId}.ts`]
  );
}

/**
 * Kenar ekler.
 *
 * `organizationId` AYRI parametre: köprü kenar senaryosunda kenarın
 * sahibi, işaret ettiği düğümün sahibinden farklı olmalı.
 */
export async function seedGraphEdge(
  db: IntegrationDb,
  snapshotId: string,
  organizationId: string,
  edgeId: string,
  source: string,
  target: string
): Promise<void> {
  await db.query(
    `INSERT INTO graph_edges
       (id, organization_id, snapshot_id, source, target, edge_kind, label, confidence)
     VALUES ($1,$2,$3,$4,$5,'depends_on','depends_on',0.9);`,
    [edgeId, organizationId, snapshotId, source, target]
  );
}

export interface ChunkSeed {
  readonly id: string;
  readonly path: string;
  readonly content: string;
  /** Firewall kovası: `allow` | `approval` | `deny`. */
  readonly universeBucket?: string;
  readonly containsSecret?: boolean;
  /** pgvector embedding. Verilmezse `NULL` kalır. */
  readonly embedding?: readonly number[];
}

/** Bir dosya + chunk ekler; FTS vektörü GERÇEK `to_tsvector` ile üretilir. */
export async function seedChunk(
  db: IntegrationDb,
  tenant: TenantFixture,
  chunk: ChunkSeed
): Promise<void> {
  const fileId = `file_${chunk.id}`;

  await db.query(
    `INSERT INTO files (id, organization_id, snapshot_id, path, content_hash, size_bytes)
     VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO NOTHING;`,
    [
      fileId,
      tenant.organizationId,
      tenant.snapshotId,
      chunk.path,
      "b".repeat(64),
      chunk.content.length
    ]
  );

  await db.query(
    `INSERT INTO chunks
       (id, organization_id, snapshot_id, file_id, path, ordinal, content, content_hash,
        start_line, end_line, start_byte, end_byte, part_index, part_count,
        estimated_tokens, universe_bucket, contains_secret, tsv, embedding, embedding_dim)
     VALUES ($1,$2,$3,$4,$5,0,$6,$7,1,10,0,$8,0,1,
             $9,$10,$11,
             -- FTS vektoru GERCEK to_tsvector ile: elle yazilmis bir tsv,
             -- uretimdeki davranisi degil test yazarinin varsayimini olcerdi.
             to_tsvector('english', $6),
             $12::vector, $13);`,
    [
      chunk.id,
      tenant.organizationId,
      tenant.snapshotId,
      fileId,
      chunk.path,
      chunk.content,
      "c".repeat(64),
      chunk.content.length,
      Math.ceil(chunk.content.length / 4),
      chunk.universeBucket ?? "allow",
      chunk.containsSecret ?? false,
      chunk.embedding ? `[${chunk.embedding.join(",")}]` : null,
      chunk.embedding ? chunk.embedding.length : null
    ]
  );
}
