# الصوت المباشر: RealtimeKit، قواعد الكتم، المتحدث النشط، المواجهة
> جزء من خطة تطبيق Flutter لواجهة اللاعب — الفهرس والتسلسل في 00-MASTER-PLAN.md

---

## 1. الهدف والنطاق

هذا الملف يوصّف **طبقة الصوت/الفيديو المباشر للّعب عن بُعد** (online / «عن بُعد» / remote) في نادي المافيا. الطبقة تتألف من ثلاثة أجزاء مترابطة:

1. **`RemoteVoice`** — شريط تحكّم الصوت/الكاميرا الدائم (نسختان: لاعب سفليّ ثابت، مضيف بطاقة علوية) المبنيّ فوق hook `useVoice` (عميل Cloudflare RealtimeKit headless).
2. **`useActiveSpeaker`** — مُصغِّر (reducer) نقيّ يستمع لأحداث الـ socket ويحسب `allowedPids` (من يُسمح له بالكلام الآن) — المصدر الوحيد لقاعدة فتح/كتم المايك.
3. **`ConfrontationControls`** — واجهة المواجهة الثنائية (المواجهة 30 ثانية بين لاعبَين أثناء نقاش النهار) بحالاتها الست.

**النطاق الحرج (يجب احترامه حرفياً):**

- **تظهر الطبقة فقط عندما `state.config.isRemote === true`**. لا تُرسم إطلاقاً في الألعاب المحلية داخل النادي؛ والخادم يرفض توكن الصوت للغرف غير البعيدة بخطأ `voice_remote_only`.
- **اجتماع RealtimeKit واحد لكل غرفة**: يُنشأ كسولاً على أول طلب `voice:get-token` ويُخزَّن مُعرّفه في حالة اللعبة (`config.voiceMeetingId`). كل مشارك (لاعبون + المضيف) ينضمّ لنفس الاجتماع.
- **التطبيق عميل ثانٍ لنفس الـ backend**: لا endpoints ولا أحداث socket جديدة. Flutter يستدعي `voice:get-token` عبر Socket.IO، يستلم `authToken`، ويُهيّئ عميل RealtimeKit/Dyte الأصليّ به. العقد الخلفيّ لا يتغيّر إطلاقاً.
- **نموذج «المايك السياديّ» (sovereign lock)**: في أطوار اللوبي يملك الجميع مايكاً حرّاً يدوياً؛ أثناء اللعب يُفتح مايك اللاعب تلقائياً فقط في دوره (نقاش/تبرير/مواجهة) ويُغلق تلقائياً في غير ذلك، والمضيف يفرض كتم كل من يتكلم بلا إذن.
- **الكاميرا مقفولة ليلاً** (مكافحة غش: لا كروت أدوار على الكاميرا في `NIGHT`).

**خارج النطاق:** عرض حلقات التحدّث/الفيديو على كروت الطاولة ثلاثية الأبعاد (`PhoneSpectatorView`) — هذا الملف **مصدر البيانات** لها (`onVoiceMaps` → `{videoByPid, audioByPid}`) لكن الرسم يخصّ شريحة الطاولة/المتفرّج (27-spectator-gameover.md). كما أن منطق الليدر المفوَّض في الـ Host Console (توليد/ربط الأدوار، إدارة النقاش) يخصّ 30-host-console.md؛ هنا فقط جزء الصوت والمواجهة المشترك بين اللاعب والمضيف.

---

## 2. المرجع في الكود الحالي — مسارات الملفات المصدر

| الملف | الدور |
|---|---|
| `frontend/src/hooks/useVoice.ts` | 273 سطراً — عميل RealtimeKit headless: دورة الاتصال، ربط الصوت، خرائط pid، سجلّ التشخيص، وضع السمّاعة، كتم مشارك. |
| `frontend/src/hooks/useActiveSpeaker.ts` | 71 سطراً — مُصغِّر `allowedPids` من 7 أحداث socket + حالة المواجهة. |
| `frontend/src/components/RemoteVoice.tsx` | 209 سطراً — نسختا الشريط (لاعب/مضيف) + الأيقونات SVG + معاينة الكاميرا الذاتية + الـ 3 effects للقواعد. |
| `frontend/src/components/ConfrontationControls.tsx` | 156 سطراً — واجهة المواجهة الست + `mapErr`. |
| `frontend/src/lib/voice.ts` | 51 سطراً — محمّل SDK كسول (`loadRealtimeKit`)، `rtkArray`، `physicalIdFromCustom`. |
| `backend/src/sockets/voice.socket.ts` | معالج `voice:get-token`. |
| `backend/src/sockets/confrontation.socket.ts` | معالجات المواجهة الثلاثة + المؤقّت الخلفيّ. |
| `backend/src/services/voice.service.ts` | إنشاء الاجتماع + إصدار التوكن + اختيار الـ preset + Cloudflare REST. |
| `frontend/src/components/PlayerFlow.tsx` | نقطتا الاستدعاء عند اللاعب (~2708 و ~3149، فرعان متطابقان — نسخة واحدة في Flutter) + حساب `shouldOpenMic` + `useActiveSpeaker`. |
| `frontend/src/app/player/host/page.tsx` | نقطة الاستدعاء عند المضيف (~424–450) + `hostAllowedPids` + `nameByPid`. |

**مراجع تحقُّق قرأتُها بالكامل لكتابة هذا الملف:** جميع الملفات أعلاه، إضافة إلى تقريرَي `reports/voice.md` و `sections/host-voice.md`.

---

## 3. التبعيات على ملفات الخطة الأخرى

- **04-socket-layer.md** — عقد `emit(event,payload) → Future` مع ack، وعقد `on(event, handler) → unsubscribe`. هذه الطبقة كلها socket-only. رسالة timeout بالعربية «الخادم في وضع قطع الاتصال أو لا يستجيب (Timeout)» ونجاح فقط عند `response.success === true`.
- **20-game-state-core.md** — `gamePhase`، `roomId`، `state.config.isRemote`، roster (`players[]` بحقول `physicalId/name/isAlive`)، و`isPlayerDead`. هذه الطبقة تُركّب مرة واحدة فوق كل الأطوار.
- **21-join-lobby.md** — أطوار اللوبي (`LOBBY/ROLE_GENERATION/ROLE_BINDING`) = `freeMic`.
- **23-night-phase.md** — طور `NIGHT` يُطفئ الكاميرا قسراً.
- **25-day-voting.md** — أحداث `day:discussion-updated` و`day:justification-timer-started/stopped` مصدرها شريحة النقاش/التصويت؛ هنا نستهلكها فقط لحساب `allowedPids`.
- **27-spectator-gameover.md** — مُستهلِك `onVoiceMaps` (`videoByPid/audioByPid`) لرسم حلقات التحدّث/الفيديو على الكروت، و`GAME_OVER` = طور `freeMic`.
- **30-host-console.md** — نسخة المضيف من `RemoteVoice`/`ConfrontationControls` مركّبة في قشرة الـ Host؛ `hostAllowedPids`/`nameByPid` تُبنى هناك.
- **01-foundation-theme.md** — الثيم الداكن، ألوان الذهبي `#C5A059`، خط `Amiri`، استراتيجية Window Size Classes (§5)، وحدة RTL (`Directionality.rtl`).
- **02-models-data-layer.md** — نماذج `Player`، `GameConfig` (`isRemote`, `voiceMeetingId`).
- **06-push-notifications.md** — تدفقات صلاحيات النظام (مرجع لنمط طلب صلاحية الميكروفون/الكاميرا قبل الانضمام).
- **90-release-android.md / 91-release-ios.md** — إعداد الخلفية (foreground service / UIBackgroundModes) + نصوص صلاحيات الميكروفون/الكاميرا (§10).

