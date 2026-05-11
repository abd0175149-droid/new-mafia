# 🧩 Data-Driven Architecture — Context

> **آخر تحديث:** 2026-05-11
> **الحالة:** المرحلة 1 + 2 مكتملة — في انتظار النشر والاختبار

---

## الهدف

الانتقال من نظام أدوار وقدرات مكتوب بالكود (Hardcoded) إلى نظام ديناميكي يعتمد على قاعدة البيانات.
يسمح بإضافة/تعديل أدوار وقدرات جديدة من واجهة الإدارة بدون لمس الكود.

---

## الجداول الجديدة (4 جداول)

| الجدول | الغرض |
|---|---|
| `ability_definitions` | تعريف كل قدرة (اغتيال، حماية، تحقيق...) |
| `role_definitions` | تعريف كل دور (شيخ مافيا، شريف...) مع قدراته |
| `card_templates` | تصميم بطاقة كل دور (ألوان، أيقونات، تدرجات) |
| `interaction_rules` | قواعد التفاعل بين القدرات (حماية تلغي اغتيال) |

---

## الملفات الجديدة

### Backend
- `schemas/game-config.schema.ts` — Drizzle schema
- `scripts/seed-game-config.ts` — بذر البيانات الأولية
- `routes/game-config.routes.ts` — 15 API endpoint
- `game/definition-service.ts` — قراءة من DB مع Cache
- `game/dynamic-role-generator.ts` — توليد أدوار من DB
- `game/dynamic-night-resolver.ts` — تسوية الليل من DB
- `game/dynamic-win-checker.ts` — فحص فوز مع محايدين

### ملفات مُعدّلة
- `config/db.ts` — ربط schema جديد
- `drizzle.config.ts` — إضافة schema لـ Kit
- `index.ts` — routes + auto-migration
- `game/state.ts` — Feature Flag + DynamicNightState
- `sockets/lobby.socket.ts` — Feature Flag عند التوليد

---

## Feature Flag

- **الحقل:** `GameConfig.useDynamicEngine` (default: `false`)
- **التفعيل:** عبر socket event `room:toggle-dynamic-engine`
- **السلوك:** عند `true`، يُستخدم `generateRolesDynamic()` بدلاً من `generateRoles()`
- **Fallback:** إذا فشل المحرك الجديد، يعود للقديم تلقائياً

---

## API Endpoints

```
GET    /api/game-config/abilities
POST   /api/game-config/abilities
PUT    /api/game-config/abilities/:id
DELETE /api/game-config/abilities/:id

GET    /api/game-config/roles
POST   /api/game-config/roles
PUT    /api/game-config/roles/:id
DELETE /api/game-config/roles/:id

GET    /api/game-config/card-templates
POST   /api/game-config/card-templates
PUT    /api/game-config/card-templates/:id

GET    /api/game-config/interactions
POST   /api/game-config/interactions
PUT    /api/game-config/interactions/:id
DELETE /api/game-config/interactions/:id
```

---

## قيود مهمة

1. **لا يتم النشر على `master`** حتى اكتمال الاختبار على `staging`
2. **المحرك القديم لا يُحذف** — يبقى كـ fallback
3. **تغيير أي تعريف من الواجهة يمسح Cache الذاكرة** عبر `invalidateCache()`
4. **الجداول تُنشأ تلقائياً** عند تشغيل السيرفر (CREATE TABLE IF NOT EXISTS)
