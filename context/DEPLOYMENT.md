# 🎭 Mafia Platform — دليل النشر والتطوير الشامل

> آخر تحديث: 2026-05-30

---

## ⛔ قواعد ذهبية للنشر الآمن (اقرأ أولاً!)

> **هذا القسم إلزامي — يجب مراجعته قبل كل عملية نشر**

### 🚫 ممنوعات مطلقة

| # | الأمر الممنوع | السبب | البديل الآمن |
|---|--------------|-------|--------------|
| 1 | `git reset --hard` على السيرفر | يحذف `docker-compose.override.yml` → يفقد ربط الفوليومات → **ضياع البيانات** | `git pull origin <branch>` |
| 2 | `git push origin main` من فرع `staging` | الفرع `main` غير موجود — الفرع الرئيسي اسمه `master` | `git push origin staging` أو `git push origin master` |
| 3 | `docker volume prune` | يحذف جميع الفوليومات غير المستخدمة = **ضياع بيانات الإنتاج** | حذف فوليوم محدد بالاسم |
| 4 | `docker compose down -v` | يحذف الفوليومات المرتبطة | `docker compose down` بدون `-v` |
| 5 | نشر على `~/mafia-prod` بدون اختبار على `~/mafia-staging` أولاً | خطر توقف الموقع | اختبر على staging أولاً دائماً |

### ✅ خطوات النشر الآمنة (Checklist)

```
□ 1. تأكد من الفرع الصحيح:
     - جهازك (Windows): فرع staging
     - السيرفر ~/mafia-staging: فرع staging  
     - السيرفر ~/mafia-prod: فرع master

□ 2. على السيرفر، استخدم PULL فقط (لا reset!):
     cd ~/mafia-staging && git pull origin staging
     cd ~/mafia-prod && git pull origin master

□ 3. تحقق أن docker-compose.override.yml موجود قبل البناء:
     cat ~/mafia-prod/docker-compose.override.yml
     # يجب أن يظهر: unified-mafia_postgres_data + unified-mafia_uploads_data

□ 4. ابنِ backend + frontend فقط (لا تعيد بناء database!):
     docker compose build --no-cache backend frontend
     docker compose up -d backend frontend

□ 5. تحقق أن البيانات لم تُفقد:
     docker exec mafia-prod-database-1 psql -U mafia_user -d mafia_db \
       -c "SELECT COUNT(*) FROM players;"
```

### 🔑 معلومات الفروع (Git Branches)

| البيئة | الفرع | أمر Push | أمر Pull (على السيرفر) |
|--------|-------|----------|------------------------|
| **التطوير** (staging) | `staging` | `git push origin staging` | `cd ~/mafia-staging && git pull origin staging` |
| **الإنتاج** (production) | `master` | `git push origin master` | `cd ~/mafia-prod && git pull origin master` |

> ⚠️ **لا يوجد فرع اسمه `main`!** الفرع الرئيسي اسمه `master`.

### 🔗 ملف docker-compose.override.yml الحرج

هذا الملف موجود **فقط** في `~/mafia-prod` ويربط الفوليومات الأصلية:

```yaml
# ~/mafia-prod/docker-compose.override.yml
# ⛔ لا تحذف هذا الملف أبداً!
volumes:
  db_data:
    external: true
    name: unified-mafia_postgres_data
  uploads_data:
    external: true  
    name: unified-mafia_uploads_data
```

إذا اختفى هذا الملف (مثلاً بسبب `git reset --hard`):
- Docker ينشئ فوليومات **جديدة فارغة** بدلاً من ربط الأصلية
- النتيجة: **ضياع كامل للبيانات والصور**
- الحل: إعادة إنشاء الملف يدوياً + إعادة تشغيل

### 💾 النسخ الاحتياطية التلقائية (Google Drive)

| العنصر | المسار على Google Drive |
|--------|------------------------|
| قاعدة بيانات الإنتاج | `gdrive:Server-Backups/latest/databases/mafia-prod_mafia_db.sql.gz` |
| صور المستخدمين | `gdrive:Server-Backups/latest/uploads/mafia-prod_uploads.tar.gz` |
| سكريبت النسخ | `/opt/backup/server-backup.sh` |
| أداة الاسترجاع | `rclone` |

