# النوتة وشات المافيا السري

> جزء من خطة تطبيق Flutter لواجهة اللاعب — الفهرس والتسلسل في 00-MASTER-PLAN.md

---

## 1. الهدف والنطاق

هذا الملف يصف مكوّناً واحداً كاملاً: **مفكرة التحري** (`PlayerNotepad`) وما يختبئ داخلها: **غرفة تشاور المافيا السرّية** (Mafia Secret Chat). المصدر الأصلي: `frontend/src/components/PlayerNotepad.tsx` (602 سطراً) + عقد السيرفر في `backend/src/sockets/mafia-chat.socket.ts` (157 سطراً).

**ما يغطّيه هذا الملف:**
1. **المفكرة** (لكل اللاعبين): كتابة ملاحظات تحرّي حرّة إمّا **عامة** أو **مربوطة بلاعب محدّد** (عبر منتقي `@` أو رقائق اختيار سريع)؛ تصنيف كل لاعب بمستوى ريبة (بريء/مشتبه/مافيا/غير محدّد)؛ عرض/تعديل/حذف الملاحظات. كل ذلك **تخزين محلي بحت** (`shared_preferences`) لا يمسّ السيرفر.
2. **شات المافيا السري** (للمافيا الأحياء فقط، وعندما يفعّله الليدر): تبويب ثالث «🗣️ التشاور» يظهر داخل نفس المفكرة كـ **غطاء** (كل اللاعبين يملكون زر مفكرة مطابقاً، ففتحها لا يكشف شيئاً). شات لحظي عبر Socket.IO مع تخزين على Redis aux، وتحقّق سيادي على السيرفر عند كل عملية.

**الغطاء (Cover) قرار تصميمي حرج:** زر المفكرة هو «باب الغرفة». المافيا المؤهّل يُفتح له التبويب مباشرة على «التشاور»؛ غير المؤهّل لا يرى للتبويب أثراً. يجب ألا يوجد أي فرق مرئي بين جهاز مافيا وجهاز مواطن **إلا وجود التبويب الثالث**، ولا يجوز أي وميض تحميل يكشف الفرق (لا انتظار شبكة قبل رسم التبويبات — `chatVisible` معروف محلياً).

**خارج النطاق (يُذكر للربط فقط، ليس للتنفيذ هنا):** حساب علم `mafiaChatEnabled` وحساب `chatVisible` وزر الـ FAB الذي يفتح المفكرة — كلها في `PlayerFlow` (راجع 20-game-state-core.md). مراقبة الليدر للشات وتبديله (`leader:mafia-chat-history` / `leader:mafia-chat-toggle`) في 30-host-console.md — لكن أحداثها موثّقة أدناه لأنها في نفس ملف السوكت.

**نطاق REST:** صفر. هذا المكوّن لا يجري أي طلب HTTP. كل الحفظ إمّا محلي (ملاحظات) أو عبر Socket.IO + Redis (شات).

---

## 2. المرجع في الكود الحالي — مسارات الملفات المصدر

- `c:/Projects/new mafia/unified-mafia/frontend/src/components/PlayerNotepad.tsx` — المكوّن كاملاً (المفكرة + تبويب الشات العميل).
- `c:/Projects/new mafia/unified-mafia/backend/src/sockets/mafia-chat.socket.ts` — عقد أحداث الشات كاملاً: `mafia:chat-send`، `mafia:chat-history`، `leader:mafia-chat-history`، `leader:mafia-chat-toggle`، دالة `verifyAliveMafia`، الثوابت الأمنية.
- `c:/Projects/new mafia/unified-mafia/frontend/src/components/PlayerFlow.tsx`:
  - السطر ~212: `const [isNotepadOpen, setIsNotepadOpen] = useState(false);` و`notepadNotes`.
  - السطر ~145: `const [mafiaChatEnabled, setMafiaChatEnabled] = useState(false);`.
  - السطر ~405–407: ترطيب `mafiaChatEnabled` من رد rejoin/state (`if (typeof res.mafiaChatEnabled === 'boolean')`).
  - السطر ~629–631: مستمع `room:config-updated` يحدّث `mafiaChatEnabled`.
  - السطر ~1300: poll كل 3 ثوانٍ يحدّث `setMafiaChatEnabled(res.mafiaChatEnabled === true)`.
  - السطر ~3740–3748: زر الـ FAB (📝) الذي يفتح المفكرة.
  - السطر ~3752–3768: تركيب `<PlayerNotepad .../>` وحساب `chatVisible` (منقول حرفياً في §7).
- `c:/Projects/new mafia/unified-mafia/frontend/src/lib/socket.ts` — `getSocket()` singleton (يُستورد ديناميكياً في المكوّن الأصلي).
- `c:/Projects/new mafia/unified-mafia/frontend/src/lib/swal.ts` — `swalConfirm` (تأكيد مسح كل الملاحظات).

---

## 3. التبعيات على ملفات الخطة الأخرى

- **01-foundation-theme.md** — بذرة الثيم (الألوان، الخطوط Amiri + mono، `Directionality(rtl)`)، **واستراتيجية Window Size Classes** المطبّقة في §5.
- **02-models-data-layer.md** — تسجيل نماذج `PlayerNote` / `MafiaChatMessage` / `SuspicionLevel` (§8) في طبقة النماذج المشتركة، وشكل كائن اللاعب المُمرّر (`physicalId/name/avatarUrl`).
- **04-socket-layer.md** — خدمة السوكت المشتركة: `getSocket()` singleton، الـ ack callbacks، `emitWithAck`، تسجيل/إلغاء المستمعات. **مصادقة السوكت إلزامية** (هوية `role/roomId/physicalId` تُحقن في `socket.data` على السيرفر عند المصادقة — راجع 05-session-auth.md).
- **05-session-auth.md** — إلزامية مصادقة السوكت التي عليها يعتمد التحقق السيادي `verifyAliveMafia`.
- **20-game-state-core.md** — الأب `PlayerFlow`/`GameSessionController`: يملك علم `mafiaChatEnabled`، يحسب `chatVisible`، يمرّر `roomId`/`myPhysicalId`/`players`/`isOpen`/`onClose`/`onNotesChange`/`chatVisible`، ويرسم زر الـ FAB. أيضاً: مسح ملاحظات المفكرة (`mafia_notes_{roomId}_{physicalId}`) على `LOBBY|ROLE_GENERATION|ROLE_BINDING` وعلى `GAME_OVER`.
- **11-shell-navigation.md** — ترتيب الطبقات (z-index) العام؛ المفكرة تعيش عند مستوى 100 والـ FAB عند 90 (راجع خريطة الطبقات في 20-game-state-core.md §الطبقات العلوية).
- **30-host-console.md** — واجهة الليدر لمراقبة الشات وتبديله (`leader:mafia-chat-history` / `leader:mafia-chat-toggle`)؛ توثيق العقد هنا مرجعي فقط.
- **92-qa-parity.md** — checklist التكافؤ في §12 يُغذّي هذا الملف.

---

## 4. الواجهة والتجربة تفصيلياً

كل الواجهة عربية RTL (`Directionality(TextDirection.rtl)`) مع جزر LTR محدّدة (طوابع الوقت فقط). لا يوجد أي أصل صورة/صوت/lottie — كل الأيقونات إيموجي Unicode.

### 4.0 زر الفتح (FAB) — يعيش في `PlayerFlow` (مرجعي، يُنفَّذ في 20-game-state-core.md)

