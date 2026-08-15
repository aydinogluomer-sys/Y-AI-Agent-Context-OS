# Tehdit Modeli

> Kaynak: master plan §I (Security Matrix) · spec §28
> Son güncelleme: 2026-08-14 (P17)

Bu belge **ölçülen** durumu bildirir. Bir azaltımın planda yazılı olması
uygulandığı anlamına gelmez; her satırın *Durum* sütunu koddan doğrulanır.

## Durum sözlüğü

| Durum | Anlamı |
|---|---|
| **Uygulandı** | Kod ve birim testi var |
| **Kısmen** | Karar uygulandı, bir parçası dış bağımlılık bekliyor |
| **Bekliyor** | Kod yok |

## Tehditler

| # | Tehdit | Azaltım | Durum | Kanıt |
|---|---|---|---|---|
| T-01 | IDOR | `requireProjectScope` + DB membership | Uygulandı | `apps/api/src/middleware/authz.ts` |
| T-02 | Cross-tenant | Her sorguda org predikatı; traversal'da **iki terimde de** | **Doğrulandı** | `tests/security/tenant-isolation.spec.ts` — canlı DB, köprü kenar saldırısı |
| T-03 | Path traversal | `PathGuard` realpath containment | Uygulandı | `packages/security/src/path-guard/` (48 test) |
| T-04 | Symlink escape | realpath + `lstat` | Uygulandı | aynı |
| T-05 | Prompt injection | Repo içeriği **DATA**; tip düzeyinde kanal ayrımı | Kısmen | `packages/security/src/trust/boundary.ts` — adapter teslimi P11 bekliyor |
| T-06 | Malicious repository | Boyut/derinlik/dosya sayısı limitleri | Uygulandı | `packages/core/src/repo/workspace.ts` |
| T-07 | Secret leakage | Firewall DENY + SecretScanner + redaksiyon | Uygulandı | `packages/security/src/secret-scanner/` (39 test) |
| T-08 | Tool escalation | Tool allow-list, capability negotiation | Kısmen | `packages/adapters/src/types.ts` — canlı sağlayıcı bekliyor |
| T-09 | MCP escalation | Sunucu allow-list + tool filtresi, deny-by-default | Uygulandı | `packages/security/src/mcp/allowlist.ts` (12 test) |
| T-10 | Policy bypass | **FAIL CLOSED**: DENY + security event + degraded | Uygulandı | `apps/api/src/observability/health.ts` |
| T-11 | Approval bypass | Mutation intercept backend'de | Uygulandı | `packages/security/src/change-firewall/` (46 test) |
| T-12 | JWT confusion | `jose` + sabit algoritma + JWKS `kid` | Uygulandı | `apps/api/src/middleware/authn.ts` (24 test) |
| T-13 | JWKS attacks | URI allow-list, TLS, TTL'li cache | Kısmen | aynı — canlı IdP bekliyor |
| T-14 | Replay | `jti` + idempotency key + **kullanılmış nonce deposu** | **Doğrulandı** | `tests/security/replay.spec.ts` — canlı DB, eşzamanlı TOCTOU testi |
| T-15 | Worker impersonation | HMAC imzalı kimlik; **imzasız = DENY** | Uygulandı | `packages/security/src/worker-identity/` (16 test) |
| T-16 | Artifact poisoning | CAS hash doğrulaması + yazan principal | Kısmen | Zincir doğrulandı; artifact yazımı `adapter.start()` bekliyor |
| T-17 | CAS tampering | `content_hash` yeniden hesaplama + append-only | Kısmen | aynı |
| T-18 | Event forgery | Hash chain + append-only trigger | Uygulandı | `packages/security/src/evidence/chain.ts` (30 test) |
| T-19 | Audit actor spoofing | Actor **daima** doğrulanmış principal'dan | Uygulandı | `apps/api/src/domain/identity/evaluation-subject.ts` |
| T-20 | Repository write race | Lock/lease + hash-before/after + atomic write | Uygulandı | `packages/core/src/repo/local-adapter.ts` |
| T-21 | Stale lock | Lease TTL + otomatik release | Uygulandı | `packages/core/src/runtime/queue.ts` |
| T-22 | Command injection | `execFile` + argüman dizisi; **shell yok** | Uygulandı | `packages/core/src/git/git-cli.ts` |
| T-23 | SSRF | URL allow-list, private IP bloğu; `/db/configure` **silindi** | Uygulandı | `packages/core/src/repo/remote-adapter.ts` |
| T-24 | Supply chain | Lockfile pin, tek paket yöneticisi | Kısmen | SBOM yok |

## Bilinen sınırlar

Bu bölüm, kapanmış **görünen** ama kapanmamış olanları sayar.

- **T-14 (replay) KAPANDI.** Kullanılmış nonce deposu eklendi (migration
  0084). Nonce birincil anahtar olduğu için ikinci kullanım veritabanı
  tarafından reddedilir — "önce bak, yoksa yaz" yaklaşımının TOCTOU açığı
  yok. Eşzamanlı üç doğrulamadan tam olarak biri geçiyor.

  **Kalan sınır:** `verifyWorkerCredential` (senkron) nonce tüketmez;
  koruma `verifyWorkerCredentialWithReplayCheck` içinde ve depo gerektirir.
  Depo verilmezse sonuç `replayChecked: false` taşır — sessiz değil.
- **T-05 (prompt injection).** Kanal ayrımı tip düzeyinde uygulanıyor. Ancak
  enjeksiyon **tespiti** bir kapı değildir ve olamaz: kalıp listesi
  eksiksiz olamaz. "Gözlem yok" hiçbir zaman "güvenli" demek değildir.
- **T-16/T-17 (CAS).** Hash doğrulaması yazılı; sonucu canlı Postgres
  olmadan doğrulanamaz.
- Master planın adlandırdığı 18 güvenlik spec'inin **üçü yazıldı** ve
  canlı Postgres'e karşı çalışıyor: `tenant-isolation`, `replay`,
  `evidence-chain`. Kalan 15'i `adapter.start()` ya da HTTP yüzeyi
  gerektiriyor.

- **Zincirin tamamı yeniden yazılırsa** doğrulama geçer. Bu sınır hem
  `chain.test.ts`'te hem `verify:evidence-chain` çıktısında yazılı;
  kapatmak dış bir çıpa gerektirir (imzalı zaman damgası / harici depo).
