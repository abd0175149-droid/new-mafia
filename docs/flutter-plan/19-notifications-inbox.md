# جرس الإشعارات وصندوق الوارد
> جزء من خطة تطبيق Flutter لواجهة اللاعب — الفهرس والتسلسل في 00-MASTER-PLAN.md

---

## 1. الهدف والنطاق

هذا الملف يواصف **الواجهة داخل التطبيق** لصندوق الوارد: زر الجرس (bell) الموجود في هيدر الصفحة الرئيسية، مع عدّاد غير المقروء (badge)، ولوحة/شاشة الإشعارات المنسدلة، ومودال تفاصيل الإشعار الغني (صورة/فيديو/رابط)، وبانرات حالة الإذن، والحالة الفارغة، والتعليم كمقروء، وتنسيق الوقت النسبي، وخريطة أيقونات وألوان الأنواع، والتوجيه العميق عند نقر الصف.

**داخل النطاق:**
- زر الجرس + badge غير المقروء (العدّ محسوب من طرف العميل).
- لوحة الإشعارات (dropdown في الويب) وترقيتها لشاشة/bottom-sheet في Flutter.
- مودال التفاصيل الغني (صورة/فيديو + نص غني + زر إجراء).
- بانرات الحالة الثلاثة: طلب الإذن، تثبيت iOS (يُحذف في Flutter)، الرفض.
- الحالة الفارغة، صفوف القائمة، الأيقونات والألوان لكل نوع، الوقت النسبي.
- الجلب الأولي + polling كل 60 ثانية + refetch على رسالة foreground/push.
- التعليم كمقروء (فردي وكلّي)، والتنقّل عند نقر الصف.

**خارج النطاق (يُواصف في ملفات أخرى):**
- خط أنابيب الدفع نفسه (FCM/APNs، الأذونات، register-token، الـ background handler، deep-link cold-start) — كله في **06-push-notifications.md**.
- تعريف الثيم والألوان والخطوط وWindow Size Classes — في **01-foundation-theme.md**.
- طبقة REST العامة (Dio/base-URL/Bearer) — في **03-networking-rest.md**.
- خرائط التوجيه للوجهات (Join/Games/Feedback/Order/Home) — في **08-deeplinks-routing.md**.
- زر كتم الليدر ونظام الصوت — **لا علاقة له بهذا الملف** (07-sound-system.md، 30-host-console.md).
- صفحة تشخيص الدفع `/player/debug-push` — تخص **06-push-notifications.md** (تُعاد بناؤها كشاشة تشخيص native LTR).

**ملاحظة أساسية:** التطبيق **عميل ثانٍ لنفس الـ backend**. لا endpoints جديدة ولا أحداث socket جديدة. هذه الشريحة **صفر Socket.IO**؛ كل التحديث الحي عبر REST polling + رسائل FCM foreground.

---

## 2. المرجع في الكود الحالي — مسارات الملفات المصدر

- `c:/Projects/new mafia/unified-mafia/frontend/src/components/NotificationBell.tsx` — المكوّن الكامل (الجرس + اللوحة + المودال الغني + `resolveNotificationUrl` المحلية + `formatTimeAgo` + خرائط `TYPE_ICONS`/`TYPE_COLORS`).
- `c:/Projects/new mafia/unified-mafia/frontend/src/hooks/usePushNotifications.ts` — الهوك: `fetchNotifications`/`markAsRead`/`markAllAsRead`، حساب unread من طرف العميل، polling 60s، مستمع رسائل الـ SW، والحالة المُصدَّرة (`notifications, unreadCount, permissionState, isIOSPWA, needsInstall, ...`).
- `c:/Projects/new mafia/unified-mafia/backend/src/routes/player-notification.routes.ts` — مسارات الـ REST (register-token, GET list, unread-count, read, read-all, delete).
- `c:/Projects/new mafia/unified-mafia/backend/src/schemas/notification.schema.ts` — جدول `player_notifications` وحقوله الفعلية المُعادة.

مصادر تقارير مقروءة بالكامل:
- `scratchpad/reports/pwa-push.md` — قسم NotificationBell / Rich modal / API Calls.
- `scratchpad/sections/platform.md` — القسم 2 (جرس الإشعارات) والقسم 3 (المودال الغني).

**تحققات أُجريت على الكود المصدر (لا اعتماد على التقارير وحدها):**
- شكل صف الإشعار المُعاد من الـ backend هو **`select().from(playerNotifications)` كاملاً** = الحقول: `id, playerId, title, body, type, data, isRead, isPushSent, createdAt`. لاحظ أن التقارير أغفلت حقل **`isPushSent`** — هو موجود فعلاً في الاستجابة (غير مستعمل في الواجهة، لكن انقله للنموذج للأمانة).
- `body` افتراضه `''` (قد يكون فارغاً)، `data` افتراضه `{}` (jsonb، قد يكون كائناً فارغاً)، `title` غير فارغ (varchar 200)، `type` غير فارغ (varchar 30).
- الحد الافتراضي لـ GET هو **50** (`parseInt(limit) || 50`)، والترتيب `createdAt DESC`.
- نسخة `resolveNotificationUrl` **داخل الـ bell أضيق** من نسخة الـ SW (تُواصف حرفياً في §6). قرار النقل: **اعتمد نسخة الـ SW الأشمل** كما في 08-deeplinks-routing.md.

---

## 3. التبعيات على ملفات الخطة الأخرى