**استعادة من Google Drive:**
```bash
# قاعدة البيانات
rclone copy gdrive:Server-Backups/latest/databases/mafia-prod_mafia_db.sql.gz /tmp/
gunzip -k /tmp/mafia-prod_mafia_db.sql.gz
docker exec mafia-prod-database-1 psql -U mafia_user -d postgres -c "DROP DATABASE mafia_db;"
docker exec mafia-prod-database-1 psql -U mafia_user -d postgres -c "CREATE DATABASE mafia_db OWNER mafia_user;"
docker cp /tmp/mafia-prod_mafia_db.sql mafia-prod-database-1:/tmp/restore.sql
docker exec mafia-prod-database-1 psql -U mafia_user -d mafia_db -f /tmp/restore.sql

# الصور
rclone copy gdrive:Server-Backups/latest/uploads/mafia-prod_uploads.tar.gz /tmp/
cd /tmp && tar -xzf mafia-prod_uploads.tar.gz
docker cp /tmp/avatars mafia-prod-backend-1:/app/uploads/
docker cp /tmp/card-faces mafia-prod-backend-1:/app/uploads/
docker cp /tmp/sounds mafia-prod-backend-1:/app/uploads/
```

---

## 📋 فهرس المحتويات

1. [قواعد ذهبية للنشر الآمن](#-قواعد-ذهبية-للنشر-الآمن-اقرأ-أولاً)
2. [نظرة عامة على البنية التحتية](#-نظرة-عامة-على-البنية-التحتية)
3. [تفاصيل البيئات](#-تفاصيل-البيئات)
4. [دورة حياة التطوير والنشر](#-دورة-حياة-التطوير-والنشر)
5. [أوامر مرجعية سريعة](#-أوامر-مرجعية-سريعة)
6. [إدارة قواعد البيانات](#-إدارة-قواعد-البيانات)
7. [استكشاف الأخطاء وإصلاحها](#-استكشاف-الأخطاء-وإصلاحها)
8. [ملاحظات أمنية مهمة](#-ملاحظات-أمنية-مهمة)

---

## 🏗 نظرة عامة على البنية التحتية

### السيرفر

| العنصر | التفاصيل |
|--------|----------|
| نظام التشغيل | Ubuntu Linux |
| الوصول | SSH عبر المستخدم `sysadmin` |
| إدارة الحاويات | Docker + Docker Compose |
| الوصول الخارجي | Cloudflare Tunnels (بدون فتح بورتات مباشرة للإنترنت) |
| ملف إعدادات الأنفاق | `~/.cloudflared/*.yml` |

### المعمارية العامة

```
┌─────────────────────────────────────────────────────────┐
│                    السيرفر (Ubuntu)                      │
│                                                         │
│  ┌─────────────── بيئة الإنتاج ───────────────┐        │
│  │  ~/mafia-prod (فرع master)                  │        │
│  │                                             │        │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  │        │
│  │  │ Frontend │  │ Backend  │  │ Postgres │  │        │
│  │  │ :3010    │  │ :4000    │  │ :5432    │  │        │
│  │  └──────────┘  └──────────┘  └──────────┘  │        │
│  │  ┌──────────┐                               │        │
│  │  │  Redis   │                               │        │
│  │  │  :6381   │                               │        │
│  │  └──────────┘                               │        │
│  └─────────────────────────────────────────────┘        │
│                                                         │
│  ┌─────────────── بيئة التطوير ───────────────┐        │
│  │  ~/mafia-staging (فرع staging)              │        │
│  │                                             │        │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  │        │
│  │  │ Frontend │  │ Backend  │  │ Postgres │  │        │
│  │  │ :3000    │  │ :4001    │  │ :5435    │  │        │
│  │  └──────────┘  └──────────┘  └──────────┘  │        │
│  │  ┌──────────┐                               │        │
│  │  │  Redis   │                               │        │
│  │  │  :6382   │                               │        │
│  │  └──────────┘                               │        │
│  └─────────────────────────────────────────────┘        │
│                                                         │
│  ┌─────────────── خدمات أخرى ─────────────────┐        │
│  │  SchoolOS, Kafka, Netdata, etc.             │        │
│  │  (لا تمس هذه الحاويات!)                     │        │
│  └─────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────┘
```

---

## 🌍 تفاصيل البيئات

### بيئة الإنتاج (Production)

| العنصر | القيمة |
|--------|--------|
| **الرابط** | `https://club-mafia.grade.sbs/` |
| **المسار على السيرفر** | `~/mafia-prod` |
| **فرع Git** | `master` ⚠️ (ليس `main`!) |
| **Cloudflare Tunnel** | يوجه إلى `http://127.0.0.1:3010` |
| **override.yml** | ✅ مطلوب — يربط الفوليومات الأصلية |

**ملف `.env` الخاص بالإنتاج:**

```env
COMPOSE_PROJECT_NAME=mafia-prod
FRONTEND_PORT=3010
BACKEND_PORT=4000
DB_PORT=5432
REDIS_PORT=6381
DB_NAME=mafia_db
```

**ملف `docker-compose.override.yml` (ربط البيانات الأصلية):**

```yaml
volumes:
  db_data:
    external: true
    name: unified-mafia_postgres_data
  uploads_data:
    external: true
    name: unified-mafia_uploads_data
```

> ⛔ تحذير حرج:
> ملف `docker-compose.override.yml` في بيئة الإنتاج يربط قاعدة البيانات والصور الأصلية.
> **لا تحذف هذا الملف أبداً** وإلا ستفقد الاتصال ببيانات الإنتاج!

---

### بيئة التطوير (Staging)

| العنصر | القيمة |
|--------|--------|
| **الرابط** | `https://mafia.grade.sbs/` |
| **المسار على السيرفر** | `~/mafia-staging` |
| **فرع Git** | `staging` |
| **Cloudflare Tunnel** | يوجه إلى `http://127.0.0.1:3000` |

**ملف `.env` الخاص بالتطوير:**

```env
COMPOSE_PROJECT_NAME=mafia-staging
FRONTEND_PORT=3000
BACKEND_PORT=4001
DB_PORT=5435
REDIS_PORT=6382
DB_NAME=mafia_db_staging
```

> ملاحظة مهمة:
> بيئة التطوير تعمل على **نسخة منفصلة** من قاعدة البيانات.
> أي تعديل فيها لن يؤثر على بيانات الإنتاج.

---

## 🔄 دورة حياة التطوير والنشر

### المخطط العام

```
    جهازك (Windows)              السيرفر (Ubuntu)
    ================              ================

    1. كتابة الكود
         │
         ▼
    2. git add + commit
         │
         ▼
    3. git push origin staging ──────► ~/mafia-staging
         │                              │
         │                              ▼
         │                         4. git pull
         │                              │
         │                              ▼
         │                         5. docker compose up -d --build
         │                              │
         │                              ▼
         │                         6. اختبار على mafia.grade.sbs
         │
         │  ✅ نجح الاختبار؟
         │
         ▼
    7. git checkout master
       git merge staging
       git push origin master ──────► ~/mafia-prod
                                       │
                                       ▼
                                  8. git pull
                                       │
                                       ▼
                                  9. docker compose up -d --build
                                       │
                                       ▼
                                  10. تحقق من club-mafia.grade.sbs
```

---

### الخطوة 1: رفع التعديلات لبيئة التطوير (Staging)

**على جهازك (PowerShell):**

```powershell
cd "C:\Projects\new mafia\unified-mafia"

# تأكد أنك على فرع staging
git checkout staging

# أضف التعديلات وارفعها
git add .
git commit -m "وصف التعديل هنا"
git push origin staging
```

**على السيرفر (SSH):**

```bash
cd ~/mafia-staging
git pull origin staging
docker compose up -d --build
```

> 💡 نصيحة:
> إذا كان التعديل فقط في الـ Backend (بدون تغيير في Frontend)، يمكنك إعادة بناء الباك إند فقط لتوفير الوقت:
> ```bash
> docker compose up -d --build backend
> ```

**بعد التشغيل:** افتح `https://mafia.grade.sbs/` وتأكد أن كل شيء يعمل.

---

### الخطوة 2: اعتماد التعديلات للنشر (Production)

**على جهازك (PowerShell) — بعد نجاح الاختبار:**

```powershell
# الانتقال لفرع الإنتاج ودمج التعديلات
git checkout master
git merge staging
git push origin master

# العودة لفرع التطوير لمواصلة العمل
git checkout staging
```

**على السيرفر (SSH):**

```bash
cd ~/mafia-prod
git pull origin master
docker compose up -d --build
```

> ⚠️ تحذير:
> تأكد دائماً من اختبار التعديلات في بيئة التطوير **قبل** دمجها في `master`.
> النشر المباشر على `master` بدون اختبار قد يتسبب في توقف الموقع!

---

### الخطوة 3: التعامل مع تغييرات قاعدة البيانات (Schema Changes)

إذا قمت بتعديل هيكل الجداول (إضافة عمود، تعديل نوع بيانات، إلخ):

**على السيرفر — بعد رفع الكود:**

```bash
# تطبيق التعديلات على بيئة التطوير أولاً
cd ~/mafia-staging
docker compose up -d --build backend
docker exec -it mafia-staging-backend-1 npm run db:push

# بعد نجاح الاختبار، طبقها على الإنتاج
cd ~/mafia-prod
docker compose up -d --build backend
docker exec -it mafia-prod-backend-1 npm run db:push
```

> ⛔ تحذير حرج:
> عند تطبيق `db:push` على الإنتاج، إذا سألك Drizzle عن حذف أعمدة أو جداول،
> **اقرأ السؤال بعناية شديدة قبل الضغط على Enter!**
> حذف عمود = حذف البيانات الموجودة فيه نهائياً.

---

## ⚡ أوامر مرجعية سريعة

### مراقبة الحاويات

```bash
# عرض حالة جميع حاويات المافيا
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" --filter name=mafia

# سجلات الباك إند (آخر 50 سطر)
docker logs mafia-prod-backend-1 --tail 50
docker logs mafia-staging-backend-1 --tail 50

# سجلات الفرونت إند
docker logs mafia-prod-frontend-1 --tail 20

# متابعة السجلات مباشرة (Live)
docker logs -f mafia-prod-backend-1
```

### إعادة التشغيل

```bash
# إعادة تشغيل خدمة واحدة
docker compose restart backend
docker compose restart frontend

# إعادة تشغيل كل شيء
docker compose down
docker compose up -d

# إعادة البناء والتشغيل (بعد تحديث الكود)
docker compose up -d --build
```

### الدخول لقاعدة البيانات

```bash
# الدخول لقاعدة بيانات الإنتاج
docker exec -it mafia-prod-database-1 psql -U mafia_user -d mafia_db

# الدخول لقاعدة بيانات التطوير
docker exec -it mafia-staging-database-1 psql -U mafia_user -d mafia_db_staging

# استعلام سريع (بدون دخول تفاعلي)
docker exec -it mafia-prod-database-1 psql -U mafia_user -d mafia_db -c "SELECT count(*) FROM staff;"
```

---

## 💾 إدارة قواعد البيانات

### أخذ نسخة احتياطية (Backup)

```bash
# نسخة احتياطية من الإنتاج
docker exec mafia-prod-database-1 pg_dump -U mafia_user -d mafia_db > ~/backup_prod_$(date +%Y%m%d).sql

# نسخة احتياطية من التطوير
docker exec mafia-staging-database-1 pg_dump -U mafia_user -d mafia_db_staging > ~/backup_staging_$(date +%Y%m%d).sql
```

### استعادة نسخة احتياطية

```bash
# استعادة في بيئة التطوير (لا تستعيد مباشرة في الإنتاج!)
docker exec -i mafia-staging-database-1 psql -U mafia_user -d mafia_db_staging < ~/backup_prod_20260511.sql
```

### نسخ بيانات الإنتاج إلى التطوير (تحديث بيئة الاختبار)

```bash
# 1. تصدير من الإنتاج
docker exec mafia-prod-database-1 pg_dump -U mafia_user -d mafia_db > ~/staging_refresh.sql

# 2. مسح قاعدة بيانات التطوير وإعادة إنشائها
docker exec -i mafia-staging-database-1 psql -U mafia_user -d postgres -c "DROP DATABASE IF EXISTS mafia_db_staging;"
docker exec -i mafia-staging-database-1 psql -U mafia_user -d postgres -c "CREATE DATABASE mafia_db_staging;"

# 3. استيراد البيانات
docker exec -i mafia-staging-database-1 psql -U mafia_user -d mafia_db_staging < ~/staging_refresh.sql

# 4. إعادة تشغيل الباك إند
cd ~/mafia-staging
docker compose restart backend
```

---

## 🔧 استكشاف الأخطاء وإصلاحها

### المشكلة: 502 Bad Gateway

**الأسباب المحتملة:**
1. الحاوية متوقفة ← تحقق بـ `docker ps`
2. البورت خاطئ ← تأكد أن `.env` يطابق إعدادات Cloudflare Tunnel
3. الباك إند لم يبدأ ← تحقق بـ `docker logs`

**الحل:**
```bash
# تحقق من حالة الحاويات
docker ps --filter name=mafia-prod

# إذا كانت الحاويات متوقفة
cd ~/mafia-prod
docker compose up -d
```

### المشكلة: خطأ 401 عند تسجيل الدخول

**السبب:** الباك إند لا يستطيع الاتصال بقاعدة البيانات.

**الحل:**
```bash
docker logs mafia-prod-backend-1 --tail 10
# إذا ظهر خطأ auth_failed (28P01):
docker exec -it mafia-prod-database-1 psql -U mafia_user -d mafia_db -c "ALTER USER mafia_user WITH PASSWORD 'mafia_pass';"
docker compose restart backend
```

### المشكلة: تعارض البورتات (Address already in use)

**الحل:**
```bash
# اكتشف من يستخدم البورت (مثال: 6379)
sudo lsof -i :6379

# غيّر البورت في .env لرقم غير مستخدم
nano .env
docker compose up -d
```

### المشكلة: البيانات لا تظهر بعد تسجيل الدخول

**السبب المحتمل:** ملف `docker-compose.override.yml` مفقود أو يشير لصندوق بيانات خاطئ.

**الحل:**
```bash
cat docker-compose.override.yml
# تأكد أنه يشير إلى: unified-mafia_postgres_data
```

---

## 🔒 ملاحظات أمنية مهمة

### Docker Volumes (صناديق البيانات)

| اسم الصندوق | المحتوى | مستوى الحساسية |
|-------------|---------|----------------|
| `unified-mafia_postgres_data` | قاعدة بيانات الإنتاج الأصلية | 🔴 **حرج — لا تحذف أبداً** |
| `unified-mafia_uploads_data` | صور وملفات المستخدمين | 🔴 **حرج — لا تحذف أبداً** |
| `mafia-staging_db_data` | قاعدة بيانات التطوير | 🟡 متوسط |
| `mafia-prod_db_data` | فارغ (غير مستخدم) | 🟢 آمن للحذف |
| `mafia-prod_postgres_data` | فارغ (غير مستخدم) | 🟢 آمن للحذف |
| `mafia_postgres_data` | نسخة قديمة جداً | 🟡 احتفظ به كنسخة احتياطية |

> ⛔ تحذير حرج:
> **لا تنفذ أبداً** `docker volume prune` على هذا السيرفر!
> هذا الأمر يحذف جميع الصناديق غير المستخدمة وقد يحذف بيانات الإنتاج الأصلية.

### متغيرات البيئة الحساسة

- **`JWT_SECRET`**: مطلوب لتوقيع جلسات المستخدمين. إذا تغير، سيتم تسجيل خروج جميع المستخدمين.
- **كلمة مرور قاعدة البيانات**: حالياً `mafia_pass` — يُنصح بتغييرها لكلمة أقوى في الإنتاج.

### Redis على مستوى النظام

يوجد خدمة Redis مثبتة على مستوى نظام التشغيل (وليس Docker) وتستخدم البورت `6379`.
لذلك استخدمنا بورتات بديلة (`6381` للإنتاج و `6382` للتطوير).

---

## 📁 هيكل الملفات على السيرفر

```
/home/sysadmin/
├── mafia-prod/                    ← بيئة الإنتاج
│   ├── .env                       ← إعدادات البورتات واسم قاعدة البيانات
│   ├── docker-compose.yml         ← تعريف الخدمات
│   ├── docker-compose.override.yml ← ربط صناديق البيانات الأصلية (لا تحذف!)
│   ├── backend/
│   └── frontend/
│
├── mafia-staging/                 ← بيئة التطوير
│   ├── .env
│   ├── docker-compose.yml
│   ├── backend/
│   └── frontend/
│
├── staging_db_backup.sql          ← نسخة البيانات المنقولة للتطوير
└── .cloudflared/                  ← إعدادات أنفاق Cloudflare
    └── *.yml
```

---

## 🗺 إعدادات Cloudflare Tunnels

| النطاق | يوجه إلى | البيئة |
|--------|----------|--------|
| `club-mafia.grade.sbs` | `http://127.0.0.1:3010` | الإنتاج |
| `mafia.grade.sbs` | `http://127.0.0.1:3000` | التطوير |

> 💡 ملاحظة:
> تعديل هذه الإعدادات يتم عبر ملف `~/.cloudflared/*.yml` على السيرفر.
> بعد التعديل يجب إعادة تشغيل خدمة Cloudflared:
> ```bash
> sudo systemctl restart cloudflared
> ```

---

## 🧰 تقنيات المشروع

| المكون | التقنية | الإصدار |
|--------|---------|---------|
| Frontend | Next.js (Standalone) | 14.x |
| Backend | Express + Socket.IO | - |
| Database | PostgreSQL | 16-alpine |
| Cache/State | Redis | Alpine |
| ORM | Drizzle ORM | 0.33.x |
| Containerization | Docker Compose | v2 |
| Language | TypeScript | 5.5.x |

---

## 🧩 محرك الأدوار الديناميكي (Data-Driven Engine)

> **آخر تحديث:** 2026-05-12

### ما هو؟

نظام جديد يسمح بإدارة الأدوار والقدرات والبطاقات من لوحة التحكم بدون تعديل الكود.
يعمل جنباً إلى جنب مع النظام القديم عبر **Feature Flag**.

### Feature Flag

| الإعداد | القيمة الافتراضية | الوصف |
|---------|------------------|-------|
| `useDynamicEngine` | `false` | يُفعّل من واجهة الليدر عند بدء اللعبة |

**عند التفعيل:**
- التوليد يقرأ الأدوار من `role_definitions` بدلاً من الـ Enum الثابت
- الليل يستخدم `dynamic-night-resolver` بدلاً من `night-resolver`
- فحص الفوز يدعم المحايدين عبر `dynamic-win-checker`

**عند التعطيل (الافتراضي):**
- كل شيء يعمل كالسابق بدون أي تغيير

### جداول قاعدة البيانات الجديدة

| الجدول | الوصف |
|--------|-------|
| `ability_definitions` | تعريف القدرات (اغتيال، حماية، كشف...) |
| `role_definitions` | تعريف الأدوار مع ربط القدرات |
| `card_templates` | قوالب تصميم البطاقات |
| `interaction_rules` | قواعد التفاعل بين القدرات |

### خطوات النشر الأولى (مرة واحدة)

```bash
# 1. تطبيق Schema الجديد
cd ~/mafia-staging
docker compose up -d --build backend
docker exec -it mafia-staging-backend-1 npm run db:push

# 2. بذر البيانات الأولية (يحوّل الأدوار الثابتة إلى صفوف في DB)
docker exec -it mafia-staging-backend-1 npx tsx src/scripts/seed-game-config.ts

# 3. التحقق
docker exec -it mafia-staging-database-1 psql -U mafia_user -d mafia_db_staging \
  -c "SELECT id, name_ar, team FROM role_definitions;"
```

### لوحة تحكم الأدوار

**الرابط:** `https://mafia.grade.sbs/admin/game-config`
**الصلاحية:** `admin` فقط

**التبويبات المتاحة:**
1. **القدرات** — إضافة/تعديل/حذف القدرات
2. **الأدوار** — بناء أدوار جديدة مع ربط القدرات
3. **البطاقات** — تصميم قوالب البطاقات مع معاينة حية
4. **التفاعلات** — تعريف قواعد التقاطع بين القدرات
5. **التوليد** — ضبط أولويات التوزيع مع محاكاة

### نمط MafiaCard الذكي

ملف `MafiaCard.tsx` أصبح **Smart Wrapper**:
- الكود القديم نُقل إلى `MafiaCardLegacy.tsx`
- كل استيراد قديم يعمل بدون تعديل
- عند تمرير `useDynamicEngine={true}` → يعرض `DynamicMafiaCard` (يقرأ من DB)

