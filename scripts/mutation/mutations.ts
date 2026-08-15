/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * P20 / FAZ 1 — MUTASYON KAYITLARI.
 *
 * Her kayit bir iddiadir: "su dosyadaki su predikat kaldirilirsa, su suit
 * KIRILMALIDIR." Kapi bunu dogrular. Suit gecerse mutasyon HAYATTA KALMIS
 * demektir — yani o test yanlis yesildir.
 *
 * ## Neden JSON degil TS
 *
 * `find`/`replace` cok satirli SQL parcalari icerir. JSON'da bunlar `\n`
 * kacisiyla yazilir; bu oturumda kacis dizisi daralmasi uc kez dosya
 * bozdu. Template literal ile metin oldugu gibi durur.
 *
 * **UYARI:** `find` metni `${` icermemeli — template literal onu
 * interpolasyon sanar. traversal.ts icinde `${nextNode}` var; o satirlar
 * bilerek secilmedi.
 */

export interface Mutation {
  /** Kisa kimlik; `--id` ile tek bir mutasyon kosulabilir. */
  readonly id: string;
  /** Depoya gore dosya yolu. */
  readonly file: string;
  /** Dosyada TAM BIR KEZ gecmeli. Sifir = kayit curumus; birden cok = belirsiz. */
  readonly find: string;
  /** Yerine yazilacak metin. Parametre sayisi DEGISMEMELI. */
  readonly replace: string;
  /** Kirilmasi beklenen suit. */
  readonly suite: string;
  /** Ilgili tehdit (varsa). */
  readonly threat?: string;
  /** Bu mutasyonun neyi olctugu. */
  readonly why: string;
}