- **01-foundation-theme.md** — الألوان hex، الخطوط (Amiri للعناوين، Tajawal للجسم)، RTL، واستراتيجية Window Size Classes الكاملة (compact/medium/expanded) التي يخصّصها §5 هنا. ثيم Dark Noir V2.1 لا وضع فاتح.
- **02-models-data-layer.md** — تعريف `NotificationItem` وتحويل JSON (يُواصَف في §8 هنا ويُوحَّد هناك).
- **03-networking-rest.md** — عميل REST، base-URL المركزي، حقن `Authorization: Bearer <player JWT>`، ومعالجة أظرف الأخطاء (401 `غير مصادق`، 503 `DB unavailable`)، وحلّ مسارات `/uploads/...` النسبية مقابل مضيف الـ backend (مهم لصور/فيديوهات الإشعار).
- **05-session-auth.md** — مصدر `player.token` و`playerId`؛ الصندوق لا يجلب شيئاً بدون لاعب مسجّل.
- **06-push-notifications.md** — كل خط أنابيب الدفع: الأذونات (`AuthorizationStatus`→`permissionState`)، register-token، الـ background handler، cold-start deep-link، وحدث foreground `onMessage` الذي **يُحفّز refetch الصندوق**. هذا الملف يستهلك مخرجاته فقط.
- **08-deeplinks-routing.md** — الـ route mapper الموحّد الذي يُحوّل `(type, data)` إلى وجهة داخلية؛ نقر صف الإشعار يستدعيه. يجب أن يستخدم **نسخة الـ SW الأشمل** لا نسخة الـ bell الأضيق.
- **11-shell-navigation.md** — أين يُركَّب زر الجرس (كإجراء في الـ AppBar/الهيدر) وكيف تُفتح شاشة الإشعارات (route أو bottom sheet).
- **12-home.md** — الصفحة الرئيسية هي حاضنة زر الجرس فعلياً في الويب؛ نسّق موضع الأيقونة معها.
- **14-games-invites.md** — وجهة `new_activity` (شاشة الألعاب مع `activityId`).
- **17-order-fnb.md** — وجهة `order_status` (شاشة الطلب).
- **18-feedback.md** — وجهة `feedback_survey` (مع `sessionId`).
- **21-join-lobby.md** — وجهتا `activity_started` و`room_invite` (شاشة الانضمام مع `code`/`invite`/`by`).
- **07-sound-system.md** — لا تبعية مباشرة (لا صوت في هذه الشاشة على هاتف اللاعب)، مذكور فقط لنفي الالتباس.

---

## 4. الواجهة والتجربة تفصيلياً

جميع القيم أدناه منقولة حرفياً من `NotificationBell.tsx`. القاعدة اللونية Dark Noir (لا وضع فاتح). الاتجاه RTL. لا `letterSpacing` على أي نص عربي.

### 4.1 زر الجرس (Bell button)

- الزر: `width 42، height 42`، خلفية `rgba(255,255,255,0.08)`، حد `1px solid rgba(255,255,255,0.12)`، `borderRadius 12`، محتوى موسّط (flex center)، `cursor pointer`، `position relative`، `transition all 0.2s`.
- الأيقونة: إيموجي `🔔` بحجم `fontSize 20`، موسّطة.
- **التفاعل**: نقرة تبدّل `open` (فتح/إغلاق اللوحة). في الويب يُغلق عبر `mousedown` خارج الحاوية؛ في Flutter انظر §6.

### 4.2 عدّاد غير المقروء (Badge)

- يظهر فقط عندما `unreadCount > 0`.
- الموضع: `position absolute, top -4, right -4` (يعلو الزر من أعلى-يمين).
- الشكل: خلفية `#ef4444`، نص `#fff`، `borderRadius 50%` (دائري)، `minWidth 20، height 20`، `fontSize 11، fontWeight 700`، محتوى موسّط، `padding 0 5px` (يتمدّد أفقياً عند 3 أرقام).
- النص: `unreadCount > 99 ? '99+' : unreadCount` — سقف العرض `"99+"`.
- ملاحظة RTL: `right -4` في الويب بصري؛ في Flutter استخدم `Positioned` مع مراعاة أن الجرس أيقونة app-bar (ضع الشارة أعلى-يمين الأيقونة بصرياً، لا تعكسها مع الاتجاه — الشارة عنصر بصري لا نصّي).

### 4.3 اللوحة المنسدلة (Dropdown panel) — الحاوية

- أنيميشن الدخول/الخروج (framer-motion `AnimatePresence`):
  - initial: `{opacity: 0, y: -10, scale: 0.95}`
  - animate: `{opacity: 1, y: 0, scale: 1}`
  - exit: `{opacity: 0, y: -10, scale: 0.95}`
  - `transition: { duration: 0.2 }` (200ms).
  - مكافئ Flutter: `FadeTransition` + `SlideTransition` (من y ‎-10px) + `ScaleTransition` (0.95→1)، `Curves.easeOut`، 200ms.
- الحاوية: `position absolute, top 50, left 0` (**مرساة يسار لأن التخطيط RTL** — أسفل الجرس مباشرة). أبعاد: `width 340، maxHeight 480`.
- الخلفية: `rgba(17,17,17,0.98)`، حد `1px solid rgba(255,255,255,0.1)`، `borderRadius 16`، `overflow hidden`، `zIndex 100`.
- تأثير: `backdropFilter: blur(20px)`، ظل `boxShadow: 0 20px 40px rgba(0,0,0,0.5)`.

ترتيب المحتوى الرأسي داخل اللوحة: **Header → (بانرات الحالة الاختيارية) → القائمة/الحالة الفارغة**. البانرات قد تتراكم فوق القائمة معاً.

### 4.4 الهيدر (Header)

- صف: `padding 14px 16px`، حد سفلي `1px solid rgba(255,255,255,0.08)`، `flex` مع `justify-content: space-between` ومحاذاة رأسية للمنتصف.
- العنوان (يمين بصرياً في RTL): نص `الإشعارات` بلون `#fff`، `fontWeight 700`، `fontSize 15`. عندما `unreadCount > 0` يُلحق به ` (N)` — أي النص الكامل مثل `الإشعارات (3)`.
- زر «قراءة الكل» (يسار بصرياً): يظهر فقط عند `unreadCount > 0`. النص الحرفي `قراءة الكل ✓`، خلفية `none`، بلا حد، لون `#f59e0b`، `fontSize 12`، `cursor pointer`. النقر يستدعي `markAllAsRead()`.

### 4.5 بانر طلب الإذن (Sub-state: permissionState === 'prompt')

- القسم: `padding 12px 16px`، خلفية `rgba(59,130,246,0.08)`، حد سفلي `1px solid rgba(255,255,255,0.06)`.
- زر CTA بعرض كامل: `width 100%، padding 10px 0، borderRadius 10، border none`.
  - الخلفية العادية: `linear-gradient(135deg, #3b82f6, #2563eb)`.
  - أثناء التفعيل (`enabling === true`): الخلفية `rgba(59,130,246,0.3)`، و`cursor: wait`، والزر `disabled`.
  - النص، اللون: `#fff`، `fontWeight 600`، `fontSize 13`.
  - النص الحرفي: العادي `🔔 تفعيل الإشعارات على هاتفك` — أثناء التفعيل `⏳ جاري التفعيل...`.
- التعليق (caption): نص `اضغط للحصول على إشعارات فورية`، لون `rgba(255,255,255,0.4)`، `fontSize 11`، `margin 6px 0 0`، `textAlign center`.
- التفاعل: `handleEnableNotifications` → يضبط `enabling=true` → `await requestPermission()` → `enabling=false`. (في Flutter `requestPermission()` يُنفَّذ عبر خدمة الدفع في 06-push-notifications.md.)

### 4.6 بانر تثبيت iOS (Sub-state: needsInstall) — يُحذف كلياً في Flutter

