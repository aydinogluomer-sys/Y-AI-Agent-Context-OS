/**
 * Y-P01-004 (devam) — `migrations/MAPPING.md`'yi dosyalardan yeniden üretir.
 *
 * İlk üretim `extract-migrations.ts` tarafından `db.ts` okunarak yapılmıştı.
 * ADR-003 göçü tamamlandıktan sonra kaynak artık `migrations/*.sql`
 * dosyalarının kendisidir; yeni migration eklendiğinde bu script çalıştırılır.
 *
 * `migrations.test.ts` her migration'ın eşlemede listelendiğini doğrular.
 */

import * as fs from "fs";
import * as path from "path";
import { REPO_ROOT, isMain, rel } from "./lib";
import { loadMigrations } from "../../packages/db/src/loader";

const MIGRATIONS_DIR = path.join(REPO_ROOT, "migrations");
const BASELINE = path.join(REPO_ROOT, "packages", "db", "src", "__fixtures__", "migration-baseline.json");

function main(): void {
  const migrations = loadMigrations(MIGRATIONS_DIR);
  const baselineCount: number = JSON.parse(fs.readFileSync(BASELINE, "utf-8")).count;

  const rows = migrations
    .map((m) => {
      const origin = m.ordinal <= baselineCount ? "ADR-003 göçü" : "yeni";
      const down = m.down ? "var" : "—";
      return `| ${String(m.ordinal).padStart(4, "0")} | \`${m.fileName}\` | \`${m.version}\` | ${origin} | ${down} |`;
    })
    .join("\n");

  const content = `# Migration Eşlemesi

> Üreten: \`scripts/audit/regenerate-migration-mapping.ts\`
> Doğrulayan: \`packages/db/src/migrations.test.ts\`

ADR-003 gereği migration'lar \`apps/api/src/db.ts\` içindeki inline
\`migrationVersions\` dizisinden dosyalara çıkarıldı. İlk ${baselineCount} dosyanın
**SQL içeriği birebir korunmuştur** ve hash'leri
\`packages/db/src/__fixtures__/migration-baseline.json\` içinde dondurulmuştur.

\`schema_migrations\` tablosu eski \`version\` string'lerini tutmaya devam eder.
Runner, dosya adındaki sıra numarasını değil, dosyanın \`-- Ledger version:\`
başlığındaki değeri ledger anahtarı olarak kullanır. Bu sayede halihazırda
migrate edilmiş veritabanları yeniden çalıştırılmaz.

## Kurallar

- Yeni migration'ın numarası, mevcut en büyük numaranın bir fazlasıdır.
- Faz başına ayrılmış numara blokları için master plan Appendix K.1.
- **Yeni her migration için \`-- +down\` bölümü zorunludur.**
- Göç edilen ilk ${baselineCount} dosya **değiştirilemez**; değiştirilirse parite testi kırılır.

## Eşleme

| # | Dosya | Ledger version | Köken | Down |
|---|---|---|---|---|
${rows}

Toplam: **${migrations.length}** migration (${baselineCount} göç + ${migrations.length - baselineCount} yeni).
`;

  fs.writeFileSync(path.join(MIGRATIONS_DIR, "MAPPING.md"), content, "utf-8");
  console.log(`[mapping] ${migrations.length} migration -> ${rel(path.join(MIGRATIONS_DIR, "MAPPING.md"))}`);

  const missingDown = migrations.filter((m) => m.ordinal > baselineCount && !m.down);
  if (missingDown.length > 0) {
    console.error(`[mapping] HATA: yeni migration'larda -- +down eksik:`);
    for (const m of missingDown) console.error(`  ${m.fileName}`);
    process.exit(1);
  }
}

if (isMain(import.meta.url)) {
  main();
}