---

## 4. الواجهة والتجربة تفصيلياً

> السياق العام: كل الواجهة عربية RTL. الويب يلفّ الوثيقة بـ `dir="rtl"`؛ في Flutter لُفّ الشجرة بـ `Directionality(TextDirection.rtl)` واستخدم `EdgeInsetsDirectional`/`AlignmentDirectional`. لا `framer-motion` في هذه الشريحة — الأنيميشنات محدودة: `animate-pulse` (نقطة الاتصال أثناء الاتصال + العدّاد ≤10ث)، و`transition-all` على أزرار التبديل (استخدم `AnimatedContainer` مدّة ~200ms).

### 4.أ — `RemoteVoice` نسخة اللاعب (شريط صوت سفليّ ثابت)

تُرسم عندما `enabled && !isHost`. إذا `enabled === false` تُرجع **null** بالكامل (لا شيء).

**الحاوية الخارجية:** ثابتة أسفل الشاشة عرضاً كاملاً، عمود متمركز، `z-40`، `pointer-events: none` (الأبناء يعيدون تفعيل اللمس). في Flutter: `Positioned(left:0,right:0,bottom:0)` داخل `Stack` أعلى محتوى الطور، أو `bottomSheet`/طبقة ثابتة في القشرة.

1. **معاينة الكاميرا الذاتية** (فقط عند `selfVideoOn && selfVideoTrack`): عنصر فيديو `76×104px`، `rounded-xl` (12px)، `object-cover`، حد `2px` بلون `sky-500/60`، `shadow-lg`، خلفية سوداء، **معكوس مرآةً** `transform: scaleX(-1)`. محاذاة للنهاية أعلى الشريط (`self-end pe-3 pb-1`). في Flutter: `Transform(alignment: Alignment.center, transform: Matrix4.diagonal3Values(-1,1,1), child: ...)` حول عرض الفيديو المحلّي من الـ SDK داخل `ClipRRect(borderRadius: 12)`.

2. **الشريط نفسه:** `flex items-center gap-2` (فجوة 8px)، `rounded-t-2xl` (16px علوي فقط)، حد `1px` بلا حد سفليّ `border-[#1f1c17]`، خلفية `bg-[#0a0a0acc]` (أسود بشفافية ~0.8) مع `backdrop-blur-md`، حشوة `px-4 pt-2` وحشوة سفلية `calc(0.5rem + env(safe-area-inset-bottom))`. في Flutter: `BackdropFilter(ImageFilter.blur(sigmaX:12,sigmaY:12))` + لون `Color(0xCC0A0A0A)`، و`SafeArea(top:false)` أو `MediaQuery.paddingOf(context).bottom` للحشوة السفلية.