**هذا البانر خاص بـ PWA على iOS Safari (غير مثبّت) ولا معنى له في تطبيق native — احذفه.** موثّق هنا للأمانة والتكافؤ فقط:
- القسم: `padding 12px 16px`، خلفية `rgba(245,158,11,0.08)`، حد سفلي `1px solid rgba(255,255,255,0.06)`.
- العنوان: `📱 لتفعيل الإشعارات على iPhone`، لون `#f59e0b`، `fontSize 13`، `fontWeight 600`، `marginBottom 4`.
- الجسم: لون `rgba(255,255,255,0.5)`، `fontSize 12`، `lineHeight 1.6`، ثلاثة أسطر حرفياً:
  1. `1. اضغط على ⎙ (مشاركة) في أسفل Safari` (رمز `⎙` بحجم `fontSize 16`).
  2. `2. اختر "إضافة إلى الشاشة الرئيسية"` (النص بين علامتي التنصيص بخط عريض ولون `#fff`).
  3. `3. افتح التطبيق من الشاشة الرئيسية`.

### 4.7 بانر الرفض (Sub-state: permissionState === 'denied')

- القسم: `padding 12px 16px`، خلفية `rgba(239,68,68,0.08)`، حد سفلي `1px solid rgba(255,255,255,0.06)`.
- النص الحرفي: `❌ تم رفض الإشعارات — يمكنك تفعيلها من إعدادات المتصفح`، لون `#ef4444`، `fontSize 12`.
- **بديل Flutter**: استبدل ذيل النص «من إعدادات المتصفح» بزر/عبارة تفتح إعدادات التطبيق عبر `openAppSettings()` (حزمة `permission_handler`). نص مقترح للزر: `فتح إعدادات التطبيق` — لكن **حافظ على صدر الرسالة `❌ تم رفض الإشعارات` حرفياً** ليبقى التكافؤ.

### 4.8 الحالة الفارغة (Empty state)

- عندما `notifications.length === 0`: `div` بـ `padding 32`، `textAlign center`، لون `rgba(255,255,255,0.3)`، `fontSize 14`، نص حرفي `لا توجد إشعارات`.
- **ملاحظة**: البانرات (طلب الإذن/الرفض) قد تظهر أعلى الحالة الفارغة معاً — لا يمنع أحدهما الآخر.

### 4.9 القائمة (List container)

- الحاوية: `overflowY auto، maxHeight 340`.
- تُعرض أول **30 عنصراً فقط** (`notifications.slice(0, 30)`) رغم أن الـ backend يعيد حتى 50. في Flutter: اعرض القائمة الكاملة (بلا قصّ) أو أبقِ الحد 30 للتكافؤ الحرفي — الأفضل عرض الكل مع `ListView` كسول لأن الشاشة الكاملة تسمح بذلك (قرار واعٍ؛ لا يكسر التكافؤ لأن التكافؤ = «إظهار أحدث الإشعارات»).

### 4.10 صف الإشعار (Row)

- الحاوية: `padding 12px 16px`، حد سفلي `1px solid rgba(255,255,255,0.04)`، `cursor pointer`، `transition background 0.2s`.
- خلفية الصف: مقروء → `transparent`؛ غير مقروء → `rgba(245,158,11,0.05)` (لمسة عنبرية خفيفة).
- التخطيط الداخلي: `flex، gap 10، alignItems flex-start` — [أيقونة/صورة قائدة] + [عمود النص] + [عمود لاحق].

**أ) العنصر القائد — إما thumbnail أو emoji chip:**
- إذا كان `data.imageUrl` موجوداً → إطار صورة: `position relative، width 44، height 44، borderRadius 8، overflow hidden، flexShrink 0، background #000`.
  - الصورة: `width 100%، height 100%، objectFit cover`.
  - إذا كان `data.videoUrl` موجوداً أيضاً → طبقة فوقية `▶️`: `position absolute، inset 0`، flex center، خلفية `rgba(0,0,0,0.35)`، `fontSize 16`.
- وإلا → رقاقة إيموجي: `fontSize 22، width 32، height 32، borderRadius 8`، flex center، خلفية `` `${TYPE_COLORS[type] || '#666'}20` `` (لون النوع على شفافية 12.5% — اللاحقة `20` hex alpha ≈ 0.125)، `flexShrink 0`.
  - محتواها: `TYPE_ICONS[type] || '🔔'`.

**ب) عمود النص:** `flex 1، minWidth 0`.
- العنوان: `title`؛ اللون مقروء `rgba(255,255,255,0.6)` / غير مقروء `#fff`؛ الوزن مقروء `400` / غير مقروء `600`؛ `fontSize 13، marginBottom 2`.
- الجسم: `body`؛ لون `rgba(255,255,255,0.4)`، `fontSize 12`، مقصوص إلى **سطرين** (`-webkit-box، WebkitLineClamp 2، WebkitBoxOrient vertical، overflow hidden`). في Flutter: `Text(body, maxLines: 2, overflow: TextOverflow.ellipsis)`.
- الوقت: `formatTimeAgo(createdAt)`؛ لون `rgba(255,255,255,0.2)`، `fontSize 10، marginTop 4`.

**ج) العمود اللاحق:** `flex column، alignItems center، gap 4، flexShrink 0`.
- نقطة غير المقروء: تظهر فقط عندما `!isRead` → مربع `width 8، height 8، borderRadius 50%`، خلفية `#f59e0b`.
- chevron: يظهر عندما `rich || resolveNotificationUrl(type, data)` (أي الصف قابل للفتح كمودال غني أو ينحلّ إلى وجهة) → نص `◀` (مؤشّر RTL)، لون `rgba(255,255,255,0.2)`، `fontSize 14`.

### 4.11 خرائط الأنواع (منقولة حرفياً)

**`TYPE_ICONS`** (fallback `🔔`):
| type | icon |
|---|---|
| `new_activity` | 📅 |
| `game_ended` | 🎮 |
| `custom` | 📢 |
| `reminder` | ⏰ |
| `friend_booked` | 👥 |
| `level_up` | 🏆 |
| `booking_confirmed` | ✅ |
| `comeback` | 🔥 |
| `feedback_survey` | 📋 |
| `order_status` | 🍽️ |

**`TYPE_COLORS`** (fallback `#666`):
| type | color |
|---|---|
| `new_activity` | `#f59e0b` |
| `game_ended` | `#ef4444` |
| `custom` | `#8b5cf6` |
| `reminder` | `#3b82f6` |
| `friend_booked` | `#22c55e` |
| `level_up` | `#f59e0b` |
| `booking_confirmed` | `#22c55e` |
| `comeback` | `#ef4444` |
| `feedback_survey` | `#8b5cf6` |
| `order_status` | `#10b981` |