يُرسم فقط عند `step == 'done' || step == 'rejoined'`:
- الموضع: `fixed bottom-[88px] right-4`، دائرة `w-12 h-12` (48×48dp)، خلفية `#111`، حد `2px #C5A059`، إيموجي 📝 بحجم `text-xl`.
- الظل: `shadow-[0_0_20px_rgba(197,160,89,0.3)]` = `BoxShadow(color: Color(0x4DC5A059), blurRadius: 20)`.
- `z-[90]`، `hover:scale-105` (على الويب؛ في Flutter اجعلها `AnimatedScale` عند الضغط أو تجاهلها).
- `title="مفكرة التحري"` (tooltip).
- الضغط → يفتح المفكرة (`isOpen = true`).

### 4.1 حاوية المودال (طبقة كاملة الشاشة)

- **الحاوية**: `fixed inset-0 z-[100]`، عمود flex، خلفية `#080808` (أسود شبه تام). `paddingBottom: env(safe-area-inset-bottom)` (شريط منزل iPhone). تُركَّب فقط عند `isOpen`.
- **أنيميشن الدخول/الخروج** (framer-motion): initial `{opacity: 0, y: '100%'}` → animate `{opacity: 1, y: 0}` → exit للأسفل `{opacity: 0, y: '100%'}`. Transition: `type: 'spring', damping: 28, stiffness: 350` (إحساس bottom-sheet ينزلق للأعلى يغطّي كامل الشاشة).
  - **مكافئ Flutter**: `showGeneralDialog`/`PageRouteBuilder` بـ `SlideTransition(Offset(0,1)→Offset.zero)` + `FadeTransition`، منحنى قريب من الـ spring: `Curves.easeOutCubic` (تقريب مقبول)؛ المدة ~350ms. أو `showModalBottomSheet(isScrollControlled: true, useSafeArea: true)` بارتفاع كامل. احترم `MediaQuery.viewPadding.bottom`.
- **عمود ثابت**: header (shrink-0) ← شريط تبويبات (shrink-0) ← body (flex-1 overflow-y-auto).

### 4.2 الترويسة (Header)

- صف: `px-4 py-3`، حد سفلي `#1e1e1e`، خلفية `#0d0d0d`، `shrink-0`، `items-center justify-between`.
- العنوان: `📝 مفكرة التحري`، `text-lg font-black`، لون ذهبي `#C5A059`، **خط `Amiri, serif`**، `gap-2` بين الإيموجي والنص.
- زر الإغلاق: دائرة `32×32` (`w-8 h-8`)، خلفية `#1a1a1a`، `text-gray-400`، إيموجي `✕` بحجم `text-lg`، hover → `bg-red-500/20 text-red-400`. الضغط → `onClose()`.

### 4.3 شريط التبويبات

- `flex gap-1 px-4 pt-3 pb-2 shrink-0`. تبويبان دائمان + واحد شرطي.
- كل زر: `flex-1 py-2 rounded-xl text-sm font-bold transition-all`. **نشط**: `bg-[#C5A059] text-black shadow`. **غير نشط**: `bg-[#1a1a1a] text-gray-400 hover:text-white border border-[#2a2a2a]`.
- التبويبات:
  1. **add** — النص الحرفي: `✏️ إضافة ملاحظة`.
  2. **view** — النص الحرفي (مع لاحقة العدّ فقط عند وجود ملاحظات): ``📋 عرض الملاحظات${hasAnyNotes ? ` (${playersWithNotes.length + (generalNote?.text ? 1 : 0)})` : ''}``. أي: «📋 عرض الملاحظات» ثم « (N)» حيث N = عدد اللاعبين ذوي الملاحظات + (1 إن وُجد نص ملاحظة عامة).
  3. **chat** — يُرسم **فقط عند `chatVisible == true`**. `relative flex-1 ...`. النص الحرفي: `🗣️ التشاور`. يحمل **شارة غير مقروء**: `span` عند `top-1 left-2`، دائرة `w-2 h-2` (8×8dp) `rounded-full bg-red-500 animate-pulse`، تظهر عند `chatUnread && activeTab !== 'chat'`.
- **الأنيميشن للشارة**: نبض متكرّر (`animate-pulse` = opacity loop). في Flutter: `FadeTransition`/`ScaleTransition` مع `AnimationController(repeat: reverse)` مدة ~1s.

### 4.4 الجسم (Body)

`flex-1 overflow-y-auto px-4 pb-6`.

#### 4.4.1 تبويب «add» (إضافة ملاحظة) — الافتراضي لغير المافيا

عمود `gap-3`:

**أ) بطاقة الربط**: `bg-[#111] border border-[#222] rounded-2xl p-3`. تسمية: `الملاحظة مرتبطة بـ` بنمط `text-[10px] text-gray-600 font-mono uppercase tracking-widest mb-2`.
- **الحالة A — لاعب محدّد**: صف مميّز `bg-[#C5A059]/10 border border-[#C5A059]/30 rounded-xl px-3 py-2.5 justify-between`، يحوي:
  - أفاتار دائري `36×36` (`w-9 h-9 rounded-full bg-[#1a1a1a] border border-[#C5A059]/40 overflow-hidden`): صورة `avatarUrl` بـ `object-cover` إن وُجدت، وإلا نص `#{physicalId}` ذهبي `text-sm font-black text-[#C5A059]`.
  - الاسم: `text-white font-bold text-sm`، fallback `لاعب #${physicalId}`.
  - سطر المقعد: `مقعد #${physicalId}` ذهبي `text-[#C5A059] text-[10px] font-mono`.
  - زر إلغاء الربط `✕`: `text-gray-500 hover:text-red-400 text-sm px-2`، `title="إلغاء الربط"` → `setTargetPlayer(null)`.
- **الحالة B — بلا لاعب**: صندوق منقّط `bg-[#0d0d0d] border border-dashed border-[#333] rounded-xl px-3 py-3 text-center`. النص الحرفي: `اكتب @ لاختيار لاعب — أو اترك فارغاً للملاحظات العامة` (الرمز `@` بنمط `text-[#C5A059] font-bold`). حاوية النص: `text-gray-600 text-xs font-mono`.

**ب) حقل الكتابة (Textarea)**: داخل `div.relative`. 5 أسطر (`rows=5`)، `dir="auto"`، `w-full bg-[#0d0d0d] text-gray-200 text-sm p-4 rounded-2xl border border-[#2a2a2a]`، focus: `border-[#C5A059]/60` + `ring-1 ring-[#C5A059]/30`، `resize-none placeholder-gray-700`. النص النائب ديناميكي:
- مع لاعب محدّد: `ملاحظتك عن ${name}...` (name أو `لاعب #${physicalId}`).
- بلا لاعب: `اكتب ملاحظتك هنا... (اكتب @ لتحديد لاعب)`.

**ج) منتقي `@` (Dropdown)**: `AnimatePresence`، motion `initial {opacity:0, y:-8}` → `animate {opacity:1, y:0}` → `exit {opacity:0, y:-8}`. الموضع: `absolute bottom-full left-0 right-0 mb-1` (**يفتح فوق** الـ textarea)، `bg-[#111] border border-[#C5A059]/40 rounded-2xl overflow-hidden shadow-xl z-10 max-h-52 overflow-y-auto`.
- عنوان صغير: `اختر لاعباً` بنمط `text-[9px] text-[#C5A059]/60 font-mono uppercase tracking-widest px-3 pt-2 pb-1`.
- **حالة فارغة**: `لا يوجد لاعبون مطابقون` بنمط `text-gray-600 text-xs text-center py-4`.
- الصفوف: زر `flex items-center gap-3 w-full px-3 py-2.5 hover:bg-[#C5A059]/10 text-right`. أفاتار `32×32` (`w-8 h-8 rounded-full bg-[#1a1a1a] border border-[#333]`؛ صورة أو نص `{physicalId}` ذهبي `text-xs font-black`). الاسم `text-white text-sm font-bold` (fallback `لاعب`)، والمقعد `مقعد #${physicalId}` ذهبي `text-[10px] font-mono`.
- **حرج**: الصف يستخدم `onMouseDown` مع `e.preventDefault()` كي لا يفقد الـ textarea التركيز. مكافئ Flutter: اجعل عناصر القائمة لا تسرق التركيز (`Focus(canRequestFocus: false)` أو `GestureDetector`)، ثم أعد التركيز بعد الاختيار.

