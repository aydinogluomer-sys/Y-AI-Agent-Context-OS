# Repository Adapter'ları

> spec §5 · ADR-006, ADR-018, ADR-019

## Sözleşme

```
connect · clone · fetch · checkout · listFiles · readFile
gitStatus · gitDiff · changedFiles · currentCommit · branch
repositoryMetadata · disconnect
```

Read-only ve write-capable adapter'lar **ayrı capability setleri** taşır.

## Uygulanmış adapter'lar

| Adapter | Kaynak | Durum |
|---|---|---|
| `LocalRepositoryAdapter` | Yerel dosya sistemi | Uygulandı (41 test) |
| `RemoteRepositoryAdapter` | GitHub, GitLab | Uygulandı (32 test) |

## Güvenlik kuralları

| Kural | Gerekçe |
|---|---|
| Repository kökü **kullanıcı seçmez** (ADR-018) | Kullanıcının seçtiği kök, PathGuard'ın koruduğu sınırı kullanıcıya devretmektir |
| Git komutları `execFile` + argüman dizisi, **shell yok** (ADR-006) | Dosya adındaki `;` veya `$()` kabuk tarafından yorumlanamaz (T-22) |
| Ingestion HTTP isteği içinde **çalışmaz** (ADR-019) | İstek içindeki uzun iş kısmi başarı üretir ve retry'dan yoksundur |
| `writeFile` zorunlu `changeDecision` alır | Kontrolsüz yazım derleme zamanında imkânsız (ADR-039) |
| realpath containment + `lstat` | T-03, T-04 |
| Boyut / derinlik / dosya sayısı limitleri | T-06 |
| hash-before / hash-after | T-20, ADR-041 |

## Yol güvenliği

`PathGuard` her okuma ve yazmada uygulanır. Reddedilen isimler,
uzantılar ve dizinler `packages/security/src/path-guard/` içinde
tanımlıdır ve 48 testle kapsanır.

`changedFiles` git olmayan bir dizinde **`UNSUPPORTED` fırlatır** — sessiz
boş dizi döndürmez. Boş dizi "değişiklik yok" demektir; bu bilgi yokken
onu söylemek yanlış olurdu.