خلفية رقاقة الإيموجي = لون النوع + `20` (alpha ≈ 12.5%). في Flutter: `color.withOpacity(0.125)` (أو `Color(0x20......)`).

### 4.12 مودال تفاصيل الإشعار الغني (Rich detail modal)

يُفتح عند نقر صف يحمل `imageUrl` أو `videoUrl` (`isRich`).

- الغطاء (overlay): `position fixed، inset 0، zIndex 200`، خلفية `rgba(0,0,0,0.82)`، `backdropFilter blur(6px)`، flex center، `padding 16`؛ أنيميشن fade فقط (`opacity 0→1`، خروج `1→0`). نقر الخلفية يغلق المودال.
- البطاقة: أنيميشن `scale 0.92→1` + `y 20→0` (خروج معكوس)؛ `dir="rtl"`؛ `width 100%، maxWidth 420، maxHeight 88vh، overflowY auto`؛ خلفية `#0f0f0f`، حد `1px solid rgba(255,255,255,0.12)`، `borderRadius 18`، ظل `0 20px 60px rgba(0,0,0,0.6)`. `stopPropagation` على البطاقة (نقرها لا يُغلق).
- **الهيدر**: `flex space-between، padding 14px 16px`، حد سفلي `1px solid rgba(255,255,255,0.08)`.
  - العنوان: `span` بلون `#fff`، `fontWeight 700`، `fontSize 15`، flex `gap 8` = إيموجي النوع (`TYPE_ICONS[type] || '🔔'`) + `title`.
  - زر الإغلاق: نص `✕`، لون `#888`، `fontSize 20`، `lineHeight 1`، بلا حد/خلفية. النقر يغلق (`setDetail(null)`).
- **الوسائط**:
  - إذا `data.videoUrl` → `<video controls playsInline>` بـ `src = videoUrl`، `poster = imageUrl || undefined`؛ نمط `width 100%، maxHeight 50vh، background #000، display block`.
  - وإلا إذا `data.imageUrl` → `<img>` بـ `src = imageUrl`؛ نمط `width 100%، maxHeight 55vh، objectFit contain، background #000، display block`.
- **الجسم**: يُعرض عند وجود `data.richBody || body`؛ يُفضَّل `data.richBody` على `body`. النمط: `padding 14px 16px`، لون `rgba(255,255,255,0.82)`، `fontSize 14`، `lineHeight 1.7`، `whiteSpace pre-wrap` (يحترم أسطر النص). في Flutter: `Text` مع `softWrap` أو `SelectableText`.
- **زر الإجراء**: يظهر فقط عند وجود `data.url`. الغلاف `padding 0 16px 16px`؛ الزر `width 100%، padding 12px 0، borderRadius 12، border none`، خلفية `linear-gradient(135deg, #f59e0b, #d97706)`، لون `#000`، `fontWeight 700`، `fontSize 14`.
  - النص الحرفي: خارجي (`isExternalUrl`) → `🔗 فتح الرابط`؛ داخلي → `انتقال ◀`.
  - التفاعل: يخزّن `u = data.url` → يغلق المودال (`setDetail(null)`) → `go(u)` (خارجي: يفتح المتصفح؛ داخلي: تنقّل داخلي).
- **الـ footer**: `padding 0 16px 14px`، لون `rgba(255,255,255,0.25)`، `fontSize 11`، النص = `formatTimeAgo(createdAt)`.

مكافئ Flutter للمودال: `showGeneralDialog` مع `barrierColor: Color(0xD1000000)` (≈ 0.82) + `BackdropFilter blur(6px)`؛ محتوى بـ `ScaleTransition(0.92→1)` + انزلاق طفيف؛ فيديو عبر `video_player`+`chewie` (poster = imageUrl)؛ صورة عبر `CachedNetworkImage(fit: BoxFit.contain)`.

### 4.13 حالات الخطأ للوسائط (إضافة Flutter — الويب لا يعرض شيئاً صريحاً)

الويب يعتمد سلوك `<img>`/`<video>` الافتراضي (لا placeholder صريح). في Flutter:
- فشل تحميل الصورة → `errorWidget` هادئ (أيقونة النوع + خلفية `#000`) بلا رسالة صاخبة.
- فشل تحميل الفيديو → إظهار الـ poster (`imageUrl`) فقط أو أيقونة النوع.
- هذه إضافات دفاعية لا تكسر التكافؤ.

---

## 5. التكيّف مع الشاشات 6→11 إنش

الاستراتيجية الكاملة (Window Size Classes) موثّقة في **01-foundation-theme.md**. أدناه تخصيص **هذه الشاشة** بدقة. القرار المعماري الأساسي: **الـ dropdown ذو العرض الثابت 340 غير مناسب للموبايل native — رَقِّه**.

- **compact (< 600dp — هواتف 6–7 إنش):**
  - زر الجرس كإجراء في الـ AppBar (42dp لمسياً كافٍ؛ حافظ على أبعاد الأيقونة والشارة كما في §4.1/4.2).
  - عند النقر: **افتح شاشة إشعارات كاملة** (route) أو **bottom sheet بارتفاع كامل تقريباً** بدل اللوحة المنسدلة — عمود واحد كما في PWA.
  - الصفوف بعرض الشاشة كاملاً؛ نفس أحجام النص والأيقونات في §4.10.
  - المودال الغني: بملء العرض مع `maxHeight 88%` من ارتفاع الشاشة.
- **medium (600–840dp — تابلت 8 إنش):**
  - يجوز الإبقاء على نمط **لوحة منبثقة مرساة من الجرس** (overlay) لكن بعرض أوسع (≈ 380–420dp) بدل 340، أو الإبقاء على الشاشة الكاملة مع **سقف عرض للمحتوى النصي 640dp موسّطاً**.
  - القائمة عمود واحد؛ ارفع مقاس thumbnail القائد قليلاً (من 44 إلى ≈ 52) وحجم أيقونة chip بنسبة معتدلة للحفاظ على النسبة اللمسية.
  - المودال الغني: `maxWidth` ثابت (≈ 480) موسّط بدل ملء العرض.
- **expanded (> 840dp — تابلت 10–11 إنش):**
  - سقف عرض المحتوى **840–960dp موسّطاً**.
  - **two-pane (master-detail) موصى به**: قائمة الإشعارات في جزء يمين (RTL) والتفاصيل الغنية في جزء يسار **بدل مودال ملء الشاشة** — نقر صف غني يملأ الجزء الجانبي لا يفتح حواراً.
  - **مضاعفة عناصر العرض الحساسة**: كبّر thumbnail القائد ووسائط المودال (الفيديو/الصورة) بدل مجرد تمديدها؛ الصور تُعرض بدقة أعلى ضمن سقف عرضها.
  - زر الجرس يبقى في الـ AppBar لكن قد يفتح الجزء الجانبي مباشرة إذا كانت الشاشة two-pane دائمة.