**د) زر الحفظ**: `w-full py-4 bg-gradient-to-r from-[#C5A059] to-[#b38b47] text-black font-black rounded-2xl shadow-lg`، **خط `Amiri, serif`**، `active:scale-[0.98]`. معطّل (`disabled:opacity-30 disabled:grayscale`) عند `noteText.trim()` فارغ. النص الحرفي ديناميكي:
- مع لاعب محدّد: `💾 حفظ عن ${name}` (name أو `لاعب #${physicalId}`).
- بلا لاعب: `💾 حفظ ملاحظة عامة`.

**هـ) رقائق الاختيار السريع**: تُعرض فقط عند `!targetPlayer` ووجود لاعبين آخرين (`players.filter(p => p.physicalId !== myPhysicalId).length > 0`). عنوان: `أو اختر لاعباً مباشرة` بنمط `text-[10px] text-gray-600 font-mono uppercase tracking-widest mb-2 px-1`. ثم `flex flex-wrap gap-2` من أزرار حبّة: `flex items-center gap-2 px-3 py-2 bg-[#1a1a1a] border border-[#333] rounded-xl hover:border-[#C5A059] hover:bg-[#C5A059]/10 transition-all shadow-sm`. كل زر يعرض أفاتار اختياري `24×24` (`w-6 h-6 rounded-full`، صورة فقط عند وجود avatarUrl)، ثم `#{physicalId}` ذهبي `font-mono text-sm font-black`، ثم الاسم `text-gray-200 text-sm font-bold` (fallback `لاعب`). الضغط → `setTargetPlayer(player)`.

#### 4.4.2 تبويب «view» (عرض الملاحظات)

`space-y-3`:
- **زر مسح الكل** (فقط عند `hasAnyNotes`): محاذاة يمين (`flex justify-end px-1`). النص الحرفي: `🗑️ مسح كل الملاحظات`، حبّة حمراء `text-red-500/80 hover:text-red-400 text-xs font-bold bg-red-500/10 px-3 py-1.5 rounded-lg border border-red-500/20`. الضغط → `clearAllNotes()` (تأكيد swal — §4.5).
- **بطاقة الملاحظات العامة** (فقط عند `generalNote?.text`، أي `notes[0].text`): `bg-[#111] border border-[#2a2a2a] rounded-2xl p-4`. ترويسة `justify-between items-center mb-2`: `📌 ملاحظات عامة` ذهبي `text-sm font-bold`، وزر `مسح` أحمر `text-red-500/60 hover:text-red-400 text-xs` → `clearNoteText(0)`. الجسم: `text-gray-300 text-sm whitespace-pre-wrap leading-relaxed`.
- **بطاقات لكل لاعب** (`playersWithNotes` — كل لاعب `notes[pid]` وله نص أو ريبة ≠ none)، كل بطاقة `bg-[#111] border border-[#2a2a2a] rounded-2xl p-4`:
  - ترويسة `flex items-center gap-3 mb-3`: أفاتار `40×40` (`w-10 h-10`؛ صورة أو `#{physicalId}` ذهبي `text-sm font-black`)، الاسم `text-white font-bold text-sm` (fallback `لاعب #${physicalId}`)، المقعد `مقعد #${physicalId}` ذهبي `text-[10px] font-mono`، وزر `🗑️ حذف` (`text-red-500/50 hover:text-red-400 text-xs bg-red-500/10 px-2 py-1 rounded-lg border border-red-500/20`، `title="حذف الملاحظة بالكامل"`) → `deletePlayerNote(pid)` (بلا تأكيد).
  - **أزرار الريبة** (`flex gap-1.5 mb-3`): ثلاثة أزرار toggle `flex-1 py-1.5 text-[11px] rounded-lg font-bold transition-all border`. القيم من `SUSPICION_CONFIG`:
    - `safe` → النص `🟢 بريء`، نشط `bg-emerald-500/20 text-emerald-400 border-emerald-500/40`.
    - `suspect` → النص `🟡 مشتبه`، نشط `bg-yellow-500/20 text-yellow-400 border-yellow-500/40`.
    - `mafia` → النص `🔴 مافيا`، نشط `bg-red-500/20 text-red-400 border-red-500/40`.
    - غير نشط (لكل الثلاثة): `bg-[#0d0d0d] text-gray-600 border-[#1e1e1e] hover:border-[#333]`.
    - الضغط → `setSuspicion(pid, level)`؛ الضغط على المستوى النشط نفسه يعيده إلى `none`.
    - (ملاحظة: القيمة `none` لها تكوين `⚪ غير محدد` / `bg-[#222] text-gray-500 border-[#444]` لكنها **لا تُعرض كزر** في هذه الشاشة — تُستخدم للحساب فقط.)
  - **نص الملاحظة**: إن وُجد → `bg-[#0a0a0a] border border-[#1e1e1e] rounded-xl p-3`، `text-gray-300 text-sm whitespace-pre-wrap leading-relaxed`. إن كان تصنيفاً فقط بلا نص → نص موسّط `لا يوجد نص — فقط تصنيف` بنمط `text-gray-700 text-xs text-center py-1`.
  - **رابط إضافة**: `+ إضافة ملاحظة` (`mt-2 w-full text-[11px] text-[#C5A059]/60 hover:text-[#C5A059] font-mono`) → يضع هذا اللاعب هدفاً وينتقل لتبويب «add».
- **حالة فارغة** (لا ملاحظات إطلاقاً): موسّطة `py-16 opacity-40`. إيموجي كبير `📭` (`text-5xl mb-3`)، ثم `لا توجد ملاحظات مسجّلة بعد` (`text-gray-400 text-sm`)، ثم تلميح `انتقل لتبويب "إضافة ملاحظة" للبدء` (`text-gray-600 text-xs mt-1`).

#### 4.4.3 تبويب «chat» (🗣️ التشاور السرّي) — مافيا فقط

يُرسم فقط عند `activeTab === 'chat' && chatVisible` (حراسة مزدوجة). عمود `flex flex-col h-full`:
- **قائمة الرسائل**: `flex-1 overflow-y-auto flex flex-col gap-2 py-2`.
  - **حالة فارغة**: موسّطة `py-16 opacity-40`، `🤫` (`text-5xl mb-3`)، ثم `لا رسائل بعد — ابدأ التشاور` (`text-gray-400 text-sm`).
  - **فقاعة الرسالة**: `max-w-[85%]`. **رسائلي `self-start`، رسائل الآخرين `self-end`** (معكوس عن شات LTR المعتاد لأن اللاي‑آوت RTL — راجع تحذير §5/§10). فقاعتي: `bg-[#C5A059]/15 border-[#C5A059]/30`؛ الآخرون: `bg-[#141414] border-[#262626]`. الكل `rounded-2xl px-3 py-2 border`.
    - سطر المُرسِل: `{name} (#{physicalId})` بنمط `text-[10px] font-bold mb-0.5` — **ذهبي `#C5A059` لرسائلي، `text-red-400` للزملاء**؛ الجزء `(#{physicalId})` بنمط `font-mono opacity-70`.
    - نص الرسالة: `text-gray-200 text-sm whitespace-pre-wrap leading-relaxed break-words`.
    - الطابع الزمني: `text-[9px] text-gray-600 mt-0.5 font-mono`، **`dir="ltr"`**، بصيغة `new Date(at).toLocaleTimeString('ar-JO', {hour:'2-digit', minute:'2-digit'})`.
  - عنصر خفي `<div ref={chatEndRef}/>` كنقطة تمرير؛ `scrollIntoView({behavior:'smooth'})` عند كل تغيّر في الرسائل/التبويب أثناء وجودنا في تبويب الشات.
