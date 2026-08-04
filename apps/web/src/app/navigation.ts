/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  Cpu, 
  Layers, 
  ShieldAlert, 
  Network,
  Lock,
  Sliders,
  History,
  FileText,
  BadgeAlert,
  SlidersHorizontal,
  FolderOpen,
  Database,
  Layout,
  Users,
  Compass,
  Eye,
  Server,
  RefreshCw,
  BarChart2,
  CheckSquare,
  GitBranch,
  Terminal,
  HelpCircle,
  HardDrive,
  Settings,
  Shield,
  Search,
  Activity,
  FileCode,
  AlertTriangle
} from "lucide-react";

export type TabId = 
  // Implemented real panels
  | "chat-cockpit"
  | "project-dashboard"
  | "worker-runtime"
  | "artifact-center"
  | "permission-kernel"
  | "evidence-store"
  | "event-journal"
  | "file-locks"
  | "quality-gate-report"
  | "impact-analysis"
  | "index-job-orchestrator"
  // Placeholders - Mission Control
  | "active-project"
  | "system-health"
  | "token-budget-status"
  | "cost-compression-chart"
  // Placeholders - Projects & Workspace
  | "projects"
  | "memberships"
  | "scoped-paths"
  | "repo-adapter"
  | "file-explorer"
  | "allowed-paths"
  | "workspace-boundaries"
  // Placeholders - Context OS
  | "context-objects"
  | "context-items"
  | "context-chunks"
  | "context-pack-builder"
  | "compression-ratios"
  | "segment-ranking"
  | "context-registry"
  | "context-export"
  // Placeholders - Graph Intelligence
  | "ast-map"
  | "dependency-graph"
  | "symbol-index"
  | "import-export-resolver"
  | "impact-radius"
  | "incremental-index"
  | "syntax-recovery"
  // Placeholders - Artifact CAS
  | "workspace-files"
  | "cas-blobs"
  | "dedup-chunks"
  | "hash-verification"
  | "integrity-audit"
  | "quarantine"
  // Placeholders - Task Lifecycle
  | "task-board"
  | "backlog"
  | "active-tasks"
  | "verified-tasks"
  | "closed-tasks"
  | "fsm-transitions"
  // Placeholders - Agent Network
  | "dispatcher-agent"
  | "context-builder-agent"
  | "developer-agent"
  | "qa-agent"
  | "director-agent"
  | "session-checkpoints"
  | "continuation-handoff"
  | "chronological-autochecks"
  // Placeholders - Security Kernel
  | "abac-matrix"
  | "role-policies"
  | "human-approval-gate"
  | "path-traversal-guard"
  | "secret-redactor"
  | "default-deny-rules"
  | "read-only-policies"
  // Placeholders - Evidence & Audit
  | "event-store"
  | "evidence-health-gauge"
  | "corruption-reports"
  | "cryptographic-ledger"
  | "signed-logs"
  // Placeholders - Worker Runtime
  | "index-sync"
  | "git-tracking"
  | "ast-compilation-jobs"
  | "load-metrics"
  | "runtime-telemetry"
  // Placeholders - Database & Migrations
  | "db-status"
  | "supabase-pool-manager"
  | "migrations"
  | "schema-browser"
  | "dev-reset-utility"
  | "public-tables"
  // Placeholders - Providers & Connectors
  | "model-routing"
  | "google-sdk-adapter"
  | "saas-sync-states"
  | "credential-stubs"
  | "connect-center"
  // Placeholders - QA & Validation
  | "test-runner"
  | "deterministic-tests"
  | "db-integration-tests"
  | "secret-scan"
  | "debug-tag-gate"
  | "manual-qa-checklist"
  | "stage-27-validation"
  | "stage-28-validation"
  | "stage-29-validation"
  | "stage-30-validation"
  | "stage-31-validation"
  | "stage-32-validation"
  | "stage-33-validation"
  | "stage-34-validation"
  | "stage-35-validation"
  // Placeholders - Documentation
  | "architecture-index"
  | "architecture-schema"
  | "kernel-explanation"
  | "context-execution-plan"
  | "ui-accessibility-notes"
  | "quality-gates"
  | "manual-qa"
  | "implementation-log"
  // Placeholders - Governance / Kernel Debt
  | "kernel-awareness-note"
  | "kernel-debt-register"
  | "permission-kernel-audit"
  | "human-review-requirements"
  | "release-sign-off";