3. **مؤشّر الاتصال:** نقطة دائرية `8×8px` + نص `10px` بخط mono لون `#9a9a9a`:
   - متصل: نقطة `bg-emerald-500` (#10b981)، نص **`متصل`**.
   - خطأ: نقطة `bg-red-500` (#ef4444)، نص **`غير متاح`**.
   - يتصل: نقطة `bg-amber-500` (#f59e0b) **`animate-pulse`**، نص **`يتصل…`**.

4. **زر المايك** — دائرة `48×48` (w-12 h-12):
   - **ON** (`selfAudioOn`): `bg-emerald-500/25 border-emerald-500/60 text-emerald-200` + توهّج `box-shadow: 0 0 16px rgba(52,211,153,.45)`، أيقونة `MicIcon`.
   - **OFF**: `bg-black/65 border-[#2a2a2a] text-[#808080]`، أيقونة `MicOffIcon` (بشرطة حمراء `#d13636`).
   - المؤشّر: `cursor-pointer` فقط في أطوار `freeMic`، وإلا `cursor-default` (الزر خامل أثناء اللعب — النقر لا يفعل شيئاً خارج `freeMic`).
   - **شارة القفل السياديّ** (عندما `micLocked === (!freeMic && !selfAudioOn)`): دائرة `20×20` أعلى-يسار الزر (`-top-1 -left-1`)، `bg-[#1a1610] border border-[#C5A059]/50 text-[#C5A059]`، تحوي `LockIcon` مقاس `11×11`. وأسفل الزر تعليق مطلق (`-bottom-3.5`) نص **`يُفتح في دورك`** بمقاس `8.5px` لون `#9a9a9a` `whitespace-nowrap`.
   - **tooltips** (سمة title — في Flutter `Tooltip` أو اضغط-مطوّل):
     - `freeMic` + ON: **`اضغط لكتم مايكك`**
     - `freeMic` + OFF: **`اضغط لفتح مايكك (لوبي)`**
     - مقفول + ON: **`دورك — مايكك مفتوح`**
     - مقفول + OFF: **`مايكك مقفول — يُفتح في دورك`**
   - **onTap:** `if (freeMic && connected) { selfAudioOn ? disableSelfAudio() : enableSelfAudio() }` — لا شيء غير ذلك.

5. **زر الكاميرا** — دائرة `48×48`:
   - **ON** (`selfVideoOn`): `bg-sky-500/25 border-sky-500/60 text-sky-200` + توهّج `0 0 16px rgba(56,189,248,.45)`، أيقونة `CamIcon`.
   - **OFF**: `bg-black/65 border-[#2a2a2a] text-[#808080]`.
   - **معطّل** (شفافية 40%) عندما `!connected || gamePhase === 'NIGHT'`.
   - title: ليلاً **`الكاميرا معطّلة ليلاً`**، وإلا **`الكاميرا`**.
   - **onTap:** `if (gamePhase !== 'NIGHT') { selfVideoOn ? disableSelfVideo() : enableSelfVideo() }`.

6. **زر السمّاعة/الأذن** — دائرة `48×48`:
   - **ON** (`speakerMode`، الافتراضي true): `bg-amber-500/25 border-amber-500/60 text-amber-200` + توهّج `0 0 16px rgba(251,191,36,.4)`، أيقونة `SpeakerIcon` (بموجات).
   - **OFF**: دار محايد داكن، أيقونة `EarIcon` (بلا موجات).
   - title: ON → **`الصوت من السمّاعة الخارجية (اضغط للأذن)`**؛ OFF → **`الصوت من سمّاعة الأذن (اضغط للسبيكر)`**.
   - **onTap:** `setSpeakerphone(!speakerMode)`.

### 4.ب — `RemoteVoice` نسخة المضيف (بطاقة علوية inline)

**الحاوية:** `mb-3 rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] px-3 py-2`.

1. **صف الحالة (يمين):** نفس نقطة الحالة ثلاثية اللون + نص `text-[#c9c3b5] font-mono text-xs`:
   - متصل: **`صوت · {participantCount + 1}`** (يُضاف 1 لاحتساب المضيف نفسه — `participantCount` يستثني الذات).
   - خطأ: **`صوت غير متاح`**.
   - غيره: **`جارٍ الاتصال…`**.

2. **صف الأزرار (يسار):**
   - (أ) **زر السمّاعة**: `px-2 py-1.5 rounded-lg text-xs font-bold`، نشط `border-amber-500/50 text-amber-300 bg-amber-500/10`، خامل `border-[#2a2a2a] text-[#808080] bg-black/40`. أيقونة `SpeakerIcon`/`EarIcon`. title: **`الصوت من السمّاعة الخارجية`** / **`الصوت من سمّاعة الأذن`**.
   - (ب) **زر السجلّ 📋**: نفس المقاس والنمط النشط الكهرمانيّ. title **`سجلّ الصوت التشخيصيّ`**. يبدّل لوحة السجلّ.
   - (ج) **زر المايك الذاتيّ**: `px-3 py-1.5`، نشط `border-emerald-500/50 text-emerald-300 bg-emerald-500/10`، **معطّل** (40%) عند `!connected`. المحتوى: أيقونة `MicIcon`/`MicOffIcon` + نص **`مايكك مفتوح`** / **`مايكك مغلق`**. title **`اضغط لكتم مايكك`** / **`اضغط لفتح مايكك`**. onTap: `selfAudioOn ? disableSelfAudio() : enableSelfAudio()`.

3. **صف رقائق الكتم** (فقط عندما `canMute && talking.length > 0`): `mt-2 flex flex-wrap gap-1.5`. `talking` = كل pid مايكه مفتوح باستثناء المضيف (`-1`) و`selfPhysicalId`. رقاقة لكل متحدّث: **`🔇 كتم {name || #pid}`** — `px-2 py-1 rounded-md text-[10px] font-bold border border-red-500/40 text-red-300 bg-red-500/10`. onTap: `muteParticipantByPid(pid, nameByPid[pid])`.

4. **لوحة السجلّ التشخيصيّ** (عند تفعيل 📋): `mt-2 rounded-lg border border-[#1a1a1a] bg-black/50 p-2`.
   - رأس: **`📋 سجلّ الصوت`** (10px، `#c9c3b5`، bold) + تلميح **`اللاعب يفتح مايكه بنفسه؛ تقدر تكتمه من هنا`** (9px، `#666`).
   - الجسم: `max-h-28 overflow-y-auto`، `dir="rtl"`، `10px` mono `#9a9a9a`، يعرض **آخر 14 سطراً** فقط (`log.slice(-14)`)، `whitespace-pre-wrap break-words`.
   - **حالة فارغة**: **`لا أحداث بعد…`** بلون `#555`.
   - أسطر السجلّ (طابع زمنيّ `HH:MM:SS` بلغة `ar-EG` ثم ` · ` ثم النص). النصوص الحرفية:
     - **`✅ متّصل بالصوت (مضيف)`** أو **`✅ متّصل بالصوت (لاعب)`**
     - **`➕ انضمّ {name}`** (fallback الاسم: `مشارك`)
     - **`➖ غادر {name}`**
     - **`🔇 كتمتَ {label}`** (label = الاسم أو `#{pid}`)
     - **`❌ فشل كتم {label}: {message|خطأ}`**
     - **`⚠️ {label} غير موجود في الصوت`**
     - **`{label} مايكه مغلق أصلاً`**
     - **`❌ تعذّر توكن الصوت: {error|خطأ}`**
     - **`❌ فشل الاتصال بالصوت: {message|خطأ}`**

### 4.ج — `ConfrontationControls` — ست حالات متبادلة الحصر

الكتلة دائماً `mb-3`. الحالات مرتّبة حسب الأسبقية في الكود؛ أول شرط يصدق يُرسم، وإلا **null**.

**1) شريط المواجهة النشطة (يراه الجميع)** — عندما `confrontation.status === 'ACTIVE'`:
- الحاوية: `rounded-xl border border-red-500/40 bg-gradient-to-r from-red-950/40 to-black px-3 py-2.5 text-center`.
- سطر الأسماء: شبكة 3 أعمدة `[1fr auto 1fr]`، `items-center gap-1.5`، `text-red-300 font-black text-sm`، **`fontFamily: 'Amiri, serif'`**:
  - خلية يسار (`truncate text-left dir="auto"`): `#{requesterId}` (بخط mono) مسافة `{nameOf(requesterId)}`.
  - خلية وسطى (`shrink-0`): **`⚔️ ×`**.
  - خلية يمين (`truncate text-right dir="auto"`): `#{targetId}` (mono) `{nameOf(targetId)}`.
- العدّاد: `mt-1 font-mono font-black text-2xl`. أبيض عادة؛ عند `remaining <= 10` → `text-red-400 animate-pulse`. النص **`{remaining}s`**.
- إن كان المُشاهِد أحد الطرفين (`myPid === requesterId || myPid === targetId`): سطر إضافيّ **`مايكك مفتوح — تكلّم الآن`** بمقاس `11px` لون `text-red-300/80`.
- **حساب `remaining`** كل تكّة 500ms: `startedAt ? max(0, round((durationSeconds||30) − (now − startedAt)/1000)) : (durationSeconds||30)`.

**2) لوحة موافقة الطرف المستهدَف** — `status === 'PENDING_TARGET' && targetId === myPid && !isHost`:
- الحاوية الذهبية: `rounded-xl border border-[#C5A059]/50 bg-[#C5A059]/10 px-3 py-2.5 text-center`.
- العنوان: **`⚔️ {requesterName} يطلب مواجهتك`** (`text-[#C5A059] font-bold text-sm mb-2`؛ `requesterName` من `nameOf`).
- زران متمركزان `gap-2`:
  - **`قبول`** — `bg-emerald-500/15 border border-emerald-500/50 text-emerald-300`.
  - **`رفض`** — `bg-red-500/15 border border-red-500/50 text-red-300`.
  - كلاهما `px-5 py-3 min-h-[44px] rounded-xl text-sm font-bold disabled:opacity-40`، معطّلان أثناء `busy`.
  - onTap: `send('player:respond-confrontation', {accept: true|false})`.
- سطر خطأ inline: `text-[10px] text-red-400/80 mt-1` عند `err`.

**3) لوحة اعتماد الليدر** — `status === 'PENDING_LEADER' && isHost`:
- نفس الحاوية الذهبية. العنوان: **`⚔️ طلب مواجهة: {A} × {B} (وافقا)`** (`A=nameOf(requesterId)`, `B=nameOf(targetId)`).
- زران:
  - **`اعتمِد (30ث)`** — emerald.
  - **`ارفض`** — red.
  - onTap: `send('leader:approve-confrontation', {approve: true|false})`.
- سطر خطأ inline بنفس النمط.

**4) انتظار الطالِب** — `status === 'PENDING_TARGET' && requesterId === myPid`:
- شريط رماديّ: `rounded-xl border border-[#2a2a2a] bg-black/40 px-3 py-2 text-center text-xs text-[#808080] font-mono`، النص **`⚔️ بانتظار موافقة {targetName}…`**.

