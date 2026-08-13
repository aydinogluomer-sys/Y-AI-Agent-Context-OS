/**
 * P01 / Y-P01-005 — Migration dosya yükleyicisi.
 *
 * `migrations/NNNN_slug.sql` dosyalarını okur, `-- +up` / `-- +down`
 * bölümlerine ayırır ve `MAPPING.md`'den ledger version'ını çözer.
 *
 * Ledger anahtarı dosya adı DEĞİL, `-- Ledger version:` başlığındaki
 * string'tir. Bu, ADR-003 göçünün mevcut veritabanlarını etkilememesini
 * sağlar: halihazırda `1.0.0-projects-foundation` uygulanmış bir DB,
 * `0001_projects_foundation.sql`'i yeniden çalıştırmaz.
 */

import * as fs from "fs";
import * as path from "path";

export interface LoadedMigration {
  /** Dosya adındaki sıra numarası (0001, 0002, ...). */
  ordinal: number;
  /** `schema_migrations` tablosunda kullanılan anahtar. */
  version: string;
  fileName: string;
  up: string;
  down: string | null;
}

const HEADER_VERSION_RE = /^--\s*Ledger version:\s*(.+)$/m;
const FILE_RE = /^(\d{4})_([a-z0-9_]+)\.sql$/;

export class MigrationLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationLoadError";
  }
}

/** `-- +up` ve `-- +down` bölümlerini ayırır. */
export function splitDirections(content: string): { up: string; down: string | null } {
  const upIdx = content.indexOf("-- +up");
  if (upIdx === -1) {
    throw new MigrationLoadError("Migration dosyasinda '-- +up' bolumu yok.");
  }
  const downIdx = content.indexOf("-- +down", upIdx);

  const up = (downIdx === -1 ? content.slice(upIdx + "-- +up".length) : content.slice(upIdx + "-- +up".length, downIdx)).trim();

  if (downIdx === -1) return { up, down: null };

  const downRaw = content.slice(downIdx + "-- +down".length).trim();
  // Yalnız yorum satırlarından oluşuyorsa down script'i yok demektir.
  const meaningful = downRaw
    .split("\n")
    .filter((l) => l.trim().length > 0 && !l.trim().startsWith("--"))
    .join("\n")
    .trim();

  return { up, down: meaningful.length > 0 ? meaningful : null };
}

export function loadMigrations(migrationsDir: string): LoadedMigration[] {
  if (!fs.existsSync(migrationsDir)) {
    throw new MigrationLoadError(`Migration dizini bulunamadi: ${migrationsDir}`);
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const out: LoadedMigration[] = [];
  const seenOrdinals = new Set<number>();
  const seenVersions = new Set<string>();

  for (const fileName of files) {
    const fm = FILE_RE.exec(fileName);
    if (!fm) {
      throw new MigrationLoadError(
        `Gecersiz migration dosya adi: ${fileName}. Beklenen bicim: NNNN_slug.sql`
      );
    }
    const ordinal = Number.parseInt(fm[1], 10);
    if (seenOrdinals.has(ordinal)) {
      throw new MigrationLoadError(`Cakisan migration sira numarasi: ${fm[1]} (${fileName})`);
    }
    seenOrdinals.add(ordinal);

    const content = fs.readFileSync(path.join(migrationsDir, fileName), "utf-8");
    const vm = HEADER_VERSION_RE.exec(content);
    if (!vm) {
      throw new MigrationLoadError(`${fileName}: '-- Ledger version:' basligi yok.`);
    }
    const version = vm[1].trim();
    if (seenVersions.has(version)) {
      throw new MigrationLoadError(`Cakisan ledger version: ${version} (${fileName})`);
    }
    seenVersions.add(version);

    const { up, down } = splitDirections(content);
    if (up.length === 0) {
      throw new MigrationLoadError(`${fileName}: '-- +up' bolumu bos.`);
    }

    out.push({ ordinal, version, fileName, up, down });
  }

  return out;
}
