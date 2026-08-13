/**
 * P02 / Y-P02-005 — Kimlik verisi erişim katmanı.
 *
 * Route'lar SQL yazmaz. P00 Truth Audit'te 199 route'un tamamı SQL'i
 * doğrudan handler içinde tutuyordu; bu yüzden aynı invariant farklı
 * yerlerde farklı uygulanıyordu (ör. bazı handler'lar `project_id`
 * filtresi koyuyor, bazıları koymuyordu — P0-8'in kaynağı).
 *
 * Buradaki her sorgu **zorunlu olarak** organization_id taşır.
 */

import { newId, type OrgRole, type ProjectRole } from "@y/shared";

export interface Db {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

export interface UserRecord {
  id: string;
  oidcIssuer: string;
  oidcSub: string;
  email: string | null;
  displayName: string | null;
  disabledAt: string | null;
}

export interface OrganizationRecord {
  id: string;
  slug: string;
  name: string;
}

export class IdentityRepository {
  constructor(private readonly db: Db) {}

  /**
   * OIDC kimliğini iç kullanıcıya çözer; yoksa oluşturur (JIT provisioning).
   *
   * Not: kullanıcı oluşturmak ona yetki VERMEZ. Üyelik ayrı bir işlemdir.
   * Bu ayrım bilinçlidir — aksi halde issuer'da hesabı olan herkes
   * otomatik erişim kazanırdı.
   */
  async resolveUser(params: {
    issuer: string;
    sub: string;
    email?: string | null;
    displayName?: string | null;
  }): Promise<UserRecord> {
    const existing = await this.db.query(
      `SELECT id, oidc_issuer, oidc_sub, email, display_name, disabled_at
         FROM users
        WHERE oidc_issuer = $1 AND oidc_sub = $2
        LIMIT 1;`,
      [params.issuer, params.sub]
    );

    if (existing.rows.length > 0) {
      return mapUser(existing.rows[0]);
    }

    const id = newId("user");
    await this.db.query(
      `INSERT INTO users (id, oidc_issuer, oidc_sub, email, display_name)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (oidc_issuer, oidc_sub) DO NOTHING;`,
      [id, params.issuer, params.sub, params.email ?? null, params.displayName ?? null]
    );

    const created = await this.db.query(
      `SELECT id, oidc_issuer, oidc_sub, email, display_name, disabled_at
         FROM users WHERE oidc_issuer = $1 AND oidc_sub = $2 LIMIT 1;`,
      [params.issuer, params.sub]
    );
    return mapUser(created.rows[0]);
  }

  /** Kullanıcının üyesi olduğu organizasyonlar. */
  async listOrganizationsForUser(userId: string): Promise<(OrganizationRecord & { role: OrgRole })[]> {
    const res = await this.db.query(
      `SELECT o.id, o.slug, o.name, m.role
         FROM organizations o
         JOIN org_memberships m ON m.organization_id = o.id
        WHERE m.user_id = $1 AND o.archived_at IS NULL
        ORDER BY o.name;`,
      [userId]
    );
    return res.rows.map((r) => ({ id: r.id, slug: r.slug, name: r.name, role: r.role as OrgRole }));
  }

  /** Bir organizasyondaki kullanıcı rolü. Üye değilse null. */
  async orgRoleOf(orgId: string, userId: string): Promise<OrgRole | null> {
    const res = await this.db.query(
      `SELECT role FROM org_memberships WHERE organization_id = $1 AND user_id = $2 LIMIT 1;`,
      [orgId, userId]
    );
    return res.rows.length > 0 ? (res.rows[0].role as OrgRole) : null;
  }

  /**
   * Organizasyondaki projeler.
   *
   * ÖNEMLİ: sonuç kullanıcının üyeliğine göre filtrelenir. Org admin'i
   * tüm projeleri görür; sıradan üye yalnız üyesi olduklarını.
   */
  async listProjectsForUser(orgId: string, userId: string, orgRole: OrgRole): Promise<any[]> {
    if (orgRole === "owner" || orgRole === "admin") {
      const res = await this.db.query(
        `SELECT id, name, description, created_at, updated_at
           FROM projects
          WHERE organization_id = $1
          ORDER BY name;`,
        [orgId]
      );
      return res.rows;
    }

    const res = await this.db.query(
      `SELECT p.id, p.name, p.description, p.created_at, p.updated_at, pm.role AS project_role
         FROM projects p
         JOIN project_memberships pm ON pm.project_id = p.id AND pm.user_id = $2
        WHERE p.organization_id = $1
        ORDER BY p.name;`,
      [orgId, userId]
    );
    return res.rows;
  }

  async listProjectMembers(projectId: string): Promise<any[]> {
    const res = await this.db.query(
      `SELECT pm.user_id, pm.role, u.email, u.display_name
         FROM project_memberships pm
         JOIN users u ON u.id = pm.user_id
        WHERE pm.project_id = $1
        ORDER BY u.email;`,
      [projectId]
    );
    return res.rows;
  }

  async upsertProjectMembership(projectId: string, userId: string, role: ProjectRole): Promise<void> {
    await this.db.query(
      `INSERT INTO project_memberships (id, project_id, user_id, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role, updated_at = NOW();`,
      [newId("pm"), projectId, userId, role]
    );
  }

  async removeProjectMembership(projectId: string, userId: string): Promise<boolean> {
    const res = await this.db.query(
      `DELETE FROM project_memberships WHERE project_id = $1 AND user_id = $2;`,
      [projectId, userId]
    );
    return (res.rowCount ?? 0) > 0;
  }
}

function mapUser(row: any): UserRecord {
  return {
    id: row.id,
    oidcIssuer: row.oidc_issuer,
    oidcSub: row.oidc_sub,
    email: row.email,
    displayName: row.display_name,
    disabledAt: row.disabled_at
  };
}
