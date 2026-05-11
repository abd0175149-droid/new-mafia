# 🎭 Mafia Platform — دليل النشر والتطوير الشامل

> آخر تحديث: 2026-05-11

---

## 📋 فهرس المحتويات

1. [نظرة عامة على البنية التحتية](#-نظرة-عامة-على-البنية-التحتية)
2. [تفاصيل البيئات](#-تفاصيل-البيئات)
3. [دورة حياة التطوير والنشر](#-دورة-حياة-التطوير-والنشر)
4. [أوامر مرجعية سريعة](#-أوامر-مرجعية-سريعة)
5. [إدارة قواعد البيانات](#-إدارة-قواعد-البيانات)
6. [استكشاف الأخطاء وإصلاحها](#-استكشاف-الأخطاء-وإصلاحها)
7. [ملاحظات أمنية مهمة](#-ملاحظات-أمنية-مهمة)

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
| **فرع Git** | `master` |
| **Cloudflare Tunnel** | يوجه إلى `http://127.0.0.1:3010` |

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