export const MUTATIONS: readonly Mutation[] = [
  {
    id: "traversal-org-seed",
    file: "packages/graph/src/traversal.ts",
    find: `WHERE n.snapshot_id = $1
    AND n.organization_id = $2
    AND n.node_identifier = ANY($3::text[])`,
    replace: `WHERE n.snapshot_id = $1
    AND ($2 = $2)
    AND n.node_identifier = ANY($3::text[])`,
    suite: "tests/security/tenant-isolation.spec.ts",
    threat: "T-02",
    why: "Seed teriminde org predikati yoksa, baska tenant'in dugumu BASLANGIC noktasi olabilir."
  },
  {
    id: "traversal-org-recursive",
    file: "packages/graph/src/traversal.ts",
    find: `      AND e.organization_id = $2`,
    replace: `      AND ($2 = $2)`,
    suite: "tests/security/tenant-isolation.spec.ts",
    threat: "T-02",
    why: "Ozyinelemede org predikati yoksa, kopru kenar uzerinden baska tenant'a GECILIR."
  },
  {
    id: "traversal-snapshot",
    file: "packages/graph/src/traversal.ts",
    find: `    WHERE e.snapshot_id = $1`,
    replace: `    WHERE ($1 = $1)`,
    suite: "tests/security/tenant-isolation.spec.ts",
    threat: "T-02",
    why: "Snapshot predikati yoksa ESKI bir snapshot'in kenarlari sonuca karisir."
  },
  {
    id: "firewall-deny",
    file: "packages/security/src/context-firewall/universe.ts",
    find: `[...universe.deny, ...universe.approval]`,
    replace: `[...universe.approval]`,
    suite: "tests/integration/retrieval-results.spec.ts",
    threat: "T-05",
    why: "DENY listesi SQL predikatina girmezse yasakli icerik geri doner (ADR-027/029)."
  },
  {
    id: "firewall-secret-filter",
    file: "packages/context/src/retrieval/lexical.ts",
    find: `AND ($7::boolean IS NOT TRUE OR COALESCE(f.contains_secret, FALSE) = FALSE)`,
    replace: `AND ($7::boolean IS NOT TRUE OR TRUE)`,
    suite: "tests/integration/retrieval-results.spec.ts",
    threat: "T-05",
    why: "contains_secret filtresi uygulanmazsa sir tasiyan dosya lexical kanaldan sizar."
  },
  {
    id: "nonce-collision",
    file: "packages/security/src/worker-identity/nonce-store.ts",
    find: `if (result.rowCount === 0) {`,
    replace: `if (result.rowCount === -999) {`,
    suite: "tests/security/replay.spec.ts",
    threat: "T-14",
    why: "Carpisma tespiti yoksa ayni nonce sinirsiz kez kullanilir (tekrar saldirisi)."
  },
  {
    id: "migration-ledger",
    file: "packages/db/src/runner.ts",
    find: `const appliedVersions = new Set<string>(existing.rows.map((r: any) => r.version));`,
    replace: `const appliedVersions = new Set<string>([]);`,
    suite: "tests/integration/migrations.spec.ts",
    why: "Ledger okunmazsa uygulanmis migration TEKRAR uygulanir; idempotency kirilir."
  },
  {
    id: "queue-lease-recovery",
    file: "packages/core/src/runtime/queue.ts",
    find: `OR (status = 'running' AND lease_expires_at < NOW())`,
    replace: `OR (status = 'running' AND FALSE)`,
    suite: "tests/integration/resilience.spec.ts",
    threat: "T-20",
    why: "Lease kurtarmasi yoksa colen worker'in isi SONSUZA KADAR kilitli kalir."
  },
  {
    id: "queue-max-attempts",
    file: "packages/core/src/runtime/queue.ts",
    find: `AND attempt < max_attempts`,
    replace: `AND TRUE`,
    suite: "tests/integration/resilience.spec.ts",
    why: "Deneme siniri yoksa surekli basarisiz olan is sonsuz dongude yeniden alinir."
  },
  {
    id: "lexical-order-by",
    file: "packages/context/src/retrieval/lexical.ts",
    find: `ORDER BY rank DESC, c.id`,
    replace: `ORDER BY c.id`,
    suite: "tests/integration/retrieval-results.spec.ts",
    why: "Siralama kaldirilirsa retrieval 'ilk N'i doner ve alaka duzeyi rastgele olur. Skor dogru hesaplanip ORDER BY unutulmasi sessiz bir bozulmadir."
  },
  {
    id: "semantic-secret-filter",
    file: "packages/context/src/retrieval/semantic.ts",
    find: `AND ($7::boolean IS NOT TRUE OR COALESCE(f.contains_secret, FALSE) = FALSE)`,
    replace: `AND ($7::boolean IS NOT TRUE OR TRUE)`,
    suite: "tests/integration/retrieval-results.spec.ts",
    threat: "T-05",
    why: "Lexical kanalda bu filtre korumasizdi. Ayni predikat semantic kanalda da var; bir kanali kapatip otekini acik birakmak yaygin bir asimetri."
  },
  {
    id: "event-records-append-only",
    file: "migrations/0030_event_store_mvp.sql",
    find: "RAISE EXCEPTION 'Event Store is an append-only ledger. Mutation (UPDATE or DELETE) of event_records is strictly forbidden.';",
    replace: "RETURN COALESCE(NEW, OLD);",
    suite: "tests/security/append-only.spec.ts",
    threat: "T-18",
    why: "Event Store append-only defteri. Trigger engellemezse gecmis olaylar sonradan degistirilebilir."
  },
  {
    id: "context-universes-immutable",
    file: "migrations/0070_context_universes.sql",
    find: "RAISE EXCEPTION 'context_universes degismezdir (ADR-030): bir run''in hangi kurallarla uretildigi kanittir ve sonradan degistirilemez.';",
    replace: "RETURN COALESCE(NEW, OLD);",
    suite: "tests/security/append-only.spec.ts",
    threat: "T-18",
    why: "ADR-030: universe DEGISMEZ. Degistirilebilirse bir run'in hangi kurallarla derlendigi geriye donuk degistirilebilir."
  },
  {
    id: "context-manifests-immutable",
    file: "migrations/0072_context_manifests.sql",
    find: "RAISE EXCEPTION 'context_manifests degismezdir (ADR-034): manifest bir kanittir ve sonradan degistirilemez.';",
    replace: "RETURN COALESCE(NEW, OLD);",
    suite: "tests/security/append-only.spec.ts",
    threat: "T-18",
    why: "ADR-034: manifest bir KANITTIR. Degistirilebilirse hangi baglamin verildigi ispatlanamaz."
  },
  {
    id: "change-boundaries-immutable",
    file: "migrations/0075_change_boundaries.sql",
    find: "RAISE EXCEPTION 'change_boundaries degismezdir (ADR-038): sinir sonradan genisletilemez.';",
    replace: "RETURN COALESCE(NEW, OLD);",
    suite: "tests/security/append-only.spec.ts",
    threat: "T-18",
    why: "ADR-038: sinir sonradan GENISLETILEMEZ. Degistirilebilirse agent yazma iznini kendisi buyutebilir."
  },
  {
    id: "run-events-append-only",
    file: "migrations/0080_run_events.sql",
    find: "RAISE EXCEPTION 'run_events append-only bir zincirdir (ADR-048): gecis kayitlari degistirilemez.';",
    replace: "RETURN COALESCE(NEW, OLD);",
    suite: "tests/security/append-only.spec.ts",
    threat: "T-18",
    why: "ADR-048: her gecis bir olaydir. Degistirilebilirse FSM gecmisi yeniden yazilabilir."
  },
  {
    id: "authz-fail-open",
    file: "apps/api/src/middleware/authz.ts",
    find: "return { allowed: false, reason: \"POLICY_STORE_UNAVAILABLE\" };",
    replace: "return { allowed: true, scope: { principal, projectId, orgId: principal.orgId, role: \"viewer\", resolvedFrom: \"project_membership\" } };",
    suite: "tests/security/fail-closed.spec.ts",
    threat: "T-01",
    why: "Depo erisilemezken ALLOW donmek bir yetki sisteminin en tehlikeli hatasidir cunku SESSIZDIR: hicbir istek reddedilmez, sistem saglikli gorunur."
  },
  {
    id: "authz-org-mismatch",
    file: "apps/api/src/middleware/authz.ts",
    find: "if (row.project_org_id !== principal.orgId) {",
    replace: "if (false) {",
    suite: "tests/security/idor.spec.ts",
    threat: "T-01",
    why: "Cross-tenant kontrolu kalkarsa baska org'un proje id'siyle erisim acilir (IDOR)."
  },
  {
    id: "retry-writes-too",
    file: "apps/api/src/db-retry.ts",
    find: "if (!isConnectionError(error) || !isReadOnlyStatement(sql)) throw error;",
    replace: "if (!isConnectionError(error)) throw error;",
    suite: "apps/api/src/db-retry.test.ts",
    why: "Yazmalari da yeniden denemek SESSIZ CIFT KAYIT uretir: baglanti, ifade CALISTIKTAN sonra kopmus olabilir."
  },
  {
    id: "evidence-append-only",
    file: "migrations/0082_evidence_chain.sql",
    find: `RAISE EXCEPTION 'evidence_chain append-only bir kanit zinciridir: kayitlar degistirilemez ya da silinemez.';`,
    replace: `RETURN COALESCE(NEW, OLD);`,
    suite: "tests/security/evidence-chain.spec.ts",
    threat: "T-18",
    why: "Trigger engellemezse kanit kaydi sonradan degistirilebilir; zincirin varlik sebebi kalkar."
  }
];

/**
 * POZITIF KONTROL — davranisi DEGISTIRMEYEN mutasyon.
 *
 * Her seye "yakalandi" diyen bir harness kendisi yanlis yesildir. Bu kayit
 * yalnizca bir yorum satirini degistirir; suit GECMELIDIR, yani mutasyon
 * HAYATTA KALMALIDIR. Harness bunu "yakalandi" derse harness bozuktur.
 */
export const SELF_TEST: Mutation = {
  id: "self-test-comment",
  file: "packages/graph/src/traversal.ts",
  find: `    -- Dongu tespiti: ziyaret edilmis node'a geri donulmez.`,
  replace: `    -- Dongu tespiti (pozitif kontrol: davranis degismez).`,
  suite: "tests/security/tenant-isolation.spec.ts",
  why: "Yorum degisikligi hicbir davranisi etkilemez; HAYATTA KALMALI."
};
