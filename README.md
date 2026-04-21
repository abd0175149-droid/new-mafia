# 🎭 Unified Mafia Platform

## نظرة عامة
منصة موحدة تجمع بين **محرك لعبة المافيا** (Real-time Game Engine) و**نظام إدارة نادي المافيا** (Club Management) في مشروع واحد متكامل.

## البنية التقنية

| الخدمة | التقنية | المنفذ |
|--------|---------|--------|
| **Backend** | Express.js + Socket.IO | 4000 |
| **Frontend** | Next.js 14 + TailwindCSS v3 | 3000 |
| **Database** | PostgreSQL 16 | 5432 |
| **Cache** | Redis 7 | 6379 |

## البدء السريع

```bash
# 1. تثبيت الحزم
cd backend && npm install
cd ../frontend && npm install

# 2. تشغيل الخدمات (Docker)
docker-compose up -d postgres redis

# 3. ترحيل قاعدة البيانات
cd backend && npm run db:push

# 4. تشغيل الباك إند
npm run dev

# 5. تشغيل الفرونت إند (في terminal آخر)
cd ../frontend && npm run dev
```

## هيكل المشروع

```
unified-mafia/
├── backend/               # Express + Socket.IO + Drizzle
│   ├── src/
│   │   ├── config/        # env, db, redis
│   │   ├── schemas/       # admin.schema + game.schema
│   │   ├── middleware/     # JWT auth
│   │   ├── routes/        # REST API endpoints
│   │   ├── sockets/       # Socket.IO handlers
│   │   ├── game/          # Game logic (roles, state, voting)
│   │   ├── services/      # Business logic
│   │   └── utils/         # Helpers
│   └── package.json
├── frontend/              # Next.js 14
│   └── src/
│       ├── app/
│       │   ├── (admin)/   # 🏢 Club management UI
│       │   └── (game)/    # 🎮 Game engine UI
│       ├── components/
│       ├── hooks/
│       └── styles/
└── docker-compose.yml
```

## الحسابات الافتراضية

| الحساب | اسم المستخدم | كلمة المرور |
|--------|-------------|-------------|
| المدير العام | `admin` | `admin123` |