**5) انتظار غير-المضيف لموافقة الليدر** — `status === 'PENDING_LEADER' && !isHost`:
- نفس الشريط الرماديّ، النص **`⚔️ بانتظار موافقة المُوجِّه…`**.

**6) زر الطلب + المُنتقي** — `!confrontation && !isHost && gamePhase === 'DAY_DISCUSSION' && myPid != null`:
- **مطويّ:** زر عرض كامل **`⚔️ اطلب مواجهة لاعب`** — `w-full px-3 py-3 min-h-[44px] rounded-xl text-sm font-bold border border-red-500/40 text-red-300 bg-red-500/10`. onTap يفتح المُنتقي ويمسح الخطأ.
- **المُنتقي:** `rounded-xl border border-red-500/40 bg-black/50 p-2.5`:
  - رأس: **`اختر خصمك للمواجهة`** (`text-xs font-bold text-red-300`) + زر إغلاق **`✕`** (`w-9 h-9 -me-1.5`، `text-[#808080] text-base`).
  - جسم: `grid grid-cols-2 gap-2 max-h-48 overflow-y-auto overscroll-contain`. الأهداف = `players.filter(p => p.isAlive && p.physicalId !== myPid)`. زر لكل هدف: `px-2.5 py-3 min-h-[44px] rounded-lg text-xs font-bold border border-[#2a2a2a] bg-[#0a0a0a] text-white truncate disabled:opacity-40`، المحتوى: `#{physicalId}` (mono، لون `#C5A059`) مسافة `{name}`. onTap: `send('player:request-confrontation', {targetPhysicalId})`.
  - سطر خطأ inline: `text-[10px] text-red-400/80 mt-1 text-center`.

**خرائط رسائل الخطأ (`mapErr`)** — تُعرض حرفياً في سطر الخطأ:
| code | النص العربيّ |
|---|---|
| `max_reached` | `استُنفد حدّ المواجهات لهذه الجولة (3)` |
| `confrontation_in_progress` | `هناك مواجهة جارية` |
| `discussion_only` | `المواجهة أثناء النقاش فقط` |
| `must_be_alive` | `كلا الطرفين يجب أن يكونا أحياء` |
| `not_target` | `لست الطرف المستهدَف` |
| `only_leader` | `المُوجِّه فقط` |
| default | `{code}` أو `تعذّر` |
| استثناء مرميّ | `{e.message}` أو `خطأ` |

> ملاحظة: `nameOf(pid) = players.find(p.physicalId === pid)?.name || '#{pid}'`. في بثّ `PENDING_LEADER` لا يرسل الخادم أسماءً، فتُشتقّ من roster المحليّ.

### 4.د — الأيقونات SVG (لإعادة الرسم في Flutter)

كلها `20×20` بـ `viewBox 0 0 24 24`، `fill:none stroke:currentColor strokeWidth:2 strokeLinecap:round strokeLinejoin:round` (إلا `LockIcon`). استخدم `flutter_svg` بسلاسل SVG المضمّنة، أو `CustomPainter`. مسارات دقيقة:
- **MicIcon:** `<rect x=9 y=2 w=6 h=12 rx=3/>` + `<path d="M5 10a7 7 0 0 0 14 0"/>` + `<line 12,17→12,21/>`.
- **MicOffIcon:** كـ MicIcon + `<line 4,4→20,20 stroke="#d13636"/>` (الشرطة حمراء ثابتة).
- **CamIcon:** `<rect x=2 y=6 w=13 h=12 rx=2/>` + `<path d="M15 10l6-3v10l-6-3"/>`.
- **SpeakerIcon:** `<path d="M4 9v6h4l5 4V5L8 9H4z"/>` + `<path d="M16 8a5 5 0 0 1 0 8"/>` + `<path d="M18.5 5.5a9 9 0 0 1 0 13"/>`.
- **EarIcon:** `<path d="M4 9v6h4l5 4V5L8 9H4z"/>` (بلا موجات).
- **LockIcon:** `11×11` viewBox 24، `fill:currentColor`، `<path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 0 1 6 0v3H9z"/>`.

**رموز نصّية (emoji glyphs، ليست أصولاً):** 📋 (السجلّ)، 🔇 (كتم)، ⚔️ (كل واجهة المواجهة)، ✕ (إغلاق المُنتقي)، ➕ ➖ ✅ ❌ ⚠️ (أسطر السجلّ).

---

## 5. التكيّف مع الشاشات 6→11 إنش (إلزامي)

الاستراتيجية الكاملة (Window Size Classes) موثّقة في 01-foundation-theme.md؛ تخصيص **هذه الشاشة**:

**compact (< 600dp — هواتف 6–7 إنش):** الوضع المرجعيّ كما في الـ PWA بلا تغيير.
- شريط اللاعب السفليّ ثابت عرض كامل، أزرار `48×48`، فجوة 8px، معاينة ذاتية `76×104`.
- بطاقة المضيف inline بعرض كامل.
- شريط المواجهة النشطة: العدّاد `text-2xl` (~24sp)، شبكة الأسماء 3 أعمدة.
- مُنتقي الأهداف: `grid-cols-2`.

**medium (600–840dp — تابلت 8 إنش):** سقف عرض للمحتوى النصّي `640dp` متمركز.
- الشريط السفليّ للّاعب: لُفّه في `Center(ConstrainedBox(maxWidth: 640))` بدل التمدّد الكامل عبر الشاشة، مع إبقائه ثابتاً أسفل.
- بطاقة المضيف ولوحات المواجهة داخل نفس سقف 640dp.
- مُنتقي الأهداف: ارفع الشبكة إلى **`grid-cols-3`**.
- معاينة الكاميرا الذاتية: كبّرها إلى ~`96×132`. أزرار التحكّم يمكن أن تكبر إلى ~`52–56`.
- العدّاد يبقى `text-2xl` أو يكبر قليلاً (~28sp).

**expanded (> 840dp — تابلت 10–11 إنش):** سقف عرض `840–960dp` متمركز، و**مضاعفة عناصر اللعب الحسّاسة (المؤقّت) بدل تمديدها**.
- **عدّاد المواجهة (30ث) عنصر حسّاس**: ضاعف حجمه `text-2xl → ~text-5xl` (~48sp) واحتفظ بنبض ≤10ث الأحمر. لا تمدّد الشريط أفقياً — وسّطه ضمن السقف.
- سطر الأسماء (Amiri): كبّر إلى ~`text-lg`.
- أزرار التحكّم (مايك/كاميرا/سمّاعة): ضاعف تقريباً إلى ~`64–72`، وباعد الفجوة إلى 12–16px.
- معاينة الكاميرا الذاتية: ضاعف إلى ~`152×208`.
- مُنتقي الأهداف: ارفع الشبكة إلى **`grid-cols-4`**.
- رقائق الكتم عند المضيف: أهداف لمس أكبر (لكن تبقى `flex-wrap`).
- الحفاظ على أهداف لمس ≥`44dp` في كل الفئات (مضمون أصلاً في compact).

> ثابت في كل الفئات: RTL، الألوان hex، النصوص الحرفية، ومعكوسية مرآة المعاينة الذاتية (`scaleX(-1)`).

---

## 6. المنطق والتدفقات