في كل الفئات: الاتجاه RTL، ثيم Dark Noir ثابت، والبانرات (طلب الإذن/الرفض) تبقى أعلى القائمة.

---

## 6. المنطق والتدفقات

### 6.1 الحالة المُصدَّرة من طبقة البيانات (مطابِقة للهوك)

الهوك `usePushNotifications` يُصدّر: `notifications`، `unreadCount`، `permissionState`، `isIOSPWA`، `needsInstall`، `markAsRead`، `markAllAsRead`، `fetchNotifications`، `requestPermission`. في Flutter، هذه تصبح **provider/service واحد** (لا نسخ متعددة — احذف حارس التركيب الثلاثي `autoRegisterInFlight`/`autoRegisteredForToken`؛ لا حاجة له بنسخة واحدة).

- `unreadCount` **يُحسب من طرف العميل** = `notifications.filter(!isRead).length` بعد كل جلب. الويب لا يستدعي `/unread-count`. في Flutter يجوز إبقاء الحساب المحلي (تكافؤ) أو استخدام `/unread-count` لشارة رخيصة (إضافة اختيارية، §7).
- `permissionState: 'prompt' | 'granted' | 'denied' | 'unsupported'` — مصدره خدمة الدفع في 06-push-notifications.md. في Flutter تختفي `'unsupported'` و`needsInstall` (لا مفهوم PWA install). الخريطة: `AuthorizationStatus.notDetermined → 'prompt'`، `authorized/provisional → 'granted'`، `denied → 'denied'`.

### 6.2 آلة حالة الجرس/اللوحة

```
[مغلق] --نقر الجرس--> [مفتوح]
[مفتوح] --نقر الجرس / نقر خارجي (mousedown) / تنقّل داخلي--> [مغلق]
[مفتوح] --نقر صف غني--> [مفتوح + مودال تفاصيل]
[مفتوح + مودال] --نقر الخلفية / زر ✕ / زر إجراء--> [مفتوح] ثم قد يُغلق عند التنقّل
```

- **نقر صف** (المنطق الحرفي من الكود):
  1. إذا `!isRead` → `markAsRead(id)` (تفاؤلي، انظر 6.4).
  2. إذا `isRich` (يحمل `imageUrl`/`videoUrl`) → افتح مودال التفاصيل و**توقّف** (`return`).
  3. وإلا → `go(resolveNotificationUrl(type, data))`.
- **`go(url)`**: إذا `url` فارغ → لا شيء. إذا خارجي (`/^https?:\/\//i`) → افتح خارجياً (Flutter: `url_launcher` بـ `LaunchMode.externalApplication`). وإلا → أغلق اللوحة ونفّذ تنقّلاً داخلياً (`router.push` ↔ go_router في Flutter عبر 08-deeplinks-routing.md).

### 6.3 `resolveNotificationUrl` — النسختان

**نسخة الـ bell المحلية (الأضيق — الموجودة فعلاً في NotificationBell.tsx):**
```
if (data?.url) return data.url;
switch (type) {
  case 'activity_started':  return data?.roomCode ? `/player/join?code=${data.roomCode}` : null;
  case 'new_activity':      return data?.activityId ? `/player/games?activityId=${data.activityId}` : '/player/games';
  case 'booking_confirmed': return '/player/home';
  case 'game_ended':        return '/player/home';
  case 'feedback_survey':   return data?.sessionId ? `/player/feedback?sessionId=${data.sessionId}` : '/player/feedback';
  case 'custom':            return data?.url || null;
  default:                  return null;   // نوع مجهول = صف غير قابل للتنقّل
}
```

**قرار النقل (من التقارير):** هذه النسخة **أضيق من نسخة الـ SW وهي تناقض لا ميزة**. اعتمد في Flutter **نسخة الـ SW الأشمل** الموحّدة في 08-deeplinks-routing.md، والتي تضيف:
- `room_invite` → `data.url` || `/player/join?code={roomCode}&invite=1[&by={encodeURIComponent(inviterName)}]` وإلا `/player/home`.
- `activity_started` بلا roomCode → `/player/home` (بدل `null`).
- `order_status` → `data.url` || `/player/order`.
- `new_order` → `data.url` || `/venue/orders` (سياق موظف — قد لا يعني تطبيق اللاعب).
- `custom`/default → `data.url` || `/player/home` (بدل `null`).

**لكن انتبه لأثر الواجهة:** الـ chevron `◀` في الصف يظهر عندما `rich || resolveNotificationUrl(...)`. إن اعتمدت نسخة الـ SW (التي نادراً ما تُرجع null)، ستظهر الأسهم على صفوف أكثر مما في الويب. هذا مقبول ومقصود (تحسّن اتساق)، لكن **وثّقه في §12 كاختلاف مقصود عن الويب** حتى لا يُحسب فارق تكافؤ.

### 6.4 التعليم كمقروء (تفاؤلي)

- `markAsRead(id)`: `PUT /:id/read` → تحديث محلي فوري: اضبط `isRead=true` للصف، وأنقص `unreadCount` بحد أدنى 0 (`Math.max(0, prev-1)`). في الويب لا rollback عند فشل الشبكة (يُبتلع بصمت). في Flutter: أبقِ التفاؤلية؛ يجوز إضافة rollback هادئ عند فشل PUT (تحسين).
- `markAllAsRead()`: `PUT /read-all` → محلياً: كل الصفوف `isRead=true`، `unreadCount=0`.

### 6.5 الجلب، الـ polling، وإعادة جلب الحدث الحي

- **الجلب الأولي**: عند توفّر اللاعب (mount) → `fetchNotifications()` فوراً.
- **polling**: `setInterval(fetchNotifications, 60000)` — كل 60 ثانية. في Flutter: `Timer.periodic(Duration(seconds: 60))`. أوقف المؤقّت عند التخلّص/الخروج.
- **foreground FCM**: عندما `permissionState === 'granted'` يسجّل `onForegroundMessage(() => fetchNotifications())` (محتوى الرسالة نفسه غير مستعمل — مجرد محفّز). في Flutter: `FirebaseMessaging.onMessage.listen((_) => refetch())` من 06-push-notifications.md.
- **رسالة الـ SW (ويب فقط)**: مستمع `navigator.serviceWorker 'message'` عند `event.data.type === 'PUSH_RECEIVED'` → `fetchNotifications()`. في Flutter لا SW — يُستبدل بحدث `onMessage` أعلاه (نفس الأثر: إعادة جلب).
- **إضافة Flutter موصى بها**: refetch عند عودة التطبيق للمقدمة عبر `AppLifecycleListener` (الويب لم يملك خطّاف resume صريحاً) — مرآة `visibilitychange`.