- **صف الإدخال** (`shrink-0 flex gap-2 pt-2 pb-1`): حقل نص `dir="rtl"`، النص النائب `اكتب رسالة للفريق…`، `flex-1 bg-[#111] border border-[#2a2a2a] rounded-xl px-3 py-2.5 text-sm text-white`، focus `border-[#C5A059]/50`. **سقف صلب 300 حرف على العميل** (`value.slice(0, 300)` في onChange). زر `إرسال`: `px-4 rounded-xl bg-[#C5A059] text-black font-bold text-sm`، معطّل (`disabled:opacity-40`) عند `chatSending || !chatInput.trim()`. مفتاح Enter يرسل (`onKeyDown Enter → sendChat`).

### 4.5 حوار التأكيد

«مسح كل الملاحظات» يستخدم `swalConfirm('هل أنت متأكد من مسح جميع الملاحظات ومستويات الريبة لجميع اللاعبين؟')` (غلاف SweetAlert2). **لا تأكيد** لحذف/مسح ملاحظة لاعب مفرد أو للملاحظة العامة.
- مكافئ Flutter: `showDialog` بـ `AlertDialog` بثيم داكن/ذهبي (أو غلاف swal الموحّد للتطبيق). النص الحرفي أعلاه. الأزرار: تأكيد/إلغاء؛ يرجع `true`/`false` كـ `Future<bool>`.

### 4.6 جدول النصوص العربية الحرفية (للنسخ المباشر)

| الموضع | النص الحرفي |
|---|---|
| عنوان الترويسة | `📝 مفكرة التحري` |
| زر تبويب add | `✏️ إضافة ملاحظة` |
| زر تبويب view | `📋 عرض الملاحظات` (+ ` (N)`) |
| زر تبويب chat | `🗣️ التشاور` |
| تسمية بطاقة الربط | `الملاحظة مرتبطة بـ` |
| المقعد | `مقعد #{physicalId}` |
| fallback اسم لاعب (بطاقة/عرض) | `لاعب #{physicalId}` |
| fallback اسم لاعب (منتقي/حبّة) | `لاعب` |
| تلميح بلا هدف | `اكتب @ لاختيار لاعب — أو اترك فارغاً للملاحظات العامة` |
| نائب textarea (مع هدف) | `ملاحظتك عن {name}...` |
| نائب textarea (بلا هدف) | `اكتب ملاحظتك هنا... (اكتب @ لتحديد لاعب)` |
| عنوان المنتقي | `اختر لاعباً` |
| منتقي فارغ | `لا يوجد لاعبون مطابقون` |
| زر حفظ (مع هدف) | `💾 حفظ عن {name}` |
| زر حفظ (بلا هدف) | `💾 حفظ ملاحظة عامة` |
| عنوان الحبّات | `أو اختر لاعباً مباشرة` |
| زر إلغاء الربط (title) | `إلغاء الربط` |
| زر مسح الكل | `🗑️ مسح كل الملاحظات` |
| عنوان الملاحظات العامة | `📌 ملاحظات عامة` |
| زر مسح (عام) | `مسح` |
| زر حذف لاعب | `🗑️ حذف` |
| زر حذف لاعب (title) | `حذف الملاحظة بالكامل` |
| ريبة safe | `🟢 بريء` |
| ريبة suspect | `🟡 مشتبه` |
| ريبة mafia | `🔴 مافيا` |
| ريبة none (غير معروضة) | `⚪ غير محدد` |
| تصنيف بلا نص | `لا يوجد نص — فقط تصنيف` |
| زر إضافة ملاحظة إضافية | `+ إضافة ملاحظة` |
| عرض فارغ (سطر 1) | `لا توجد ملاحظات مسجّلة بعد` |
| عرض فارغ (سطر 2) | `انتقل لتبويب "إضافة ملاحظة" للبدء` |
| شات فارغ | `لا رسائل بعد — ابدأ التشاور` |
| نائب إدخال الشات | `اكتب رسالة للفريق…` |
| زر إرسال الشات | `إرسال` |
| تأكيد مسح الكل | `هل أنت متأكد من مسح جميع الملاحظات ومستويات الريبة لجميع اللاعبين؟` |
| tooltip الـ FAB | `مفكرة التحري` |

---

## 5. التكيّف مع الشاشات 6→11 إنش

الاستراتيجية الكاملة (Window Size Classes) موثّقة في **01-foundation-theme.md**. تخصيص هذه الشاشة:

**ملاحظة مهمة:** هذه الشاشة **لا تحتوي عناصر لعب حسّاسة (بطاقات أدوار/مؤقتات دائرية)**، فقاعدة «مضاعفة أحجام العناصر الحسّاسة» في expanded لا تنطبق هنا؛ نطبّق بدلها سقف عرض + تكبير معتدل للمس والخط.

### compact (< 600dp، هواتف 6–7 إنش) — الأساس
مطابق للـ PWA حرفياً: المفكرة **كاملة الشاشة** (`inset-0`)، عمود واحد، الجسم يملأ العرض بالكامل (`px-4`). زر الحفظ بعرض كامل، رقائق الاختيار `flex-wrap`. فقاعات الشات `max-w-[85%]`. لا تغيير.

### medium (600–840dp، تابلت 8 إنش)
- المفكرة تبقى كاملة الشاشة لكن **محتوى الجسم يُسقَّف بعرض 640dp ويُتوسّط** (لفّ الجسم بـ `Center(child: ConstrainedBox(maxWidth: 640))`). الترويسة وشريط التبويبات يبقيان بعرض كامل (شريط علوي)، ومحتواهما داخلهما متوسّط أو ممتد بلا مشكلة.
- منتقي `@`: يبقى بعرض الـ textarea (المسقّف 640) لا بعرض الشاشة.
- فقاعات الشات: احتفظ بـ `max-w-[85%]` نسبةً إلى العمود المسقّف (640) لا الشاشة، فلا تمتد الفقاعات عرضاً بشكل قبيح.
- رقائق الاختيار السريع تصطف طبيعياً بعدد أكبر لكل سطر ضمن الـ 640.

### expanded (> 840dp، تابلت 10–11 إنش)
- سقف عرض المحتوى **840–960dp** ويُتوسّط (استخدم 900dp). لا تمدّد الجسم على كامل عرض التابلت.
- تكبير معتدل للمس والخط: كبّر أهداف اللمس (أزرار التبويب، زر الحفظ، حبّات الاختيار) بمعامل ~1.15، والخطوط الأساسية بمقدار درجة واحدة (لا مضاعفة — لا عناصر حسّاسة هنا).
- **two-pane اختياري لتبويب view فقط** على expanded: قائمة اللاعبين ذوي الملاحظات في عمود يمين وتفاصيل/تحرير في عمود يسار — **لكن هذا اختياري وليس في المصدر؛ الافتراضي عمود واحد مسقّف**. تبويبا add/chat يبقيان عموداً واحداً دائماً (الشات محادثة خطية، والإضافة نموذج).
- أفاتارات العرض يمكن تكبيرها من 40→48dp ضمن المعامل، والمنتقي `max-h` يمكن رفعه من 52 (208dp) إلى ~280dp لاستغلال الارتفاع.

