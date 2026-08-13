/**
 * P01 / Y-P01-001 — Kimlik ve kiracılık sözleşmeleri.
 *
 * P00 Truth Audit bulguları (P0-3, P0-4):
 *   - Authorization tamamen token claim'i / env değişkeniydi.
 *   - DB-backed kontrol fonksiyonu (`auth.ts:398-430`) import edilip
 *     HİÇ çağrılmıyordu ve var olmayan bir tabloyu sorguluyordu.
 *   - Hiçbir tabloda `organization_id` yoktu (42/42).
 *
 * Bu modül, P02'nin implemente edeceği kanonik modeli tanımlar.
 * ADR-002 (OIDC + jose + DB-backed membership), ADR-017 (authorization
 * tek noktadan).
 */

/** Bir principal'ın hangi tür aktör olduğunu belirtir. */
export type PrincipalKind = "user" | "service" | "worker";

/**
 * Organizasyon düzeyinde rol.
 * Kritik: rol TOKEN CLAIM'inden değil, `org_memberships` tablosundan çözülür.
 */
export type OrgRole = "owner" | "admin" | "member" | "viewer";

/** Proje düzeyinde rol. */
export type ProjectRole = "maintainer" | "developer" | "reviewer" | "viewer";

/**
 * Doğrulanmış çağıran.
 *
 * `roles` ve erişilebilir projeler burada TAŞINMAZ — bilerek. Token'a
 * gömülü yetki listesi, token yenilenene kadar bayat kalır ve iptal
 * edilemez. Yetki her istekte `authz` middleware'i tarafından DB'den
 * çözülür (ADR-017).
 */
export interface Principal {
  /** OIDC `sub` claim'i. */
  readonly sub: string;
  /** `users` tablosundaki iç kimlik. */
  readonly userId: string;
  /** Aktif organizasyon. Cross-tenant izolasyonun anahtarı. */
  readonly orgId: string;
  readonly kind: PrincipalKind;
  /** JWT `jti` — replay koruması için (T-14). */
  readonly tokenId: string;
  /** Token'ın geçerlilik sonu (epoch saniye). */
  readonly expiresAt: number;
}

/** Bir kullanıcının organizasyondaki üyeliği. */
export interface OrgMembership {
  readonly orgId: string;
  readonly userId: string;
  readonly role: OrgRole;
  readonly createdAt: string;
}

/** Bir kullanıcının projedeki üyeliği. */
export interface ProjectMembership {
  readonly projectId: string;
  readonly userId: string;
  readonly role: ProjectRole;
  readonly createdAt: string;
}

/**
 * Tek bir istek için çözülmüş erişim kapsamı.
 * `authz` middleware'i bunu üretir; handler'lar ad-hoc kontrol yapmaz.
 */
export interface ProjectScope {
  readonly principal: Principal;
  readonly projectId: string;
  readonly orgId: string;
  readonly role: ProjectRole;
  /** Kararın hangi kaynaktan geldiği — audit ve teşhis için. */
  readonly resolvedFrom: "project_membership" | "org_admin";
}

/**
 * Worker ve agent kimlikleri.
 * İmzasız worker hiçbir job claim edemez (T-15).
 */
export interface ServiceIdentity {
  readonly id: string;
  readonly orgId: string;
  readonly kind: "worker" | "agent" | "integration";
  readonly publicKey: string;
  readonly revokedAt: string | null;
}

/** Yetkilendirme kararı — reddedilme sebebi daima kaydedilir. */
export type AuthzDecision =
  | { readonly allowed: true; readonly scope: ProjectScope }
  | { readonly allowed: false; readonly reason: AuthzDenialReason };

export type AuthzDenialReason =
  | "NO_PRINCIPAL"
  | "TOKEN_EXPIRED"
  | "TOKEN_REVOKED"
  | "ORG_MISMATCH"
  | "NO_PROJECT_MEMBERSHIP"
  | "INSUFFICIENT_ROLE"
  | "POLICY_STORE_UNAVAILABLE";

/**
 * FAIL CLOSED kuralı.
 *
 * Policy/membership deposu erişilemezse karar DAİMA reddir. P00 bulgusu
 * P0-5: mevcut kernel `CI=true` iken statik bir allow listesine düşüyordu.
 */
export const FAIL_CLOSED_DENIAL: AuthzDenialReason = "POLICY_STORE_UNAVAILABLE";

/** Rol hiyerarşisi — sayısal karşılaştırma için. */
const PROJECT_ROLE_RANK: Record<ProjectRole, number> = {
  viewer: 0,
  reviewer: 1,
  developer: 2,
  maintainer: 3
};

export function projectRoleAtLeast(actual: ProjectRole, required: ProjectRole): boolean {
  return PROJECT_ROLE_RANK[actual] >= PROJECT_ROLE_RANK[required];
}

const ORG_ROLE_RANK: Record<OrgRole, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3
};

export function orgRoleAtLeast(actual: OrgRole, required: OrgRole): boolean {
  return ORG_ROLE_RANK[actual] >= ORG_ROLE_RANK[required];
}