### 6.6 الحالات الحدّية

- **لا لاعب مسجّل**: `fetchNotifications`/`markAsRead`/`markAllAsRead`/`requestPermission` كلها تعود مبكراً بلا فعل. الشاشة تبقى فارغة/غير متاحة. اربط ظهور الجرس بحالة الجلسة (05-session-auth.md).
- **`data === {}` أو `null`**: `isRich` تعود false؛ لا thumbnail؛ رقاقة إيموجي بلون fallback؛ لا url. تعامل مع `data` كخريطة قد تكون فارغة.
- **`body` فارغ**: سطر الجسم يظهر فارغاً (ارتفاع ضئيل)؛ لا تعطّل. في المودال، إذا `richBody` و`body` كلاهما فارغ لا يُعرض قسم الجسم.
- **العدّ > 99**: الشارة تعرض `99+`.
- **قائمة > 30**: الويب يقصّ عند 30؛ Flutter يجوز عرض الكل (§4.9).
- **503 `DB unavailable`**: الجلب يعيد استجابة بلا `success` → الويب يبتلعها بصمت (تبقى القائمة الحالية). في Flutter: أبقِ القائمة السابقة؛ لا تُظهر خطأ صاخباً في الـ polling (قد تُظهر حالة «تعذّر التحديث» خفيفة اختيارياً).
- **401 `غير مصادق`**: يعني انتهاء الجلسة → مرّرها لطبقة الجلسة (05-session-auth.md) لإعادة تسجيل الدخول؛ لا تُظهر إشعارات مضلّلة.
- **صور/فيديو من `/uploads/...` نسبية**: يجب حلّها مقابل مضيف الـ backend (لا proxy في native) — انظر 03-networking-rest.md.

### 6.7 إعادة الاتصال واستعادة الحالة

- لا حالة socket تُستعاد هنا (صفر socket). الاستعادة = مجرد `fetchNotifications()` عند: mount، عودة المقدمة، كل 60s، وعند وصول رسالة foreground. القائمة نفسها بلا حالة معقّدة — إعادة الجلب تُعيد بناءها كاملة من الـ backend (المصدر الوحيد للحقيقة).

---

## 7. عقود التكامل

### 7.1 REST (كلها بمسار أساس `/api/player-notifications` وترويسة `Authorization: Bearer <player JWT>` ما لم يُذكر خلاف)

| Method + Path | Request | Response (كما تُستعمل) | متى |
|---|---|---|---|
| GET `/api/player-notifications` (اختياري `?limit=`، افتراضي **50**) | — | `{ success: true, notifications: NotificationRow[] }` مرتّبة `createdAt DESC` | الجلب الأولي + polling 60s + عند حدث foreground |
| PUT `/api/player-notifications/:id/read` | — | `{ success: true }` | عند نقر صف غير مقروء / (تفاؤلياً) |
| PUT `/api/player-notifications/read-all` | — | `{ success: true }` | زر «قراءة الكل ✓» |
| GET `/api/player-notifications/unread-count` | — | `{ success: true, count: number }` | **غير مستعمل في الويب** — إضافة اختيارية لشارة رخيصة |
| DELETE `/api/player-notifications/:id` | — | `{ success: true }` | **غير مستعمل في الويب** — إضافة اختيارية (swipe-to-delete عبر `Dismissible`) |
| POST `/api/player-notifications/register-token` | `{ token, deviceId, deviceInfo }` | `{ success: true }`؛ 400 `{error:'token مطلوب'}`؛ 401 `{error:'غير مصادق'}` | يخص **06-push-notifications.md** (مذكور للسياق فقط) |

**أظرف الأخطاء المشتركة**: 401 `{ error: 'غير مصادق' }` (لا playerId)، 503 `{ error: 'DB unavailable' }` (على كل مسارات القراءة/التحديث). `NotificationRow` = `{ id, playerId, title, body, type, data, isRead, isPushSent, createdAt }`.

**مصدر مفتاح VAPID** (`GET /api/push/vapid-public-key`، بلا auth) — **يُحذف كلياً في Flutter** (لا Web Push)؛ مذكور فقط لأنه في نفس شريحة الويب. لا علاقة له بصندوق الوارد.

### 7.2 Socket

**لا شيء.** هذه الشريحة لا تستخدم Socket.IO إطلاقاً. القنوات المكافئة للتحديث الحي:
- **FCM foreground** (`FirebaseMessaging.onMessage`) → محفّز `fetchNotifications()` فقط (محتوى الرسالة غير مستعمل هنا). التفاصيل في 04-socket-layer.md (نفي) و06-push-notifications.md (التنفيذ).
- في الويب: رسالة الـ SW → page `postMessage({type:'PUSH_RECEIVED', ...})` — **تُستبدل بـ `onMessage` في Flutter**؛ لا يوجد SW.

عقد حمولة الدفع (data-only، كل القيم strings) — مصدر حقول `data` في الصف الغني والتوجيه: `{ title, body, tag?, type, url?, imageUrl?, videoUrl?, richBody?, roomCode?, activityId?, sessionId?, inviterName? }`. قيم `type` المعروفة: `activity_started, room_invite, new_activity, booking_confirmed, game_ended, feedback_survey, order_status, new_order, custom, reminder, friend_booked, level_up, comeback`.

---

## 8. نماذج Dart المطلوبة