export interface NavigationItem {
  id: TabId;
  label: string;
  route: string;
  description: string;
  status: "implemented" | "placeholder";
  icon: any;
}

export interface NavigationCategory {
  id: string;
  label: string;
  items: NavigationItem[];
}

export const NAVIGATION_CATEGORIES: NavigationCategory[] = [
  {
    id: "mission-control",
    label: "Görev Kontrol (Mission Control)",
    items: [
      { id: "chat-cockpit", label: "Sohbet Kokpiti", route: "/chat", description: "Y-OS Çekirdek AI ajan sohbet kokpiti", status: "implemented", icon: Terminal },
      { id: "project-dashboard", label: "AI Görev Kontrolü", route: "/dashboard", description: "Yüksek doğruluklu yapay zeka durum telemetrisi HUD paneli", status: "implemented", icon: Cpu },
      { id: "active-project", label: "Aktif Proje", route: "/active-project", description: "Şu anda aktif olan çalışma alanı koordinatları", status: "implemented", icon: FolderOpen },
      { id: "system-health", label: "Sistem Sağlığı", route: "/system-health", description: "Küresel motor yaşamsal belirtileri izleme monitörü", status: "implemented", icon: Activity },
      { id: "token-budget-status", label: "Token Bütçe Durumu", route: "/budget", description: "Gerçek zamanlı bağlam paketleme token göstergeleri", status: "implemented", icon: Sliders },
      { id: "cost-compression-chart", label: "Maliyet ve Sıkıştırma", route: "/cost-chart", description: "Compactor maliyet analizi grafik ve tabloları", status: "implemented", icon: BarChart2 }
    ]
  },
  {
    id: "projects-workspace",
    label: "Projeler ve Çalışma Alanı",
    items: [
      { id: "projects", label: "Projeler Kaydı", route: "/projects", description: "Çalışma alanı proje tanımları veritabanı", status: "implemented", icon: FolderOpen },
      { id: "memberships", label: "Üyelik Yetkilendirmeleri", route: "/memberships", description: "Kullanıcı rol parametreleri ve yetki sınırları eşleşmesi", status: "implemented", icon: Users },
      { id: "scoped-paths", label: "Kapsam Belirlenmiş Yollar", route: "/scoped-paths", description: "Erişim sınırı olan klasörlerin kısıtlamaları", status: "implemented", icon: Compass },
      { id: "repo-adapter", label: "Repo Adaptör Motoru", route: "/repo-adapter", description: "Düşük seviyeli çalışma alanı dosya sürücüleri", status: "implemented", icon: Server },
      { id: "file-explorer", label: "Dosya Gezgini", route: "/explorer", description: "Etkileşimli dizin tarayıcı arayüzü", status: "implemented", icon: FolderOpen },
      { id: "allowed-paths", label: "İzin Verilen Yollar", route: "/allowed-paths", description: "Geliştirici görev yazma dizinleri beyaz listesi (Whitelist)", status: "implemented", icon: Lock },
      { id: "workspace-boundaries", label: "Çalışma Alanı Sınırları", route: "/boundaries", description: "Mantıksal yürütme limitleri kısıtlamaları", status: "implemented", icon: Shield }
    ]
  },
  {
    id: "context-os",
    label: "Context OS (Bağlam OS)",
    items: [
      { id: "index-job-orchestrator", label: "Dizin İşi Orkestratörü", route: "/index-jobs", description: "Dizin oluşturma kuyruğu izleme ekranı", status: "implemented", icon: FolderOpen },
      { id: "context-objects", label: "Bağlam Nesneleri", route: "/ctx-objects", description: "Normalize edilmiş kaynak kod nesneleri kataloğu", status: "implemented", icon: Database },
      { id: "context-items", label: "Bağlam Öğeleri", route: "/ctx-items", description: "Kaynak tamponları eşleme meta verileri", status: "implemented", icon: FileText },
      { id: "context-chunks", label: "Bağlam Parçaları (Chunks)", route: "/ctx-chunks", description: "Hesaplanmış hash ve token metrikleri listesi", status: "implemented", icon: Layers },
      { id: "context-pack-builder", label: "50K Bağlam Paketi Oluşturucu", route: "/pack-builder", description: "Ajan modelleri için bağlam derleyici motoru", status: "implemented", icon: Cpu },
      { id: "compression-ratios", label: "Sıkıştırma Oranları", route: "/ratios", description: "Compactor dosya ölçeklendirme göstergeleri", status: "implemented", icon: BarChart2 },
      { id: "segment-ranking", label: "Segment Sıralaması", route: "/ranking", description: "Bağımlılık ağırlığına göre benzerlik puanı sıralayıcısı", status: "implemented", icon: Sliders },
      { id: "context-registry", label: "Bağlam Sicili", route: "/registry", description: "Obsidian hafıza kasası kayıt kütüphanesi", status: "implemented", icon: Database },
      { id: "context-export", label: "Bağlam Dışa Aktarma", route: "/export", description: "Derlenmeye hazır segment dışa aktarma sihirbazı", status: "implemented", icon: FileText }
    ]
  },
  {
    id: "graph-intelligence",
    label: "Grafik Zekası (Graph)",
    items: [
      { id: "impact-analysis", label: "Etki Analizi Paneli", route: "/impact-analysis", description: "AST modül bağımlılıkları etki yarıçapı tarayıcısı", status: "implemented", icon: Layers },
      { id: "ast-map", label: "AST Haritası", route: "/ast-map", description: "ES modülü import/export bağlantıları görselleştiricisi", status: "implemented", icon: Network },
      { id: "dependency-graph", label: "Bağımlılık Grafiği", route: "/dependency-graph", description: "Etkileşimli çalışma alanı mantıksal ilişki grafiği", status: "implemented", icon: Network },
      { id: "symbol-index", label: "Sembol Dizini", route: "/symbols", description: "Çıkartılmış değişken ve sınıf token'ları kataloğu", status: "implemented", icon: Search },
      { id: "import-export-resolver", label: "İthalat/İhracat Çözücü", route: "/resolver", description: "Dosya bağlantı eşlemeleri ve bağımlılık ayrıştırıcısı", status: "implemented", icon: Compass },
      { id: "impact-radius", label: "Etki Yarıçapı", route: "/radius", description: "Değişiklik yayılma tahmini derleyici motoru", status: "implemented", icon: Layers },
      { id: "incremental-index", label: "Artımlı Dizinleme", route: "/incremental-idx", description: "Dinamik dosya değişiklikleri eşitleyicisi", status: "implemented", icon: RefreshCw },
      { id: "syntax-recovery", label: "Sözdizimi Kurtarma", route: "/recovery", description: "Hatalı kaynak dosyalar için AST yedek derleyicisi", status: "implemented", icon: HelpCircle }
    ]
  },
  {
    id: "artifact-cas",
    label: "Artefakt CAS (Depolama)",
    items: [
      { id: "artifact-center", label: "Artefakt Merkezi CAS", route: "/artifacts", description: "İçerik Adreslemeli Depolama (CAS) yöneticisi", status: "implemented", icon: Layers },
      { id: "workspace-files", label: "Çalışma Alanı Dosyaları", route: "/ws-files", description: "Hazırlanmış uygulama kaynakları kataloğu", status: "implemented", icon: FolderOpen },
      { id: "cas-blobs", label: "CAS İkili Verileri (Blobs)", route: "/blobs", description: "Benzersiz şekilde indekslenmiş ikili CAS veri blokları", status: "implemented", icon: Database },
      { id: "dedup-chunks", label: "Tekilleştirilmiş Parçalar", route: "/dedup", description: "Dosya altı bayt seviyesinde eşlenmiş segmentler", status: "implemented", icon: Layers },
      { id: "hash-verification", label: "Hash Doğrulama", route: "/hash-verify", description: "SHA-256 bütünlük doğrulayıcı test motoru", status: "implemented", icon: CheckSquare },
      { id: "integrity-audit", label: "Bütünlük Denetimi", route: "/integrity-audit", description: "CAS bozulma ve tarama raporlama aracı", status: "implemented", icon: ShieldAlert },
      { id: "quarantine", label: "Karantina Kayıtları", route: "/quarantine", description: "Paketlenememiş bozuk veya engellenmiş dosyalar listesi", status: "implemented", icon: AlertTriangle }
    ]
  },
  {
    id: "task-lifecycle",
    label: "Görev Yaşam Döngüsü",
    items: [
      { id: "file-locks", label: "Dosya Kilitleri ve Kiraları", route: "/file-locks", description: "Kilit mekanizması ve yazma kiralamaları paneli", status: "implemented", icon: Lock },
      { id: "task-board", label: "Görev Panosu (Task Board)", route: "/tasks", description: "FSM adımları görev yaşam döngüsü panosu", status: "implemented", icon: Layout },
      { id: "backlog", label: "Yapılacaklar Kuyruğu", route: "/backlog", description: "Ön analizi yapılmış proje görev kuyruğu", status: "implemented", icon: Sliders },
      { id: "active-tasks", label: "Aktif Görevler", route: "/active-tasks", description: "Şu anda çalışan AI ajan süreçleri izleyicisi", status: "implemented", icon: SlidersHorizontal },
      { id: "verified-tasks", label: "Doğrulanmış Görevler", route: "/verified", description: "Tamamlanmış ve testlerden geçmiş hedefler", status: "implemented", icon: CheckSquare },
      { id: "closed-tasks", label: "Kapatılmış Görevler", route: "/closed", description: "Arşivlenmiş adli günlük (audit) kayıtları", status: "implemented", icon: History },
      { id: "fsm-transitions", label: "FSM Durum Geçişleri", route: "/fsm", description: "Görev durum makinesi geçiş logları akışı", status: "implemented", icon: RefreshCw }
    ]
  },
  {
    id: "agent-network",
    label: "Yapay Zeka Ajan Ağı",
    items: [
      { id: "dispatcher-agent", label: "Yönlendirici Ajan (Dispatcher)", route: "/dispatcher", description: "Görev analizi ve koordinasyon ajanı stüdyosu", status: "implemented", icon: Cpu },
      { id: "context-builder-agent", label: "Bağlam Yapılandırıcı Ajan", route: "/ctx-builder", description: "Kod tabanını sıkıştırıp bağlam paketi hazırlayan ajan", status: "implemented", icon: Cpu },
      { id: "developer-agent", label: "Geliştirici Ajan (Developer)", route: "/developer", description: "İzinli yollarda kod değişiklikleri yapan ajan", status: "implemented", icon: Cpu },
      { id: "qa-agent", label: "QA Test Ajanı", route: "/qa-agent", description: "İzole alanda testleri ve güvenlik taramasını çalıştıran ajan", status: "implemented", icon: Cpu },
      { id: "director-agent", label: "Yönetici Ajan (Director)", route: "/director", description: "Kanıtları denetleyen ve sürüm imzalayan yönetici ajan", status: "implemented", icon: Cpu },
      { id: "session-checkpoints", label: "Oturum Denetim Noktaları", route: "/checkpoints", description: "Süreç izleme denetim noktaları geçmişi", status: "implemented", icon: History },
      { id: "continuation-handoff", label: "Devamlılık Handoff Dosyası", route: "/handoff", description: "Ajanlar arası durum aktarım bellek paketi", status: "implemented", icon: RefreshCw },
      { id: "chronological-autochecks", label: "Otomatik Zamanlanmış Kontroller", route: "/autochecks", description: "Zamanlanmış otonom doğrulama adımları listesi", status: "implemented", icon: CheckSquare }
    ]
  },
  {
    id: "security-kernel",
    label: "Güvenlik Çekirdeği (Security)",
    items: [
      { id: "permission-kernel", label: "Erişim Yetki Çekirdeği", route: "/security", description: "ABAC rol erişim yetki denetleyicisi panel arayüzü", status: "implemented", icon: ShieldAlert },
      { id: "abac-matrix", label: "ABAC Matrisi", route: "/abac-matrix", description: "Kullanıcı-Kaynak ayrıcalık eşleştirme tabloları", status: "implemented", icon: Shield },
      { id: "role-policies", label: "Rol Politikaları", route: "/policies", description: "Salt okunur varsayılan politika şablonları", status: "implemented", icon: Lock },
      { id: "human-approval-gate", label: "İnsan Onay Geçidi", route: "/human-approval", description: "Yazma eylemleri için insan onayı talep kuyruğu", status: "implemented", icon: Users },
      { id: "path-traversal-guard", label: "Dizin Kaçış Koruması", route: "/traversal-guard", description: "Dizin dışına çıkma engelleyici engelleme logları", status: "implemented", icon: Shield },
      { id: "secret-redactor", label: "Sır Ayıklayıcı (Redactor)", route: "/redactor", description: "Sır ve şifre maskeleme istatistikleri arayüzü", status: "implemented", icon: Search },
      { id: "default-deny-rules", label: "Varsayılan Reddetme Kuralları", route: "/default-deny", description: "Taban kısıtlama profilleri ve güvenlik sınırları", status: "implemented", icon: Lock },
      { id: "read-only-policies", label: "Salt Okunur Kurallar", route: "/read-only", description: "Güvenli okuma sınırı ve politika haritaları", status: "implemented", icon: Eye }
    ]
  },
  {
    id: "evidence-audit",
    label: "Kanıt ve Adli Denetim",
    items: [
      { id: "evidence-store", label: "Kanıt Deposu Paneli", route: "/evidence", description: "Y-OS merkezi doğrulama kanıtları veri kasası", status: "implemented", icon: FileText },
      { id: "event-journal", label: "Ajan Olay Günlüğü", route: "/events", description: "SHA-256 ile zincirlenmiş olay günlüğü (audit log)", status: "implemented", icon: History },
      { id: "event-store", label: "Olay Deposu", route: "/event-store", description: "Salt eklenebilir veritabanı olay kayıt sicili", status: "implemented", icon: Database },
      { id: "evidence-health-gauge", label: "Kanıt Sağlık Göstergesi", route: "/health-gauge", description: "Kriptografik bütünlük sağlık oranı gösterge paneli", status: "implemented", icon: Activity },
      { id: "corruption-reports", label: "Bozulma Raporları", route: "/corruption", description: "Bütünlük hataları ve sapma (drift) analizi alarmları", status: "implemented", icon: AlertTriangle },
      { id: "cryptographic-ledger", label: "Kriptografik Defter", route: "/ledger", description: "Değiştirilemez olay kayıt zinciri dizini", status: "implemented", icon: History },
      { id: "signed-logs", label: "İmzalı Loglar", route: "/signed-logs", description: "SHA-256 imzasıyla mühürlenmiş sistem logları", status: "implemented", icon: CheckSquare }
    ]
  },
  {
    id: "worker-runtime",
    label: "Çalışma Zamanı İzleme (Runtime)",
    items: [
      { id: "worker-runtime", label: "İşçi Çalışma Zamanı HUD", route: "/workers", description: "Arka plan işçileri ve çalışan görev yükleri", status: "implemented", icon: SlidersHorizontal },
      { id: "index-sync", label: "Dizin Eşitleme İşleri", route: "/index-sync", description: "Aktif Git depoları izleme aracı", status: "implemented", icon: RefreshCw },
      { id: "git-tracking", label: "Git Takibi", route: "/git-tracking", description: "Commit geçmişi ve dizin derleyici motoru", status: "implemented", icon: GitBranch },
      { id: "ast-compilation-jobs", label: "AST Derleme İşleri", route: "/ast-jobs", description: "Statik analiz işçi kuyruğu durum ekranı", status: "implemented", icon: Cpu },
      { id: "load-metrics", label: "Yük Metrikleri", route: "/load", description: "Sistem CPU ve bellek limitleri izleme paneli", status: "implemented", icon: Activity },
      { id: "runtime-telemetry", label: "Çalışma Zamanı Telemetrisi", route: "/telemetry", description: "Express ve Vite sunucu yürütme logları konsolu", status: "implemented", icon: Terminal }
    ]
  },
  {
    id: "database-migrations",
    label: "Veritabanı ve Migrasyonlar",
    items: [
      { id: "db-status", label: "Veritabanı Durumu", route: "/db-status", description: "Supabase bağlantıları ve satır sayıları metrikleri", status: "implemented", icon: Database },
      { id: "supabase-pool-manager", label: "Supabase Havuz Yöneticisi", route: "/db-pool", description: "PostgreSQL istemci havuzu limitleri yapılandırma ekranı", status: "implemented", icon: Settings },
      { id: "migrations", label: "Migrasyon Defteri", route: "/migrations", description: "Çalıştırılmış veritabanı migrasyon kayıtları günlüğü", status: "implemented", icon: History },
      { id: "schema-browser", label: "Şema Tarayıcısı", route: "/schema", description: "Tablo yapıları ve veritabanı sütunları tarayıcısı", status: "implemented", icon: FolderOpen },
      { id: "dev-reset-utility", label: "Geliştirici Sıfırlama Aracı", route: "/dev-reset", description: "ALLOW_DESTRUCTIVE_DB_RESET kontrol paneli", status: "implemented", icon: AlertTriangle },
      { id: "public-tables", label: "Genel Tablolar", route: "/tables", description: "Projeler, görevler ve üyelikler tabloları listesi", status: "implemented", icon: Database }
    ]
  },
  {
    id: "providers-connectors",
    label: "Sağlayıcılar ve Konektörler",
    items: [
      { id: "model-routing", label: "Model Yönlendirme", route: "/model-routing", description: "Gemini / Claude / fallbacks yapay zeka modeli seçici", status: "implemented", icon: RefreshCw },
      { id: "google-sdk-adapter", label: "Google SDK Adaptörü", route: "/google-sdk", description: "Vertex AI entegrasyon kancaları izleyicisi", status: "implemented", icon: Cpu },
      { id: "saas-sync-states", label: "SaaS Eşitleme Durumları", route: "/saas-sync", description: "Üçüncü taraf SaaS senkronizasyon verileri paneli", status: "implemented", icon: FolderOpen },
      { id: "credential-stubs", label: "Kimlik Bilgisi Taslakları", route: "/credentials", description: "SaaS kimlik doğrulama taslakları izleyicisi", status: "implemented", icon: Lock },
      { id: "connect-center", label: "Bağlantı Merkezi", route: "/connectors", description: "Dış servis bağlantıları yapılandırmaları paneli", status: "implemented", icon: Compass }
    ]
  },
  {
    id: "qa-validation",
    label: "QA ve Doğrulama Suite'i",
    items: [
      { id: "quality-gate-report", label: "Kalite Geçidi Raporu", route: "/quality-gates", description: "Statik kontroller ve hata ayıklama etiketi denetleyicileri", status: "implemented", icon: BadgeAlert },
      { id: "test-runner", label: "Test Koşturucu", route: "/test-runner", description: "Çalışma alanı test motoru kontrol arayüzü", status: "implemented", icon: Terminal },
      { id: "deterministic-tests", label: "Belirleyici Testler", route: "/test-det", description: "Çevrimdışı verifikasyon iddiaları koşturucusu", status: "implemented", icon: CheckSquare },
      { id: "db-integration-tests", label: "Veritabanı Entegrasyon Testleri", route: "/test-db", description: "Supabase bağlantı ve şema doğrulama koşturucusu", status: "implemented", icon: Database },
      { id: "secret-scan", label: "Sır Tarayıcısı (Secret Scan)", route: "/secret-scan", description: "Regex token ve veritabanı şifreleri tarayıcı paneli", status: "implemented", icon: Search },
      { id: "debug-tag-gate", label: "Debug Etiketi Engeli", route: "/debug-gate", description: "PR'larda fdescribe ve fit kodlarını engelleyen kalite geçidi", status: "implemented", icon: AlertTriangle },
      { id: "manual-qa-checklist", label: "Manuel QA Kontrol Listesi", route: "/manual-qa", description: "Arayüz butonları manuel kalite kontrol listesi", status: "implemented", icon: FileText },
      { id: "stage-27-validation", label: "Erişim Yetki Çekirdeği (ABAC) Doğrulaması", route: "/stage-27", description: "ABAC rolleri, yol normalizasyonu ve varsayılan reddetme kuralları testi", status: "implemented", icon: CheckSquare },
      { id: "stage-28-validation", label: "Bağlam Paketleyici (50K Pack) Doğrulaması", route: "/stage-28", description: "50K token bütçesi altında semantik sıralama ve compactor testi", status: "implemented", icon: CheckSquare },
      { id: "stage-29-validation", label: "Repo Adaptörü ve Kapsamlı Yollar Doğrulaması", route: "/stage-29", description: "Dizin sınırı kısıtlamaları, allowlist/denylist ve repo adaptör testi", status: "implemented", icon: CheckSquare },
      { id: "stage-30-validation", label: "Kriptografik Olay Günlüğü Doğrulaması", route: "/stage-30", description: "Append-only adli defter ve SHA-256 zincirlenmiş loglar testi", status: "implemented", icon: CheckSquare },
      { id: "stage-31-validation", label: "Obsidian Bellek Kasası Doğrulaması", route: "/stage-31", description: "Obsidian hafıza kasası ve ContextObject soy ağacı testi", status: "implemented", icon: CheckSquare },
      { id: "stage-32-validation", label: "Ajan Devamlılık Handoff Doğrulaması", route: "/stage-32", description: "Yapay zeka ajanları arası durum aktarım bellek paketi testi", status: "implemented", icon: CheckSquare },
      { id: "stage-33-validation", label: "Görev Yaşam Döngüsü FSM Doğrulaması", route: "/stage-33", description: "FSM durum makinesi geçişleri ve atomik dosya kilitleri testi", status: "implemented", icon: CheckSquare },
      { id: "stage-34-validation", label: "İşçi Çalışma Zamanı Telemetrisi Doğrulaması", route: "/stage-34", description: "Worker HUD canlı bellek/CPU yük metrikleri testi", status: "implemented", icon: CheckSquare },
      { id: "stage-35-validation", label: "Artefakt CAS Tekilleştirme Doğrulaması", route: "/stage-35", description: "İçerik adreslemeli CAS ikili veri tekilleştirme ve hash doğrulaması", status: "implemented", icon: CheckSquare }
    ]
  },
  {
    id: "documentation",
    label: "Sistem Dokümantasyonu",
    items: [
      { id: "architecture-index", label: "Mimari Dizini", route: "/docs/arch-idx", description: "Küresel monorepo paketleri ve veri türleri dizini", status: "implemented", icon: FolderOpen },
      { id: "architecture-schema", label: "Mimari Şeması", route: "/docs/arch-schema", description: "Vite istemcisinden Express ve PostgreSQL veri akışları", status: "implemented", icon: Network },
      { id: "kernel-explanation", label: "Çekirdek Çalışma Tezi", route: "/docs/kernel-explain", description: "Sır ayıklayıcı, compactor ve güvenlik çekirdeği açıklaması", status: "implemented", icon: FileText },
      { id: "context-execution-plan", label: "Bağlam Yürütme Planı", route: "/docs/execution-plan", description: "AST token oluşturma hattı zaman planı", status: "implemented", icon: Layers },
      { id: "ui-accessibility-notes", label: "Arayüz Erişilebilirlik Notları", route: "/docs/accessibility", description: "WCAG renk kontrastı ve tasarım kuralları kılavuzu", status: "implemented", icon: Eye },
      { id: "quality-gates", label: "Kalite Geçitleri Kuralları", route: "/docs/quality-gates", description: "Commit engelleme ve kod kalitesi politikaları dokümanı", status: "implemented", icon: BadgeAlert },
      { id: "manual-qa", label: "Manuel QA Rehberi", route: "/docs/manual-qa", description: "Butonlar ve form alanları manuel tarama kılavuzu", status: "implemented", icon: FileText },
      { id: "implementation-log", label: "Uygulama Günlüğü", route: "/docs/impl-log", description: "Kararlılık ve aşama aşama iyileştirme arşivi logu", status: "implemented", icon: History }
    ]
  },
  {
    id: "governance-kernel-debt",
    label: "Yönetişim ve Çekirdek Borcu",
    items: [
      { id: "kernel-awareness-note", label: "Çekirdek Farkındalık Notu", route: "/gov/awareness", description: "Sır taraması ve kimlik bilgisi maskeleme kılavuzu", status: "implemented", icon: ShieldAlert },
      { id: "kernel-debt-register", label: "Çekirdek Borç Sicili", route: "/gov/debt", description: "Eksik yetkilendirme ve refaktör edilecek kodlar sicili", status: "implemented", icon: Settings },
      { id: "permission-kernel-audit", label: "Erişim Çekirdeği Denetimi", route: "/gov/audit", description: "Admin vs Guest erişim logları karşılaştırma raporu", status: "implemented", icon: History },
      { id: "human-review-requirements", label: "İnsan İnceleme Koşulları", route: "/gov/human-review", description: "Kritik işlemler için gereken manuel imza kuralları", status: "implemented", icon: Users },
      { id: "release-sign-off", label: "Sürüm İmza Defteri", route: "/gov/signoff", description: "Kriptografik doğrulama sürümü imza defteri kontrol listesi", status: "implemented", icon: Lock }
    ]
  }
];