**ثابت عبر الفئات:** الغطاء يبقى مطابقاً — لا فرق مرئي بين مافيا ومواطن إلا التبويب الثالث؛ ولا يتغيّر ترتيب الطبقات ولا الألوان.

---

## 6. المنطق والتدفقات

### 6.1 آلة حالة التبويب

`activeTab ∈ {add, view, chat}`.
- **عند الفتح** (`isOpen` يصبح true): `setActiveTab(chatVisible ? 'chat' : 'add')` — المافيا المؤهّل يهبط مباشرة على الشات، والبقية على add. (تأثير مفتاحه `[isOpen]` فقط.)
- **عند إلغاء التأهيل أثناء العرض** (موت/تعطيل الليدر/تغيّر المرحلة → `chatVisible` يصبح false): إن كان `activeTab === 'chat'` → `setActiveTab('add')`. وأيضاً زر التبويب ولوحة الشات يُخفيان (كلاهما محروس بـ `chatVisible`). (تأثير مفتاحه `[chatVisible, activeTab]`.)
- **تفعيل تبويب الشات** يمسح `chatUnread` (`activeTab === 'chat' → setChatUnread(false)`).
- **الانتقال من view إلى add** عبر `+ إضافة ملاحظة` يضع الهدف ويحوّل التبويب.

### 6.2 منطق الملاحظات (محلي بالكامل)

- **مفتاح التخزين**: `mafia_notes_${roomId}_${myPhysicalId}` → JSON `Record<number, {text: string, suspicion: 'safe'|'suspect'|'mafia'|'none'}>`، حيث المفتاح `0` = الملاحظات العامة.
- **التحميل**: عند كل فتح (`isOpen` true) اقرأ المفتاح، `JSON.parse`، `setNotes(parsed)` واستدعِ `onNotesChange(parsed)` (الأب يستخدمها لشارات الريبة في شاشة التصويت). أخطاء JSON تُبتلع صمتاً.
- **كشف `@`** (عند كل تغيير نص): خذ النص قبل الـ cursor (`selectionStart`)، جد آخر `@` (`lastIndexOf`). إن وُجد وكان ما بعده (حتى الـ cursor) **بلا مسافة ولا سطر جديد** → افتح المنتقي بـ `pickerQuery = afterAt` و`pickerAnchor = atIdx`. وإلا أغلق المنتقي وامسح الاستعلام.
- **قائمة المنتقي**: `players` مستثنى منها الذات (`physicalId === myPhysicalId`)؛ مطابقة حالة-غير-حسّاسة على `String(physicalId).includes(q)` أو `name.toLowerCase().includes(q)`؛ استعلام فارغ → كل الآخرين.
- **اختيار من المنتقي**: احذف `@` + الكلمة المكتوبة من النص (`before + afterAt`, ثم `trimStart()`)، `setTargetPlayer(player)`، أغلق المنتقي، وأعد التركيز على الـ textarea بعد 50ms.
- **الحفظ** (`saveNote`): no-op إن `!text && !targetPlayer`. `pid = targetPlayer?.physicalId ?? 0`. **يُلحق** بأي نص موجود بفاصل `\n` (لا يستبدل أبداً): `newText = current.text ? current.text + '\n' + text : text` (وإن كان النص فارغاً يبقى `current.text`). يحفظ الخريطة كاملة في التخزين، ينادي `onNotesChange`، ثم يصفّر `noteText` و`targetPlayer`. زر الحفظ معطّل حصراً على النص الفارغ — فلا يمكن إنشاء إدخال «تصنيف فقط» من هذا التبويب (فقط من أزرار الريبة في view).
- **تبديل الريبة** (`setSuspicion`): يضع المستوى؛ الضغط على المستوى النشط نفسه يعيده `none`. يحفظ + يُخطر الأب.
- **مسح النص فقط** (`clearNoteText(pid)`): يُفرِّغ النص فقط؛ إن أصبح بلا نص وبلا ريبة (`suspicion === 'none'`) يُحذف المفتاح كليّاً. يستخدمه زر «مسح» للملاحظة العامة.
- **حذف ملاحظة لاعب** (`deletePlayerNote`): يحذف المفتاح كليّاً (نص + ريبة). بلا تأكيد.
- **مسح الكل** (`clearAllNotes`): تأكيد swal → `setNotes({})`، `removeItem(storageKey)`، `onNotesChange({})`.
- **بيانات مشتقّة للعرض**: `playersWithNotes = players.filter(p => notes[p.physicalId] && (text || suspicion !== 'none'))` — أي أن ملاحظة عن لاعب غادر الطاقم تختفي من العرض (البيانات تبقى في التخزين). `generalNote = notes[0]`. `hasAnyNotes = playersWithNotes.length > 0 || generalNote?.text`.
- **دورة حياة الملاحظات عبر الجولات** (يُدار في الأب — 20-game-state-core.md): تُمسح على `LOBBY|ROLE_GENERATION|ROLE_BINDING` وعلى `GAME_OVER`. النطاق per-room + per-seat يعني أن remap المقعد يُيتّم الملاحظات القديمة (سلوك مقبول).

### 6.3 منطق الشات (العميل)

- **حساب `chatVisible`** (في الأب، **لا يُبثّ أبداً**، محلي بحت — منقول حرفياً في §7). أعلامه تصل عبر: رد rejoin/state (`res.mafiaChatEnabled`)، poll كل 3 ثوانٍ (`res.mafiaChatEnabled === true`)، وحدث `room:config-updated` الحيّ.
- **دورة الاشتراك**: تأثير مفتاحه `[isOpen, chatVisible, roomId]`؛ فقط عند مفتوح **و** مؤهّل:
  1. احصل على السوكت المشترك (`getSocket()`).
  2. سجّل مستمع `mafia:chat-message` (المعالج: تجاهل الرسائل بلا `text`؛ ألحق مع ring-buffer عميل `prev.slice(-199)` — يبقي آخر 200؛ إن كنّا خارج تبويب الشات → `chatUnread = true`).
  3. اطلب التاريخ: `emit('mafia:chat-history', {roomId}, ack)` → عند `ack.success && Array.isArray(ack.messages)` → `setChatMessages(ack.messages)`.
  4. **التنظيف** (`socket.off`) عند الإغلاق/إلغاء التأهيل.
- **الإرسال** (`sendChat`): trim؛ توقّف إن فارغ أو `chatSending`؛ `chatSending = true`؛ `emit('mafia:chat-send', {roomId, text}, ack)` — عند `ack.success` صفّر الإدخال؛ وفي كل الأحوال صفّر `chatSending` داخل الـ ack. **شبكة أمان**: `setTimeout(3000)` غير مشروط يصفّر `chatSending` تحسّباً لعدم وصول الـ ack (انقطاع). Enter يرسل. **لا إلحاق تفاؤلي** — الرسالة تظهر فقط عبر بثّ السيرفر (echo).
- **رفض صامت**: السيرفر يرد `{success: false}` مجرّداً — العميل **لا يعرض أي خطأ**؛ الإدخال ببساطة لا يُصفّر. هذا مقصود (ثابت الرفض الصامت).
- **التمرير التلقائي**: عند كل رسالة جديدة/تغيّر تبويب وأنت في تبويب الشات → مرّر للأسفل.

### 6.4 إعادة الاتصال واستعادة الحالة