```dart
/// صف إشعار كما يعيده الـ backend (select كامل من player_notifications)
class NotificationItem {
  final int id;
  final int? playerId;            // قد يكون null (references nullable)
  final String title;            // varchar(200) not null
  final String body;             // text default '' — قد يكون فارغاً
  final String type;             // varchar(30) not null
  final Map<String, dynamic> data; // jsonb default {} — قد يكون فارغاً
  final bool isRead;
  final bool isPushSent;         // موجود في الاستجابة (غير مستعمل في الواجهة)
  final DateTime createdAt;

  // ── قيم مشتقّة من data (كل القيم strings في حمولة الدفع) ──
  String? get imageUrl   => data['imageUrl']   as String?;
  String? get videoUrl   => data['videoUrl']   as String?;
  String? get richBody   => data['richBody']   as String?;
  String? get url        => data['url']        as String?;
  String? get roomCode   => data['roomCode']   as String?;
  String? get activityId => data['activityId'] as String?;
  String? get sessionId  => data['sessionId']  as String?;
  String? get inviterName=> data['inviterName']as String?;

  bool get isRich => imageUrl != null || videoUrl != null;

  NotificationItem copyWith({bool? isRead});
  factory NotificationItem.fromJson(Map<String, dynamic> json);
}

/// حالة الإذن (مطابقة لسلسلة الويب — 'unsupported' يختفي في native)
enum PushPermissionState { prompt, granted, denied, unsupported }

/// وصف مرئي للنوع (الأيقونة + اللون) — من TYPE_ICONS/TYPE_COLORS
class NotificationTypeMeta {
  final String icon;   // fallback '🔔'
  final Color color;   // fallback Color(0xFF666666)
  static NotificationTypeMeta of(String type);
  Color get chipBackground => color.withOpacity(0.125); // اللاحقة hex '20'
}

/// حالة صندوق الوارد (provider/notifier واحد — لا نسخ متعددة)
class NotificationsState {
  final List<NotificationItem> notifications;
  final int unreadCount;                 // محسوب: notifications.where((n)=>!n.isRead).length
  final PushPermissionState permission;
  final bool needsInstall;               // يبقى false دائماً في native
  final bool loading;
}
```

دوال الخدمة: `Future<void> fetchNotifications()`، `Future<void> markAsRead(int id)`، `Future<void> markAllAsRead()`، (اختياري) `Future<void> deleteNotification(int id)`، (اختياري) `Future<int> fetchUnreadCount()`، `Future<bool> requestPermission()` (مفوّض لخدمة الدفع في 06).

دالّة الوقت النسبي (**انقلها حرفياً — لا تعتمد افتراضيات `timeago`**):
```dart
String formatTimeAgo(DateTime createdAt) {
  final diff = DateTime.now().difference(createdAt);
  final mins = diff.inMinutes;
  if (mins < 1) return 'الآن';
  if (mins < 60) return 'قبل $mins د';
  final hours = mins ~/ 60;
  if (hours < 24) return 'قبل $hours ساعة';
  final days = hours ~/ 24;
  return 'قبل $days يوم';
}
```

مساعدات: `bool isExternalUrl(String? u) => u != null && RegExp(r'^https?://', caseSensitive: false).hasMatch(u);`

---

## 9. الحزم المستخدمة

- إدارة الحالة: `flutter_riverpod` (أو `provider`) — provider/notifier واحد لصندوق الوارد. (وحّد مع 02-models-data-layer.md.)
- الشبكة: `dio` (أو `http`) عبر عميل REST المركزي في 03-networking-rest.md.
- الصور: `cached_network_image` (thumbnail الصف + صورة المودال) — مع حلّ مسارات `/uploads` مقابل مضيف الـ backend.
- الفيديو: `video_player` + `chewie` (فيديو المودال، poster = imageUrl).
- الروابط الخارجية: `url_launcher` (`LaunchMode.externalApplication`).
- إعدادات الإذن (بديل بانر الرفض): `permission_handler` (`openAppSettings()`).
- الدفع (تبعية خارجية، في 06): `firebase_core` + `firebase_messaging`.
- أنيميشن: مدمج (`FadeTransition`/`ScaleTransition`/`SlideTransition`/`showGeneralDialog`) — أو `flutter_animate` اختيارياً.
- شارة العدّ: `Stack` + `Positioned` يدوي (يكفي)، أو حزمة `badges` اختيارياً.
- الحذف بالسحب (اختياري): `Dismissible` مدمج.
- (لا حاجة لـ `flutter_local_notifications` هنا — تخص 06؛ ولا `just_audio` — لا صوت في هذه الشاشة.)

---

## 10. اختلافات Android / iOS

- **`BackdropFilter blur` (لوحة blur(20) + مودال blur(6))**: مكلف على أجهزة Android الضعيفة؛ فكّر في تقليله أو استبداله بخلفية شبه معتمة على الفئات الدنيا. iOS يتعامل مع الـ blur بكفاءة أعلى. (تحسين أداء، لا فرق سلوكي.)
- **بديل بانر الرفض**: `openAppSettings()` يفتح صفحة إعدادات التطبيق على المنصتين، لكن مسار الإعدادات وتسميته يختلفان (Android: App info → Notifications؛ iOS: Settings → App → Notifications). النص العربي يبقى موحّداً.
- **فيديو المودال**: `video_player` يستخدم ExoPlayer على Android وAVPlayer على iOS؛ صيغ/كودكات مدعومة قد تختلف — اعتمد صيغاً شائعة (mp4/H.264) من الـ backend.
- **الحذف بالسحب (اختياري `Dismissible`)**: اتجاه السحب في RTL — استخدم `DismissDirection.endToStart` بما يوافق حسّ RTL؛ سلوك الحركة متطابق منطقياً بين المنصتين.
- **إيماءة الرجوع على iOS** (إن رُقّي الصندوق لـ route كامل في compact): مرّر إغلاق الشاشة عبر back gesture الطبيعي؛ على Android زر الرجوع النظامي يغلقها. سلوك متكافئ.
- **صور الإشعارات في مركز الإشعارات النظامي (OS)** تخص 06-push-notifications.md لا هذه الشاشة (`imageUrl` هنا يُعرض داخل التطبيق فقط، وهو مجاني على المنصتين داخل الواجهة).

لا اختلافات جوهرية أخرى داخل واجهة الصندوق نفسها؛ ما ورد أعلاه هو الفروق الفعلية ذات الأثر.

---

## 11. الأصول المطلوبة

- **لا أصول صور/ملفات ثابتة خاصة بهذه الشاشة.** الأيقونات كلها إيموجي نصّية (🔔 والجرس، 📅🎮📢⏰👥🏆✅🔥📋🍽️ للأنواع، ▶️ overlay الفيديو، ◀ chevron/انتقال، ✕ إغلاق، 🔗 فتح الرابط، 📱⎙ لبانر iOS المحذوف). حافظ على الإيموجي **خالية من ZWJ** (سياسة الثيم في 01) لتوافق الأجهزة القديمة.
- الخطوط: من الثيم المركزي (Tajawal للجسم، Amiri للعناوين) — لا تُعرّف محلياً.
- الوسائط الديناميكية: `data.imageUrl` (thumbnail الصف + صورة المودال)، `data.videoUrl` (فيديو المودال مع poster) — تأتي وقت التشغيل من الـ backend (مسارات مطلقة أو `/uploads` نسبية تُحلّ مقابل المضيف).
- ألوان الأنواع hex ثابتة في الكود (§4.11) — ضمّنها كثوابت لا كأصول.

---

## 12. معايير القبول — checklist تكافؤ مع النسخة الحالية