### 6.أ — دورة حياة الاتصال (`useVoice`)

المُحرِّك effect مُفتاح على **`[enabled, roomId, isHost]` فقط** — لا يُعاد التهيئة عند تبدّل الطور (حرج: الويب يستخدم `key="remote-voice"` ثابتاً + ref-mirrored callbacks لمنع إعادة التركيب وانقطاع الصوت). **في Flutter: اجعل الصوت خدمة مفردة (singleton service عبر Riverpod/Bloc) مُثبّتة فوق كل widgets الأطوار — لا تربط دورة حياتها بـ widget طور.**

خطوات التهيئة (عندما `enabled && roomId`):
1. `res = await emit('voice:get-token', {roomId})`. عند الفشل (`!res.success`): `error = res.error || 'voice_token_failed'` + سطر سجلّ `❌ تعذّر توكن الصوت: …` ثم توقّف.
2. **[صلاحيات — إضافة Flutter]** اطلب صلاحية الميكروفون قبل الانضمام (وصلاحية الكاميرا عند أول تشغيل كاميرا). رفض → حالة `error`/`غير متاح`.
3. حمّل SDK الأصليّ (بديل `loadRealtimeKit`؛ في Flutter الحزمة مُدمجة، لا حقن script).
4. `meeting = RealtimeKitClient.init({authToken: res.authToken, defaults: {audio: isHost, video: false}})` — **المضيف ينضمّ ومايكه مفتوح، اللاعب مكتوم، الكاميرا مغلقة للجميع**.
5. حارس الإلغاء: علم `cancelled`؛ إن هُدم الـ effect أثناء التهيئة → `meeting.leave()` فوراً.
6. اربط مستمعي المجموعة والذات (§7 أحداث SDK)، ثم `await meeting.join()`.
7. اربط صوت المشاركين المنضمّين مسبقاً، `connected = true`, `error = null`، سطر سجلّ `✅ متّصل بالصوت (…)`.

**التنظيف** عند إلغاء التركيب/تغيّر الغرفة: `meeting.leave()`، فصل كل عُقد الصوت، إزالة عناصر الصوت المخفية، إغلاق AudioContext، `connected = false`. **في Flutter:** استدعِ `leave()`/`dispose()` على الخدمة عند مغادرة الغرفة فقط (لا عند تبدّل الطور).

**`rebuild()`** يُعيد بناء اللقطة الكاملة من حالة SDK: `selfAudioOn/selfVideoOn/selfVideoTrack` من `meeting.self`؛ `canMute` من `meeting.self.permissions.canDisableParticipantAudio`؛ خرائط `audioByPid`/`videoByPid` مفهرَسة بـ physicalId (الذات = pid الخاص، أو `-1` للمضيف)؛ `participantCount = joined.length` (يستثني الذات).

**تعيين الهوية:** `customParticipantId`: `'host' → -1` (`VOICE_HOST_KEY`)؛ `'p{N}' → N`؛ أي شيء آخر → `null` (يُتجاهَل المشارك في الخرائط).

### 6.ب — قواعد المايك لكل مرحلة (محرّك القاعدة الأساسيّ)

`freeMic = gamePhase ∈ {LOBBY, ROLE_GENERATION, ROLE_BINDING, GAME_OVER}`.

ثلاثة effects (انقلها حرفياً):
1. **مزامنة المايك السياديّ** (لاعب فقط، `!isHost`، `connected`، `!freeMic`): إذا `shouldOpenMic && !selfAudioOn` → `enableSelfAudio()`؛ إذا `!shouldOpenMic && selfAudioOn` → `disableSelfAudio()`. اللاعب لا يستطيع التبديل يدوياً خارج `freeMic`.
   - `shouldOpenMic` (يحسبه الأب): `voiceAllowedPids.includes(parseInt(physicalId)) && !isPlayerDead`.
2. **فرض المضيف للكتم** (مضيف فقط، `connected`، `canMute`، `!freeMic`): عند تغيّر `audioByPid` أو `allowedPids`، أيّ pid مايكه مفتوح وليس `-1` وليس في `allowedPids` → `muteParticipantByPid(pid)`.
3. **إطفاء الكاميرا ليلاً**: إذا `gamePhase === 'NIGHT' && selfVideoOn` → `disableSelfVideo()`. (والزرّ معطّل ليلاً.)

**`allowedPids` من `useActiveSpeaker`** (أسبقيّة):
1. مواجهة `ACTIVE` → `[requesterId, targetId]` (تتجاوز كل شيء).
2. `DAY_DISCUSSION` و`discussion.status === 'SPEAKING'` → `[currentSpeakerId]`.
3. `DAY_JUSTIFICATION` ومؤقّت تبرير نشط → `[defenderId]`.
4. غير ذلك → `[]` (لا أحد: ليل، تصويت، إلخ).

**دعم الخادم (backstop) عبر presets** المُصدَرة مع التوكن: مضيف→`mafia_leader` (يكتم الآخرين)، حيّ→`mafia_player` (يبثّ)، ميّت→`mafia_dead` (لا يبثّ إطلاقاً). **الـ preset مُثبَّت لحظة إصدار التوكن حسب `isAlive`**؛ لاعب يموت أثناء اللعب يبقى بـ `mafia_player` لكن قاعدة `!isPlayerDead` + فرض المضيف تُبقيان مايكه مغلقاً. (تحديث التوكن عند الموت في Flutter = تحسين، ليس تكافؤاً.)

### 6.ج — آلة حالات المواجهة (server-authoritative)

الحالة في Redis (`state.confrontation`)؛ العميل يرسم من البثوث + أخطاء ack فقط.

```
[لا مواجهة]
  → player:request-confrontation (لاعب، نقاش، <3/جولة، كلاهما حيّ، ليس الذات)
    → confrontation:pending {PENDING_TARGET, +names}   → [PENDING_TARGET]
[PENDING_TARGET]
  → player:respond-confrontation {accept:false}  → confrontation:ended{target_declined} → [لا مواجهة]
  → player:respond-confrontation {accept:true}   → confrontation:pending {PENDING_LEADER, ids only} → [PENDING_LEADER]
[PENDING_LEADER]
  → leader:approve-confrontation {approve:false} → confrontation:ended{leader_rejected} → [لا مواجهة]
  → leader:approve-confrontation {approve:true}
    → confrontation:started {requesterId,targetId,durationSeconds:30,startedAt}  → [ACTIVE]
    → count++ ، مؤقّت خادم 30ث
[ACTIVE]
  → بعد 30ث (setTimeout خادم) → confrontation:ended{time_up} → [لا مواجهة]
```

- **حدّ 3 لكل جولة**: تصفير كسول (`confrontationRound !== state.round → count=0`).
- **العميل يمسح الحالة محلياً** عند `game:phase-changed` بعيداً عن `DAY_DISCUSSION` (المواجهة نقاشيّة فقط). المؤقّت الخادميّ يستمر مستقلاً؛ بثّ `confrontation:ended` idempotent.
- **العدّاد** يُشتقّ من `startedAt` (epoch ms) كل 500ms — لا تراكم انزياح محليّ. احذر انزياح ساعة الجهاز (الويب فيه نفس العيب؛ استخدم إزاحة وقت الخادم إن كانت محسوبة في مكان آخر بالتطبيق).

