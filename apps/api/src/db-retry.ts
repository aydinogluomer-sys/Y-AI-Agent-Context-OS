/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * P21/5 — BAGLANTI KOPMASINDA YENIDEN DENEME.
 *
 * ## Bulgu
 *
 * P20/Faz 3'te olculdu: node-postgres havuzu SEFFAF TOPARLANMIYOR.
 * Sunucu baglantilari koparsa (DB yeniden baslatma, failover, idle
 * timeout) havuz OLMUS bir istemciyi geri verebiliyor ve sorgu
 * "terminating connection due to administrator command" ile duser.
 * Sonraki sorgu calisir — yani kayip TEK bir istektir.
 *
 * Test o davranisi kayda gecirdi ama URETIMDE bir sey degismemisti.
 * Bu dosya o borcu kapatir.
 *
 * ## KRITIK: yalnizca OKUMA yeniden denenir
 *
 * Baglanti koptugunda iki durum ayirt EDILEMEZ:
 *
 *   a) ifade sunucuya hic ulasmadi
 *   b) ifade CALISTI ama yanit donerken baglanti koptu
 *
 * (b) durumunda bir INSERT'i yeniden denemek IKINCI KEZ yazar. Sessiz
 * cift kayit, dusen bir istekten cok daha kotudur: hata gorunur,
 * bozulmus veri gorunmez.
 *
 * Bu yuzden yeniden deneme YALNIZCA salt-okunur ifadelerde yapilir.
 * Yazmalar oldugu gibi firlatilir ve cagiran karar verir (idempotency
 * anahtari olan yazmalar zaten guvenle tekrarlanabilir — ama bu karar
 * BURADA verilemez).
 */

/** Baglanti duzeyinde, yani ifadeyle ilgisi olmayan hatalar. */
const CONNECTION_ERROR =
  /terminating connection|Connection terminated|socket hang up|ECONNRESET|server closed the connection/i;

/**
 * Ifade salt-okunur mu?
 *
 * Bastaki bosluk ve `--` yorum satirlari atlanir. CTE'ler (`WITH ...`)
 * BILEREK salt-okunur SAYILMAZ: `WITH ... INSERT` gecerli bir yazma
 * ifadesidir ve ayirt etmek icin SQL ayristirmak gerekirdi. Supheli
 * durumda yeniden DENEMEMEK dogru taraftir.
 */
export function isReadOnlyStatement(sql: string): boolean {
  const stripped = sql.replace(/^\s*(--[^\n]*\n|\s)*/, "");
  return /^select\b/i.test(stripped);
}

export function isConnectionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return CONNECTION_ERROR.test(message);
}

export interface QueryResultLike {
  rows: any[];
  rowCount: number | null;
}

/**
 * Salt-okunur sorguyu baglanti hatasinda BIR KEZ yeniden dener.
 *
 * Bir kez, cunku havuz olmus istemciyi ilk hatada atar; ikinci deneme
 * yeni bir baglanti alir. Israrli bir dongu, gercekten dusmus bir
 * veritabaninda istegi asili birakirdi — fail-closed davranisini
 * geciktirmek de bir zarardir.
 */
export async function queryWithReadRetry(
  run: (sql: string, params: unknown[]) => Promise<QueryResultLike>,
  sql: string,
  params: unknown[] = []
): Promise<QueryResultLike> {
  try {
    return await run(sql, params);
  } catch (error) {
    if (!isConnectionError(error) || !isReadOnlyStatement(sql)) throw error;
    return await run(sql, params);
  }
}