- [ ] زر الجرس 42×42، خلفية `rgba(255,255,255,0.08)`، حد `rgba(255,255,255,0.12)`، radius 12، إيموجي 🔔 بحجم 20. ✓
- [ ] الشارة تظهر فقط عند `unread>0`، دائرة `#ef4444`، نص أبيض 11/700، `minWidth 20/height 20`، سقف `99+`. ✓
- [ ] اللوحة: عرض 340 (compact route/sheet)، `rgba(17,17,17,0.98)`، radius 16، blur(20)، ظل `0 20px 40px rgba(0,0,0,0.5)`، مرساة يسار (RTL). ✓
- [ ] أنيميشن دخول اللوحة `{opacity:0,y:-10,scale:0.95}→{1,0,1}` خلال 200ms، وخروج معكوس. ✓
- [ ] الهيدر: عنوان `الإشعارات` (+`(N)` عند unread>0) أبيض 700/15؛ زر `قراءة الكل ✓` بلون `#f59e0b` 12px يظهر فقط عند unread>0. ✓
- [ ] بانر طلب الإذن (prompt): CTA بتدرّج `#3b82f6→#2563eb`، نص `🔔 تفعيل الإشعارات على هاتفك` / `⏳ جاري التفعيل...`، caption `اضغط للحصول على إشعارات فورية`. ✓
- [ ] بانر الرفض (denied): `❌ تم رفض الإشعارات` بلون `#ef4444`؛ في Flutter زر `openAppSettings()` بدل ذيل «المتصفح». ✓
- [ ] بانر تثبيت iOS (`needsInstall`) **محذوف** في Flutter. ✓
- [ ] الحالة الفارغة: `لا توجد إشعارات` موسّطة، `rgba(255,255,255,0.3)` 14px. ✓
- [ ] الصف: padding `12px 16px`، خلفية غير المقروء `rgba(245,158,11,0.05)`، حد سفلي `rgba(255,255,255,0.04)`. ✓
- [ ] العنصر القائد: thumbnail 44×44 radius 8 (مع overlay ▶️ للفيديو على `rgba(0,0,0,0.35)`) أو رقاقة إيموجي 32×32 radius 8 بخلفية لون النوع 12.5%. ✓
- [ ] العنوان (لون/وزن حسب isRead)، الجسم مقصوص سطرين `rgba(255,255,255,0.4)` 12px، الوقت `rgba(255,255,255,0.2)` 10px. ✓
- [ ] نقطة غير المقروء 8×8 `#f59e0b`؛ chevron `◀` عند `rich || resolveUrl≠null`. ✓
- [ ] خرائط `TYPE_ICONS`/`TYPE_COLORS` منقولة حرفياً مع fallback `🔔`/`#666`. ✓
- [ ] `formatTimeAgo` ينتج حرفياً `الآن` / `قبل N د` / `قبل N ساعة` / `قبل N يوم`. ✓
- [ ] نقر صف: تعليم كمقروء إن لزم → غني يفتح المودال / وإلا تنقّل عبر الـ route mapper. ✓
- [ ] المودال الغني: overlay `rgba(0,0,0,0.82)`+blur(6)، بطاقة `#0f0f0f` maxWidth 420 radius 18، دخول scale 0.92→1 + y 20→0، إغلاق بالخلفية/✕. ✓
- [ ] المودال: فيديو (`controls playsInline` poster=imageUrl maxHeight 50vh) أو صورة (`contain` maxHeight 55vh)؛ جسم `richBody||body` 14/1.7 pre-wrap؛ زر إجراء عنبري `🔗 فتح الرابط`/`انتقال ◀` عند وجود url؛ footer وقت نسبي. ✓
- [ ] الجلب الأولي + polling 60s + refetch على foreground `onMessage`. ✓
- [ ] `unreadCount` محسوب من طرف العميل (تكافؤ مع الويب). ✓
- [ ] «قراءة الكل» تصفّر العدّ وتعلّم الكل محلياً بعد `PUT /read-all`. ✓
- [ ] **اختلاف مقصود موثّق**: اعتماد نسخة `resolveNotificationUrl` الأشمل (الـ SW) يجعل أسهم `◀` تظهر على صفوف أكثر من الويب — مقبول ومقصود، لا يُحسب فارق تكافؤ. ✓
- [ ] **إضافات اختيارية لا تكسر التكافؤ**: `unread-count` للشارة، `DELETE /:id` عبر `Dismissible`، refetch عند عودة المقدمة. ✓

---

## 13. ملاحظات أداء وأمان

- **الشبكة**: polling كل 60s خفيف (استجابة ≤50 صفاً)؛ أوقف المؤقّت عند عدم وجود لاعب أو عند الخروج/التخلّص لتوفير البطارية. فكّر بإيقاف الـ polling أثناء الخلفية وتفعيله على resume (`AppLifecycleListener`).
- **`unread-count` (اختياري)**: أرخص من جلب القائمة كاملة لتحديث الشارة فقط؛ استخدمه للـ badge وأبقِ جلب القائمة عند فتح الشاشة فقط إن رغبت بتقليل الحمل.
- **blur**: `BackdropFilter` مكلف GPU على Android الضعيف — قلّله على الفئات الدنيا (§10).
- **التخزين المؤقت للوسائط**: `cached_network_image` يخفّض إعادة التحميل؛ صور/فيديو الإشعار قد تكون خارجية — طبّق حدود حجم/مهلة.
- **أمان الروابط**: الروابط الخارجية تُفتح عبر `url_launcher` (خارجياً)؛ **تحقّق من مخطط الرابط** (`https?://` فقط قبل الفتح الخارجي) — لا تفتح مخططات عشوائية من حمولة الدفع. الروابط الداخلية تمرّ عبر الـ route mapper المُتحقَّق منه في 08-deeplinks-routing.md (لا `router.push` بسلسلة خام غير معروفة).
- **الحقن عبر `data`**: `data` من الـ backend jsonb حرّ — عامل كل حقوله كنصوص لا موثوقة؛ لا تنفّذ HTML خام (الويب عرض `richBody`/`body` كنص عادي `pre-wrap` لا `dangerouslySetInnerHTML` — حافظ على ذلك: استخدم `Text`، لا محرّك HTML).
- **الجلسة**: لا تجلب/تعرض شيئاً بدون `player.token`؛ عالج 401 بإعادة توجيه الجلسة لا بإظهار قائمة قديمة مضلّلة.
- **الخصوصية**: عناوين/أجسام الإشعارات قد تكشف معلومات لعب حسّاسة — احترم قفل الشاشة النظامي (عرض الإشعار النظامي يخص 06)؛ داخل التطبيق لا حاجة لإخفاء إضافي.