- الشات **لا يُخزَّن محلياً أبداً** (ثابت أمني). عند إعادة فتح المفكرة يُعاد جلب التاريخ كاملاً من السيرفر (`mafia:chat-history`).
- عند إعادة اتصال السوكت (يُدار في طبقة السوكت 04 + الأب 20): بعد أن يعيد الأب `room:rejoin-player` وتعود العضوية في الغرفة، إن كانت المفكرة مفتوحة على تبويب الشات فسيعيد تأثير الاشتراك التسجيل (المستمع مربوط بحياة السوكت المشترك). في Flutter: أعد تسجيل مستمع `mafia:chat-message` عند حدث reconnect للسوكت المشترك إن كانت المفكرة مفتوحة ومؤهّلة، وأعد جلب التاريخ.
- **إلغاء التأهيل الفوري**: موت اللاعب، أو تعطيل الليدر للغرفة، أو دخول مرحلة محظورة → `chatVisible` يصبح false → التبويب واللوحة يُخفيان و`activeTab` يرتد إلى `add`. لا يحتاج تدخل السيرفر لهذا العرض، لكن السيرفر يرفض أي عملية لاحقة سياديّاً على أي حال.

### 6.5 المؤقتات والمهل

- **3000ms** — شبكة أمان تصفّر `chatSending` إن لم يصل الـ ack.
- **50ms** — تأخير إعادة التركيز على الـ textarea بعد اختيار من المنتقي.
- **السيرفر**: throttle **700ms** بين رسالتين لنفس السوكت (مفروض على السيرفر — العميل لا يفرضه لكن يجب ألا ينهار من رفض بسببه؛ الرفض صامت).

### 6.6 الحالات الحدّية

- `players` قد تكون `roster` أو `votingPlayersInfo` (fallback) — عامِل كائنات اللاعب بدفاعية (`name`/`avatarUrl` اختياريان).
- ملاحظة عن لاعب غادر الطاقم تختفي من العرض لكن تبقى في التخزين (لا تحذفها).
- منتقي `@` بلا نتائج → «لا يوجد لاعبون مطابقون» (لا تخفِ اللوحة).
- الشات: رسالة واردة بلا `text` تُتجاهَل.
- إرسال أثناء انقطاع: الـ ack لا يصل → `chatSending` يُصفَّر بعد 3s، الإدخال يبقى كما هو (لم يُصفّ)، لا خطأ مرئي.

---

## 7. عقود التكامل

### 7.1 REST
**لا يوجد.** هذا المكوّن لا يجري أي طلب HTTP.

### 7.2 Socket — أحداث العميل (هذا المكوّن)

| الاتجاه | الحدث | الحمولة | الـ ack/الرد | متى |
|---|---|---|---|---|
| emit | `mafia:chat-history` | `{ roomId: string }` | `{ success: boolean, messages?: MafiaChatMessage[] }` | عند فتح المفكرة و`chatVisible` (تركيب التأثير)؛ يرطّب كامل التاريخ |
| emit | `mafia:chat-send` | `{ roomId: string, text: string }` (text ≤300 على العميل) | `{ success: boolean }` (false مجرّد عند أي رفض) | زر إرسال / مفتاح Enter |
| on | `mafia:chat-message` | `MafiaChatMessage = { physicalId: number, name: string, text: string, at: number }` (at = ms epoch) | — | دفع رسالة حيّة؛ المستمع فعّال فقط أثناء (المفكرة مفتوحة + مؤهّل) |

### 7.3 Socket — عقد السيرفر (`mafia-chat.socket.ts` — للفهم، ليس للتنفيذ في العميل)

| الحدث | الحارس | السلوك |
|---|---|---|
| `mafia:chat-send {roomId, text}` → ack `{success}` | throttle 700ms → `verifyAliveMafia` → نص غير فارغ (trim، ≤300) | يُلحق `{physicalId, name, text, at: Date.now()}` لمخزن aux (سقف 200)؛ يبثّ انتقائياً `mafia:chat-message` لكل سوكت ليدر في الغرفة + كل سوكت مافيا حيّ؛ `ack {success:true}` |
| `mafia:chat-history {roomId}` → ack `{success, messages}` | `verifyAliveMafia` | يرجع `store.messages` (أو `[]`) |
| `leader:mafia-chat-history {roomId}` → ack `{success, messages, enabled: undefined}` | `socket.data.role === 'leader'` وإلا `{success:false, error:'Only leader'}` | قراءة كاملة للتاريخ (واجهة الليدر — 30-host-console.md). `enabled` حرفياً `undefined` |
| `leader:mafia-chat-toggle {roomId, enabled}` → ack `{success, enabled}` أو `{success:false, error}` | ليدر فقط؛ الغرفة موجودة | يضبط `state.config.mafiaChatEnabled = (enabled===true)`، يحفظ، ثم `io.to(roomId).emit('room:config-updated', { mafiaChatEnabled })` — **هذا يُبثّ للجميع** (العلم لا يكشف هوية) |

**حدث مُستهلَك في الأب (يغذّي `chatVisible`):** `room:config-updated → { mafiaChatEnabled: boolean }`؛ وأيضاً حقل `mafiaChatEnabled` يركب على ردود rejoin/poll.

**التحقق السيادي `verifyAliveMafia` (على السيرفر، عند كل عملية):** الهوية من `socket.data` فقط (`role==='player'`, `roomId`, `physicalId` مضبوطة عند مصادقة السوكت)؛ `roomId` المطلوب = غرفة السوكت؛ حالة اللعبة الحيّة موجودة؛ `config.mafiaChatEnabled === true`؛ `rolesConfirmed === true`؛ المرحلة ∉ {LOBBY, ROLE_GENERATION, GAME_OVER}؛ اللاعب موجود وله دور و`isAlive !== false` و`isMafiaRole(role)`. (يغطّي تلقائياً حالة الأخ الأصغر المتحوّل لمافيا، ويقطع الميت فوراً.)

**الثوابت:** `MAX_MESSAGES = 200`, `MAX_TEXT_LEN = 300`, `SEND_THROTTLE_MS = 700`, مفتاح Redis `mafia-chat:{roomId}` (فضاء aux), `BLOCKED_PHASES = {LOBBY, ROLE_GENERATION, GAME_OVER}`.

### 7.4 حساب `chatVisible` (منقول حرفياً من `PlayerFlow.tsx` ~3759 — يُنفَّذ في الأب 20-game-state-core.md)

```
chatVisible =
  mafiaChatEnabled &&
  !isPlayerDead &&
  (['GODFATHER', 'SILENCER', 'CHAMELEON', 'WITCH', 'OLDER_BROTHER', 'MAFIA_REGULAR'].includes(assignedRole || '') || mafiaTeam.length > 0) &&
  // ROLE_BINDING مسموحة: امتلاك assignedRole يعني أن الأدوار اعتُمدت ووُزّعت فعلاً
  !['LOBBY', 'ROLE_GENERATION', 'GAME_OVER'].includes(gamePhase || '')
```

الـ props المُمرّرة للمكوّن: `roomId`, `myPhysicalId = parseInt(physicalId) || 0`, `players = roster.length > 0 ? roster : votingPlayersInfo`, `isOpen`, `onClose`, `onNotesChange`, `chatVisible`.

---

## 8. نماذج Dart المطلوبة