### 6.د — إعادة الاتصال واستعادة الحالة

- `useActiveSpeaker` يُبذَر `discussion` من `initialDiscussionState` (بيانات poll) لاستعادة الحالة بعد إعادة الاتصال.
- عند إعادة اتصال الـ socket (الموبايل يقطع الـ socket في الخلفية): يجب إعادة الانضمام عند `AppLifecycleState.resumed` (راجع 04-socket-layer.md و30-host-console.md). خدمة الصوت المفردة تحافظ على الاجتماع؛ لكن لو انقطع اتصال RealtimeKit في الخلفية، أعِد `join()`.
- **المهل/المؤقّتات:** `Timer.periodic(500ms)` أثناء `ACTIVE` فقط (أوقفه عند انتهاء ACTIVE)؛ ركلة إعادة بناء `Future.delayed(120ms)` بعد `enableSelfVideo` (المسار الأصليّ يستدعي `rebuild` فوراً + بعد 120ms)؛ مؤقّت المواجهة 30ث خادميّ (لا تنسخه للعميل).

### 6.ه — الحالات الحدّية

- توكن فشل / صلاحية مرفوضة → `error` → مؤشّر أحمر «غير متاح»، لا توقّف تعطّليّ.
- مشارك بـ `customParticipantId` غير معروف → يُتجاهَل (لا يظهر في الخرائط).
- كتم مشارك غير موجود → سطر `⚠️ … غير موجود في الصوت`؛ مايكه مغلق أصلاً → سطر `… مايكه مغلق أصلاً`.
- `enabled === false` → لا شيء يُرسم ولا اتصال.
- **ازدواج التركيب:** `PlayerFlow` يُركّب الزوج مرّتين بفرعَين متطابقين — **نسخة واحدة فقط في Flutter**.

---

## 7. عقود التكامل

### 7.أ — REST (لا شيء من العميل)

**العميل لا يجري أي طلب HTTP في هذه الشريحة.** كل شيء Socket.IO مع ack.

للسياق فقط (خلفيّ، لا يُنفَّذ من Flutter): Cloudflare RealtimeKit REST —
`POST https://api.cloudflare.com/client/v4/accounts/{ACCT}/realtime/kit/{APP_ID}/meetings` بجسم `{title: "mafia-{roomId}"}` → `{data:{id}}`؛ ثم `POST …/meetings/{meetingId}/participants` بجسم `{name, preset_name, custom_participant_id}` → `{data:{token}}`. Bearer `CLOUDFLARE_REALTIMEKIT_TOKEN`. الرد يُقرأ من `json.data ?? json.result`. متغيرات البيئة: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_REALTIMEKIT_APP_ID`, `CLOUDFLARE_REALTIMEKIT_TOKEN`, `RTK_PRESET_LEADER|PLAYER|DEAD` (افتراضيات `mafia_leader|mafia_player|mafia_dead`).

### 7.ب — Socket: Client → Server (emit مع ack)

| Event | Payload | ack نجاح | أخطاء ack |
|---|---|---|---|
| `voice:get-token` | `{ roomId }` | `{ success:true, authToken, meetingId, participantId ('host'\|'p{pid}'), preset }` | `voice_not_configured`, `Room not found`, `voice_remote_only`, `not_in_room`, `voice_token_failed`\|message |
| `player:request-confrontation` | `{ roomId, targetPhysicalId }` | `{ success:true }` | `remote_only`, `discussion_only`, `confrontation_in_progress`, `max_reached`, `player_not_found`, `must_be_alive`, `self` |
| `player:respond-confrontation` | `{ roomId, accept: boolean }` | `{ success:true }` | `no_pending`, `not_target` |
| `leader:approve-confrontation` | `{ roomId, approve: boolean }` | `{ success:true }` | `only_leader`, `no_pending` |

- هويّة المضيف في الخادم: `socket.data.authStaff` تُرقّي الدور إلى `leader`؛ `isHost = role==='leader' || socket.data.isPlayerHost===true`. هويّة اللاعب: `socket.data.physicalId` مقابل roster.

### 7.ج — Socket: Server → Room (بثّ، يُستمع عبر `on`)

| Event | Payload | متى يُطلق |
|---|---|---|
| `confrontation:pending` | `{ status:'PENDING_TARGET', requesterId, requesterName, targetId, targetName }` | بعد طلب صحيح |
| `confrontation:pending` | `{ status:'PENDING_LEADER', requesterId, targetId }` (**بلا أسماء**) | بعد قبول الطرف |
| `confrontation:started` | `{ requesterId, targetId, durationSeconds:30, startedAt (epoch ms) }` | اعتماد الليدر |
| `confrontation:ended` | `{ reason: 'target_declined'\|'leader_rejected'\|'time_up' }` | رفض/رفض ليدر/انتهاء 30ث |
| `day:discussion-updated` | `{ discussionState: { currentSpeakerId, status ('SPEAKING'\|…), … } }` | تغيّر دور النقاش (شريحة أخرى) |
| `day:justification-timer-started` | `{ physicalId }` | بدء مؤقّت التبرير |
| `day:justification-timer-stopped` | `(بلا حمولة مُستخدَمة)` | إيقاف المؤقّت |
| `game:phase-changed` | `{ phase }` | انتقال الطور (يمسح discussion/defender/confrontation المحليّة) |

معالجات `useActiveSpeaker`: `confrontation:pending → setConfrontation(d)`؛ `confrontation:started → setConfrontation({status:'ACTIVE', ...d})`؛ `confrontation:ended → setConfrontation(null)`؛ `game:phase-changed` (phase≠DAY_DISCUSSION → discussion=null و confrontation=null؛ phase≠DAY_JUSTIFICATION → defender=null).

### 7.د — أحداث SDK (RealtimeKit/Dyte — ليست Socket.IO)

- المجموعة: `meeting.participants.joined.on('participantJoined'|'participantLeft', p)`.
- لكل مشارك: `p.on('audioUpdate')`, `p.on('videoUpdate')`.
- الذات: `meeting.self.on('audioUpdate'|'videoUpdate'|'permissionsUpdate'|'roomJoined')`.
- سطح API المُستخدَم: `RealtimeKitClient.init({authToken, defaults:{audio,video}})`, `meeting.join()`, `meeting.leave()`, `meeting.self.enableAudio/disableAudio/enableVideo/disableVideo`, `meeting.self.audioEnabled/videoEnabled/videoTrack/permissions.canDisableParticipantAudio`, حقول المشارك `id, name, customParticipantId, audioEnabled, audioTrack, videoEnabled, videoTrack`, و`participant.disableAudio()` (كتم المضيف القسريّ)، ومجموعة `toArray()`/`values()`.
- **لا تُسجِّل** أي مستمع لـ `screenShareUpdate` أو غيره — فقط الأحداث أعلاه.

---

## 8. نماذج Dart المطلوبة

```dart
// ثوابت
const int kVoiceHostKey = -1;      // مفتاح المضيف في كل الخرائط
const int kMaxConfrontationsPerRound = 3;
const int kConfrontationDurationSeconds = 30;

