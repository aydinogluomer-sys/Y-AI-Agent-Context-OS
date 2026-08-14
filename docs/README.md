# Belgeler

## Mimari ve karar

| Belge | İçerik |
|---|---|
| [ADR dizini](adr/README.md) | 51 mimari karar kaydı; kodda atıf yapılan her ADR burada |
| [Mimari](architecture-and-design/architecture-index.md) | Sistem şeması |
| [Context Compiler](architecture-and-design/context-compiler.md) | Bütçe, determinizm, chunk sınırı |

## Güvenlik

| Belge | İçerik |
|---|---|
| [Güvenlik modeli](security/security-model.md) | Katmanlar ve değişmezler |
| [Tehdit modeli](security/threat-model.md) | 24 tehdit, azaltım ve **ölçülen durum** |
| [Policy dili](security/policy-language.md) | ALLOW / APPROVAL / DENY, glob, MCP |
| [Kanıt modeli](security/evidence-model.md) | Manifest, hash zinciri, determinizm |

## Adapter'lar

| Belge | İçerik |
|---|---|
| [Agent adapter'ları](adapters/agent-adapters.md) | Sözleşme, kurallar, **durum** |
| [Repository adapter'ları](adapters/repository-adapters.md) | Local, GitHub, GitLab |

## Operasyon

| Belge | İçerik |
|---|---|
| [Yerel geliştirme](operations/local-development.md) | Kurulum, ortam değişkenleri |
| [Dağıtım](operations/deployment.md) | Biçimler, konfigürasyon, sırlar |
| [Operasyon](operations/operations.md) | Sağlık uçları, metrikler, log'lar |
| [Olay müdahalesi](operations/incident-response.md) | Sınıflandırma ve ilk aksiyonlar |
| [Yedekleme](operations/backup-restore.md) | Ne yedeklenir, nasıl dönülür |
| [Sürüm yükseltme](operations/upgrade.md) | Migration modeli |

## API

| Belge | İçerik |
|---|---|
| [API yüzeyi](api/api-surface.md) | Kanonik `/api/v1`, silinen uçlar |

## Plan ve kabul

| Belge | İçerik |
|---|---|
| [Master plan](Y_FINAL_PRODUCTION_IMPLEMENTATION_MASTER_PLAN.md) | 21 faz |
| [Kabul raporu](Y_FINAL_ACCEPTANCE_REPORT.md) | **Ne yapıldı, ne yapılmadı** |
| [Truth Audit](audit/2026-08-13-truth-audit/) | P00 envanterleri |

---

**Bu belgeler ölçülen durumu bildirir.** Bir yeteneğin planda yazılı
olması uygulandığı anlamına gelmez; her belge kendi sınırlarını açıkça
yazar. Belge ile kod çelişirse **kod esastır** (spec §0).
