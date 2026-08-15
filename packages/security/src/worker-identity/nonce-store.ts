/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * P19 / T7 — T-14 TEKRAR SALDIRISI: KULLANILMIŞ NONCE DEPOSU.
 *
 * P17'de worker kimliği imzalandı (T-15) ve her kimlik benzersiz bir
 * `nonce` taşımaya başladı. Ama nonce **saklanmıyordu**: aynı token TTL
 * süresince (≤1 saat) sınırsız kez kullanılabiliyordu.
 *
 * `identity.test.ts` bu sınırı açıkça kayıt altına almıştı — bu modül o
 * kaydı kapatır.
 *
 * ## Karar: INSERT çarpışması, SELECT-sonra-INSERT DEĞİL
 *
 * Doğal görünen yaklaşım "önce baktım, yoksa yazdım"dır. Bu **TOCTOU**
 * açığıdır: iki eşzamanlı istek de "kullanılmamış" görür, ikisi de yazar,
 * ikisi de kabul edilir — tam olarak engellemesi gereken durum.
 *
 * Nonce birincil anahtar olduğu için ikinci `INSERT` **veritabanı
 * tarafından** reddedilir. Yarış, tek bir atomik işleme indirgenir.
 *
 * ## Karar: enjekte edilebilir, zorunlu değil
 *
 * `verifyWorkerCredential` nonce deposunu **opsiyonel** alır. Zorunlu
 * yapmak, deposu olmayan her çağrı yerini (birim testleri, süreç içi
 * doğrulama) veritabanına bağlardı.
 *
 * Ama opsiyonel olması sessiz bir zaafa dönüşmesin diye: depo verilmezse
 * dönen sonuç `replayChecked: false` taşır. Çağıran, tekrar korumasının
 * uygulanıp uygulanmadığını **bilebilir**.
 */

export interface NonceStoreDb {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

export interface NonceRecord {
  readonly nonce: string;
  readonly workerId: string;
  readonly expiresAt: Date;
}

export class NonceReplayError extends Error {
  readonly code = "NONCE_REPLAY";
  constructor(readonly nonce: string) {
    super(
      `Worker kimligi TEKRAR kullanildi (nonce: ${nonce.slice(0, 8)}...). ` +
        "Her kimlik yalniz bir kez kullanilabilir (T-14)."
    );
    this.name = "NonceReplayError";
  }
}

export interface NonceStore {
  /**
   * Nonce'u tüketir.
   *
   * @throws {NonceReplayError} nonce daha önce kullanıldıysa.
   */
  consume(record: NonceRecord): Promise<void>;
  /** Süresi dolmuş kayıtları siler; silinen sayıyı döndürür. */
  purgeExpired(now?: Date): Promise<number>;
}

export class PostgresNonceStore implements NonceStore {
  constructor(private readonly db: NonceStoreDb) {}

  async consume(record: NonceRecord): Promise<void> {
    /*
     * `ON CONFLICT DO NOTHING` + `rowCount` kontrolu.
     *
     * Hata firlatmasini beklemek yerine carpismayi SESSIZ yapip satir
     * sayisina bakmak, hata mesaji ayristirmaktan saglamdir: farkli
     * Postgres surumleri farkli mesaj uretebilir ama rowCount degismez.
     */
    const result = await this.db.query(
      `INSERT INTO used_worker_nonces (nonce, worker_id, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (nonce) DO NOTHING;`,
      [record.nonce, record.workerId, record.expiresAt.toISOString()]
    );

    if (result.rowCount === 0) {
      throw new NonceReplayError(record.nonce);
    }
  }

  async purgeExpired(now: Date = new Date()): Promise<number> {
    // Suresi dolmus bir nonce'u tutmanin degeri yok: onu tasiyan token
    // zaten `EXPIRED` ile reddedilir.
    const result = await this.db.query(
      "DELETE FROM used_worker_nonces WHERE expires_at < $1;",
      [now.toISOString()]
    );
    return result.rowCount ?? 0;
  }
}

/**
 * Bellek içi depo — YALNIZ TEK SÜREÇ.
 *
 * Test ve tek örnekli yerel geliştirme için. Üretimde kullanılamaz:
 * Y birden çok API örneği ve worker çalıştırdığında, bir örnekte
 * kullanılmış nonce diğerinde hâlâ geçerli görünür — koruma yatay
 * ölçeklendiğinde **sessizce kaybolur**.
 *
 * Bu sınır adında ve burada yazılı; gizli değil.
 */
export class InMemoryNonceStore implements NonceStore {
  private readonly used = new Map<string, Date>();

  async consume(record: NonceRecord): Promise<void> {
    if (this.used.has(record.nonce)) {
      throw new NonceReplayError(record.nonce);
    }
    this.used.set(record.nonce, record.expiresAt);
  }

  async purgeExpired(now: Date = new Date()): Promise<number> {
    let removed = 0;
    for (const [nonce, expiresAt] of this.used) {
      if (expiresAt < now) {
        this.used.delete(nonce);
        removed++;
      }
    }
    return removed;
  }

  size(): number {
    return this.used.size;
  }
}
