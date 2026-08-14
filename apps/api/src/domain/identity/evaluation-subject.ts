/**
 * P17 / P0-7 — Yetki degerlendirmesinde KIMLIK TUREVI.
 *
 * P00 Truth Audit bulgusu (`index.ts:4402`):
 *
 *     subject: { ...subject, project_id: projectId }
 *
 * Istemcinin govdede gonderdigi `subject` nesnesi oldugu gibi yayiliyordu.
 * Bir istemci `subject_type: "system"` gonderip sistem kimligiyle
 * degerlendirme yaptirabiliyor, seed policy "allow / system / hepsi / hepsi"
 * oldugu icin sonuc her zaman ALLOW oluyor ve audit kaydi da o sahte
 * kimlikle yaziliyordu.
 *
 * ADR-017: yetki tek noktadan verilir ve audit aktoru HER ZAMAN dogrulanmis
 * principal'dir. Bir istemcinin kendi kimligini bildirmesine izin vermek,
 * kimlik dogrulamasini istemciye devretmektir.
 *
 * Bu modul, kimlik turevini HTTP katmanindan ayirir; boylece degismez
 * ("istekten kimlik alinmaz") bir testle kilitlenebilir. Handler icinde
 * inline birakilsaydi, ancak calisan bir sunucu ile dogrulanabilirdi.
 */

/** Principal'in bu turev icin ihtiyac duyulan ALT KUMESI. */
export interface EvaluationPrincipal {
  readonly actorId: string;
  readonly role: string;
}

export interface EvaluationSubject {
  readonly subject_type: "user";
  readonly subject_id: string;
  readonly project_id: string;
  // Dizi icerigi readonly DEGIL: PermissionSubjectDTO.roles mutable bekliyor.
  // Paylasilan DTO'yu degistirmek yerine burada uyum sagliyoruz; her cagri
  // zaten YENI bir dizi dondurdugu icin paylasilan durum riski yok.
  readonly roles: string[];
}

export class UnauthenticatedEvaluationError extends Error {
  readonly code = "UNAUTHENTICATED";
  constructor() {
    super("Yetki degerlendirmesi dogrulanmis principal olmadan yapilamaz.");
    this.name = "UnauthenticatedEvaluationError";
  }
}

/**
 * Degerlendirme oznesini YALNIZCA dogrulanmis principal'dan ve dogrulanmis
 * proje kapsamindan turetir.
 *
 * Fonksiyon istek govdesini PARAMETRE OLARAK BILE ALMAZ. Govde erisimi
 * olmayan bir fonksiyon, govdeden kimlik sizdiramaz — bu, "govdeyi okuma"
 * disiplinini bir yoruma degil, imzaya baglar.
 *
 * `subject_type` SABIT `"user"`: bu yol yalniz kullanici degerlendirmesi
 * yapar. Sistem kimligiyle degerlendirme sunucu ici cagri yollarina aittir
 * ve HTTP yuzeyinden erisilebilir olmamalidir.
 */
export function deriveEvaluationSubject(
  principal: EvaluationPrincipal | undefined,
  projectId: string
): EvaluationSubject {
  // Principal yoksa FAIL CLOSED. Anonim bir ozne uydurmak, kimliksiz istegin
  // bir policy karari almasina izin vermek olurdu.
  if (!principal || !principal.actorId) {
    throw new UnauthenticatedEvaluationError();
  }
  if (!projectId) {
    throw new UnauthenticatedEvaluationError();
  }

  return {
    subject_type: "user",
    subject_id: principal.actorId,
    project_id: projectId,
    roles: [principal.role]
  };
}

/**
 * Govdede `subject` gonderildi mi? Cagiran bunu yanitta bildirir.
 *
 * Sessizce yok saymak, cagiranin gonderdigi kimligin UYGULANDIGINI sanmasina
 * yol acar — ve bir gun o varsayimla guvenlik karari verilir.
 */
export function bodyDeclaredSubject(body: unknown): boolean {
  return typeof body === "object" && body !== null && "subject" in body;
}