// رد توكن الصوت (ack voice:get-token)
class VoiceTokenResponse {
  final bool success;
  final String? authToken;
  final String? meetingId;
  final String? participantId; // 'host' أو 'p{pid}'
  final String? preset;        // mafia_leader | mafia_player | mafia_dead
  final String? error;
}

// حالة الصوت الحيّة (مكافئ VoiceApi) — يديرها VoiceController
class VoiceState {
  final bool connected;
  final String? error;
  final bool selfAudioOn;
  final bool selfVideoOn;
  final bool canMute;              // صلاحية كتم الآخرين (المضيف)
  final Object? selfVideoTrack;    // مسار فيديو محليّ من SDK (نوع SDK)
  final Map<int, bool> audioByPid;         // من مايكه مفتوح (pid → bool)
  final Map<int, Object?> videoByPid;      // pid → مسار فيديو المشارك
  final int participantCount;      // يستثني الذات
  final List<String> log;          // مُقيَّد بـ 41 (العرض: آخر 14)
  final bool speakerMode;          // افتراضي true (السمّاعة الخارجية)
}

// حالة المواجهة (مكافئ ConfrontationState)
enum ConfrontationStatus { pendingTarget, pendingLeader, active }
class ConfrontationState {
  final ConfrontationStatus status; // 'PENDING_TARGET'|'PENDING_LEADER'|'ACTIVE'
  final int requesterId;
  final int targetId;
  final String? requesterName;
  final String? targetName;
  final int? durationSeconds;       // 30
  final int? startedAt;             // epoch ms
}

// مخرجات useActiveSpeaker
class ActiveSpeakerResult {
  final int? activeSpeakerId;
  final bool isLive;
  final ConfrontationState? confrontation;
  final List<int> allowedPids;
}

// خرائط الترحيل للأعلى (onVoiceMaps)
class VoiceMaps {
  final Map<int, Object?> videoByPid;
  final Map<int, bool> audioByPid;
}

// حالة داخلية لواجهة المواجهة (مكافئ حالة المكوّن)
class ConfrontationUiState {
  final bool pickerOpen;
  final bool busy;
  final String? err;   // نصّ مُترجَم عبر mapErr
}
```

- **`physicalIdFromCustom(String? id) → int?`**: null/‏`'host'` → null؛ `'p{N}'` → N (وإلا null).
- **`pidOf(participant) → int?`**: `customParticipantId=='host' ? -1 : physicalIdFromCustom(...)`.
- **`mapErr(String? code) → String`**: كما في جدول §4.
- دالة الأسماء: `nameOf(int pid, List<Player> players) → players.firstWhereOrNull(p.physicalId==pid)?.name ?? '#$pid'`.

---

## 9. الحزم المستخدمة

- **⚠️ عميل RealtimeKit/Dyte الأصليّ (Flutter)** — **مخاطرة رئيسية، انظر §13**. المرشّحان على pub.dev: `dyte_core` (منصّة Dyte الأصلية التي استحوذت عليها Cloudflare وأعادت تسميتها RealtimeKit)، أو حزمة `realtimekit`/`realtimekit_core` (إن نُشرت بعد الرِّبراند). **يجب التحقق من الاسم والنسخة الحيّة على pub.dev وقت البناء** قبل الاعتماد. سطح API المطلوب: `init({authToken})`، presets، `custom_participant_id`، `audioUpdate/videoUpdate`، `self.permissions.canDisableParticipantAudio`، `participant.disableAudio()`.
- **`permission_handler`** — صلاحيات الميكروفون (قبل الانضمام) والكاميرا (قبل أول تشغيل). مسار الرفض → حالة `error`/«غير متاح».
- **توجيه السمّاعة/الأذن** — إن لم يوفّره الـ SDK (`setAudioDevice`): `flutter_webrtc` (`Helper.setSpeakerphoneOn(bool)`) أو `audio_session`.
- **`wakelock_plus`** — إبقاء الشاشة مضاءة أثناء جلسة الصوت (الشاشة تبقى مضاءة للّعب أصلاً).
- **`socket_io_client`** — عبر helper الـ 04-socket-layer.md (`emit → Future` مع ack + timeout).
- **`intl`** — طوابع السجلّ الزمنية `HH:mm:ss` بلغة `ar_EG`.
- **`flutter_svg`** أو `CustomPainter` — أيقونات §4.د.
- **الخط:** حزمة `Amiri` مضمّنة (سطر أسماء المواجهة).

> **لا تُنقل**: كل آلة AudioContext + عناصر `<audio>` المخفية + استئناف الإيماءة — **workaround ويب بحت، احذفه** (§13).

---

## 10. اختلافات Android / iOS (إلزامي)

توجد اختلافات جوهرية (الصوت المباشر + الخلفية):

- **الخلفية (حرج — بدونها يموت الصوت عند تصغير التطبيق):**
  - **Android:** خدمة أماميّة `foregroundServiceType="microphone"` (و`camera` عند استخدام الكاميرا) في `AndroidManifest.xml`، وصلاحيات `RECORD_AUDIO`, `CAMERA`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MICROPHONE`. راجع 90-release-android.md.
  - **iOS:** `UIBackgroundModes` تحتوي `audio` و`voip` في `Info.plist`، مع تفعيل `AVAudioSession` بفئة `playAndRecord`. راجع 91-release-ios.md.
- **نصوص الصلاحيات (iOS `Info.plist`):** `NSMicrophoneUsageDescription` و`NSCameraUsageDescription` بنصّ عربيّ يشرح استخدام الصوت/الكاميرا في اللعب عن بُعد.
- **توجيه السمّاعة/الأذن:** سلوك السمّاعة الخارجية مقابل سمّاعة الأذن يُدار عبر `AVAudioSession`/`overrideOutputAudioPort` على iOS و`AudioManager`/`setSpeakerphoneOn` على Android — استخدم واجهة الـ SDK أو `flutter_webrtc` الموحّدة؛ راقب الاختلاف عند بلوتوث/سمّاعة سلكية.
- **`env(safe-area-inset-bottom)`:** الشريط السفليّ يحترم مؤشّر الصفحة الرئيسية على iPhone الحديثة عبر `SafeArea(top:false)`؛ على Android غالباً الحشوة صفر لكن احترم أشرطة الإيماءات.
- **إذن الميكروفون في الخلفية / الشارة:** iOS يُظهر مؤشّر الميكروفون البرتقاليّ عند فتح المايك — سلوك نظام متوقّع، لا معالجة.

---

## 11. الأصول المطلوبة

- **لا صور/أصوات/Lottie.** كل الأيقونات SVG مضمّنة (§4.د) تُلوّن بـ `currentColor`.
- **خط `Amiri`** (ملف `.ttf` مضمّن في `pubspec.yaml`) — لسطر أسماء المواجهة النشطة فقط؛ باقي النصّ يرث خطوط التطبيق + `monospace` للأرقام/الأكواد/العدّادات/الحالة.
- **رموز emoji** كنصّ (📋 🔇 ⚔️ ✕ ➕ ➖ ✅ ❌ ⚠️) — لا تحتاج أصولاً؛ تأكّد أن خط النظام يرسمها (أو ضمّن خط emoji إن لزم على أجهزة قديمة).
- **لا أصل SDK خارجيّ** يُحمَّل وقت التشغيل (بخلاف الويب الذي يحقن script من jsDelivr) — الحزمة الأصلية مُدمجة في الحزمة.