```dart
enum SuspicionLevel { safe, suspect, mafia, none }

// تحويل JSON: القيم النصية حرفياً 'safe' | 'suspect' | 'mafia' | 'none'
extension SuspicionLevelJson on SuspicionLevel {
  String get value => switch (this) {
    SuspicionLevel.safe => 'safe',
    SuspicionLevel.suspect => 'suspect',
    SuspicionLevel.mafia => 'mafia',
    SuspicionLevel.none => 'none',
  };
  static SuspicionLevel fromValue(String? v) => switch (v) {
    'safe' => SuspicionLevel.safe,
    'suspect' => SuspicionLevel.suspect,
    'mafia' => SuspicionLevel.mafia,
    _ => SuspicionLevel.none,
  };
}

class PlayerNote {
  final String text;              // قد يكون فارغاً (تصنيف فقط)
  final SuspicionLevel suspicion;  // افتراضي none
  const PlayerNote({this.text = '', this.suspicion = SuspicionLevel.none});

  Map<String, dynamic> toJson() => {'text': text, 'suspicion': suspicion.value};
  factory PlayerNote.fromJson(Map<String, dynamic> j) => PlayerNote(
    text: (j['text'] ?? '') as String,
    suspicion: SuspicionLevelJson.fromValue(j['suspicion'] as String?),
  );
  PlayerNote copyWith({String? text, SuspicionLevel? suspicion}) =>
    PlayerNote(text: text ?? this.text, suspicion: suspicion ?? this.suspicion);
}

// خريطة الملاحظات: المفتاح int (physicalId؛ 0 = عام). يُخزَّن/يُقرأ كـ
// Record<number, PlayerNote> بمفاتيح نصية في JSON (JSON keys strings) —
// عند القراءة حوّل المفتاح إلى int (int.parse) وعند الكتابة إلى string
// للحفاظ على تكافؤ بايتي مع localStorage الويب.
typedef NotesMap = Map<int, PlayerNote>;

class MafiaChatMessage {
  final int physicalId;
  final String name;
  final String text;
  final int at;   // ms since epoch
  const MafiaChatMessage({
    required this.physicalId, required this.name,
    required this.text, required this.at,
  });
  factory MafiaChatMessage.fromJson(Map<String, dynamic> j) => MafiaChatMessage(
    physicalId: (j['physicalId'] as num).toInt(),
    name: (j['name'] ?? '') as String,
    text: (j['text'] ?? '') as String,
    at: (j['at'] as num).toInt(),
  );
  DateTime get time => DateTime.fromMillisecondsSinceEpoch(at);
}

// عرض دفاعي لكائن اللاعب المُمرّر (roster أو votingPlayersInfo)
class NotepadPlayer {
  final int physicalId;
  final String? name;       // اختياري
  final String? avatarUrl;  // اختياري
  const NotepadPlayer({required this.physicalId, this.name, this.avatarUrl});
  factory NotepadPlayer.fromDynamic(Map<String, dynamic> j) => NotepadPlayer(
    physicalId: (j['physicalId'] as num).toInt(),
    name: j['name'] as String?,
    avatarUrl: j['avatarUrl'] as String?,
  );
}
```

حالة الودجت (StatefulWidget/Riverpod): `notes: NotesMap`, `activeTab: NotepadTab {add, view, chat}`, `chatMessages: List<MafiaChatMessage>` (≤200), `chatInput: String`, `chatSending: bool`, `chatUnread: bool`, `noteText: String`, `targetPlayer: NotepadPlayer?`, `showPicker: bool`, `pickerQuery: String`, `pickerAnchor: int`. مراجع: `chatScrollController` (بديل chatEndRef)، `textFocusNode`/`textController` (بديل textareaRef). `activeTabRef` غير لازم في Flutter (لا stale closures عند قراءة الحالة في الـ callbacks).

---

## 9. الحزم المستخدمة

- `socket_io_client` — عميل السوكت (نسخة تطابق socket.io الرئيسية للسيرفر)؛ `emitWithAck`/ack callbacks. عبر خدمة السوكت المشتركة (04-socket-layer.md).
- `shared_preferences` — تخزين الملاحظات بنفس تنسيق المفتاح `mafia_notes_{roomId}_{myPhysicalId}` و JSON (تكافؤ سلوكي). **الشات لا يُخزَّن إطلاقاً.**
- `google_fonts` — خط **Amiri** (العنوان + زر الحفظ) وخط أحادي (JetBrains Mono / أو ما اعتمده 01-foundation-theme.md) للأرقام والملصقات الإنجليزية.
- `intl` — `DateFormat.Hm('ar_JO')` (أو `'ar'`) لتنسيق طابع الوقت (مطابقة `toLocaleTimeString('ar-JO', {hour:'2-digit', minute:'2-digit'})`).
- `flutter/material` (أو `flutter_animate`) — أنيميشن الانزلاق/الظهور والنبض للشارة والحوارات.

(لا حاجة لـ camera/notifications/deeplinks/haptics في هذه الشريحة.)

---

## 10. اختلافات Android / iOS

اختلافات دقيقة فقط، لا اختلاف في المنطق:

1. **الحافة الآمنة السفلية (iOS home indicator):** المصدر يضيف `paddingBottom: env(safe-area-inset-bottom)`. على iOS يجب تطبيق `MediaQuery.viewPadding.bottom` (أو `SafeArea(bottom: true)`) لتجنّب تداخل صف إدخال الشات مع شريط المنزل؛ على Android الحشوة غالباً صفر لكن طبّق نفس المنطق (لا فرع خاص بمنصّة).
2. **إزاحة لوحة المفاتيح لصف إدخال الشات:** النسخة الويب تحصل عليها مجّاناً؛ في Flutter اضبط `resizeToAvoidBottomInset: true` وأضِف حشوة `MediaQuery.viewInsets.bottom` أسفل صف الإدخال — سلوك مطلوب على المنصّتين، لكن اختبره على iOS حيث تختلف مقاسات اللوحة.
3. **Enter → إرسال:** على الجوال عيّن `TextInputAction.send` و`onSubmitted → sendChat`؛ سلوك زر «إرسال/return» متطابق على المنصّتين مع نفس الإعداد.
4. **عرض الإيموجي:** خطوط الإيموجي تختلف بين Android وiOS (📝🗣️🤫🟢🟡🔴🗑️📭📌💾); ثبّت الأحجام (`fontSize`) لأن خط الأساس يختلف. لا فرق سلوكي.

عدا ما سبق: **لا اختلافات** — المكوّن منطق واجهة + سوكت خالص لا يمسّ أي API منصّي (كاميرا/إشعارات/اهتزاز/deeplink).

---

## 11. الأصول المطلوبة

- **لا ملفات صور/صوت/lottie.** كل الأيقونات إيموجي Unicode: `📝 ✕ ✏️ 📋 🗣️ 💾 📌 🗑️ 📭 🤫 🟢 🟡 🔴 ⚪ @`.
- **أفاتارات اللاعبين**: صور بعيدة من `player.avatarUrl` (دائرية `object-cover`) مع بديل نصّي `#{physicalId}`. استخدم `CachedNetworkImage`/`Image.network` مع `errorBuilder` يعرض البديل الذهبي.
- **الخط**: **Amiri** (serif عربي) للعنوان وزر الحفظ (عبر `google_fonts`)؛ نص الجسم بخط عربي sans (حسب قرار 01-foundation-theme.md)؛ خط أحادي (mono) للأرقام والملصقات.
- **لوحة الألوان (hex حرفية):** ذهبي `#C5A059` (شريك تدرّج `#b38b47`)؛ أسود `#080808 / #0a0a0a / #0d0d0d / #111 / #141414 / #1a1a1a`؛ حدود `#1e1e1e / #222 / #262626 / #2a2a2a / #333 / #444`؛ دلالات: emerald/yellow/red بخلفية `/20` وحدّ `/40`؛ أحمر الشارة `bg-red-500` (`#ef4444`). ظل الـ FAB `rgba(197,160,89,0.3)` blur 20.

---

