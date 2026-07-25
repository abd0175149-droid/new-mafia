# كونسول المضيف عن بُعد: الشاشات التسع + مكونات الليدر الثلاثة المشتركة
> جزء من خطة تطبيق Flutter لواجهة اللاعب — الفهرس والتسلسل في 00-MASTER-PLAN.md

---

## 1. الهدف والنطاق

هذا الملف يواصف **كونسول المضيف (Host Console)** للغرف البعيدة (online remote rooms) في نادي المافيا — المسار `/player/host` داخل تطبيق اللاعب. المضيف **مُوجِّهٌ لا لاعب** («أنت المُوجِّه (لا لاعب) — تُدير اللعبة ويشترك أصدقاؤك من أجهزتهم.») — لا يأخذ دوراً ولا مقعداً، ويكتم/يفتح مايكات اللاعبين ويُدير كل أطوار اللعبة من جهازه.

النطاق يشمل تسع شاشات host + قشرة داخل اللعبة + مكوّنات مساعدة:

1. **شاشة الإنشاء** (`page.tsx` عند `gameState == null`) — ضبط اسم الغرفة والسعة وكل الإعدادات مقدّماً ثم `room:create-remote`.
2. **HostLobby** — كود الغرفة، الدعوات، roster حي مع طرد/عقوبة، سعة، إعدادات حية، بدء توزيع الأدوار.
3. **RoleGeneration** — يُفوَّض بالكامل إلى **`LeaderRoleConfigurator`** (مكوّن الليدر #1، موصوف كاملاً في §4.7).
4. **HostRoleBinding** — إسناد الأدوار الخاصة، توزيع عشوائي، تأكيد ودفع، قفل وبدء.
5. **HostDayControls** — نقاش (DiscussionDock)، مع توجيه داخليّ لأطوار DAY_* الأخرى.
6. **HostVoting** — تصويت بالوكالة.
7. **HostJustification** — تبريرات + قرار.
8. **HostElimination** — إقصاء/كشف/تعادل + شاشة الممرضة.
9. **HostNightRunner** (ليل أوتوماتيكي) + **HostMorningRecap** (ملخص الصباح).
10. **GAME_OVER** على مستوى الصفحة.
11. **RoomCodeCard** + **HostSettingsModal**.

بالإضافة إلى **مكوّنات الليدر الثلاثة المشتركة** التي يستوردها الكونسول ويجب نقلها لتكامل parity كامل:
- **`LeaderRoleConfigurator`** (§4.7) — طور ROLE_GENERATION.
- **`LeaderDayView`** (§4.16) — فولباك لأطوار النهار الخاصة: نافذة العمدة (mayor window)، تأجيل العمدة (MAYOR_POSTPONED)، قنبلة الأب الروحيّ (pendingBomb)، وأي DAY_* غير مطابق.
- **`LeaderNightView`** (§4.17) — الليل اليدويّ (`nightMode !== 'auto'`) وتدفق الشرطية (`policewomanChoice`).

**خارج النطاق (شرائح أخرى، تُعرَّف واجهاتها هنا فقط):** `RemoteVoice`, `ConfrontationControls`, `PhoneSpectatorView`, `InviteModal`, `useActiveSpeaker` → انظر 31-voice-realtimekit.md و14-games-invites.md و20-game-state-core.md.

**قاعدة صلبة:** هذه الشريحة **لا تُجري أي طلب HTTP/REST إطلاقاً** — كل التواصل Socket.IO ack-RPC. الصور فقط `<img>` GET (avatarUrl + thumb مشتق).

---

## 2. المرجع في الكود الحالي — مسارات الملفات المصدر

الجذر: `c:/Projects/new mafia/unified-mafia/frontend/src/`

- `app/player/host/page.tsx` — HostPage (القشرة + شاشة الإنشاء + التوجيه بالطور + GAME_OVER).
- `app/player/host/HostLobby.tsx`
- `app/player/host/HostRoleBinding.tsx`
- `app/player/host/HostDayControls.tsx` (يحوي `DiscussionDock`, `DiscussionFinished`; يوجّه HostVoting/HostJustification/HostElimination والفولباك لـ LeaderDayView)
- `app/player/host/HostVoting.tsx`
- `app/player/host/HostJustification.tsx`
- `app/player/host/HostElimination.tsx` (يحوي `EliminatedRow`)
- `app/player/host/HostNightRunner.tsx` (ليل أوتو + توجيه MORNING_RECAP→HostMorningRecap و manual→LeaderNightView)
- `app/player/host/HostMorningRecap.tsx`
- `app/player/host/HostSettingsModal.tsx`
- `components/RoomCodeCard.tsx`
- **مكوّنات الليدر المشتركة (مقروءة كاملةً من الكود لهذا الملف):**
  - `app/leader/LeaderRoleConfigurator.tsx`
  - `app/leader/LeaderDayView.tsx` (2267 سطراً)
  - `app/leader/LeaderNightView.tsx` (1440 سطراً)
- ثوابت: `lib/constants.ts` (Role, ROLE_NAMES, ROLE_ICONS, MAFIA_ROLES, NEUTRAL_ROLES, Phase).
- دعم: `hooks/useSocket.ts`, `hooks/useActiveSpeaker.ts`, `context/PlayerContext.tsx`, `components/PhaseLoading.tsx`, `components/PhaseHeader.tsx`, `lib/avatar.ts` (`avatarThumb`), `lib/socket.ts` (`getSocket`), `lib/swal.ts` (`swalConfirm`).

---

## 3. التبعيات على ملفات الخطة الأخرى

- **01-foundation-theme.md** — لغة التصميم (ألوان hex، خط Amiri، `btn-premium`، استراتيجية Window Size Classes الكاملة). §5 هنا يخصّص فقط.
- **02-models-data-layer.md** — نماذج `GameState`, `Player`, `Config`, `VotingState`, `JustificationState`, `MorningEvent`, `AssassinState`, `MayorState` … المشتركة.
- **03-networking-rest.md** — لا يُستعمَل هنا (لا REST) عدا تحميل صور الـ avatars.
- **04-socket-layer.md** — **حرج**: عقد `emit` ack-RPC (timeout 15s، ينجح فقط عند `success===true`، رسالة الـ timeout العربية). كل أفعال المضيف تفترض هذا العقد.
- **05-session-auth.md** — توكن socket auth إلزاميّ؛ التخويل (`غير مصرّح لك`) server-side.
- **06-push-notifications.md** — دعوات push (InviteModal) + توجيه نقرة الإشعار (`url:/player/join?...`).
- **07-sound-system.md** — لا صوت لعبة هنا (الصوت الحيّ في 31).
- **08-deeplinks-routing.md** — المسار `/player/host` ودخول InviteModal.
- **11-shell-navigation.md** — موضع الكونسول في الشِل (غالباً خارج bottom-nav).
- **13-profile.md** — بيانات المضيف (`usePlayer`) للتحقق من تسجيل الدخول.
- **14-games-invites.md** — **InviteModal** يُعرَّف هناك؛ يُستدعى من اللوبي وقشرة اللعبة.
- **20-game-state-core.md** — **HostGameController** و`applyState` والـ overlays الثلاثة (revealOverride, policewomanChoice, poolSignature) والـ polling. المرجع الأساسي لآلة الحالة.
- **21-join-lobby.md** — نظير اللاعب للوبي (roster/roomCode).
- **22..25 (role-cards / night / morning / day-voting)** — نظائر واجهة اللاعب لنفس الأطوار؛ يجب توافق العقود.
- **26-notepad-mafia-chat.md** — إعداد `mafiaChatEnabled` يُضبط هنا في الإنشاء (ويُخفى toggle الليدر عبر `hideMafiaChat`).
- **27-spectator-gameover.md** — **PhoneSpectatorView** (حلقة الطاولة، بعين المضيف `revealRoles/hostView`).
- **31-voice-realtimekit.md** — **RemoteVoice** + **ConfrontationControls** + **useActiveSpeaker** (WebRTC/RealtimeKit).
- **90/91-release** — wake lock، أذونات المايك/الكاميرا، صوت الخلفية.
- **92-qa-parity.md** — معايير القبول §12.

---

## 4. الواجهة والتجربة تفصيلياً

### 4.0 لغة التصميم العامة (تُطبَّق على كل شاشات §4)

- كل الواجهات RTL: لفّ بـ `Directionality(TextDirection.rtl)`، استخدم `EdgeInsetsDirectional`/`AlignmentDirectional`. كود الغرفة وحده LTR.
- خلفية الصفحة `#050505`، نص أبيض، حشوة سفلية `pb-24` (≈96px).
- بطاقات: `#0a0a0a` أو تدرّجات `from-[#0e0e10] to-[#0b0b0c]` / `from-[#0d0d0e] to-[#0a0a0a]`؛ حدود `#1a1a1a`/`#222`/`#2a2a2a`؛ زوايا `rounded-xl` (12px) / `rounded-2xl` (16px).
- ذهبي accent `#C5A059`؛ تدرّج CTA `from-[#C5A059] to-[#b38b47]` (وأحياناً `to-[#8a6d3b]`) مع توهّج `boxShadow: 0 0 18–20px rgba(197,160,89,0.3–0.4)`؛ النص على الذهبي أسود.
- أحمر المافيا العميق `#8A0303`؛ نص أحمر فاتح `#ff6b6b`/`#e08a8a`/`#ff6b64`؛ شارة تصويت حمراء `#b0362f`؛ chip دور مواطن أزرق `#3f83c4`.
- ثانوية: زمردي (`emerald-*` — تفعيل/أحياء)، sky (دعوة/اختيار مصوّت)، كهرماني (`amber-*` — عقوبة/إلغاء اللعبة)، بنفسجي `#6b21a8`/`#a78bfa` (عقود السفّاح/الشرطية).
- رماديات: `#b3b3b3` ملصقات، `#9a9a9a`/`#808080` تلميحات، `#888`/`#666`/`#555` باهت.
- خطوط: sans افتراضي للجسم؛ `Amiri, serif` للعناوين العربية العرضية؛ `font-mono` للأرقام/الأكواد/اللاتيني الفرعي مع `tracking-widest`/`tracking-[0.2em]`/`tracking-[0.3em]` uppercase.
- `btn-premium` = زر CTA ذهبيّ فاخر (class عالميّ؛ يلفّ الملصق في `<span>`) — يجب إعادة إنشاؤه كـ widget مشترك في 01.
- أنيميشن: `animate-pulse` (مؤقّت حرج/أزرار غير مكشوفة/CTA الفائز/تحذير الطرد)؛ `animate-spin` (حلقة التحميل)؛ `active:scale-95`/`active:scale-[0.99]` ضغط؛ `transition-all/colors/transform`؛ أشرطة تقدّم `transition-all duration-500`؛ modals framer-motion (spring damping 25 stiffness 200، وscale 0.95→1).

### 4.1 شاشة الإنشاء (`page.tsx`، `gameState == null`)

- تخطيط: `max-w-md mx-auto`، حشوة `p-5`.
- Eyebrow ذهبي mono `text-xs tracking-[0.2em] uppercase` : **«Remote Play · Host»**.
- H1 `text-2xl font-black`: **«استضافة غرفة عن بُعد»**.
- شرح رمادي `#808080` `text-sm mb-6`: **«أنت المُوجِّه (لا لاعب) — تُدير اللعبة ويشترك أصدقاؤك من أجهزتهم.»**
- بطاقة `bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl p-5 space-y-4` بالحقول:
  - **اسم الغرفة**: label `#b3b3b3` «اسم الغرفة»؛ `TextField` قيمة افتراضية **«غرفة عن بُعد»**؛ نمط: `bg-[#050505] border border-[#222] rounded-lg px-3 py-3`، تركيز حد `#C5A059`.
  - **أقصى عدد لاعبين**: label «أقصى عدد لاعبين»؛ `number` مثبَّت بين **6 و50**، افتراضي **12** (`Math.max(6, Math.min(50, parse||12))`).
  - فاصل علويّ `pt-3 border-t border-[#1a1a1a] space-y-4`:
    - **«🌙 وضع الليل»** (eyebrow mono 10px)، نص `#b3b3b3`: **«أوتوماتيكي (إلزاميّ عن بُعد — اللاعبون يُرسلون من أجهزتهم)»**؛ label «مهلة كل خطوة: `{autoNightTime}ث`» (القيمة ذهبية mono)؛ `range` **min 5 max 60 step 5** (`accent-[#C5A059]`) — Flutter: `Slider(min:5,max:60,divisions:11)`، افتراضي **15**.
    - **«⏱️ مؤقّت اللعبة»** (eyebrow mono): 4 أزرار segmented عرض متساوٍ للقيم `[0,30,60,90]` — النص «مطفأ» عند 0 وإلا `«{m} د»`؛ المحدد `bg-[#C5A059]/20 border-[#C5A059] text-[#C5A059]` وإلا `border-[#222] text-[#888]`. افتراضي **0**.
    - **«⚖️ نظام العقوبات»**: stepper `−/+` (`px-3 py-2 text-[#888]`) بقيمة mono، مثبَّت **1–10**، افتراضي **3**؛ ملصق «أقصى عدد»؛ وpills نطاق بمحاذاة `mr-auto`: **«كامل الغرفة»** (`room`) / **«كل لعبة»** (`game`) — المحدد ذهبي، افتراضي `room`.
    - **«💣 قنبلة الأب الروحيّ»**: زرّان — **«مفعّلة»** (مفعّل: `bg-red-500/15 border-red-600 text-red-300`) / **«معطّلة»** (مفعّل: `bg-[#1a1a1a] border-[#333] text-white`). افتراضي **true (مفعّلة)**.
    - **«🗣️ غرفة تشاور المافيا السرّية»**: **«مفعّلة»** (مفعّل زمردي `bg-emerald-500/15 border-emerald-600 text-emerald-300`) / **«معطّلة»**. افتراضي **false**.
    - **«📨 دعوة اللاعبين لأصدقائهم»**: **«مسموح»** (مفعّل sky `bg-sky-500/15 border-sky-600 text-sky-300`) / **«للمضيف فقط»**؛ نص مساعد `#9a9a9a` 10px: **«عند التفعيل يظهر زرّ «إرسال دعوة» لكل لاعب في الغرفة، لا للمضيف وحده.»** افتراضي **false**.
    - **«🎙️ أقصى عدد تبريرات»** (label mono): `number` w-24 مثبَّت **1–5**، افتراضي **2**.
  - **CTA** `btn-premium w-full`: النصوص — `«جارٍ الإنشاء…»` (أثناء الإنشاء) / `«جارٍ الاتصال…»` (socket غير متصل، معطّل، `opacity-50`) / **«🌐 إنشاء الغرفة»**.
  - **صندوق خطأ** inline (عند الفشل): `p-2.5 rounded-lg bg-red-900/30 border border-red-700 text-red-200 text-sm` يعرض نص الخطأ (مثل `«تعذّر إنشاء الغرفة»` أو نص الخادم `«غير مصرّح لك»`).
  - إن كان `player == null`: تحذير أصفر `text-xs text-yellow-400`: **«يجب تسجيل الدخول كلاعب أولاً.»**
- تذييل `#9a9a9a text-xs leading-relaxed`: **«إنشاء الغرف مقصورٌ على الحسابات المصرّح لها. إن ظهر «غير مصرّح لك» فتواصل مع الإدارة لتفعيل الاستضافة لحسابك.»**

### 4.2 القشرة داخل اللعبة (`page.tsx`، `gameState != null`)

- **رأس لاصق** (`sticky top-0 z-20 bg-[#050505]/95 backdrop-blur border-b border-[#1a1a1a] px-4 py-2.5`، صفّ بين طرفين): يمين — mono ذهبي `«🌐 HOST · {roomCode}»`؛ يسار:
  - زر كهرماني **«⤴️ إلغاء اللعبة»** (`text-[10px] font-bold text-amber-300 border border-amber-500/40 rounded-md px-2 py-1`) — يظهر فقط عندما `phase !== 'LOBBY' && phase !== 'GAME_OVER'`؛ عند الضغط `confirm`: **«إلغاء اللعبة الحالية والعودة للوبي؟ (يبقى اللاعبون في الغرفة)»** ثم `room:reset-to-lobby` ثم refresh.
  - chip اتصال mono: متصل → **«● متصل»** (`text-green-400`) / منقطع → **«○ منقطع»** (`text-red-400`).
- **توست خطأ** ثابت (`fixed bottom-4 inset-x-4 z-40 p-3 rounded-xl bg-red-900/90 border border-red-700 text-red-100 text-sm text-center shadow-lg`) — حالة `error` واحدة مشتركة عبر `setError`، تختفي تلقائياً بعد **4000ms**.
- **لوحة RemoteVoice + ConfrontationControls** (فقط عند `config.isRemote`، داخل `px-4 pt-2`): RemoteVoice بمفتاح ثابت `key="remote-voice"`، `enabled={!!phase}`, `isHost={true}`, `selfPhysicalId={null}`, `allowedPids` من `useActiveSpeaker`, `nameByPid` من الروستر، callback `onVoiceMaps → voiceMaps {videoByPid, audioByPid}`. يتبعها ConfrontationControls بـ `myPid={null}`, `isHost={true}`. (التفاصيل في 31.)
- **شريط الإحصاءات** (`statsBar`): يظهر عند `config.isRemote && inPlayPhase && hostRoster.length>0`، حيث `inPlayPhase = phase && !['LOBBY','ROLE_GENERATION','ROLE_BINDING'].includes(phase)` — يشمل الليل والتصويت. صفّ `flex gap-2 px-4 pt-1 mb-1` من 3 بطاقات `flex-1 rounded-xl border border-[#1a1a1a] bg-gradient-to-b from-[#0e0e10] to-[#0b0b0c] py-1.5 text-center`:
  1. **الأحياء**: mono `text-[17px]` زمردي `text-emerald-400` + label «أحياء» (10px `#9a9a9a`). `aliveCount = roster.filter(isAlive).length`.
  2. **مافيا**: mono 17px أحمر `text-red-400` + label «مافيا». `mafiaAlive = roster.filter(isAlive && role∈MAFIA_ROLES).length`.
  3. **الطور**: mono `text-[15px]` ذهبي + label «الطور». نص من `PHASE_SHORT`.
- **`PHASE_SHORT`** (خريطة الطور المختصر): `LOBBY:'لوبي', ROLE_GENERATION:'أدوار', ROLE_BINDING:'ربط', DAY_DISCUSSION:'نقاش', DAY_VOTING:'تصويت', DAY_JUSTIFICATION:'دفاع', DAY_ELIMINATION:'كشف', ELIMINATION_PENDING:'كشف', DAY_REVEALED:'كشف', DAY_TIEBREAKER:'تعادل', NIGHT:'ليل', MORNING_RECAP:'صباح', GAME_OVER:'نهاية'`؛ غير معروف → `'—'`.
- **حلقة المضيف** (`hostRing`، `PhoneSpectatorView`): تظهر عند `config.isRemote && showRing && roster.length>0` حيث `showRing = phase ∈ {MORNING_RECAP, DAY_DISCUSSION, DAY_JUSTIFICATION, DAY_ELIMINATION, ELIMINATION_PENDING, DAY_REVEALED, DAY_TIEBREAKER, GAME_OVER}` (التصويت والليل بلا حلقة عمداً). props: `roster` (physicalId,name,role,isAlive,gender,avatarUrl), `physicalId="-1"`, `gamePhase`, `on`, `initialDiscussionState`, `videoByPid=voiceMaps.videoByPid`, `speakingByPid=voiceMaps.audioByPid`, `revealRoles`, `hostView`, `winnerReveal = phase==='GAME_OVER' ? {winner, players} : null`. داخل `px-2 pt-1`. (المكوّن في 27.)
- **جسم موجَّه بالطور** (`body`): انظر الجدول أدناه.
- **InviteModal** overlay عند `showInvite && roomId`.
- **طور غير معروف** → `PhaseLoading text="الطور «{phase}»"` (حلقة spinner 8×8 بحد علويّ ذهبي دائرة).

**توجيه الطور في الجسم (`page.tsx`):**

| `phase` | الجسم |
|---|---|
| `LOBBY` | RoomCodeCard + زر «📨 إرسال دعوة للاعبين» + HostLobby + زر «🗑️ إلغاء الغرفة وإغلاقها» (§4.4/4.5) |
| `ROLE_GENERATION` | `LeaderRoleConfigurator {gameState, emit, setError, hideMafiaChat}` (§4.7) |
| `ROLE_BINDING` | `HostRoleBinding` (§4.8) |
| `phase.startsWith('DAY_')` | `HostDayControls` — يوجّه داخلياً (§4.9–4.12، فولباك §4.16) |
| `NIGHT` أو `MORNING_RECAP` | `HostNightRunner {..., on, readOnlyChoices}` (§4.13/4.14، فولباك §4.17) |
| `GAME_OVER` | إعلان الفائز + أزرار (§4.15) |
| غير ذلك | `PhaseLoading` |

### 4.3 RoomCodeCard (`components/RoomCodeCard.tsx`)

- البطاقة كلها زر: `border-[#C5A059]/40 bg-[#C5A059]/5 rounded-xl active:scale-[0.99]`.
- caption رمادي صغير يتبدّل: **«رمز الغرفة — اضغط للنسخ»** ↔ **«✓ تم النسخ»** (لمدة **2000ms** بعد النسخ).
- الكود: mono `text-3xl font-black` ذهبي `tracking-[0.3em]`، **`dir="ltr"` قسري** (لفّ بـ `Directionality(ltr)`؛ letterSpacing ≈ 0.3em من حجم الخط).
- النسخ: `navigator.clipboard.writeText` + fallback `document.execCommand('copy')` (في Flutter: `Clipboard.setData` فقط، بلا fallback؛ يُقترَح `HapticFeedback.lightImpact`).
- لا تُرسم إن لم يوجد كود (`code` فارغ → null).

### 4.4 HostLobby (`HostLobby.tsx`) + كروم على مستوى الصفحة

**كروم الصفحة حول HostLobby:**
- فوقها: `RoomCodeCard` داخل `mx-4 mt-3`؛ ثم زر كامل العرض `mx-4 mt-3`: **«📨 إرسال دعوة للاعبين»** (`py-3 rounded-xl border border-sky-600/40 text-sky-300 bg-transparent text-sm font-bold`) → `showInvite=true`.
- تحتها (`px-4 mt-4 mb-6`): زر تدميري **«🗑️ إلغاء الغرفة وإغلاقها»** (`py-3 rounded-lg border border-red-800/50 text-red-300 bg-red-950/20 text-sm font-bold`) → `confirm`: **«إلغاء الغرفة وإخراج كل من انضمّ؟»** → `room:close-event` → مسح `localStorage['mafia_host_room']` + `roomIdRef=null` + `gameState=null` (رجوع لشاشة الإنشاء).

**HostLobby نفسه** (`px-3`):
- زر كامل العرض ذهبي التصبيغ **«⚙️ إعدادات اللعبة»** → HostSettingsModal.
- صف السعة: **«اللاعبون {n} / {max}»** (n ذهبي mono) + stepper `−/+` (أهداف لمس **44×44px**) مثبَّت **6–50** عبر `room:update-max-players`.
- **Roster** (لاعبون `!seatHeld`، مرتّبون بـ physicalId، accordion واحد مفتوح):
  - **حالة فارغة**: بطاقة بحد متقطّع، إيموجي **🎴**، Amiri **«بانتظار انضمام اللاعبين…»**، تلميح **«شارك رمز الغرفة أو استخدم زر الدعوة…»**.
  - **صف اللاعب**: avatar دائري **36px** (thumb عبر `avatarThumb` → `onError` مرة واحدة للأصل عبر حارس `dataset.fb` → emoji **👨/👩** حسب الجنس) + **نقطة اتصال** overlay (bottom-end): زمردية عند `isConnected !== false` / رمادية zinc عند الانقطاع؛ `#{physicalId}` ذهبي mono؛ الاسم (يبهت `white/40` عند الانقطاع)؛ نقاط عقوبات (فقط إن `penalties>0`: `maxPenalties` نقطة تمتلئ حمراء حتى العدد)؛ سهم **▾/▴**.
  - **إجراءات التوسيع**: **«⚠️ عقوبة»** (كهرماني) → `leader:record-penalty` ثم طيّ؛ **«✕ طرد»** (أحمر) → مودال تأكيد.
- **المقاعد المحجوزة** (لاعبون `seatHeld===true`، فقط إن وُجدوا): chips **«#{id} {name} ✕»** → `room:release-held-seat`.
- **زر البدء**: إن `players.length >= 6` → **«🎴 بدء توزيع الأدوار»** (تدرّج ذهبي متوهّج) → `room:start-generation`؛ وإلا زر داكن معطّل **«🎴 بدء التوزيع — {n}/6 لاعبين»**.
- **مودال تأكيد الطرد** (`fixed z-50 bg-black/80 backdrop-blur-sm`، بطاقة `max-w-xs` بحد أحمر): **✕** + **«طرد {name}؟»** + زرّان **«تأكيد الطرد»** (أحمر → `room:kick-player`) / **«إلغاء»**؛ النقر على الخلفية يلغي.
- كل الإجراءات خلف علم `busy` (تسلسلية، منع نقر مزدوج).

### 4.5 HostSettingsModal (`HostSettingsModal.tsx`)

- Overlay `z-[70] bg-black/80 backdrop-blur-sm`؛ ورقة سفلية على الموبايل (`items-end rounded-t-2xl`) / وسطية `≥sm` (`rounded-2xl`)؛ `max-w-md max-h-[88vh]` عمود flex؛ قفل تمرير body (`document.body.style.overflow='hidden'` أثناء الفتح، يُستعاد عند التفكيك)؛ الخلفية تُغلق، النقر الداخلي `stopPropagation`. (Flutter: `showModalBottomSheet(isScrollControlled:true)` بـ maxHeight 88% — قفل التمرير تلقائي.)
- رأس ذهبي Amiri **«⚙️ إعدادات اللعبة»** + **✕**.
- محتوى قابل للتمرير، مُهيَّأ من `gameState.config`:
  - **🏷️** اسم الغرفة (`TextField` maxLength **60**).
  - **⏱️** مهلة فعل الليل: stepper **5–60** (وحدة «ث»).
  - **⏳** مؤقّت اللعبة: stepper **0–180** دقيقة («0 = مطفأ»)؛ الأولية `config.gameTimerEnabled ? (config.gameTimerMinutes||30) : 0`.
  - **🎙️** أقصى تبريرات: stepper **1–5**.
  - **⚠️** أقصى عقوبات: stepper **1–10**.
  - **📋** نطاق العقوبة: pills **«الغرفة»** / **«اللعبة»** (المحدد ذهبي).
  - **💣** toggle القنبلة (زمردي «نعم» / داكن «لا» عبر `Toggle` مشترك).
  - **🗣️** toggle دردشة المافيا.
  - **📨** دعوات اللاعبين: **«مسموح»** (sky) / **«للمضيف فقط»**.
  - شريط خطأ أحمر inline عند فشل الحفظ.
  - **لا حقل maxPlayers هنا** — السعة تُعدَّل من stepper اللوبي فقط.
- تذييل `btn-premium` **«💾 حفظ الإعدادات»** → **«جارٍ الحفظ…»** → عند النجاح **«✓ حُفظت»** ثم إغلاق تلقائي بعد **700ms**؛ يُطلق `room:update-settings`، والـ UI يتحدّث من إعادة بث الخادم.

### 4.6 GAME_OVER — على مستوى الصفحة (§4.15 مكرّرة هنا للترتيب) — انظر §4.15.

### 4.7 مكوّن الليدر #1 — `LeaderRoleConfigurator` (طور ROLE_GENERATION)

يُمرَّر بـ `{gameState, emit, setError, hideMafiaChat}`. `hideMafiaChat=true` للمضيف (يخفي toggle دردشة المافيا لأنه يُضبط في إعدادات الإنشاء).

**الحالة المحلية والافتراضات:** `roles: Role[]` (تُولَّد أوّلاً)، `loading` (true→false بعد التوليد)، `openDropdown: number|null`، `assassinContractCount=4`، `mayorVoteWeight=2`، `jesterSurviveRounds=2`، `witchDisableRounds=3`، `mafiaChatOn = config.mafiaChatEnabled===true`، `chatToggleBusy`.

**خوارزمية التوليد الأوّلي** (على `gameState.players` — الأحياء `isAlive !== false`):
- `playerCount = عدد الأحياء`؛ `totalMafia = ceil(playerCount/4)`.
- `hasJester = playerCount >= 8`؛ `totalNeutral = hasJester ? 1 : 0`؛ `totalCitizens = playerCount - totalMafia - totalNeutral`.
- `mafiaOrder = [GODFATHER, SILENCER, CHAMELEON, WITCH, MAFIA_REGULAR]` — أول `totalMafia`؛ ما بعد آخر عنصر → `MAFIA_REGULAR`.
- `citizenOrder = [SHERIFF, DOCTOR, SNIPER, POLICEWOMAN, NURSE, MAYOR, CITIZEN]` — أول `totalCitizens`؛ ما بعد آخر عنصر → `CITIZEN` (العمدة سادساً — لا يدخل تلقائياً إلا بستّة مقاعد مواطنين).
- إن `hasJester` أضِف `JESTER` في النهاية.

- **loading**: نص مركزيّ `text-[#555] font-mono tracking-widest`: **«INITIALIZING ROSTER...»**.
- **الحاوية**: `mb-10 w-full max-w-5xl mx-auto`.
- **رأس**: بطاقة `bg-black/30 border border-[#2a2a2a] rounded-xl p-8` بشريط ذهبي جانبي (`w-1 h-full bg-[#C5A059]/40` يسار)؛ H2 Amiri `text-3xl font-black` **«تدقيق وإعداد المهام السرية»**؛ p مono ذهبي/رمادي `tracking-[0.3em] text-xs`: **«ROLE COMPOSITION MATRIX CONFIGURATION»**.

**ثلاثة أقسام (أعمدة عموديّة `flex flex-col gap-6`):**
1. **المافيا** (`border-[#8A0303]/30`): عنوان mono `#8A0303` **«SYNDICATE (المافيا)»** + شارة `{n} OP(s)`. بطاقات الأدوار (`flex flex-wrap gap-3`) لكل `r ∈ MAFIA_ROLES`؛ ملوّنة `text-[#C5A059]` حد `border-[#8A0303]/20`.
   - **إعداد الساحرة** (يظهر عند وجود `WITCH`): بطاقة بنفسجية `bg-purple-500/5 border-purple-500/10`؛ نص شرح: **«🧙‍♀️ الساحرة: تعطّل قدرة لاعب من المواطنين أو المستقلين لعدة راوندات. لاعب مختلف كل مرة. تكشف الحرباية إذا معطّلة.»**؛ stepper **«راوندات التعطيل:»** مثبَّت **1–6** (افتراضي 3).
   - **غرفة تشاور المافيا** (يُخفى عند `hideMafiaChat` — أي عند المضيف): بطاقة `bg-red-500/5`؛ عنوان **«🗣️ غرفة تشاور المافيا»**؛ نص: **«محادثة سرّية للمافيا الأحياء داخل «مفكرة التحري» — تراقبها أنت بالكامل من زرّ 🕵️»**؛ زر toggle **«✓ مفعّلة»** (زمردي) / **«معطّلة»** → `leader:mafia-chat-toggle {roomId, enabled:!mafiaChatOn}` (يقرأ `r.enabled`؛ خطأ → `«تعذّر تغيير إعداد غرفة التشاور»`). **لا يُنقَل هذا الزر لواجهة المضيف.**
2. **المواطنون** (`border-[#C5A059]/30`): عنوان mono ذهبي **«CITIZENS (المواطنون)»** + شارة `{n} OP(s)`؛ بطاقات لكل `r` ليست mafia ولا neutral؛ `text-white` حد `border-[#2a2a2a]`.
3. **المحايدون** (`border-amber-500/30`): عنوان mono كهرماني **«🤡 NEUTRAL (المحايدون)»** + شارة `{n} OP(s)` + أزرار:
   - **«🤡 إزالة المهرج» / «➕ إضافة المهرج»** (`toggleJester`: يبدّل آخر CITIZEN ↔ JESTER).
   - **«🔪 إزالة السفّاح» / «➕ إضافة السفّاح»** (يظهر فقط `playerCount >= 10`؛ يبدّل آخر CITIZEN ↔ ASSASSIN).
   - **«👥 إزالة التوأمين» / «➕ إضافة التوأمين»** (يظهر فقط `playerCount >= 10`؛ يسحب آخر `MAFIA_REGULAR`→`OLDER_BROTHER` وآخر `CITIZEN`→`YOUNGER_BROTHER`، والعكس عند الإزالة).
   - إن `neutralRoles.length===0`: نص مركزيّ — إما **«يتطلب 8 لاعبين على الأقل لتفعيل المحايدين»** (playerCount<8) أو **«لا يوجد أدوار محايدة — اضغط "إضافة المهرج" لتفعيله»**.
   - **وصف المهرج** (عند وجوده): **«🤡 المهرج يفوز إذا أقصته المدينة (تصويت / اتفاقية / قنص). يجب أن يبقى على قيد الحياة للمدة المحددة أدناه ليفوز عند إقصائه، وإلا يخسر مثل أي لاعب.»** + stepper **«جولات النجاة المطلوبة:»** **1–6** (افتراضي 2).
   - **إعداد السفّاح** (عند وجوده): **«🔪 السفّاح: قاتل محترف بنظام عقود اغتيال ذكية. يقتل كل ليلة (ما عدا الأولى). إذا قتل نفس هدف المافيا لا يُحسب. يظهر كمواطن عند التحقيق.»** + stepper **«عدد العقود المطلوبة:»** **2–6** (افتراضي 4).
   - **إعداد العمدة** (عند وجوده): **«🎩 العمدة: مرّة واحدة بعد فرز التصويت يكشف نفسه ويُلغي الإعدام — تصويت جديد على الجميع أو تأجيل بلا موت. بعد الكشف يُحسب صوته بالوزن المحدَّد هنا.»** + stepper **«وزن صوته بعد الكشف:»** `×{n}` مثبَّت **1–4** (افتراضي 2).

**بطاقة الدور** (`renderRoleCard`): مربّع أيقونة 12×12 (`ROLE_ICONS[r]` grayscale) + منطقة قابلة للنقر تفتح dropdown (`dir="ltr"`) يُظهر `ROLE_NAMES[r]` + سهم ▼؛ القائمة (`AnimatePresence`, `absolute w-[220px]`) تسرد **كل الأدوار** (`Object.values(Role)`): أيقونة + `ROLE_NAMES[role]` ذهبي + وسم **«محايد»** كهرماني للأدوار المحايدة؛ الاختيار يستبدل الدور في هذا الـ slot. (Flutter: bottom-sheet picker أفضل من dropdown.)

- **CTA**: `btn-premium` كامل العرض/`min-w-[300px]` بنص mono `tracking-[0.3em]` **«CONFIRM OP_DISTRIBUTION»** → `handleConfirm`:
  - `setLoading(true)` ثم `setup:roles-confirmed {roomId, roles, assassinContractCount?, mayorVoteWeight?, jesterSurviveRounds?, witchDisableRounds?}` — الحقول الاختيارية تُرسَل فقط إن كان الدور المقابل موجوداً في `roles` (وإلا `undefined`). عند الخطأ: `setError(err.message)` + `setLoading(false)`.

### 4.8 HostRoleBinding (طور ROLE_BINDING)

- **شريط ملخّص** (3 أعمدة): إجمالي الأدوار / الخاصة المسندة **«x/y»** (زمردي) / عدد المواطنين (ذهبي).
- عنوان قسم: **«الأدوار الخاصّة — وزّعها كلها»**؛ لكل دور خاص صف: emoji الدور + الاسم العربي (أحمر باهت `#e08a8a` للمافيا / sky `#8fc3ea` لغيره)؛ صبغة الصف عند الإسناد: مافيا `border-[#8A0303]/30 bg-[#8A0303]/5`، غير مافيا `border-[#265e33]/30 bg-[#0d1a0d]`، غير مسند محايد؛ `<select>` كامل العرض (**«— اختر لاعب —»** + الأحياء غير المسندين أو المسند لهذا الـ slot)؛ زر قفل **🔒/🔓** (28px، ذهبي عند القفل) يظهر بعد الإسناد.
- **بطاقة المواطنين**: **«👤 المواطنون ({n}) — يُوزَّعون تلقائياً على الباقين»** + chips بالأسماء المسندة أو **«—»**.
- **صف «🎭 المافيا تعرف بعضها»** بمفتاح pill مخصّص (مسار ذهبي عند التفعيل، مقبض أبيض ينزلق start↔end بوعي RTL: `end-0.5`/`start-0.5`) — toggle تفاؤليّ محليّ + `room:update-mafia-reveal {roomId, allowMafiaReveal}` **fire-and-forget** (الأخطاء مبتلعة)؛ الأولية `config.allowMafiaReveal !== false`.
- **أزرار**:
  - **«🎲 توزيع عشوائيّ للباقي»** → `setup:random-assign {roomId, lockedPhysicalIds}`؛ يعيد بناء الـ slots من `res.state` محافظاً على أعلام القفل؛ يصفّر `rolesConfirmed`.
  - **«📨 تأكيد الأدوار وإرسالها»** → `setup:confirm-roles {roomId}`؛ معطّل إن بقي خاصٌّ غير مسند أو مؤكَّد سابقاً؛ يتحول زمردياً **«✅ تمّ التأكيد والإرسال للاعبين»**.
  - `btn-premium` **«🔒 قفل الهويّات وبدء اللعبة»** → `setup:binding-complete {roomId}`؛ يتطلب التأكيد وإلا خطأ **«أكّد الأدوار أولاً»**.
  - تلميح كهرماني mono إن بقي خاص: **«تبقّى {n} دور خاصّ بلا توزيع»**.
- **منطق حالة حرج (يُنقَل حرفياً)**:
  - الـ slots تُهيَّأ من `gameState.rolesPool` **فقط عند تغيّر توقيع JSON للحزمة** (`poolInitRef`) — لأن poll الـ 2.5s يعيد إنشاء هوية المصفوفة وكانت إعادة التهيئة الساذجة تمسح الإسنادات/الأقفال الجارية.
  - تدفق الإسناد: تعيين محلي تفاؤليّ → `setup:unbind-role {roomId, physicalId}` (إن كان استبدالاً) ثم `setup:bind-role {roomId, physicalId, role}`؛ عند الخطأ → إرجاع الـ slot للقيمة السابقة + عرض الخطأ. أي إسناد يدويّ يصفّر `rolesConfirmed`.

### 4.9 HostDayControls / DiscussionDock (طور DAY_DISCUSSION)

**حارس التوجيه في HostDayControls** (لأطوار `DAY_*`):
- `DAY_DISCUSSION` → DiscussionDock (هنا).
- `DAY_VOTING` → HostVoting (§4.10).
- `DAY_JUSTIFICATION` → HostJustification (§4.11).
- `DAY_ELIMINATION` / `DAY_REVEALED` / `DAY_TIEBREAKER` / `ELIMINATION_PENDING` → **HostElimination (§4.12) فقط عندما** `pendingResolution.type !== 'MAYOR_POSTPONED'` **ولا** `pendingBomb`؛ وإلا (تأجيل العمدة / قنبلة الأب الروحي) وأي DAY_* غير مطابق → **`LeaderDayView` (§4.16)**.
- **نافذة العمدة** (mayor window modal) تعلو أيّ طور نهاريّ ما دامت مفتوحة (§4.16).

**DiscussionDock — إعداد** (`!discussionState`):
- بطاقة Amiri ذهبي **«بدء جولة النقاش»**؛ **«من يبدأ؟»** شبكة chips للأحياء (`#id name`؛ المحدد ذهبي مصمت بنص أسود؛ الافتراضي أول حيّ)؛ **«الوقت لكل لاعب»** presets `[15,30,45,60,90]` ثانية (افتراضي 30)؛ CTA `btn-premium` **«▶ ابدأ الدوران»** → `day:start-discussion {startPhysicalId, timeLimitSeconds}`؛ خطأ **«اختر لاعب البداية»** إن لم يُختَر.

**DiscussionDock — حيّ (live)**:
- لوحة ضبط اختيارية (زر ⏱ يفتحها، ذهبي عند الفتح): شبكة 4 أعمدة `[+30, +10, −10, −30]` → `day:adjust-timer {phase:'DISCUSSION', delta}` (ذهبي للزيادة/أحمر للنقص) + **«🔄 إعادة الوقت من البداية»** → `day:timer-action {action:'RESET'}`.
- صف الحالة: **«الدور: #{currentSpeakerId} {name}»** (أو **«🔇 مُسكَت»** إن كان المتحدث الحالي `isSilenced`) + mono **«طابور {speakingQueue.length} · تكلّم {hasSpoken.length}»**.
- صف التحكم: **⏭** متحدث سابق (معطّل عند `hasSpoken.length===0`) → `day:prev-speaker`؛ زر مركزيّ: أثناء `status==='SPEAKING'` → **«⏸ إيقاف»** (`day:timer-action PAUSE`)؛ وإلا **«▶ ابدأ»** (WAITING→START) أو **«▶ استئناف»** (RESUME) بتدرّج ذهبي؛ **«⏮ التالي»** (تدرّج أحمر داكن `from-[#3a1513] to-[#230d0c]` نص `#eba9a4`) → `day:next-speaker`؛ **⏱** فتح لوحة الضبط.
- **تنبيه**: الأيقونتان **⏭/⏮ معكوستان عمداً** لأجل RTL (⏭ = السابق، ⏮ = التالي) — لا «تصلحها» دون مراجعة.

**DiscussionDock — انتهاء النقاش** (`discussionState.isFinished`):
- بطاقة **«انتهت جولة النقاش»** + ملاحظة mono **«الصفقات تُؤخذ تلقائياً ممّا سجّله اللاعبون»** (المضيف لا يسجّل صفقات في remote)؛ **«مدّة التصويت»** presets `[بدون(null), 10, 20, 30]` ثانية → CTA **«🗳️ بدء التصويت»** → `day:start-voting {durationSeconds: votingDur || undefined}`.

### 4.10 HostVoting (طور DAY_VOTING — UI مستقل، بلا حلقة فوقه)

- **تحميل**: `PhaseLoading` 🗳️ **«جارٍ تحضير التصويت…»** حتى وصول `votingState`.
- `PhaseHeader` 🗳️ **«مرحلة التصويت»** / سطر لاتيني **«VOTING»**.
- **صف الرأس**: عدّادا الفريقين **«🏛 {citizens}»** أخضر | **«🎭 {mafia}»** أحمر (محسوبان من أدوار الأحياء — معرفة المضيف فقط، عبر `role ∈ {GODFATHER,SILENCER,CHAMELEON,WITCH,OLDER_BROTHER,MAFIA_REGULAR}`)؛ chip نمط (إطار ذهبي): **«مباشر»** / **«إعادة»** (tieBreakerLevel 1) / **«مُضيّق»** (≥2) / **«🎩 بأمر العمدة»** (mayorRevote)؛ عدّاد كبير `{totalVotesCast}/{aliveCount}` (يُفضَّل `votingState.totalVotesCast` لأن وزن العمدة ×2 لا يستهلك مصوّتَين؛ الاحتياط = مجموع أصوات المرشحين).
- **شبكة المرشحين** (3 أعمدة، `GridView.count(crossAxisCount:3)`): بطاقة لكل مرشح — شارة عدد أصوات (pill أحمر عائم `#b0362f` بظلّ، فقط عند `votes>0`)؛ avatar **40px** (صورة أو emoji جنس)؛ **«#{pid} {name}»**؛ **«🤝 صفقة»** ذهبي إذا `type==='DEAL'`؛ تلميح **«اضغط للتصويت»** عند تسليح مصوّت؛ حد البطاقة sky + `active:scale-95` عند التسليح، معطّلة/باهتة بدونه.
- **شريط المصوّتين بالوكالة** (`Wrap`): سطر تعليمات **«صوِّت بالوكالة — اختر مصوِّتاً معلّقاً ثم اضغط مرشّحاً · اضغط مَن صوّت للتراجع»**؛ chips لكل حيّ: معلّق = محايد؛ محدد = sky + `scale-105`؛ صوّت بنفسه = زمردي + **✅**؛ صوّت بالوكالة = كهرماني + **🟠**؛ chip العمدة يُظهر **«🎩×{mayorVoteWeight}»** فقط عند `mayorState.revealed` (الوزن من `config.mayorVoteWeight` افتراضي 2).
- **تدفق التصويت**: تسليح المصوّت → نقر مرشّح → `day:cast-vote {candidateIndex, delta:1, voterPhysicalId}` ثم مسح التحديد تلقائياً؛ خطأ **«اختر مصوِّتاً أولاً»** عند نقر مرشّح دون تسليح (الزر أيضاً معطّل).
- **تراجع**: نقر chip من صوّت يسحب صوته الفعليّ (`delta:-1` على الـ candidateIndex في `leaderProxyVotes[pid] ?? playerVotes[pid]`).
- **أزرار سفلية**: **«🔓 مباشر»** (إلغاء التضييق؛ يظهر فقط إن النمط ≠ مباشر وليس mayorRevote) → `day:un-narrow`؛ زر **⏰** timeout (فقط أثناء عدم الاكتمال؛ tooltip **«تصويت الغائبين على أنفسهم»**) → `day:voting-timeout`؛ `btn-premium` **«⚖️ حسم التصويت»** (مفعّل فقط عند `totalVotes >= alive.length`) → `day:resolve`.
- تحديد المصوّت يُصفَّر عند تغيير الطور.

### 4.11 HostJustification (طور DAY_JUSTIFICATION)

- **تحميل**: `PhaseLoading` **«جارٍ تحضير التبرير…»** حتى وصول `justificationData` (jd). الحقول: `accused[]`، `canJustifyList[]` (احتياط `accused`)، `resultType==='TIE'`، `timer {physicalId, startTime, timeLimitSeconds}`، `votersForAccused[]`، `leaderProxyVotes {voterId: candidateIndex}`، `candidates[]`؛ + `gameState.withdrawalState {count, needed, withdrawn[]}`.
- **مرحلة الدفاع** (تكرار على `canJustifyList` بمؤشّر محليّ `idx`):
  - رأس mono **«مُدافِع {idx+1} / {total}»**؛ اسم Amiri **«#{pid} {name}»**؛ عدّ تنازليّ حيّ من مؤقّت الخادم (`timeLimitSeconds − (Date.now()−startTime)/1000`, نبضة ثانية محلية): `text-4xl` mono يتحول أحمر + `animate-pulse` عند **≤10** ثوانٍ؛ وإلا **«جاهز للدفاع»**.
  - قبل بدء المؤقّت: presets مدة `[15,30,45,60]` (افتراضي 30) + `btn-premium` **«▶ ابدأ مؤقّت الدفاع»** → `day:start-justification-timer {physicalId, timeLimitSeconds}`.
  - أثناء التشغيل: شبكة ضبط `[+30,+10,−10,−30]` → `day:adjust-timer {phase:'JUSTIFICATION', delta}`.
  - صف سفليّ: **🔄** إعادة → `day:reset-justification-timer {physicalId, timeLimitSeconds}`؛ **«⏭ التالي ({idx+2}/{n})»** أو **«✅ إنهاء التبريرات»** → `day:stop-justification-timer` (أخطاؤه مُتجاهَلة) ثم تقدّم idx أو `allDone`.
  - **قواعد إعادة الضبط (تُنقَل حرفياً)**: idx/allDone يُصفَّران مرة واحدة عند دخول الطور (حارس ref ضد الـ poll)، ويُصفَّران عند **انكماش** `canJustifyList` (إقصاء إداريّ أثناء التدفق).
- **مرحلة القرار** (`allDone` أو قائمة فارغة):
  - رأس ⚖️ **«القرار»** / **«انتهت التبريرات»**.
  - بطاقة نصاب السحب (إن `votersForAccused` غير فارغة): ثلاثية mono كبيرة **«{count} مسحوب / {needed} للنصاب من {votersTotal} مصوّت»** (العدد يخضرّ عند بلوغ النصاب؛ الاحتياط `needed = ceil(votersTotal/2)`)؛ شريط تقدّم (أزرق→أخضر عند النصاب).
  - بطاقة أصوات الوكالة (برتقالية، إن وُجد `leaderProxyVotes`): صفوف **«#{voter} {name} → #{candidatePid} (متّهم)»** (تسمية الهدف حمراء إذا وقع الصوت على متهم) + زر **«🗳️ سحب»** أزرق لكل صف → `player:withdraw-vote {physicalId: voterId}` (**بلا roomId عمداً**)؛ يُستبدل بـ **«✓ سُحب»** بعد دخوله `withdrawalState.withdrawn`.
  - أزرار القرار — نسخة TIE (`resultType==='TIE'`): **«🔁 إعادة التصويت»** (أخضر؛ لاحقة **«(النصاب ✅)»** عند اكتماله) / **«🎯 حصر بين المتعادلين»** / **«💀 إقصاء جميع المتعادلين»** — كلها `day:tie-action {action: REVOTE|NARROW|ELIMINATE_ALL, tiedCandidates: jd.accused||jd.candidates}`. نسخة غير TIE: **«💀 تنفيذ الإقصاء»** (أحمر كبير) → `day:execute-elimination {skipWithdrawal:true}` + **«🔁 إعادة التصويت»** (`tie-action REVOTE`).

### 4.12 HostElimination (أطوار DAY_ELIMINATION / DAY_REVEALED / DAY_TIEBREAKER)

**صف `EliminatedRow` المشترك**: avatar **40px** (thumb + fallback مرة) أو **«#{pid}»** ذهبي؛ اسم + id mono؛ chip دور (أيقونة + اسم عربي) — مافيا = chip أحمر وصف مصبوغ أحمر، غيره chip أزرق `#3f83c4` وصف محايد.

- **DAY_ELIMINATION**: `PhaseHeader` 💀 **«اكتمل التصويت — جاهز للحسم»** / **«AWAITING REVEAL»**؛ بطاقة بملاحظة قفل **«🔒 بعين المُوجِّه فقط — لم يُكشف بعد»**؛ صفوف `pendingResolution.eliminated[]` بأدوار من `pendingResolution.revealedRoles[]` (fallback `player.role` ثم `'UNKNOWN'`)؛ فارغة: **«لا مُقصَين هذه الجولة»**. CTA أحمر متدرّج `from-[#8A0303] to-[#5e0202]` بتوهّج أحمر **«💀 كشف الهويّة لجميع اللاعبين»** (معطّل بلا pending) → `day:trigger-reveal {result: gameState.pendingResolution}`؛ حاشية **«الكشف يظهر على حلقة الطاولة عند الجميع»**.
- **DAY_REVEALED** (طور client فقط — انظر §6): `PhaseHeader` 💀 **«تمّ كشف الهويّة»** / **«ELIMINATION COMPLETE»**؛ صفوف من `revealedData.eliminated[]` + `revealedData.revealedRoles[]`؛ فارغة: **«لا مُقصَين — يوم بلا إعدام»**. ثم:
  - إن `pendingWinner` → CTA ذهبي نابض **«🏁 إعلان النتيجة للجميع»** → `game:confirm-end`.
  - وإلا CTA ذهبي **«🌙 بدء مرحلة الليل»** → `night:start`؛ إن رجع الرد بـ `nurseAvailable` → **شاشة الممرضة**: `PhaseHeader` ⚕️ **«الطبيب خارج اللعبة»**، بطاقة خضراء **«هل تريد تفعيل الممرضة كبديلٍ للحماية هذه الليلة؟»**، زرّان **«✅ تفعيل الممرضة»** / **«بدون ممرضة»** (كلاهما ≥44px) → `night:begin-queue {activateNurse: true|false}`.
- **DAY_TIEBREAKER**: `PhaseHeader` ⚖️ **«حالة تعادل!»** / **«TIE BREAKER»**؛ 4 خيارات مكدّسة كاملة العرض (≥48px): **«🔁 إعادة التصويت»** (ذهبي) / **«🎯 حصر التصويت بالمتعادلين»** (محايد) / **«🌙 إلغاء التصويت والانتقال لليل»** (محايد، action `CANCEL`) / **«💀 إقصاء جميع المتعادلين»** (أحمر) → `day:tie-action {action, tiedCandidates: justificationData.accused||candidates}`.

### 4.13 HostNightRunner (طور NIGHT مع `nightMode==='auto'`)

**التوجيه الداخليّ** (يُركَّب للطورين NIGHT وMORNING_RECAP):
- `isAutoNight = phase==='NIGHT' && config.nightMode==='auto'` → لوحة الليل الأوتو (أدناه).
- `phase==='MORNING_RECAP'` → **HostMorningRecap** (§4.14).
- وإلا `config.nightMode !== 'auto'` (ليل يدويّ، نادر عن بُعد) → **`LeaderNightView`** (§4.17).
- كل حالة الليل المحلية (`autoNightProgress/autoNightStep/autoNightApproval/customNightTimer`) تُصفَّر عند مغادرة NIGHT.

**لوحة الليل الأوتو** (`bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl p-4`، داخل `px-3`):
- صف العنوان: Amiri ذهبي **«🌙 الليل{ — الجولة {round}}»** + mono **«{submitted} / {total} أرسلوا»**.
- **خطوة جاهزة** (`autoNightStep` موجود، `dispatched===false`): بطاقة `#111` وسطية بـ eyebrow mono **«CURRENT STEP»**، اسم الدور Amiri ذهبي `text-lg` (`roleName`)، **«#{performerPhysicalId} — {performerName}»**، **«المدة: {customNightTimer||timeoutSeconds} ثانية»**؛ chips تجاوز المدة `[15,20,30]s` (المحدد `bg-[#C5A059] text-black`) — تظهر فقط عند `!dispatched`؛ CTA بتدرّج `from-[#C5A059] to-[#b38b47]` نص أسود بتوهّج `0 0 20px rgba(197,160,89,0.3)` **«▶ بدء {roleName}»** → `dispatched=true` تفاؤليّاً + `night:auto-advance-step {durationSeconds: customNightTimer||timeoutSeconds}`؛ إن `!res.success` أو استثناء → `setError(res.error||'فشل بدء الخطوة')` + تراجع `dispatched=false`. رابط تخطٍّ باهت **«تخطي ←»** فقط عند `canSkip && !dispatched` → `night:skip-action {role}` (ينظّف الخطوة عند النجاح).
- **قيد التنفيذ** (`dispatched===true`، لا approval بعد): شريط تقدّم ذهبي رفيع `h-1.5` بتدرّج `from-[#C5A059] to-[#b38b47]` (النسبة `submitted/total`، انتقال 500ms)؛ تعليق mono **«اللاعبون يختارون من أجهزتهم...»**؛ **قائمة موحّدة ثابتة الترتيب**: اتحاد `choices ∪ missingPlayers` مدموجاً بالـ pid ومُرتّباً **مرة واحدة بالمقعد** (`.sort((a,b)=>a.pid-b.pid)`) — الصفوف تنقلب في مكانها من **«⏳ ينتظر…»** إلى **«استهدف: #{target} {name}»** أو **«تخطي»** بلا إعادة ترتيب/قفز؛ صف صاحب الدور الحقيقي (`isReal`) مصبوغ ذهبياً `bg-[#C5A059]/10 border-[#C5A059]/50` بشارة **«صاحب الدور»** ذهبية.
- **اعتماد** (`autoNightApproval` وصل): بطاقة `#111`؛ عنوان (نسخة remote/readOnly) **«✅ اكتملت اختيارات اللاعبين — اعتمِد للمتابعة (لا يمكن التعديل)»** (نسخة الليدر: **«✅ اكتمل الاختيار — مرحلة مراجعة الليدر»**)؛ قائمة قابلة للتمرير `max-h-64` بكل الاختيارات مفروزة (real أوّلاً ثم بالـ pid)؛ لكل صف: وسم المُختار + شارات **«صاحب الدور»** (ذهبي) / **«عشوائي»** (رمادي `bg-gray-600`، `isRandom`) / **«يدوي»** (أخضر `bg-[#4CAF50]`)؛ `<select>` هدف (**«تخطي / لا أحد»** + الأحياء) **معطّل للمضيف** (`disabled = !isReal || readOnlyChoices`)؛ CTA ذهبي **«اعتماد الإجراء»** → `night:auto-approve-step {roomId, nextIndex, [modifiedChoices فقط إن !readOnly]}` — **يُحذَف مفتاح `modifiedChoices` كلياً عند readOnly** (لا يُرسَل null)؛ إن `!res.success` → `setError(res.error||'فشل اعتماد الخطوة')` وإلا `autoNightApproval=null`.
- **لوحة عقود السفّاح** (عند `autoNightStep.role==='ASSASSIN' && gameState.assassinState`): بطاقة بنفسجية `border-[#6b21a8]/30 bg-[#0d0015]/60` **«عقود السفّاح»** بعدّاد **«{completedCount}/{totalRequired}»**، شريط تقدّم بنفسجي `from-purple-600 to-purple-400`، صفوف عقود (✅ منجز أخضر / 🎯 حاليّ بحد بنفسجيّ / ⏳ معلّق رمادي) بنص `contract.descriptionAr` أو **«اغتيال {targetRole}»**.
- **بلا خطوة** (`autoNightStep===null` مع isAutoNight): `PhaseLoading` **«جارٍ تحضير الخطوة التالية...»** + زر **«🔄 إعادة تشغيل الخطوة»** → `night:retry-auto`.

**مستمعات الليل الأوتو** (على `on`، تُزال عند التفكيك):
- `night:auto-progress (data)` → `autoNightProgress = data`.
- `night:auto-started ({totalAlive})` → `autoNightProgress = {total: totalAlive, submitted:0}`؛ مسح step/approval.
- `night:auto-step-ready (data)` → `autoNightStep = {...data, dispatched:false}`؛ `autoNightProgress.submitted=0, choices=[]`؛ مسح approval + customTimer.
- `night:auto-step-started` → `autoNightStep.dispatched = true`.
- `night:auto-step-approval (data)` → `autoNightApproval = data`.

### 4.14 HostMorningRecap (طور MORNING_RECAP)

- إن وُجد `gameState.policewomanChoice` → العرض كله يُفوَّض إلى **`LeaderNightView`** (تدفق إعدام الشرطية، §4.17).
- رأس: ☀️ كبير، Amiri **«ملخّص الليلة»**، mono **«{n} تقرير»**. حالة فارغة: **«لا أحداث هذه الليلة · لا خسائر»**.
- بطاقات الأحداث من `morningEvents[]` بخريطة **EVENT_META** (أيقونة/عنوان/لون/قابلية العرض):

| type | icon | title | displayable |
|---|---|---|---|
| ASSASSINATION | 🩸 | اغتيال ناجح | نعم |
| ASSASSINATION_BLOCKED | 🛡️ | فشل الاغتيال — نجت الحماية | نعم |
| PROTECTION_FAILED | 💔 | حماية فاشلة | لا (سرّي) |
| SILENCED | 🤐 | تمّ إسكات لاعب | لا (سرّي) |
| SNIPE_MAFIA | 🎯 | القنّاص أصاب مافيا | نعم |
| SNIPE_CITIZEN | 💀 | القنّاص أصاب مواطناً | نعم |
| SHERIFF_RESULT | 🔍 | نتيجة تحقيق الشريف | لا (سرّي) |
| ASSASSIN_KILL | 🔪 | السفّاح اغتال | نعم |
| ASSASSIN_BLOCKED | 🛡️ | حماية ضدّ السفّاح | نعم |
| ABILITY_DISABLED | 🧙‍♀️ | تعطيل قدرة | نعم |
| POLICEWOMAN_EXECUTION | 👮‍♀️ | إعدام الشرطية | نعم |
| TWIN_SUICIDE | 🩸 | انتحار التوأم | نعم |
| TWIN_TRANSFORM | 🌑 | الصحوة المظلمة | نعم |
| (مجهول) | ❓ | `event.type` الخام | نعم |

- حد البطاقة: مكشوفة أخضر `#2E5C31/40`، سرّية (SHERIFF) ذهبي/25، الافتراضي `#1a1a1a`.
- محتوى البطاقة: أيقونة، عنوان Amiri ملوّن (+ وسم **«🎲 تلقائي»** إذا `wasRandom`)، سطر الهدف **«#{targetPhysicalId} {targetName} · {extra.targetRole}»**، سطر المنفّذ **«بواسطة: #{performerPhysicalId} {performerName}»**، وللشريف فقط chip حكم inline (**«🎭 مافيا»** أحمر / **«🏛 مواطن»** أخضر، Amiri، + **«🔒 سرّي لك»**) من `extra.result`.
- إجراء البطاقة: الأحداث القابلة للعرض → زر **«👁 عرض»** (ذهبي، `animate-pulse` حتى الكشف؛ يصبح **«🔄 إعادة»** بعده) → `night:display-event {eventIndex}` (بثّ لحلقة اللاعبين) + وسم محلي؛ السرّية → chip ثابت **«سرّي»**.
- CTA سفليّ: إن `pendingWinner` → **«🏁 عرض النتيجة»** (`game:confirm-end`) وإلا **«☀️ بدء نقاش اليوم»** (`night:end-recap`)؛ **كلاهما معطّل حتى تُكشف كل الأحداث القابلة للعرض** (السرّية معفاة)؛ تلميح **«اعرض جميع الأحداث أولاً»**. مجموعة المكشوف (`Set<int>`) تُصفَّر عند تغيّر `gameState.round`.

### 4.15 GAME_OVER (على مستوى الصفحة)

- الحلقة فوقه تعرض كشف الأدوار الكامل (`winnerReveal`).
- الجسم (`px-4 pt-2 pb-7 text-center`): emoji فائز عملاق `text-6xl` بتوهّج `filter: drop-shadow(0 0 26px rgba(197,160,89,0.45))`: **🩸** (MAFIA) / **🔪** (ASSASSIN) / **🤡** (JESTER) / **⚖️** (أي قيمة أخرى = فوز المدينة)؛ عنوان Amiri `text-2xl font-black`: **«انتصار المافيا»** / **«انتصار السفّاح»** / **«فوز المهرج»** / **«تطهير المدينة»**؛ سطر لاتيني mono `tracking-[0.25em]`: **«ALL CITIZENS ELIMINATED»** / **«CONTRACTS FULFILLED»** / **«THE JESTER WINS»** / **«THREAT NEUTRALIZED»**.
- أزرار (`flex gap-2 max-w-md mx-auto`): `btn-premium` **«🔄 لعبة جديدة»** → `room:new-game {roomId}` (اللاعبون يبقون، عودة للوبي) | **«إنهاء الغرفة»** (outlined `border-[#333] text-[#aaa]`) → `room:close-event` + مسح localStorage والحالة → شاشة الإنشاء.

### 4.16 مكوّن الليدر #2 — `LeaderDayView` (فولباك أطوار النهار الخاصة)

يُمرَّر بـ `{gameState, emit, setError}`. يُستدعى من HostDayControls عند `MAYOR_POSTPONED` / `pendingBomb` / أي DAY_* غير مطابق. **ملاحظة نقل:** كل شاشات LeaderDayView تستعمل `MafiaCard` (بطاقة الدور، انظر 22-role-cards.md) و`noir-card` (بطاقة داكنة مشتركة تُعرَّف في 01). كما تحوي شريط أدوات عالميّ (Quick Penalties Drawer + زر ⚖️ عائم + مودال تأكيد العقوبة + شريط المقصيين) موصوف أدناه، مغلَّف حول كل طور عبر `renderWithGlobals`.

**الأدوات العالمية (`renderWithGlobals`)**:
- زر ⚖️ عائم `fixed bottom-6 right-6 z-45 bg-[#C5A059] text-black w-12 h-12 rounded-full` (title **«نظام العقوبات السريع»**) → يفتح Drawer.
- **Quick Penalties Drawer**: backdrop `fixed inset-0 bg-black` (opacity→0.5)؛ لوحة تنزلق من اليمين (`x:100%→0`, spring damping 25 stiffness 200) `w-full max-w-md bg-[#080808]/95 border-l border-[#2a2a2a]`؛ رأس Amiri **«نظام العقوبات السريع»** + ✕؛ قائمة كل اللاعبين (`!penaltyKicked`، أحياء + أموات): avatar 10×10 (رقم أو 💀)؛ اسم قابل للنقر يكشف الدور (**«🔒 اضغط لكشف الدور»** → عند الكشف chip دور: مافيا `bg-[#8A0303]/20 text-red-400` / غيره `bg-cyan-500/10 text-cyan-300`؛ يُطلق telemetry `ui:penalty-role-reveal` — بلا ack)؛ ميت له وسم **«مُقصى»**؛ نقاط عقوبات (`maxPenalties`)؛ زر **«⚠️ عقوبة»** → يفتح مودال التأكيد. فتح الـ Drawer يُطلق telemetry `ui:penalty-menu-open {roomId}` (بلا ack).
- **مودال تأكيد العقوبة** (`penalizingId !== null`): backdrop `bg-black/80 z-50`؛ بطاقة `bg-[#0a0a0a] border-2 border-amber-500/40` بشريط علويّ كهرماني؛ أيقونة ⚠️ نابضة؛ عنوان Amiri **«تسجيل عقوبة جديدة»**؛ **«اللاعب: {name} (مقعد #{id})»**؛ نقاط العقوبات؛ نص **«هذه ستكون العقوبة رقم {n+1} من أصل {max}.»** + **«باقي {k} عقوبة للإقصاء.»** (إن `n+1 < max`)؛ عند بلوغ الحد تحذير أحمر نابض **«🚨 تحذير: سيتم طرد هذا اللاعب فوراً لتجاوزه الحد الأقصى للعقوبات!»**؛ زرّان **«تأكيد وتسجيل»** (كهرماني، أثناء التحميل **«جاري التسجيل...»**) → `leader:record-penalty {roomId, targetPhysicalId}` / **«إلغاء»**.
- **شريط المقصيين بالعقوبات** (`penaltyKickedPlayers`, `!isAlive && penaltyKicked`): بطاقة `bg-red-950/30 border border-red-500/20` رأس **«⛔ EJECTED BY PENALTIES»** + chips **«#{id} {name} مُقصى»**.

**نافذة العمدة (`renderMayorWindowModal`)** — تعلو أيّ طور نهاريّ:
- المصدر الموثوق: اشتراك مباشر عبر `getSocket()` (لا الـ `on` الممرَّر) بالأحداث: `day:mayor-window ({winner, topVotes})` → `mayorWindowLocal={winner,topVotes}`؛ `day:mayor-window-closed` و`day:mayor-revealed` → `mayorWindowLocal=null`. الاحتياط: `gameState.mayorState.window` (لإعادة الاتصال)؛ **يُغلَق نهائياً عند `mayorState.vetoUsed`**.
- المودال (`fixed inset-0 z-[90] bg-black/85`): بطاقة `border-2 border-[#C5A059]` بخلفية `linear-gradient(170deg,#1d160c,#0f0b06)`؛ 🎩؛ عنوان **«نافذة العمدة»**؛ نص **«نتيجة التصويت: إعدام {targetLabel} ({topVotes} أصوات) — اسأل: هل يُعلن العمدة نفسه ويستخدم نفوذه؟»** (targetLabel لصفقة: **«صفقة: #{init} {initName} ← #{tgt} {tgtName}»**، وإلا **«#{tgt} {tgtName}»**)؛ ثلاثة أزرار:
  - **«⚔️ لا تدخّل — تنفيذ الإعدام»** (أحمر) → `handleMayorDecision('PASS')`.
  - **«🎩🔄 إلغاء الإعدام — تصويت جديد على الجميع»** (أزرق) → `REVOTE` (يصفّر حالة التبرير والتصويت).
  - **«🎩🌙 تأجيل — لا موت اليوم»** (بنفسجي) → `POSTPONE`.
  - تذييل: **«أيّ خيارَي عمدةٍ = كشفٌ دائم للجميع + صوت ×{mayorVoteWeight} فوريّ + استهلاك القدرة (مرّة واحدة باللعبة)»**.
  - كل قرار يسبقه `swalConfirm` بنصّه (PASS: **«لا تدخّل من العمدة — تنفيذ الإعدام كالمعتاد؟»**؛ REVOTE: **«العمدة يكشف نفسه ويُلغي الإعدام — تصويت جديد كامل على الجميع؟\n(كشفٌ دائم + صوته المضاعف + تُستهلك القدرة)»**؛ POSTPONE: **«العمدة يكشف نفسه ويؤجّل — لا موت اليوم وتبدأ الليلة؟\n(كشفٌ دائم + صوته المضاعف + تُستهلك القدرة)»**) ثم `day:mayor-decision {roomId, decision}`.

**DAY_ELIMINATION — تأجيل العمدة** (`pendingResolution.type === 'MAYOR_POSTPONED'`): بطاقة `border-2 border-[#C5A059]/60` بخلفية `linear-gradient(170deg,#1d160c,#0f0b06)`؛ 🎩؛ Amiri **«العمدة أجّل الإعدام»**؛ نص **«كشف {name} نفسه عمدةً وألغى إعدام اليوم — لا موت. صوته يُحسب ×{mayorVoteWeight} من الآن، وغداً نهارٌ جديد طبيعيّ.»**؛ زر **«📢 إعلان قرار العمدة ← ثم بدء الليل»** → `day:trigger-reveal {result: pendingResolution}`.

**DAY_ELIMINATION — قنبلة الأب الروحيّ** (`pendingBomb` موجود و`GODFATHER` ضمن المُقصَين): كروت المُقصَين (MafiaCard مكشوفة) بعنوان **«🔒 LEADER EYES ONLY»**؛ بطاقة قنبلة `border-2 border-[#8A0303]/40` 💣؛ Amiri **«قدرة القنبلة»**؛ نص **«شيخ المافيا يأخذ معه لاعبين مجاورين عند إقصائه»**؛ عمودان **«⬆️ اللاعب التالي»** / **«⬇️ اللاعب السابق»** (`bomb.above`/`bomb.below`: #id + اسم + دور + زر **«💣 إقصاء هذا فقط»**، أو معطّل **«لا يوجد»**)؛ إن وُجِد الاثنان → **«💣💣 تفعيل القنبلة — إقصاء الاثنين»** (نابض)؛ دائماً **«❌ إيقاف القدرة — بدون إقصاء إضافي»**. كل الأزرار → `day:bomb-decision {roomId, eliminateAbove, eliminateBelow}`.

**بقية أطوار LeaderDayView** (تُستعمَل فقط لأي DAY_* غير مطابق تسقط هنا — نظائر كاملة لما في HostDayControls/HostVoting/HostJustification/HostElimination لكن بلغة الليدر desktop):
- **DAY_JUSTIFICATION**: مرحلة الدفاع (اختيار الوقت `<select>` [15/30/45/60]، بدء `day:start-justification-timer`، ضبط `day:adjust-timer JUSTIFICATION`، إعادة `day:reset-justification-timer`، `⏭ التالي`/`✅ إنهاء`)؛ مرحلة القرار (نصاب السحب، أصوات الوكالة `player:withdraw-vote`، أزرار TIE/execute كما §4.11).
- **DAY_REVEALED**: كروت MafiaCard؛ زر **«🌙 بدء مرحلة الليل»** → `night:start` (`nurseAvailable` → شاشة الممرضة **«الطبيب خارج اللعبة»** → `night:begin-queue {activateNurse}`) أو **«🏁 عرض النتيجة على الشاشة»** → `game:confirm-end` عند `pendingWinner`.
- **DAY_TIEBREAKER**: 4 أزرار **«إعادة تصويت»/«حصر التصويت بالمتعادلين»/«إلغاء التصويت (الانتقال لليل)»(CANCEL)/«إقصاء جميع المتعادلين»** → `day:tie-action`.
- **DAY_DISCUSSION**: إعداد (`<select>` من يبدأ + الوقت [15/30/45/60/90]، `day:start-discussion`)؛ تحكّم حيّ (⏮ PREV `day:prev-speaker`, ▶ START/RESUME أو ⏸ PAUSE `day:timer-action`, 🔄 RESET, ⏭ NEXT `day:next-speaker`, ضبط `day:adjust-timer DISCUSSION`، مؤقّت محليّ 100ms من `startTime`)؛ انتهاء النقاش (اختيار مدة التصويت [بدون/10/20/30]، **«YES - REGISTER DEALS»** يفتح تسجيل صفقات عبر `day:create-deal`/`day:remove-deal`، أو **«NO - SKIP TO VOTING»**/`day:start-voting`؛ `handleStartVoting` يسبقه `swalConfirm('هل أنت متأكد من بدء التصويت؟ لن تتمكن من تعديل الاتفاقيات.')`).
- **DAY_VOTING**: بطاقات MafiaCard بإيماءات (Tap=+1 بالوكالة، Swipe=كشف 2s)؛ شريط اختيار مصوّت؛ `day:cast-vote`/`day:resolve`/`day:voting-timeout`/`day:un-narrow` كما §4.10 لكن مع تسجيل صفقات وكشف بالسحب.
- fallback نهائي: **«UNKNOWN SUB-PHASE: {phase}»**.

### 4.17 مكوّن الليدر #3 — `LeaderNightView` (فولباك: ليل يدويّ + الشرطية)

يُمرَّر بـ `{gameState, emit, setError}`. يُستدعى من HostNightRunner عند `nightMode !== 'auto'` (ليل يدويّ) وعند `policewomanChoice` (تدفّق الشرطية داخل MORNING_RECAP). يشترك في الأدوات العالمية (Quick Penalties Drawer + مودال العقوبة) كـ §4.16.

**ثوابت العرض**: `ACTION_META` (لكل دور/قدرة icon+color+bgGlow: GODFATHER 🔪، SILENCER 🤐، SHERIFF 🔍، DOCTOR 💉، SNIPER 🎯، NURSE ⚕️، ASSASSINATE 🗡️ بنفسجي، WITCH/DISABLE 🔮 …)؛ `EVENT_META` **خاصّ بـ LeaderNightView ويختلف عن جدول §4.14 (HostMorningRecap)** في العناوين والأيقونات: ASSASSINATION_BLOCKED **«حماية ناجحة»** (لا «فشل الاغتيال — نجت الحماية»)، SNIPE_MAFIA **«القناص نجح»**، SNIPE_CITIZEN **«القناص فشل»**، SHERIFF_RESULT **«نتيجة التحقيق»**، ASSASSIN_BLOCKED **«حماية ضد السفّاح»**، ABILITY_DISABLED أيقونتها **🔮** (لا 🧙‍♀️)، PROTECTION_FAILED **«حماية فاشلة»** `text-[#8B4513]`، و**لا يحوي POLICEWOMAN_EXECUTION** (تدفّق الشرطية يُعرَض مستقلاً أدناه).

**تدفّق الشرطية** (`phase==='MORNING_RECAP' && policewomanChoice && !policewomanResult`):
- رأس 👮‍♀️ متحرّك + Amiri **«صلاحية الشرطية»** / mono **«POLICEWOMAN ABILITY ACTIVATED»**.
- بطاقة معلومات `bg-[#1a0a2e]/60 border-[#6a3d9a]/40`: **«🏅 {policewomanName} (#{policewomanPhysicalId})»**؛ **«المواطنون عند خروجها: {threshold*4} | العتبة: {threshold} | الوفيات: {citizenDeaths}»**؛ **«اختر لاعباً لإقصائه — إذا كان مافيا ستحصل الشرطية على نقاط رانك»**.
- كروت الأهداف (`pwData.targets` — MafiaCard، تحديد بحلقة `ring-[#a78bfa]`).
- زرّان: **«⚡ تنفيذ الإقصاء»** (معطّل بلا هدف؛ أثناء التحميل **«...»**) → `policewoman:execute {roomId, targetPhysicalId}` → عند النجاح `policewomanResult=res`؛ **«⏭ تخطي»** → `policewoman:skip {roomId}`.
- **نتيجة الشرطية** (`policewomanResult`): 🎯/💔؛ Amiri **«الشرطية أصابت! 🎭»** / **«الشرطية أخطأت»**؛ **«#{targetName} — {targetRole}»**؛ إن مافيا **«+نقاط رانك للشرطية 🏆»**؛ إن `pendingWinner` → إعلان الفائز + **«🏁 عرض النتائج»** → `game:confirm-end`؛ وإلا **«☀️ متابعة لنقاش اليوم»** → `night:end-recap`.

**overlay نتيجة الشريف (`renderSheriffOverlay`)**: عند `gameState.sheriffResult && phase==='NIGHT'` → overlay `fixed inset-0 z-50 bg-black/80` بكرت MafiaCard + بنر قطريّ مائل 35°: **«🎭 مافيا»** (`bg-[#8A0303]/90`) / **«🏛 مواطن»** (`bg-[#2E5C31]/90`) + eyebrow **«🔒 LEADER EYES ONLY»** + زر **«✓ فهمت»**.

**MORNING_RECAP اليدوي** (بدون policewomanChoice): تخطيط عمودين — يمين أحداث الليل (نفس EVENT_META، أزرار **«👁 عرض»/«🔄 إعادة»** → `night:display-event`، سرّي **«سري»**)، يسار كروت الأحياء (ضغط مطوّل 500ms يكشف الكرت 2s)؛ CTA سفليّ **«☀️ بدء نقاش اليوم الجديد»** → `night:end-recap` أو **«🏁 عرض النتائج»** → `game:confirm-end` (معطّل حتى كشف كل الأحداث القابلة؛ تلميح **«اعرض جميع الأحداث أولاً»**).

**NIGHT — خطوة الطابور** (`nightStep && meta`):
- رأس: 🌑 + Amiri **«مرحلة الليل»** / mono **«ROUND {round}»** + شريط تقدّم أدوار (7 أيقونات، الحالية مضيئة).
- شريط المؤدّي: أيقونة الدور + `nightStep.roleName` (Amiri ملوّن) + **«#{performerPhysicalId} {performerName}»**.
- عقود السفّاح (عند `role ∈ {ASSASSINATE, ASSASSIN} && assassinState`): **«عقود الاغتيال»** + عدّاد + شريط + صفوف `contract.description`.
- إن `nightStep.isDisabled` (معطّل بالساحرة): بطاقة بنفسجية 🚫 **«هذه القدرة معطّلة بواسطة الساحرة»** / **«ROLE IS DISABLED BY THE WITCH — PROCEED BY SKIPPING»** + زر **«⏭ تخطي للمرحلة التالية»** → `night:skip-action {role}`.
- وإلا: label **«🎯 اختر الهدف — SELECT TARGET»** + **«اضغط مطولاً على الكارد لكشف الدور»**؛ كروت `nightStep.availableTargets` (اختيار محليّ `selectedTarget`، ضغط مطوّل يكشف)؛
  - في **الوضع اليدويّ**: زرّان **«✅ تأكيد»** (معطّل بلا هدف) → `night:submit-action {roomId, role, targetPhysicalId}` / **«⏭ تخطي»** (إن `canSkip`) → `night:skip-action {roomId, role}`.
  - في وضع auto (لن يحدث هنا لأن المضيف يوجّه auto لـ HostNightRunner): رسالة **«📱 يختار اللاعبون من أجهزتهم...»** أو **«✅ تم اختيار الهدف بنجاح»**.
- **NIGHT — الطابور مكتمل** (`nightComplete`): ⚙️؛ Amiri **«اكتمل طابور الليل»** / **«ALL NIGHT ACTIONS REGISTERED • READY FOR RESOLUTION»** + `btn-premium` نابض **«⚡ معالجة تقاطعات الليل»** → `night:resolve {roomId}`.
- **NIGHT — انتظار**: 🌑 + **«AWAITING NIGHT DATA...»**.
- **حالة محلية تُنقَل**: `selectedTarget` يُصفَّر عند تغيّر الخطوة مع **استرجاع اختيار محفوظ** من `localStorage['mafia_leader_night_sel']` إن طابق (roomId+role+performer)؛ يُحفَظ عند كل اختيار؛ يُمسَح عند `submit`/`skip`/دخول MORNING_RECAP.

---

## 5. التكيّف مع الشاشات 6→11 إنش

الاستراتيجية الكاملة (Window Size Classes) موثّقة في **01-foundation-theme.md**. القاعدة العامة: compact (<600dp) = عمود واحد كما في PWA؛ medium (600–840dp) = رفع أعمدة الشبكات + سقف عرض نصّي 640dp؛ expanded (>840dp) = سقف 840–960dp + توسيع الشبكات + مضاعفة أحجام عناصر اللعب الحسّاسة.

**تخصيص كونسول المضيف:**

- **compact (<600dp — هواتف 6–7″، السيناريو الأساسي):** طبق-الأصل من الـ PWA. القشرة عمود واحد؛ `max-w-md` النصّي (شاشة الإنشاء/الإعدادات) يملأ العرض بحشوة 20px؛ شبكة المرشحين (HostVoting) **3 أعمدة**؛ chips المصوّتين `Wrap`؛ حلقة الطاولة كاملة العرض؛ HostSettingsModal ورقة سفلية `max-h-[88vh]`. أهداف اللمس ≥44px (steppers، أزرار الممرضة، أزرار التعادل ≥48px) إلزامية.
- **medium (600–840dp — تابلت 8″):** سقف عرض المحتوى النصّيّ **640dp** موسّط (شاشة الإنشاء، HostSettingsModal، بطاقات القرار في HostJustification، شاشات MAYOR_POSTPONED/الممرضة). شبكة المرشحين (HostVoting) ترتفع إلى **4 أعمدة**؛ روستر اللوبي يبقى عموداً واحداً (قوائم accordion) لكن ضمن سقف 640dp. شريط الإحصاءات الثلاثيّ يبقى 3 بطاقات متساوية. حلقة الطاولة تُوسّع صفوفها. لوحة الليل الأوتو (قائمة الاختيارات) ضمن سقف 640dp.
- **expanded (>840dp — تابلت 10–11″):** سقف **840–960dp** موسّط للمحتوى؛ شبكة المرشحين **4–5 أعمدة**؛ **مضاعفة أحجام عناصر اللعب الحسّاسة** بدل تمديدها: كروت PhoneSpectatorView/MafiaCard وأرقام المؤقّتات (عدّ التبرير `text-4xl`، عدّاد التصويت الكبير، مؤقّت النقاش) تُضاعَف حجماً؛ chips اللاعبين والمصوّتين تكبر لا تتمدّد. two-pane مفيد لأطوار الليدر المفوَّضة: LeaderNightView يعرض عمودين (أحداث | كروت أحياء) أصلاً — أبقِهما جنباً إلى جنب في expanded (وليس عمود مكدَّس). لوحة RemoteVoice/الحلقة تبقى أعلى، والجسم الموجَّه بالطور ضمن السقف. الرأس اللاصق يبقى ثابتاً بعرض كامل، والمحتوى داخله موسَّط.
- **مشترك (كل الفئات):** لا تمرير أفقيّ للجسم إطلاقاً (الجداول/الشبكات العريضة داخل `overflow-x:auto` خاصّ بها)؛ قفل `textScaleFactor` للأرقام mono الصغيرة (10–8px) لضمان مقروئية العربية؛ RTL عبر `Directionality` وEdgeInsetsDirectional (كود الغرفة LTR).

---

## 6. المنطق والتدفقات

### 6.1 آلة الحالة العليا (HostGameController)

- `gameState == null` → **شاشة الإنشاء**. بعد `room:create-remote` الناجح: حفظ `roomId` في `roomIdRef` + `localStorage['mafia_host_room']` ثم `refreshState`.
- `gameState != null` → القشرة، والجسم يُوجَّه بـ `gameState.phase` (جدول §4.2).
- الأطوار: `LOBBY → ROLE_GENERATION → ROLE_BINDING → DAY_DISCUSSION → DAY_VOTING → (DAY_JUSTIFICATION → DAY_ELIMINATION/DAY_TIEBREAKER) → DAY_REVEALED → NIGHT → MORNING_RECAP → (تكرار) → GAME_OVER`.

### 6.2 `applyState` — الدمج الحرج (يُنقَل حرفياً)

عند كل حالة قادمة `s`:
1. إن `s.phase !== 'MORNING_RECAP'` → `policewomanChoiceRef = null`.
2. `pw = (policewomanChoiceRef && s.phase==='MORNING_RECAP') ? {policewomanChoice: ref} : {}`.
3. إن `revealOverrideRef && s.phase==='DAY_ELIMINATION'` → **الخادم ما زال على DAY_ELIMINATION لكننا كشفنا محلياً** → `setState({...s, ...pw, phase:'DAY_REVEALED', revealedData: ov, pendingWinner: ov.pendingWinner ?? s.pendingWinner ?? null})`.
4. وإلا: إن كان هناك `ov` (تقدّمنا للأمام: ليل/نهاية) → `revealOverrideRef=null`؛ ثم `setState({...s, ...pw})`.

**Overlayان جبهيّان (client-only) — أخطاء سباق مُصلَحة بالفعل، النقل إلزاميّ:**
- **`revealOverrideRef` (DAY_REVEALED)**: طور جبهيّ فقط؛ الخادم يبقى DAY_ELIMINATION؛ يُفعَّل من بثّ `day:elimination-revealed`؛ بدونه يختفي زر «بدء الليل» مع كل poll.
- **`policewomanChoiceRef`**: بيانات `policewoman:choice-available` تُحقَن في كل poll أثناء MORNING_RECAP فقط (تُمسَح في غيره)؛ بدونه تعلق اللعبة عند تفعيل الشرطية.
- **`poolInitRef` (HostRoleBinding)**: توقيع JSON للـ rolesPool يمنع إعادة تهيئة الـ slots من poll.

### 6.3 إعادة الاتصال واستعادة الحالة

- عند `isConnected && roomIdRef`: `room:rejoin-host {roomId}` ثم `refreshState`؛ الفشل → مسح `roomIdRef` + `localStorage`.
- عند `isConnected && !roomIdRef`: `room:my-hosted-room {}` → إن `{success, roomId}` → حفظ + `room:rejoin-host` + `refreshState` (المضيف يستعيد غرفته من **أي جهاز**، لا من متصفح الإنشاء فقط).
- **موبايل**: يجب تشغيل مسار إعادة الاتصال عند `AppLifecycleState.resumed` (الخلفية تقطع socket).

### 6.4 المؤقّتات والمهل

- **poll كامل للحالة**: `Timer.periodic(2500ms)` دائماً أثناء التركيب (`game:get-state`)؛ + refresh بعد كل حدث بثّ (§7).
- توست الخطأ: مسح تلقائي بعد **4000ms**.
- عدّ التبرير التنازليّ: `Timer.periodic(1000ms)` مشتق من `timer.startTime` + `DateTime.now()` (لا سلطة عدّ محلية)؛ أحمر+نبض عند ≤10s.
- «تم النسخ»: **2000ms**؛ حفظ الإعدادات ثم إغلاق: **700ms**.
- المواجهة (ConfrontationControls): عدّ 500ms من `startedAt` الخادميّ، مدة ثابتة **30s** (31).

### 6.5 الحالات الحدّية

- **تحديثات تفاؤلية مع rollback**: (أ) إسناد الدور في HostRoleBinding (إرجاع الـ slot عند خطأ الخادم)؛ (ب) بدء خطوة الليل (`dispatched=true` تفاؤليّاً، تراجع عند الفشل).
- **اعتماد قراءة فقط**: المضيف **لا يرسل `modifiedChoices`** في `night:auto-approve-step` (يحذف المفتاح، لا null).
- **`player:withdraw-vote` بلا roomId** (الخادم يستنتج من الجلسة).
- **التخويل**: `room:create-remote` يفشل لغير المدرجين → عرض `«غير مصرّح لك»` + نص الإرشاد.
- **قفل شاشة**: `wakelock_plus` إلزاميّ (سطح إشراف طويل).

---

## 7. عقود التكامل

### 7.1 REST
**لا شيء.** الصور فقط: `avatarUrl` كاملة + thumb مشتق `/uploads/avatars/thumbs/{name}.webp` (عبر `avatarThumb` regex، `onError` مرة واحدة للأصل ثم emoji).

### 7.2 Socket — Emits (ack-based؛ كل الحمولات تحوي `roomId` إلا ما نُصّ)

| Event | Payload | متى | الرد المستخدَم |
|---|---|---|---|
| `room:create-remote` | `{gameName, maxPlayers, maxJustifications, maxPenalties, penaltyScope:'room'\|'game', autoNightTime, gameTimerMinutes, bombEnabled, mafiaChatEnabled, allowPlayerInvites}` | زر الإنشاء | `res.roomId` |
| `game:get-state` | `{roomId}` | poll 2.5s / بعد الأحداث / rejoin | `res.state` |
| `room:rejoin-host` | `{roomId}` | (إعادة) اتصال بغرفة محفوظة | نجاح/فشل |
| `room:my-hosted-room` | `{}` | اتصال بلا غرفة محفوظة | `{success, roomId}` |
| `room:reset-to-lobby` | `{roomId}` | إلغاء اللعبة (الرأس) | — |
| `room:close-event` | `{roomId}` | إلغاء اللوبي / إنهاء الغرفة | — |
| `room:new-game` | `{roomId}` | لعبة جديدة (GAME_OVER) | — |
| `room:update-max-players` | `{roomId, maxPlayers}` (6–50) | stepper اللوبي | — |
| `room:update-settings` | `{roomId, gameName, autoNightTime, gameTimerMinutes, maxJustifications, maxPenalties, penaltyScope, bombEnabled, mafiaChatEnabled, allowPlayerInvites}` | حفظ الإعدادات | `{success, error?}` |
| `room:kick-player` | `{roomId, physicalId}` | تأكيد الطرد | — |
| `room:release-held-seat` | `{roomId, physicalId}` | chip مقعد محجوز | — |
| `room:start-generation` | `{roomId}` | بدء اللوبي | — (→ ROLE_GENERATION) |
| `leader:record-penalty` | `{roomId, targetPhysicalId}` | عقوبة | — |
| `room:update-mafia-reveal` | `{roomId, allowMafiaReveal}` | toggle الربط | fire-and-forget |
| `setup:bind-role` | `{roomId, physicalId, role}` | إسناد slot | — |
| `setup:unbind-role` | `{roomId, physicalId}` | إعادة/مسح إسناد | — |
| `setup:random-assign` | `{roomId, lockedPhysicalIds:number[]}` | عشوائي | `res.state` |
| `setup:confirm-roles` | `{roomId}` | تأكيد وإرسال | — |
| `setup:binding-complete` | `{roomId}` | قفل وبدء | — |
| `setup:roles-confirmed` | `{roomId, roles:Role[], assassinContractCount?, mayorVoteWeight?, jesterSurviveRounds?, witchDisableRounds?}` | **LeaderRoleConfigurator** CONFIRM | — |
| `leader:mafia-chat-toggle` | `{roomId, enabled}` | toggle دردشة المافيا (ليدر فقط — مخفيّ للمضيف) | `{success, enabled}` |
| `day:start-discussion` | `{roomId, startPhysicalId, timeLimitSeconds}` | بدء النقاش | — |
| `day:timer-action` | `{roomId, action:'START'\|'PAUSE'\|'RESUME'\|'RESET'}` | تحكّم النقاش | — |
| `day:adjust-timer` | `{roomId, phase:'DISCUSSION'\|'JUSTIFICATION', delta:±10\|±30}` | ضبط | — |
| `day:prev-speaker` / `day:next-speaker` | `{roomId}` | تنقّل النقاش | — |
| `day:create-deal` | `{roomId, initiatorPhysicalId, targetPhysicalId}` | تسجيل صفقة (LeaderDayView فقط) | — |
| `day:remove-deal` | `{roomId, dealId}` | حذف صفقة (LeaderDayView) | — |
| `day:start-voting` | `{roomId, durationSeconds?}` (undefined=بلا حدّ) | بعد النقاش | — |
| `day:cast-vote` | `{roomId, candidateIndex, delta:1\|-1, voterPhysicalId}` | تصويت/تراجع بالوكالة | `{leaderProxyVotes?}` |
| `day:un-narrow` | `{roomId}` | العودة للمباشر | — |
| `day:voting-timeout` | `{roomId}` | تصويت الغائبين على أنفسهم | `{autoVotedCount?}` |
| `day:resolve` | `{roomId}` | حسم التصويت | — |
| `day:start-justification-timer` | `{roomId, physicalId, timeLimitSeconds}` | بدء الدفاع | — |
| `day:reset-justification-timer` | `{roomId, physicalId, timeLimitSeconds}` | 🔄 | — |
| `day:stop-justification-timer` | `{roomId}` | قبل المتّهم التالي | أخطاؤه مُتجاهَلة |
| `player:withdraw-vote` | `{physicalId}` (**بلا roomId**) | سحب صوت وكالة | — |
| `day:tie-action` | `{roomId, action:'REVOTE'\|'NARROW'\|'CANCEL'\|'ELIMINATE_ALL', tiedCandidates}` | تعادل/قرار | `{revote?}` |
| `day:execute-elimination` | `{roomId, skipWithdrawal:true}` | تنفيذ الإقصاء | `{mayorWindow?, window?, revote?}` |
| `day:trigger-reveal` | `{roomId, result: pendingResolution}` | كشف الهويّة | — |
| `day:mayor-decision` | `{roomId, decision:'PASS'\|'REVOTE'\|'POSTPONE'}` | قرار العمدة (LeaderDayView) | — |
| `day:bomb-decision` | `{roomId, eliminateAbove:boolean, eliminateBelow:boolean}` | قرار القنبلة (LeaderDayView) | — |
| `night:start` | `{roomId}` | بعد الكشف | `{nurseAvailable?:boolean}` |
| `night:begin-queue` | `{roomId, activateNurse:boolean}` | prompt الممرضة | — |
| `night:auto-advance-step` | `{roomId, durationSeconds}` | بدء خطوة الليل | `{success, error?}` |
| `night:auto-approve-step` | `{roomId, nextIndex, modifiedChoices?}` (**يُحذَف عند readOnly**) | اعتماد الخطوة | `{success, error?}` |
| `night:skip-action` | `{roomId, role}` | تخطي خطوة | `{success}` |
| `night:retry-auto` | `{roomId}` | خطوة عالقة | — |
| `night:submit-action` | `{roomId, role, targetPhysicalId}` | ليل يدويّ (LeaderNightView) | — |
| `night:resolve` | `{roomId}` | معالجة الليل اليدويّ | — |
| `night:display-event` | `{roomId, eventIndex}` | كشف حدث صباح | — |
| `night:end-recap` | `{roomId}` | بدء نقاش اليوم | — |
| `game:confirm-end` | `{roomId}` | إعلان الفائز | — |
| `policewoman:execute` | `{roomId, targetPhysicalId}` | إقصاء الشرطية (LeaderNightView) | `{success, targetIsMafia, targetName, targetRole, pendingWinner?}` |
| `policewoman:skip` | `{roomId}` | تخطي الشرطية | — |
| `ui:penalty-menu-open` | `{roomId}` | فتح قائمة العقوبات (telemetry، `getSocket().emit` بلا ack) | — |
| `ui:penalty-role-reveal` | `{roomId, physicalId, role}` | كشف دور في قائمة العقوبات (telemetry) | — |

المواجهة/الصوت (تُمرَّر للشرائح): `player:request-confrontation`, `player:respond-confrontation`, `leader:approve-confrontation`, `voice:get-token`, `room:invite-player` — تفاصيلها في 31 و14.

### 7.3 Socket — Listeners (كلها مفلترة/مُطبَّقة لـ `roomIdRef.current`)

| Event | الحمولة | السلوك |
|---|---|---|
| `game:state-sync` / `game:state-updated` | حالة كاملة `s` (`s.roomId===roomIdRef`) | `applyState(s)` |
| `game:phase-changed`, `game:started`, `room:player-joined`, `room:player-updated`, `room:player-kicked`, `player:seat-changed`, `night:morning-recap`, `game:over`, `day:voting-started` | (تُتجاهَل) | إعادة جلب عبر `game:get-state` |
| `policewoman:choice-available` | `data` | `policewomanChoiceRef=data` + حقن `policewomanChoice` في الحالة (يُبقى خلال MORNING_RECAP فقط) |
| `day:elimination-revealed` | `{eliminated[], revealedRoles[], pendingWinner?}` | `revealOverrideRef=data`؛ فرض phase `DAY_REVEALED` محلياً + `revealedData` (الخادم يبقى DAY_ELIMINATION) |
| `night:auto-started` | `{totalAlive}` | (HostNightRunner) progress={total,submitted:0}، مسح step/approval |
| `night:auto-progress` | `{total, submitted, missingPlayers?:[{physicalId,name}], choices?:[{physicalId, targetPhysicalId, isReal, isRandom}]}` | تحديث القائمة الحية |
| `night:auto-step-ready` | `{role, roleName, performerPhysicalId, performerName, timeoutSeconds, canSkip, ...}` | ضبط الخطوة (dispatched:false) |
| `night:auto-step-started` | — | `dispatched=true` |
| `night:auto-step-approval` | `{choices, nextIndex}` | إظهار لوحة الاعتماد |
| `day:mayor-window` / `day:mayor-window-closed` / `day:mayor-revealed` | `{winner, topVotes}` / — / — | (LeaderDayView عبر `getSocket()`) فتح/إغلاق نافذة العمدة |
| `connect`/`disconnect` | — | chip الاتصال + إعادة الانضمام |

`useActiveSpeaker` يستهلك أيضاً: `day:discussion-updated`, `day:justification-timer-started/stopped`, `game:phase-changed`, وأحداث المواجهة (31) لحساب `allowedPids` + `confrontation`.

---

## 8. نماذج Dart المطلوبة

> تُوحَّد مع 02-models-data-layer.md؛ هنا الحقول الفعلية المستهلَكة في هذه الشريحة.

```dart
enum Role { GODFATHER, SILENCER, CHAMELEON, WITCH, OLDER_BROTHER, MAFIA_REGULAR,
  SHERIFF, DOCTOR, SNIPER, POLICEWOMAN, NURSE, MAYOR, CITIZEN, YOUNGER_BROTHER, JESTER, ASSASSIN }
// MAFIA_ROLES = {GODFATHER, SILENCER, CHAMELEON, WITCH, OLDER_BROTHER, MAFIA_REGULAR}
// NEUTRAL_ROLES = {JESTER, ASSASSIN}
// ROLE_NAMES: GODFATHER'شيخ المافيا', SILENCER'قص المافيا', CHAMELEON'حرباية المافيا',
//   WITCH'الساحرة', OLDER_BROTHER'الأخ الأكبر', MAFIA_REGULAR'مافيا عادي', SHERIFF'الشريف',
//   DOCTOR'الطبيب', SNIPER'القناص', POLICEWOMAN'الشرطية', NURSE'الممرضة', MAYOR'العمدة',
//   CITIZEN'مواطن صالح', YOUNGER_BROTHER'الأخ الأصغر', JESTER'المهرج', ASSASSIN'السفّاح'
// ROLE_ICONS: GODFATHER🔪 SILENCER🤐 CHAMELEON🦎 WITCH🔮 OLDER_BROTHER👥 MAFIA_REGULAR🎭
//   SHERIFF🔍 DOCTOR💉 SNIPER🎯 POLICEWOMAN👮 NURSE🏥 MAYOR🎩 CITIZEN👤 YOUNGER_BROTHER👥 JESTER🤡 ASSASSIN🔪

class HostGameState {
  String roomId; String roomCode; String phase; int? round;
  String? winner;                 // MAFIA|ASSASSIN|JESTER|(else=city)
  List<HostPlayer> players;
  HostConfig config;
  DiscussionState? discussionState;
  VotingState? votingState;
  JustificationData? justificationData;
  WithdrawalState? withdrawalState;
  PendingResolution? pendingResolution;
  RevealedData? revealedData;      // client-only (DAY_REVEALED)
  String? pendingWinner;
  MayorState? mayorState;
  PendingBomb? pendingBomb;
  AssassinState? assassinState;
  List<MorningEvent> morningEvents;
  PolicewomanChoice? policewomanChoice; // client-only injected during MORNING_RECAP
  List<dynamic>? rolesPool;
  NightStep? nightStep; bool? nightComplete; SheriffResult? sheriffResult; // manual night
}

class HostPlayer { int physicalId; String name; Role? role; bool isAlive; String? gender;
  String? avatarUrl; bool seatHeld; bool? isConnected; int penalties; bool penaltyKicked; bool isSilenced; }

class HostConfig { bool isRemote; String nightMode; int maxPenalties; String penaltyScope;
  bool gameTimerEnabled; int gameTimerMinutes; int autoNightTime; int maxJustifications;
  bool bombEnabled; bool mafiaChatEnabled; bool allowPlayerInvites; bool allowMafiaReveal;
  int mayorVoteWeight; String gameName; }

class DiscussionState { int currentSpeakerId; String status; // WAITING|SPEAKING|PAUSED
  List<int> speakingQueue; List<int> hasSpoken; int? startTime; int timeRemaining; bool isFinished; }

class VotingState { List<Candidate> candidates; List<Deal> deals; int? totalVotesCast;
  Map<int,int> playerVotes; Map<int,int> leaderProxyVotes; int tieBreakerLevel; bool mayorRevote; }
class Candidate { String type; int targetPhysicalId; int? initiatorPhysicalId; int votes; } // type: PLAYER|DEAL

class JustificationData { List<Accused> accused; List<Accused> canJustifyList; String? resultType; // TIE
  JustTimer? timer; List<int> votersForAccused; Map<int,int> leaderProxyVotes; List<Candidate> candidates;
  int? topVotes; int maxJustifications; bool allExhausted; }
class Accused { int targetPhysicalId; String name; Role? role; int justificationCount; bool canJustify; }
class JustTimer { int physicalId; int startTime; int timeLimitSeconds; }
class WithdrawalState { int count; int needed; List<int> withdrawn; }

class PendingResolution { String? type; List<int> eliminated; List<RevealedRole> revealedRoles; String? pendingWinner; }
class RevealedRole { int physicalId; Role role; }
class RevealedData { List<int> eliminated; List<RevealedRole> revealedRoles; String? pendingWinner; }
class MayorState { bool revealed; int mayorPhysicalId; bool vetoUsed; MayorWindow? window; }
class MayorWindow { dynamic winner; int topVotes; }
class PendingBomb { BombNeighbor? above; BombNeighbor? below; }
class BombNeighbor { int physicalId; String name; String role; }

class AssassinState { int completedCount; int totalRequired; int currentContractIndex;
  List<Contract> contracts; }
class Contract { dynamic id; bool completed; String? description; String? descriptionAr; String? targetRole; }

class MorningEvent { String type; int targetPhysicalId; String targetName; int? performerPhysicalId;
  String? performerName; bool wasRandom; Map<String,dynamic>? extra; } // extra.result MAFIA|CITIZEN etc.

class PolicewomanChoice { String policewomanName; int policewomanPhysicalId; int threshold;
  int citizenDeaths; List<PwTarget> targets; }
class PwTarget { int physicalId; String name; }

// Night auto protocol (HostNightRunner local state)
class AutoNightStep { String role; String roleName; int performerPhysicalId; String performerName;
  int timeoutSeconds; bool canSkip; bool dispatched; }
class AutoNightProgress { int total; int submitted; List<MissingPlayer>? missingPlayers; List<NightChoice>? choices; }
class NightChoice { int physicalId; int? targetPhysicalId; bool isReal; bool isRandom; }
class AutoNightApproval { List<NightChoice> choices; int nextIndex; }

// Manual night (LeaderNightView)
class NightStep { String role; String roleName; int performerPhysicalId; String performerName;
  bool canSkip; bool isDisabled; List<PwTarget> availableTargets; }
class SheriffResult { String result; int targetPhysicalId; String? targetName; } // MAFIA|CITIZEN

// Voice maps (from RemoteVoice)
class VoiceMaps { Map<int, dynamic> videoByPid; Map<int, bool> audioByPid; } // dynamic = MediaStreamTrack?
```

**PHASE_SHORT** كثابت: `{LOBBY:'لوبي', ROLE_GENERATION:'أدوار', ROLE_BINDING:'ربط', DAY_DISCUSSION:'نقاش', DAY_VOTING:'تصويت', DAY_JUSTIFICATION:'دفاع', DAY_ELIMINATION:'كشف', ELIMINATION_PENDING:'كشف', DAY_REVEALED:'كشف', DAY_TIEBREAKER:'تعادل', NIGHT:'ليل', MORNING_RECAP:'صباح', GAME_OVER:'نهاية'}`.

---

## 9. الحزم المستخدمة

- `socket_io_client` — عميل Socket.IO؛ helper `emitWithAck` يحاكي عقد `useSocket` (timeout 15s، ينجح فقط عند `success===true`، وإلا يرمي `error`، رسالة timeout: **«الخادم في وضع قطع الاتصال أو لا يستجيب (Timeout)»**).
- إدارة الحالة: `flutter_riverpod` أو `flutter_bloc` — **HostGameController** واحد يملك `gameState` + الـ refs الثلاثة (revealOverride, policewomanChoice, poolSignature).
- `shared_preferences` — `mafia_host_room`، و`mafia_leader_night_sel` (اختيار الليل اليدويّ الجاري).
- `cached_network_image` — avatars (thumb أوّلاً، `errorWidget` يجرّب الأصل، ثم emoji).
- `google_fonts` — Amiri للعناوين؛ خط mono (`RobotoMono`/`JetBrainsMono`).
- `wakelock_plus` — إبقاء الشاشة مضاءة (سطح إشراف طويل).
- `url_launcher` — (WhatsApp/روابط خارجية إن استُعملت في شرائح مجاورة).
- `flutter_svg` — (شعارات SVG في مكوّنات الصوت، 31).
- مكوّنات الصوت/RealtimeKit — انظر 31 (SDK أصليّ RealtimeKit Core / خليفة `dyte_core`).
- بدائل framer-motion: `AnimatedContainer`/`AnimatedOpacity`/`AnimatedAlign`/`AnimatedSize`/`RotationTransition`/`AnimationController` (نبض/دوران/انزلاق).
- الحوارات: `showDialog` (بدل `window.confirm`/`swalConfirm`)؛ الأوراق السفلية: `showModalBottomSheet(isScrollControlled:true)`.

---

## 10. اختلافات Android / iOS

- **صوت الخلفية (RemoteVoice)**: Android يتطلب `foregroundServiceType="microphone|camera"`؛ iOS يتطلب `UIBackgroundModes: audio/voip` — وإلا تموت المكالمة عند التصغير. (التفاصيل في 31.)
- **أذونات المايك/الكاميرا** قبل `join()`: `permission_handler` مع معالجة الرفض → حالة «غير متاح» (بديل سياسة autoplay الويبية).
- **safe-area**: iOS يحتاج حشوة سفلية `env(safe-area-inset-bottom)` (InviteModal/RemoteVoice) — استخدم `SafeArea`/`MediaQuery.viewPadding`.
- **الحافظة**: `Clipboard.setData` يعمل على المنصّتين (لا حاجة لـ execCommand fallback)؛ يُقترَح `HapticFeedback.lightImpact` عند النسخ/الضغط (الويب بلا haptics — إضافة).
- **إيموجي ZWJ**: الكود اختار مفردات آمنة عمداً (WITCH 🔮 بدل 🧙‍♀️، POLICEWOMAN 👮 بدل 👮‍♀️) لتفادي تفكّك الـ glyph — أبقِ المفردات نفسها؛ وباقي إيموجي الواجهة (🧙‍♀️/👮‍♀️ في EVENT_META وحدها) تُرسَم عادة على iOS، وقد تحتاج خط Noto Color Emoji مضمّن على أندرويد القديم لضمان الوحدة.
- عدا ما سبق: **لا اختلافات جوهرية في منطق الكونسول** — كل التواصل Socket.IO موحّد المنصّة.

---

## 11. الأصول المطلوبة

- **لا صور/أصوات/Lottie مضمّنة** في هذه الشريحة — كل البصريات emoji + CSS.
- **خطوط**: `Amiri` (serif عربيّ عرضيّ) + خط mono (`RobotoMono`/`JetBrainsMono`) — تُضمَّن في الحزمة.
- **avatar افتراضيّ مضمّن**: `assets/avatars/male.png` (fallback لـ InviteModal)؛ وإيموجي 👨/👩 كـ fallback نهائيّ للروستر.
- **صور شبكية** (لا تُحزَّم): `avatarUrl` كاملة + thumb WebP 192px `/avatars/thumbs/{name}.webp`.
- **جرد إيموجي الواجهة** (كـ أيقونات): 🌐 👑 🎴 ⚙️ 📨 🗑️ ⤴️ ● ○ ▴ ▾ ⚠️ ✕ 🔒 🔓 🎲 ✅ 🎭 👤 👨 👩 🟢 ⏳ ⏱ ⏸ ▶ ⏭ ⏮ 🔄 🗳️ 🏛 ⚖️ 🎩 🤝 🟠 ⏰ 💀 🔁 🎯 🌙 ⚕️ ☀️ 🩸 🛡️ 💔 🤐 🔍 🔪 🔮 👮 🌑 ❓ 👁 🗡️ 🏁 🤡 💣 🗣️ 🎙️ 📋 🏷️ 💾 ✓ − + 🚫 🚨 ⛔ 🏥 🦎 🥇/🏅 🏆 🧙‍♀️ 👮‍♀️ (الأخيران بـ ZWJ في EVENT_META وحدها — §4.14/§10).
- `btn-premium` + `noir-card` كـ widgets مشتركة (تُعرَّف في 01).
- فيديو الكاميرا الحيّ: `MediaStreamTrack` في الحلقة (من 31).

---

## 12. معايير القبول — checklist تكافؤ ✓

- [ ] شاشة الإنشاء: كل الحقول العشرة بقيمها الافتراضية (اسم «غرفة عن بُعد»، سعة 12، مهلة الليل 15، مؤقّت 0، عقوبات 3/room، قنبلة مفعّلة، دردشة معطّلة، دعوات للمضيف فقط، تبريرات 2)، النصوص العربية حرفياً، حالات زر الإنشاء الثلاث، تعطيله عند انقطاع socket، تحذير «يجب تسجيل الدخول كلاعب أولاً.» والتذييل.
- [ ] `room:create-remote` بحمولته الحرفية؛ حفظ roomId في shared_preferences؛ عرض «غير مصرّح لك» كما هي.
- [ ] القشرة: الرأس اللاصق (🌐 HOST · code، «⤴️ إلغاء اللعبة» بشرطه، chip «● متصل»/«○ منقطع»)؛ توست خطأ 4s؛ شريط الإحصاءات (أحياء/مافيا/طور) بحساباته؛ حلقة الطاولة في الأطوار الثمانية فقط؛ RemoteVoice+Confrontation عند isRemote.
- [ ] RoomCodeCard: LTR للكود، «رمز الغرفة — اضغط للنسخ» ↔ «✓ تم النسخ» (2s)، لا يُرسم بلا كود.
- [ ] اللوبي: سعة 6–50 عبر stepper، roster accordion بنقطة الاتصال/العقوبات، عقوبة+طرد بخطوتين، مقاعد محجوزة، بدء ≥6، «🗑️ إلغاء الغرفة وإغلاقها» بـ confirm «إلغاء الغرفة وإخراج كل من انضمّ؟».
- [ ] HostSettingsModal: كل الحقول (بلا maxPlayers)، «💾 حفظ الإعدادات»→«جارٍ الحفظ…»→«✓ حُفظت»→إغلاق 700ms، `room:update-settings`.
- [ ] ROLE_GENERATION: LeaderRoleConfigurator بخوارزمية التوليد (ceil(n/4) مافيا، مهرج عند ≥8، عمدة سادساً)، أزرار المهرج/السفّاح/التوأمين (≥10)، steppers الإعدادات، `setup:roles-confirmed` بالحقول الشرطية، وإخفاء toggle دردشة المافيا (`hideMafiaChat`).
- [ ] HostRoleBinding: حارس توقيع rolesPool، إسناد تفاؤليّ مع rollback (unbind→bind)، عشوائي مع lockedPhysicalIds، تأكيد/قفل، toggle mafia-reveal fire-and-forget، «أكّد الأدوار أولاً».
- [ ] النقاش: إعداد (البادئ + [15/30/45/60/90])، تحكّم حيّ (⏭ سابق/⏮ التالي معكوسان عمداً، START/PAUSE/RESUME، ضبط ±10/±30، RESET)، مُسكَت، «انتهت جولة النقاش» + [بدون/10/20/30] → «🗳️ بدء التصويت».
- [ ] HostVoting: عدّاد الفريقين، chip النمط الأربعة، عدّاد totalVotesCast/alive، شبكة 3 أعمدة، تصويت بنقرتين + تراجع، «اختر مصوِّتاً أولاً»، mayor ×N، أزرار un-narrow/timeout/resolve بشروطها.
- [ ] HostJustification: عدّ الدفاع من startTime (أحمر+نبض ≤10s)، حارسا إعادة الضبط (دخول + انكماش)، بطاقة نصاب السحب، سحب الوكالة بلا roomId، أزرار TIE مقابل execute.
- [ ] HostElimination: DAY_ELIMINATION (كشف بعين المضيف → `day:trigger-reveal`)، DAY_REVEALED (client-only، «🌙 بدء مرحلة الليل»/nurse prompt، «🏁 إعلان النتيجة للجميع»)، DAY_TIEBREAKER الأربعة.
- [ ] HostNightRunner: خطوة جاهزة (تجاوز مدة [15/20/30]، بدء تفاؤليّ)، قيد التنفيذ (قائمة ثابتة الترتيب بلا قفز)، اعتماد قراءة-فقط (**بلا modifiedChoices**)، عقود السفّاح، «🔄 إعادة تشغيل الخطوة»، تصفير عند مغادرة NIGHT.
- [ ] HostMorningRecap: EVENT_META كاملة، سرّية الشريف، «👁 عرض»/«🔄 إعادة» لكل قابل، تعطيل CTA حتى كشف الكل، تصفير المكشوف عند تغيّر الجولة، تفويض الشرطية لـ LeaderNightView.
- [ ] GAME_OVER: خريطة الفائز الرباعية (emoji/عنوان/سطر لاتيني)، «🔄 لعبة جديدة»/«إنهاء الغرفة».
- [ ] فولباك LeaderDayView: نافذة العمدة (اشتراك getSocket المباشر + swalConfirm الثلاثة)، MAYOR_POSTPONED، قنبلة الأب الروحي (`day:bomb-decision`).
- [ ] فولباك LeaderNightView: الشرطية (execute/skip + النتيجة)، الليل اليدويّ (submit/skip/resolve)، overlay الشريف.
- [ ] applyState: overlay DAY_REVEALED لا يرتدّ مع poll؛ policewomanChoice يُحقَن في MORNING_RECAP فقط.
- [ ] إعادة الاتصال: rejoin-host ثم fallback my-hosted-room؛ يعمل عند AppLifecycleState.resumed.
- [ ] poll 2.5s + refresh على كل حدث بثّ (§7.3)؛ wake lock فعّال.
- [ ] كل الحمولات حرفية (خصوصاً withdraw-vote بلا roomId، auto-approve بلا modifiedChoices عند readOnly).

---

## 13. ملاحظات أداء وأمان

- **poll 2.5s + بثوث متعددة** قد تُنتج تحديثات متكرّرة — أعد الرسم فقط عند تغيّر فعليّ (deep-equality للـ gameState الجزئيّ)؛ لا تعِد فرز قوائم الليل (احسب مرة، حدّث في المكان).
- **overlayان جبهيّان load-bearing**: نقل ساذج يكسر الواجهة (زر «بدء الليل» يختفي / تعليق الشرطية) — انظر §6.2.
- **حارس توقيع rolesPool**: بدونه تُمحى إسنادات الربط الجارية مع كل poll.
- **قراءة-فقط**: المضيف لا يعدّل اختيارات اللاعبين — احذف مفتاح `modifiedChoices` تماماً (لا null) في `night:auto-approve-step`.
- **التخويل server-side**: `room:create-remote` يفشل لغير المدرجين؛ اعرض النص الإرشاديّ ولا تخترع تجاوزاً.
- **أمان الصوت**: المضيف مُوجِّه (preset `mafia_leader`) يستطيع كتم الآخرين؛ منطق `allowedPids` + إنفاذ المضيف؛ كاميرا الليل مُطفأة إجبارياً (anti-cheat: لا كروت أدوار أمام الكاميرا) — كله في 31.
- **معرفة المضيف الحسّاسة**: عدّادات الفريقين/mafiaAlive و`revealRoles/hostView` تكشف الأدوار للمضيف فقط — لا تُبثّ للاعبين ولا تُخزَّن في حالة مشتركة.
- **أهداف اللمس ≥44px** (steppers، أزرار الممرضة/التعادل ≥48px) — التزم بحدّ Material.
- **socket auth إلزاميّ** (05): توكن المصادقة يُربَط في طبقة الـ socket؛ الكونسول يفترض جلسة موثَّقة.
- **wake lock + صوت الخلفية**: سطح إشراف طويل حيّ — بدونهما تموت الجلسة/المكالمة عند التصغير (§10).