---

## 12. معايير القبول (checklist تكافؤ)

- [ ] الطبقة تظهر **فقط** عند `config.isRemote === true`؛ لا شيء في الألعاب المحلية.
- [ ] طلب `voice:get-token {roomId}` يُصدر التوكن؛ فشله يعرض «غير متاح» بلا تعطّل.
- [ ] عميل RealtimeKit يُهيّأ بـ `init({authToken, defaults:{audio:isHost, video:false}})` — المضيف مايكه مفتوح، اللاعب مكتوم، الكاميرا مغلقة.
- [ ] اجتماع واحد لكل غرفة (يُنشأ كسولاً، يُخزَّن `config.voiceMeetingId`).
- [ ] الهوية: `'host' → -1`, `'p{N}' → N`, غيره يُتجاهَل.
- [ ] **أطوار `freeMic`** (LOBBY/ROLE_GENERATION/ROLE_BINDING/GAME_OVER): مايك حرّ يدويّ للجميع، بلا قفل، بلا فرض كتم.
- [ ] **قفل سياديّ** أثناء اللعب: مايك اللاعب يُفتح تلقائياً فقط عندما `shouldOpenMic` (`allowedPids.includes(myPid) && !isPlayerDead`)، ويُغلق تلقائياً؛ والزر خامل يدوياً.
- [ ] **`allowedPids`**: مواجهة ACTIVE = الطرفان؛ نقاش SPEAKING = المتحدّث الحالي؛ تبرير = المدافِع؛ غيره = فارغ.
- [ ] **فرض المضيف**: كل متحدّث غير مسموح (وليس −1) يُكتَم فوراً (`disableAudio`).
- [ ] **الكاميرا ليلاً**: تُطفأ قسراً في `NIGHT` والزر معطّل بنصّ «الكاميرا معطّلة ليلاً».
- [ ] معاينة الكاميرا الذاتية `76×104` معكوسة مرآةً (`scaleX(-1)`) بحد sky.
- [ ] زر السمّاعة/الأذن يبدّل التوجيه، افتراضي «السمّاعة الخارجية»، بنصوص العناوين الحرفية.
- [ ] بطاقة المضيف: عدّاد المشاركين `صوت · {count+1}`، رقائق كتم `🔇 كتم {name}`، سجلّ تشخيصيّ بآخر 14 سطراً + حالة فارغة `لا أحداث بعد…`.
- [ ] أسطر السجلّ العربية الحرفية بطابع `ar-EG HH:MM:SS`.
- [ ] **المواجهة**: التدفق الكامل PENDING_TARGET → PENDING_LEADER → ACTIVE (30ث) → انتهاء تلقائيّ؛ حدّ 3/جولة برسالة `استُنفد حدّ المواجهات لهذه الجولة (3)`.
- [ ] العدّاد مُشتقّ من `startedAt` كل 500ms؛ `≤10ث` أحمر نابض؛ `{remaining}s`.
- [ ] ست حالات المواجهة تُرسم حسب الدور بنصوصها وألوانها الحرفية، وكل الأزرار خلف `busy`.
- [ ] `mapErr` يُرجع النصوص العربية الست + الافتراضيّات.
- [ ] المواجهة تُمسح محلياً عند مغادرة `DAY_DISCUSSION`.
- [ ] `onVoiceMaps` يُرحّل `{videoByPid, audioByPid}` للطاولة.
- [ ] خدمة الصوت **لا تُعاد تهيئتها عند تبدّل الطور** (اتصال مستمرّ).
- [ ] نسخة واحدة من الزوج (لا ازدواج كالويب).
- [ ] صلاحيات ميكروفون/كاميرا تُطلب قبل الانضمام، ومسار الرفض يُعالَج.
- [ ] الخلفية مُعدّة (Android foreground service / iOS audio+voip) — الصوت يبقى عند التصغير.

---

## 13. ملاحظات أداء وأمان

- **⚠️ مخاطرة SDK (blocker محتمل — تحقّق أولاً):** لا تفترض اسم حزمة على pub.dev. المرشّحون: `dyte_core`/`dyte_uikit` (Dyte، المنصّة الأصلية قبل رِبراند Cloudflare إلى RealtimeKit)، أو حزمة `realtimekit`/`realtimekit_core` المحتملة. **افحص pub.dev وقت البناء** للاسم/النسخة/الصيانة الحيّة. مخططات احتياطية عند غياب SDK مصان: (1) جسر WebView يستضيف SDK الويب — **رديء**: صعوبة تركيز الصوت/الصلاحيات في الخلفية؛ (2) WebRTC خام مقابل Cloudflare Realtime SFU — **مجهود كبير**: الـ presets/التوكن لا تنطبق. **الخطة: SDK أصليّ**، والعقد الخلفيّ لا يتغيّر.
- **احذف workaround الويب:** كل AudioContext + عناصر `<audio>` المخفية + استئناف الإيماءة موجودة فقط لالتفاف قيود المتصفّح (سياسة التشغيل التلقائيّ + توجيه صوت أندرويد ويب). في الأصليّ استخدم `setAudioDevice`/`setSpeakerphoneOn`. لا تنقلها.
- **دورة حياة واحدة:** خدمة صوت مفردة مثبّتة فوق كل الأطوار (لا widget-bound). إعادة التهيئة عند كل طور = انقطاع صوت متكرّر — عيب فادح.
- **أمان القواعد server-authoritative:** لا تثق بالعميل لفرض الكتم فقط — الخادم يفرض عبر presets (`mafia_dead` لا يبثّ إطلاقاً؛ `mafia_leader` وحده يكتم). العميل طبقة تجربة، والخادم هو الحارس. حافظ على هذا التقسيم.
- **الكاميرا ليلاً = مكافحة غش:** إطفاء الكاميرا في `NIGHT` قاعدة أمان لعبيّة (منع رؤية كروت الأدوار)، ليست تفضيلاً — افرضها بصرامة (زر معطّل + إطفاء قسريّ).
- **انزياح الساعة:** العدّاد يعتمد ساعة الجهاز مقابل `startedAt` الخادميّ؛ فرق كبير يشوّه العدّاد. استخدم إزاحة وقت الخادم إن توفّرت في التطبيق.
- **حماية الخادم من الإساءة (مطبَّقة خادمياً، تُحترم تجربياً):** حدّ 3 مواجهات/جولة؛ مواجهة واحدة في آنٍ؛ نقاش فقط؛ كلا الطرفين حيّ؛ الليدر وحده يعتمد.
- **البطارية/الحرارة:** الصوت + الكاميرا + wake lock مستهلكات؛ الكاميرا اختيارية ومغلقة افتراضياً (جيّد). راقب الاستهلاك في جلسات طويلة، وأغلق الاتصال فوراً عند مغادرة الغرفة.
- **الخصوصية:** أظهر مؤشّر الميكروفون/الكاميرا بوضوح (الشريط نفسه يفعل)؛ احترم مؤشّرات النظام (iOS البرتقاليّ)؛ لا تفتح المايك إلا وفق القاعدة السياديّة.
