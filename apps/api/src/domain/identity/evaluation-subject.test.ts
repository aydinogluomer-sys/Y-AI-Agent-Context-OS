import { describe, it, expect } from "vitest";
import {
  deriveEvaluationSubject,
  bodyDeclaredSubject,
  UnauthenticatedEvaluationError
} from "./evaluation-subject";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

describe("P0-7 — degerlendirme oznesi istekten alinmaz", () => {
  it("ozneyi principal'dan turetir", () => {
    const s = deriveEvaluationSubject({ actorId: "user-42", role: "member" }, "proj-1");
    expect(s.subject_id).toBe("user-42");
    expect(s.project_id).toBe("proj-1");
    expect(s.roles).toEqual(["member"]);
  });

  it("subject_type HER ZAMAN 'user' — sistem kimligi HTTP yuzeyinden alinamaz", () => {
    // P0-7'nin cekirdegi: saldirgan `subject_type: "system"` gondererek
    // "allow / system / hepsi / hepsi" seed policy'sine carpiyordu.
    const s = deriveEvaluationSubject({ actorId: "attacker", role: "viewer" }, "proj-1");
    expect(s.subject_type).toBe("user");
  });

  it("principal yoksa FAIL CLOSED — anonim ozne uydurmaz", () => {
    expect(() => deriveEvaluationSubject(undefined, "proj-1")).toThrow(
      UnauthenticatedEvaluationError
    );
    expect(() => deriveEvaluationSubject({ actorId: "", role: "admin" }, "proj-1")).toThrow(
      UnauthenticatedEvaluationError
    );
  });

  it("proje kapsami yoksa FAIL CLOSED", () => {
    expect(() => deriveEvaluationSubject({ actorId: "u1", role: "admin" }, "")).toThrow(
      UnauthenticatedEvaluationError
    );
  });

  it("govdedeki subject'i tespit eder ki yanit YOK SAYILDIGINI bildirebilsin", () => {
    expect(bodyDeclaredSubject({ subject: { subject_type: "system" } })).toBe(true);
    expect(bodyDeclaredSubject({ resource: {}, action: "read" })).toBe(false);
    expect(bodyDeclaredSubject(null)).toBe(false);
    expect(bodyDeclaredSubject("subject")).toBe(false);
  });
});

describe("P0-7 — handler govdeden ozne yaymiyor (kaynak kilidi)", () => {
  const handlerSource = readFileSync(resolve(HERE, "../../index.ts"), "utf8");

  // Aranan kalibi PARCALARDAN kuruyoruz; aksi halde bu test dosyasinin
  // kendisi tarafta eslesir ve test kendini dogrulamis olurdu.
  const SPREAD_PATTERN = "..." + "subject,";

  it("index.ts icinde `...subject` yayilimi YOK", () => {
    const offenders = handlerSource
      .split("\n")
      .map((line, i) => ({ line: line.trim(), no: i + 1 }))
      // Yorum satirlari haric: eski kalibi ACIKLAYAN yorumlar mesru.
      .filter((l) => !l.line.startsWith("*") && !l.line.startsWith("//"))
      .filter((l) => l.line.includes(SPREAD_PATTERN));

    expect(offenders).toEqual([]);
  });

  it("POZITIF KONTROL: tarama gercekten dosyayi okuyor", () => {
    // Tarama bos bir dize uzerinde calisiyor olsaydi ustteki test de
    // gecerdi. Dosyanin gercekten okundugunu kanitla.
    expect(handlerSource.length).toBeGreaterThan(10000);
    expect(handlerSource).toContain("permissions/evaluate");
  });

  it("POZITIF KONTROL: kalip gercek bir metinde eslesiyor", () => {
    expect(`subject: { ${SPREAD_PATTERN} project_id: x }`).toContain(SPREAD_PATTERN);
  });
});