## 12. معايير القبول — checklist تكافؤ

- [ ] زر FAB 📝 (48×48، حد ذهبي 2px، ظل ذهبي blur 20، z-90، bottom-88 right-4) يظهر فقط في `done/rejoined`.
- [ ] فتح المفكرة ينزلق من الأسفل (spring d28/s350 ≈ slide+fade ~350ms)، خلفية `#080808`، كامل الشاشة، حشوة سفلية آمنة.
- [ ] الترويسة: `📝 مفكرة التحري` ذهبي Amiri font-black + زر إغلاق دائري `✕` (hover أحمر).
- [ ] تبويبان دائمان: `✏️ إضافة ملاحظة` و`📋 عرض الملاحظات` (+`(N)` عند وجود ملاحظات، N = عدد اللاعبين + عام إن وُجد نصّه).
- [ ] النشط ذهبي/أسود، غير النشط `#1a1a1a` رمادي بحد `#2a2a2a`.
- [ ] **تبويب `🗣️ التشاور` يظهر فقط عند `chatVisible`** ولا يظهر أي أثر له لغير المؤهّل.
- [ ] **الغطاء**: لا فرق مرئي بين مافيا ومواطن إلا التبويب الثالث، وبلا وميض تحميل يكشف الفرق.
- [ ] فتح المفكرة يهبط على `chat` للمافيا المؤهّل و`add` للبقية.
- [ ] إلغاء التأهيل أثناء العرض (موت/تعطيل ليدر/مرحلة محظورة) يُخفي التبويب واللوحة ويرتد لـ `add`.
- [ ] شارة غير مقروء: نقطة حمراء 8px نابضة `top-1 left-2` عند `chatUnread && activeTab !== chat`؛ تُمسح بتفعيل تبويب الشات.
- [ ] بطاقة الربط تعرض الهدف (أفاتار 36 + اسم + `مقعد #N` + `✕` إلغاء) أو صندوق منقّط بنص `@`.
- [ ] textarea `dir=auto` 5 أسطر، نصوص نائبة ديناميكية حرفية.
- [ ] منتقي `@`: يفتح فوق الحقل، يستثني الذات، مطابقة على id/name، حالة فارغة «لا يوجد لاعبون مطابقون»، لا يفقد الحقل التركيز عند الاختيار، حذف `@`+الكلمة، إعادة تركيز بعد 50ms.
- [ ] زر الحفظ: تدرّج ذهبي، Amiri، معطّل على نص فارغ، النص ديناميكي `💾 حفظ عن {name}` / `💾 حفظ ملاحظة عامة`.
- [ ] الحفظ **يُلحق** بـ `\n` ولا يستبدل؛ يصفّر النص والهدف؛ يحدّث الشارات في الأب (`onNotesChange`).
- [ ] رقائق الاختيار السريع تظهر فقط بلا هدف ومع وجود آخرين، وتستثني الذات.
- [ ] view: زر مسح الكل (مع تأكيد swal بالنص الحرفي)؛ بطاقة عامة؛ بطاقات لاعبين بأزرار ريبة (`🟢 بريء`/`🟡 مشتبه`/`🔴 مافيا`) بألوانها، إعادة الضغط تُصفِّر لـ none؛ «لا يوجد نص — فقط تصنيف»؛ `+ إضافة ملاحظة` ينقل لـ add بالهدف؛ حالة فارغة `📭`.
- [ ] حذف لاعب/مسح عام بلا تأكيد؛ مسح النص وحده يحذف المفتاح إن لا نص ولا ريبة.
- [ ] الشات: قائمة رسائل، فقاعتي `self-start`/ذهبية والآخرين `self-end`/رمادية (تحقّق بصرياً تحت RTL)، اسم ذهبي لي / أحمر للزملاء، وقت `dir=ltr` بصيغة ar-JO ساعة:دقيقة، حالة فارغة `🤫`، تمرير تلقائي للأسفل.
- [ ] إدخال الشات: سقف 300 حرف، `إرسال` معطّل عند فارغ/إرسال جارٍ، Enter يرسل.
- [ ] إرسال: بلا إلحاق تفاؤلي (الرسالة تظهر عبر echo فقط)، `chatSending` يُصفَّر عبر ack أو بعد 3000ms، رفض `{success:false}` بلا أي خطأ مرئي.
- [ ] `mafia:chat-history` عند الفتح يرطّب التاريخ؛ ring-buffer عميل يبقي آخر 200.
- [ ] الشات لا يُخزَّن محلياً إطلاقاً؛ الملاحظات بمفتاح `mafia_notes_{roomId}_{physicalId}` بتنسيق JSON مطابق.
- [ ] مسح الملاحظات على `LOBBY|ROLE_GENERATION|ROLE_BINDING|GAME_OVER` (في الأب).
- [ ] تكيّف الشاشات: compact عمود واحد كامل؛ medium سقف 640؛ expanded سقف 900 + تكبير معتدل.

---

## 13. ملاحظات أداء وأمان

**أمان (ثوابت منع التسريب — تُنقل حرفياً):**
1. **`chatVisible` تجميلي فقط (UX-only):** يُحسب على جهاز اللاعب من بياناته الشرعية (دوره، حالة حياته، علم `mafiaChatEnabled` العام، المرحلة). لا يُبثّ. الإنفاذ الحقيقي كله على السيرفر (`verifyAliveMafia` عند كل عملية) — لا تعتمد على العميل لأي حماية.
2. **الشات لا يُخزَّن محلياً أبداً** — لا `shared_preferences` ولا cache ولا logs. لا شيء على القرص يكشف عضوية المافيا.
3. **لا إلحاق تفاؤلي للرسائل** — الرسالة تظهر فقط عبر echo السيرفر؛ يمنع إظهار رسالة رُفضت سياديّاً.
4. **الرفض الصامت الموحّد** — كل رفض (throttle/غير مؤهّل/نص فارغ/استثناء) يعود `{success:false}` بلا سبب؛ العميل لا يعرض شيئاً؛ السبر لا يتعلّم شيئاً. **لا تُضِف أي رسالة خطأ.**
5. **سقف 300 حرف على العميل** يعكس سقف السيرفر (تقليل الحمل)، لكن السيرفر هو الحكم النهائي (trim + slice).
6. **الغطاء بلا وميض:** لا تنتظر أي شبكة قبل رسم التبويبات — `chatVisible` معروف محلياً؛ أي await يكشف الفرق بين مافيا ومواطن.
7. **إخفاء تفاعلي فوري:** عند `chatVisible → false` (موت/تعطيل/مرحلة) أخفِ التبويب واللوحة وارتد لـ `add` فوراً، دون انتظار السيرفر.

**أداء:**
- ring-buffer 200 رسالة يمنع نمو القائمة بلا حدود؛ استخدم `ListView.builder` مع `ScrollController` وتمرير تلقائي post-frame فقط أثناء تبويب الشات نشط.
- المستمع `mafia:chat-message` مُسجَّل **فقط أثناء (المفكرة مفتوحة + مؤهّل)** ويُلغى في `dispose`/الإغلاق — تجنّب تسريب مستمعات (bug ويب معروف في مستمعات أخرى؛ في Flutter ألغِ كل subscription في `dispose`).
- تحميل الملاحظات من `shared_preferences` عند الفتح فقط (لا كل frame)؛ الكتابة عند كل حفظ/تبديل/مسح.
- منتقي `@`: الفلترة على قائمة صغيرة (≤27 لاعباً) رخيصة؛ لا داعي لـ debounce.
- أفاتارات: استخدم `CachedNetworkImage` لتفادي إعادة تحميل الصور عند إعادة بناء القائمة.
