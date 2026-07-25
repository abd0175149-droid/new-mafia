# 04 — طبقة Socket.IO: المصافحة، إعادة الاتصال، توزيع الأحداث

> جزء من خطة تطبيق Flutter لواجهة اللاعب — الفهرس والتسلسل في 00-MASTER-PLAN.md

## 1. الهدف والنطاق

بناء **خدمة Socket.IO مركزية واحدة (Singleton)** في تطبيق Flutter تكافئ تماماً سلوك الويب (PWA) الحالي، وتكون الطبقة الوحيدة التي تتعامل مع الاتصال الحيّ بالسيرفر. كل الشاشات (اللوبي، الليل، التصويت، الاستضافة…) تستهلك هذه الطبقة ولا تنشئ اتصالات خاصة بها أبداً.

**داخل النطاق:**
- إنشاء الاتصال ومعاملاته الحرفية (transports، مهل، سياسة إعادة الاتصال).
- المصافحة (handshake auth) بحمولة `{ token, playerToken }` وآلية تحديث التوكن (`reconnectSocketAuth`).
- بروتوكول ما بعد إعادة الاتصال: إعادة ربط الغرفة/المقعد (`room:rejoin-player` / `room:rejoin-host`) ثم المزامنة الكاملة (`room:get-my-state`).
- غلاف emit موحّد بنمط ack + timeout ‏15 ثانية (مكافئ `useSocket.emit`).
- **Event Bus** داخلي يوزّع أحداث السيرفر على مزوّدي الحالة (Riverpod providers) بأنواع مضبوطة.
- جدول العقد الكامل: كل أحداث client→server وserver→client التي يستخدمها تطبيق اللاعب، بحمولاتها الحرفية.
- معالجة أحداث الإنهاء القسري: `game:kicked`، `event:closed`، `game:closed`، `game:room-deleted`، `player:kicked-self`.
- الاستطلاع الدوري كل 3 ثوانٍ لـ `room:get-my-state` (البنية التحتية للمؤقت؛ تفسير الحمولة في 20-game-state-core.md).

**خارج النطاق:** REST (في 03-networking-rest.md)، تخزين التوكن ودورة تسجيل الدخول (05-session-auth.md)، تفسير حالة اللعبة وبناء واجهاتها (20-game-state-core.md وما بعده)، الصوت RealtimeKit (31-voice-realtimekit.md)، إشعارات FCM (06-push-notifications.md).

**توضيح حاسم بخصوص `deviceId`:** بعد التحقق من الكود، `deviceId` **ليس جزءاً من مصافحة الـ socket إطلاقاً**. حمولة `socket.handshake.auth` تحتوي فقط `token` و`playerToken` (و`leaderToken` كاسم بديل لـ `token` يقبله السيرفر). الـ `deviceId` يُستخدم فقط في REST عند تسجيل توكن FCM: ‏`POST /api/player-notifications/register-token` بحمولة `{ token, deviceId, deviceInfo }` (انظر 06-push-notifications.md). لا تُرسل `deviceId` في المصافحة — السيرفر يتجاهله.

## 2. المرجع في الكود الحالي — مسارات الملفات المصدر

| الملف | ما يؤخذ منه |
|---|---|
| `unified-mafia/frontend/src/lib/socket.ts` | إعدادات العميل الحرفية، `readAuth()`، ‏`getSocket()`، ‏`disconnectSocket()`، ‏`reconnectSocketAuth()` |
| `unified-mafia/frontend/src/hooks/useSocket.ts` | غلاف `emit` بـ ack + timeout ‏15000ms، نص خطأ الـ timeout الحرفي، نمط `on/off` |
| `unified-mafia/frontend/src/hooks/useGameState.ts` | `joinRoom` (emit ‏`room:auto-join`)، تمرير `emit`/`on`/`isConnected` للشاشات |
| `unified-mafia/frontend/src/components/PlayerFlow.tsx` | بروتوكول إعادة الاتصال (السطور ~540–576: listener على `connect` يعيد `room:rejoin-player`)، الاستطلاع كل 3 ثوانٍ + ‏visibilitychange/focus/online (~1288–1445)، معالجات `player:kicked-self`/`player:seat-changed` (~578–640)، ‏`game:closed` (~1179)، ‏`game:room-deleted` (~1206)، ‏`game:kicked`/`event:closed` عبر `leaveAndReset` (~1232–1264)، شاشة RESTORING SESSION (~3521–3542) |
| `unified-mafia/frontend/src/context/PlayerContext.tsx` | استدعاء `reconnectSocketAuth()` بعد استلام `staffToken` من `/me` (سطر ~93)، مفاتيح التخزين `mafia_player_token`/`token`/`leader_token` |
| `unified-mafia/backend/src/index.ts` | إعداد السيرفر (السطور 73–80): ‏`pingTimeout:15000`، ‏`pingInterval:10000`، ‏CORS. ‏**middleware المصادقة `io.use` (السطور 88–111)** — المرجع الحرفي للمصافحة |
| `unified-mafia/backend/src/sockets/*.ts` | ‏handlers كل الأحداث (`lobby.socket.ts` وأخواتها) |
| `unified-mafia/backend/src/schemas/player.schema.ts` | ‏`PLAYER_TOKEN_EXPIRY = '30d'` وتوقيع الـ player JWT |

## 3. التبعيات على ملفات الخطة الأخرى

- **01-foundation-theme.md**: الألوان (`#C5A059` الذهبي، `#808080` الرمادي، الأسود)، الأيقونات (ShieldCheck)، ثيم الـ toasts.
- **02-models-data-layer.md**: قواعد الـ serialization العامة (decimals كنصوص، epoch-ms، ‏`playerVotes` بمفاتيح نصية) — نماذج §8 هنا تُبنى وفقها.
- **03-networking-rest.md**: نفس الـ base URL (الـ socket يتصل على نفس origin الـ REST؛ المسار الافتراضي `/socket.io`).
- **05-session-auth.md**: مصدر التوكنات (`playerToken` من secure storage + ‏`staffToken` الاختياري)، ومتى يُستدعى `reconnectSocketAuth` (بعد login، بعد change-password، بعد استلام staffToken من `/me`، وعند logout يُفصل الاتصال ويُعاد بلا توكن).
- **06-push-notifications.md**: ‏`deviceId` (خاص بـ FCM — ليس في المصافحة).
- **20-game-state-core.md**: المستهلك الرئيسي للـ Event Bus وسنابشوت `room:get-my-state`؛ يملك تفسير الحمولات ومنطق الـ phase override.
- **21-join-lobby.md**: يستدعي `room:auto-join`/`room:find-by-code` ويعرض شاشة RESTORING SESSION.
- **26-notepad-mafia-chat.md**، **23-night-phase.md**، **25-day-voting.md**، **27-spectator-gameover.md**، **30-host-console.md**، **31-voice-realtimekit.md**: مستهلكو أحداث محددة (مذكورة في §7).

## 4. الواجهة والتجربة تفصيلياً

طبقة الـ socket بلا واجهة خاصة بها تقريباً، لكنها **تملك** العناصر البصرية التالية المرتبطة مباشرة بحالة الاتصال (تُعرض من الشاشات المستهلكة لكن مواصفتها الحرفية هنا):

### 4.1 شاشة استعادة الجلسة (Rejoin Loading Overlay)
تظهر عند فتح التطبيق ووجود جلسة غرفة محفوظة، وتبقى حتى نجاح/فشل الـ rejoin (مكافئ `rejoinLoading` في PlayerFlow):
- ‏overlay بملء الشاشة، `position: fixed inset-0`، خلفية **سوداء صمّاء `#000000`**، فوق كل شيء (z-index 50)، المحتوى مركزي (وسط الشاشة أفقياً وعمودياً).
- أيقونة ShieldCheck بلون **`#C5A059`** تدور دوراناً كاملاً 360° — أنيميشن دوران خطي (linear) مدته **2 ثانية**، تكرار لا نهائي، هامش سفلي 16px عن النص.
- تحتها نص لاتيني حرفي: **`RESTORING SESSION...`** — لون **`#808080`**، حجم **10px**، خط monospace، أحرف كبيرة (uppercase)، تباعد أحرف واسع (letter-spacing widest ≈ 0.1em).
- ظهور الـ overlay بأنيميشن fade-in ‏(opacity ‏0→1).
- لا يوجد زر إلغاء — تختفي تلقائياً عند اكتمال الـ rejoin أو فشله.

### 4.2 رسالة خطأ الـ Timeout
عند انقضاء 15 ثانية على emit بلا ردّ، يرفض الغلاف بالنص الحرفي:
**`الخادم في وضع قطع الاتصال أو لا يستجيب (Timeout)`**
الشاشات تعرضه في مكوّن الخطأ الخاص بها (لا تعرضه الطبقة بنفسها).

### 4.3 توست تغيير المقعد (`player:seat-changed`)
- النص الحرفي: **`تم تغيير رقمك: {oldPhysicalId} ← {newPhysicalId}`**
- توست مثبت أعلى الشاشة (fixed top-4 left-4 right-4)، خلفية ذهبية **`#C5A059`**، نص **أسود** عريض (bold)، محاذاة وسط، padding ‏16px، زوايا مدوّرة (radius ‏8px)، ظل كبير.
- أنيميشن دخول: opacity ‏0→1 مع انزلاق من الأعلى (y: ‏-20→0)؛ خروج معاكس.
- يختفي تلقائياً بعد **5000ms**.
- اهتزاز الجهاز بالنمط **`[200, 100, 200]`** (اهتزاز 200ms، توقف 100ms، اهتزاز 200ms).
- الطبقة مسؤولة أيضاً عن **تحديث المقعد المخزّن محلياً فوراً** (انظر §6.6).

### 4.4 حالات الإنهاء القسري (نصوص حرفية)
عند وصول أي حدث إنهاء، تبثّ الطبقة حدث `SessionTerminated` على الـ Bus وتصفّر الجلسة المحلية، والشاشة المستقبلة (21-join-lobby.md) تعرض رسالة الخطأ على شاشة الدخول:
- ‏`game:closed` و`game:room-deleted` ← الرسالة الحرفية: **`تم إغلاق الغرفة`**
- ‏`game:kicked` ← ‏`data.reason` إن وُجد، وإلا: **`تم إنهاء الفعالية وإغلاق الغرفة`**
- ‏`event:closed` ← ‏`data.reason || data.message` إن وُجد، وإلا: **`تم إنهاء الفعالية وإغلاق الغرفة`**
- ‏`player:kicked-self` ← تصفير صامت + علامة «خرج بإرادته» (`userExited=true` المكافئ) كي لا يعاد الانضمام تلقائياً؛ عرض الرسالة من `data.reason` إن وُجدت.

### 4.5 مؤشر حالة الاتصال
الطبقة تعرض `Stream<SocketConnectionState>` ‏(§8). لا يوجد بانر «غير متصل» دائم في الـ PWA الحالي — **لا تخترع واحداً**؛ الشاشات تستخدم الحالة لتعطيل أزرار الإرسال وتأجيل التدفقات (مثل انتظار الاتصال قبل auto-find بالكود). حالة `rejoinLoading` (§4.1) هي المؤشر البصري الوحيد.

### 4.6 حالة خطأ الاتصال
‏`connect_error` لا يُظهر أي UI (الويب يكتفي بـ console.error) — إعادة المحاولة تلقائية بلا حد. لا dialogs للاتصال إطلاقاً.

## 5. التكيّف مع الشاشات 6→11 إنش

الطبقة headless؛ التكيّف يخص عنصريها البصريين فقط:

**شاشة RESTORING SESSION (§4.1):**
- **compact (<600dp)**: كما في الـ PWA حرفياً — أيقونة بحجمها الافتراضي (~48dp) ونص 10sp.
- **medium (600–840dp)**: نفس التخطيط المركزي؛ الأيقونة 64dp والنص 12sp؛ لا سقف عرض مطلوب (محتوى نقطي مركزي).
- **expanded (>840dp)**: الأيقونة 96dp والنص 14sp — **مضاعفة الحجم بدل التمديد** (عنصر لعب حساس بصرياً على تابلت 10–11 إنش يُعرض من بعيد)؛ يبقى مركزياً تماماً.

**توست تغيير المقعد (§4.3):**
- **compact**: ملء العرض مع هوامش 16dp يميناً ويساراً (مكافئ left-4/right-4).
- **medium**: سقف عرض **640dp** ومحاذاة وسط أفقياً؛ النص 16sp.
- **expanded**: سقف عرض **640dp** (لا يتمدد أكثر — توست نصي)؛ النص 18sp والـ padding ‏20dp لضمان القراءة من مسافة.

لا شيء آخر في هذه الطبقة يتأثر بحجم الشاشة. أي UI آخر مبني على أحداث الـ socket يتبع قواعد ملف شاشته.

## 6. المنطق والتدفقات

### 6.1 آلة الحالة (State Machine) للاتصال

```
disconnected ──connect()──▶ connecting ──'connect'──▶ connected
     ▲                          │  ▲                      │
     │                 'connect_error'                    │ (جلسة غرفة محفوظة؟)
     │                (إعادة محاولة تلقائية               ▼
     │                 delay 1000→5000ms ∞)          rebinding ──rejoin ack success──▶ roomBound
     │                                                    │
     └────────────'disconnect'(أي حالة)                   └─ rejoin فشل ──▶ connected (بلا غرفة)
```

- **connected**: الهوية (authPlayer/authStaff) أُلصقت سيرفرياً من المصافحة، لكن `socket.data` الخاص باللعب (role/roomId/physicalId) **فارغ**.
- **rebinding**: أُرسل `room:rejoin-player` (أو `room:rejoin-host`) وننتظر الـ ack.
- **roomBound**: الحُرّاس السيرفرية ستقبل emits اللعب. أي `disconnect` يسقطنا إلى disconnected ويجب المرور بـ rebinding من جديد — **`socket.data` ذاكرة سيرفر تضيع مع كل انقطاع، بلا استثناء**.

### 6.2 إنشاء الاتصال — المعاملات الحرفية (استنساخ `frontend/src/lib/socket.ts`)

| المعامل | القيمة الحرفية |
|---|---|
| URL | `AppConfig.socketUrl` = نفس origin الـ REST لكل flavor (‏dev: staging `https://mafia.grade.sbs`؛ prod: `https://club-mafia.grade.sbs`) — لا dart-define (01 §6.2) |
| path | الافتراضي `/socket.io` (لا يُغيَّر) |
| `transports` | `['polling', 'websocket']` — **بهذا الترتيب** (polling أولاً ثم upgrade) |
| `autoConnect` | `true` |
| `reconnection` | `true` |
| `reconnectionAttempts` | `Infinity` (بلا حد) |
| `reconnectionDelay` | `1000` ms |
| `reconnectionDelayMax` | `5000` ms |
| `timeout` | `20000` ms (مهلة محاولة الاتصال الواحدة) |
| `auth` | `{ token: <staffToken أو ''>, playerToken: <playerJWT أو ''> }` |

إعدادات السيرفر (للعلم — تؤثر على اكتشاف الانقطاع): `pingInterval: 10000`، ‏`pingTimeout: 15000` ⇒ أسوأ حالة لاكتشاف انقطاع صامت ≈ 25 ثانية.

### 6.3 المصافحة الحرفية (backend `io.use` في `backend/src/index.ts:88`)

- **الاتصال لا يُرفض أبداً** — الـ middleware يلصق هوية فقط ويستدعي `next()` دائماً حتى مع توكن تالف.
- يقرأ `socket.handshake.auth`:
  1. `auth.token` **أو** `auth.leaderToken` (الاسمان مقبولان): يُتحقق كـ staff JWT بسر `JWT_SECRET`. إذا role ∈ `['admin','manager','leader']` ⇒ ‏`socket.data.authStaff = { id, role, username }` + ‏`socket.data.role = 'leader'`. إذا `role === 'location_owner'` ⇒ ‏`socket.data.authVenue = { id }` فقط (بلا دور leader). توكن غير صالح يُتجاهل بصمت.
  2. `auth.playerToken`: يُتحقق كـ player JWT (سر مشتق `JWT_SECRET + '_PLAYER'`، ‏HS256، صلاحية 30 يوماً، حمولة `{ playerId:number, phone:string, name:string }`). إذا صحّ ⇒ ‏`socket.data.authPlayer = { playerId, phone, name }`.
- في Flutter نرسل دائماً: `playerToken` = توكن اللاعب من secure storage (أو '' قبل login)، و`token` = ‏`staffToken` **فقط** إذا كان الحساب مربوطاً بموظف (وصل `staffToken` من `/api/player-auth/me`) — هذا ما يفعّل صلاحيات الليدر على السوكيت للحسابات المربوطة، مطابقاً لسلوك `PlayerContext.tsx`.
- **لا يوجد أي حقل آخر في المصافحة** (لا deviceId ولا roomId ولا phone).

### 6.4 تحديث التوكن — `reconnectSocketAuth` بنسخة Flutter

في الويب `auth` **دالة** تُقرأ من جديد عند كل (إعادة) اتصال، فالتوكن الجديد يُلتقط تلقائياً؛ ومع ذلك بعد login يستدعي الويب `reconnectSocketAuth()` (تحديث auth ثم `disconnect()` + ‏`connect()`) لتطبيقه فوراً.

في `socket_io_client` (Dart) الـ `auth` **خريطة ثابتة** في الـ options — لذا يجب تنفيذ الدالة التالية واستدعاؤها في المواضع الأربعة:

```dart
void reconnectSocketAuth() {
  socket.auth = _readAuth();       // { 'token': ..., 'playerToken': ... } من secure storage
  socket.disconnect();
  socket.connect();
}
```

مواضع الاستدعاء الإلزامية (من 05-session-auth.md):
1. بعد نجاح login مباشرة.
2. بعد نجاح change-password (التوكن يُستبدل بالجديد من الرد).
3. بعد استلام `staffToken` من `/api/player-auth/me` (حساب مربوط بموظف).
4. عند logout (بعد مسح التوكنات — يُعاد الاتصال بهوية فارغة).

بعد كل استدعاء سيصل حدث `connect` جديد ⇒ يمر تلقائياً ببروتوكول §6.5.

### 6.5 بروتوكول إعادة الاتصال (حرِج — استنساخ PlayerFlow حرفياً)

**عند كل حدث `connect`** (الأول وكل إعادة اتصال):
1. إذا كانت هناك جلسة غرفة محفوظة (`roomId` + ‏`physicalId` + ‏`phone` في التخزين المحلي — مكافئ `mafia_session`):
   - طبّع الهاتف: `phone.startsWith('0') ? phone : '0' + phone` (السيرفر يحذف `+962/00962/962` ويفرض `0` بادئة — أرسل بصيغة الأردن `07…`).
   - ‏emit ‏`room:rejoin-player { roomId, physicalId: int (0 إذا مجهول — البحث بالهاتف), phone }`. **الهاتف يتغلب على physicalId سيرفرياً** (حماية من renumber أثناء الانقطاع).
   - عند نجاح الـ ack: حدّث المقعد والاسم والدور المخزّنة من `res.player` (‏`physicalId` قد يكون تغيّر!)، وإذا `!res.player.isAlive` فعّل حالة الموت في الـ state.
   - عند الفشل: لا dialog — سجّل تحذيراً واستمر (الاستطلاع الدوري سيصحح).
2. إذا كان الجهاز **مضيف غرفة remote**: ‏emit ‏`room:rejoin-host { roomId }` بدلاً منه (يُتحقق سيرفرياً ضد `config.hostPlayerId`). وإن جُهل الـ roomId (جهاز جديد): ‏`room:my-hosted-room {}` أولاً.
3. بعد نجاح إعادة الربط: استدعِ فوراً `room:get-my-state` لمزامنة كاملة (تُسلَّم لـ 20-game-state-core.md).

**التنفيذ في مكان واحد مركزي** (SocketService) وليس في الشاشات — نسيان إعادة الربط يجعل كل emits اللعب تفشل بصمت لأن الحُرّاس تقرأ `socket.data` الضائع.

### 6.6 تغيّر المقعد أثناء اللعب

عند `player:seat-changed { oldPhysicalId, newPhysicalId }`: حدّث فوراً `physicalId` في الجلسة المخزّنة + الـ state، ثم أطلق توست §4.3 والاهتزاز. كل emits لاحقة تستخدم الرقم الجديد.

### 6.7 غلاف الإرسال (emitWithAck) — استنساخ `useSocket.emit`

```
Future<Map<String, dynamic>> emitAck(String event, Map data) →
  - إذا الـ socket غير مهيأ: أكمل بخطأ 'Socket not initialized'.
  - emitWithAck مع مهلة 15000ms.
  - انقضاء المهلة ⇒ خطأ بالنص الحرفي: 'الخادم في وضع قطع الاتصال أو لا يستجيب (Timeout)'.
  - الرد وصل و response['success'] == true ⇒ أكمل بالرد كاملاً.
  - غير ذلك ⇒ ارفض بـ SocketAckException(message: response['error'] ?? 'Unknown error', response: response)
    — الـ response كاملاً مرفق لأن حالات فشل كثيرة تحمل حقولاً مهمة (code/requiresConfirmation/priceMismatch…).
```

قواعد إلزامية:
- **مرّر ack callback دائماً** — بعض الـ handlers تفحص `typeof callback === 'function'` وتتجاهل النداء بدونه.
- استثناء وحيد: `player:mafia-gallery-open` يُرسل **بلا ack** (fire-and-forget).
- **رفض mafia chat صامت مقصود**: ‏`mafia:chat-send`/`mafia:chat-history` قد يرجعان `{ success:false }` بلا `error` — لا تعرض خطأً إطلاقاً (سلوك أمني anti-probing)، تجاهل بصمت.

### 6.8 الـ Event Bus في Flutter

- ‏SocketService يسجّل listener واحداً لكل حدث في جدول §7.2 عند إنشاء الاتصال (وليس لكل شاشة) ويعيد بثّه على **broadcast StreamController** مركزي:
  ```dart
  Stream<T> on<T extends SocketEvent>()  // مصفّى بالنوع
  Stream<SocketEvent> get events         // الخام
  ```
- كل حدث يُغلَّف في كلاس من §8 (sealed `SocketEvent`). الحمولات غير الممكن نمذجتها بثبات (`game:state-sync` الكامل) تمرَّر كـ `Map<String, dynamic>` داخل الغلاف.
- **لا buffering ولا replay**: الأحداث الفائتة أثناء الانقطاع تُعوَّض حصرياً من استطلاع `room:get-my-state` (§6.9) — هذا قرار معماري من الـ PWA يجب الحفاظ عليه.
- الاشتراكات تُلغى مع dispose الشاشة؛ الـ listeners الأصلية على الـ socket تبقى حية طوال عمر التطبيق.
- أحداث الإنهاء (§4.4) تُعالج داخل الطبقة نفسها (تصفير الجلسة) **ثم** تُبث كـ `SessionTerminated` للـ UI.

### 6.9 الاستطلاع الدوري (مصدر الحقيقة)

- أثناء وجود اللاعب في غرفة: ‏emit ‏`room:get-my-state { roomId, playerId?, phone? }` **فوراً ثم كل 3000ms** (مكافئ `setInterval(pollState, 3000)` في PlayerFlow).
- مزامنة فورية إضافية عند: ‏`AppLifecycleState.resumed` (مكافئ visibilitychange/focus — **مؤقتات الخلفية تُخنق على الموبايل، الـ interval وحده لا يكفي**)، وعند عودة الشبكة (`connectivity_plus` — مكافئ حدث `online`).
- حالات UI عدة (التصويت المتبقي عبر `votingStartTime + durationSeconds`، خطوة الليل، justification، ‏pendingResolution) لا يُعاد بناؤها بموثوقية إلا من هذا السنابشوت — تفاصيل التفسير في 20-game-state-core.md.
- ملاحظة من الـ PWA يجب نقلها إلى 20-game-state-core.md: حماية «phase override» بمهلة `OVERRIDE_TTL = 6000ms` تمنع استطلاعاً قديماً من دهس انتقال طور وصل لتوّه بالـ event.

### 6.10 حالات حدّية

- **emit قبل اكتمال الاتصال**: ‏socket_io_client يخزّن مؤقتاً، لكن حُرّاس اللعب ستفشل قبل rebinding — الشاشات تنتظر `roomBound` (الويب ينتظر `isConnected` قبل auto-find/rejoin).
- **انقطاع أثناء التصويت/الليل**: بعد إعادة الربط، السنابشوت التالي (≤3 ثوانٍ) يعيد بناء الحالة بما فيها الوقت المتبقي.
- **انقطاع المضيف (remote)**: ‏`room:rejoin-host` يعيد صلاحية `isPlayerHost`؛ بدونه كل أحداث القيادة تفشل.
- **الطرد أثناء الانقطاع**: قد لا يصل حدث الطرد — الاستطلاع سيرجع فشلاً/حالة بلا لاعب؛ عالجها كإنهاء جلسة.
- **حدود المعدل (تُحترم client-side)**: mafia chat ‏700ms بين الرسائل؛ دعوات ≤10/دقيقة + 1/دقيقة لكل مدعو؛ نبضة gallery-open كل 5 ثوانٍ كحد أدنى.

## 7. عقود التكامل

لا REST في هذا الملف (انظر 03-networking-rest.md). كل ما يلي Socket.IO. كل النداءات client→server بـ ack يرجع `{ success:boolean, error?:string, code?:string, ... }` ما لم يُذكر غيره.

### 7.1 client → server

#### اللوبي ودورة حياة الغرفة (`lobby.socket.ts`)

| Event | Payload | Ack / السلوك |
|---|---|---|
| `room:find-by-code` | `{ roomCode }` | `{ success, roomId, roomCode, gameName, playerCount, maxPlayers, requireTicket }` |
| `room:list-active` | `{}` | `{ success, rooms:[{ roomId, roomCode, gameName, playerCount, maxPlayers }] }` |
| `room:auto-join` | `{ roomId, name, phone?, playerId?, gender?, dob?, ticketNumber?, forceJoin?, preferredSeat? }` | نجاح: `{ success, assignedSeat, gameName, constraintViolation }` (+ بث `room:player-joined`)؛ لاعب عائد/مقعد محجوز: `{ success, assignedSeat, …, restoredSeat:true, isRemote? }`. فشل: `{ success:false, requiresConfirmation:true, error }` (في غرفة حية أخرى → dialog ثم إعادة الإرسال بـ `forceJoin:true`)؛ `{ code:'PENDING_SURVEYS', pendingCount, redirect }`؛ `{ code:'HOST_CANNOT_PLAY' }`؛ `{ code:'REMOTE_SUB_REQUIRED' }`؛ أخطاء تذاكر ومنها `{ priceMismatch:true, ticketPrice, expectedPrice, selectedOfferName }`. النجاح يضبط `socket.data` (role='player'/roomId/physicalId) |
| `room:rejoin-player` | `{ roomId, physicalId, phone? }` — الهاتف يتغلب على physicalId | `{ success, player:{ physicalId, name, role (null حتى يُسمح بالكشف), isAlive, gender, playerId, penalties }, mafiaTeam:[{ physicalId, name, role, avatarUrl }], sibling, assassinContracts, phase, gameName, roomCode, votingState (candidates/totalVotesCast/playerVotes/hiddenPlayers/playersInfo)\|null, maxPenalties, mafiaChatEnabled }` — يفكّ التجميد/يحرر seat-hold |
| `room:get-my-role` | `{ roomId, physicalId }` | `{ role, confirmed, mafiaTeam?, sibling? }` — polling fallback بعد ربط الأدوار |
| `room:get-my-state` | `{ roomId, playerId?, phone? }` — يُستطلع كل 3 ثوانٍ | سنابشوت كامل: `{ success, player{physicalId,name,role?,isAlive,gender,playerId,penalties}, phase, isRemote, allowPlayerInvites, rolesConfirmed, votingState\|null, maxPenalties, mafiaChatEnabled, justificationData\|null, withdrawalState\|null, discussionState\|null (مع deals), nightState:{ nightStep, autoNightStepRole, autoNightPerformerId (null لغير المنفّذ في remote), config:{autoNightTime}, playerSubmitted }\|null, pendingResolution\|null, assassinContracts\|null, sibling, winner\|null, rosterInfo:[{physicalId,name,avatarUrl,isAlive,gender,rankTier}], allPlayers (GAME_OVER فقط، مع الأدوار), playersInfo (الأحياء: id+name), round }` |
| `room:player-exit` | `{ roomId, phone?, playerId? }` | `{ success }` — في LOBBY: حجز المقعد 10 دقائق؛ أثناء اللعبة: تجميد (الدور محفوظ) |
| `room:freeze-player` | `{ roomId, phone?, playerId? }` | `{ success }` — للمُقصى فقط (`isAlive=false`)؛ للتنقل بين الغرف |
| `player:mafia-gallery-open` | `{ roomId? }` — **بلا ack** | نبضة anti-cheat → تنبيه leader فقط؛ throttle ‏5 ثوانٍ؛ يتطلب role ‏'player' |

#### استضافة remote (تتطلب `playerToken` مع `canHostRemote`) — تفاصيل الشاشة في 30-host-console.md

| Event | Payload | Ack |
|---|---|---|
| `room:create-remote` | `{ gameName?, maxPlayers?, maxJustifications?, maxPenalties?, penaltyScope?, displayPin?, autoNightTime? (5–60), gameTimerMinutes? (0=معطل), bombEnabled?, mafiaChatEnabled?, allowPlayerInvites? }` | `{ success, roomId, roomCode, displayPin, gameName, sessionId?, maxPlayers, isRemote:true }` — يمنح الـ socket ‏`isPlayerHost` |
| `room:rejoin-host` | `{ roomId }` | `{ success }` — يعيد الصلاحية بعد reconnect (تحقق ضد `config.hostPlayerId`) |
| `room:my-hosted-room` | `{}` | `{ success, roomId, roomCode }` أو `{ success:false }` |
| `room:invite-player` | `{ roomId, inviteePlayerId }` | `{ success }` — المضيف دائماً؛ العضو الجالس فقط إذا `allowPlayerInvites`؛ ‏rate ‏≤10/دقيقة + 1/دقيقة لكل مدعو؛ push بنوع `room_invite` و‏url ‏`/player/join?code={roomCode}&invite=1&by=…` |
| `room:release-held-seat` | `{ roomId, physicalId }` | leader/host فقط؛ `{ success }` |
| أحداث القيادة من المضيف (خلف بوابة leader/isPlayerHost) | `day:tie-action`، `day:execute-elimination`، `game:confirm-end`، `night:start`، `night:auto-advance-step`، `night:auto-approve-step`، `leader:approve-confrontation`، `voice:get-token`… | حمولاتها في 30-host-console.md |

#### اللعب

| Event | Payload | Ack / القواعد |
|---|---|---|
| `game:get-state` | `{ roomId }` | `{ success, state }` — الأدوار مُصفَّرة و`nightActions` محذوفة لغير الـ leader |
| `player:cast-vote` | `{ roomId, physicalId, candidateIndex, autoVote? }` | `{ success }` — مقعدك أنت فقط (`physicalId === socket.data.physicalId`)، طور DAY_VOTING، حي، ليس نفسك (إلا autoVote)؛ تغيير التصويت مدعوم؛ صوت العمدة ×2 |
| `player:withdraw-vote` | `{ physicalId }` — roomId من socket.data | `{ success, count, needed }` — DAY_JUSTIFICATION فقط، لمن صوّت للمتهم، مرة واحدة |
| `day:mayor-decision` | `{ roomId, decision:'PASS'\|'REVOTE'\|'REVOTE_TOP2'(بديل)\|'POSTPONE' }` | `{ success, passed?/decision, result? }` — leader أو مقعد العمدة أثناء نافذته |
| `player:night-action` | `{ roomId, actionType:'KILL'\|'INVESTIGATE'\|'PROTECT'\|'SNIPE'\|'SILENCE'\|'DECOY', targetPhysicalId:number\|null (null=تخطٍّ) }` | `{ success }` — role ‏'player'، طور NIGHT، ‏nightMode ‏'auto'، حي، مرة لكل step؛ هدف المنفّذ الحقيقي وحده يُسجَّل؛ الشريف يستقبل `night:sheriff-result` فوراً |
| `nurse:activation-response` | `{ roomId, activate:boolean }` | `{ success }` — ردّ على `nurse:activation-request` |
| `player:request-confrontation` | `{ roomId, targetPhysicalId }` | `{ success }` أو أكواد: `remote_only`، `discussion_only`، `confrontation_in_progress`، `max_reached` (3/جولة)، `player_not_found`، `must_be_alive`، `self` |
| `player:respond-confrontation` | `{ roomId, accept:boolean }` | `{ success }` — الهدف المعلّق فقط |
| `mafia:chat-send` | `{ roomId, text ≤300 }` | `{ success:true }` أو `{ success:false }` **صامت بلا سبب**. throttle ‏700ms. شروط: مافيا حي، rolesConfirmed، ‏mafiaChatEnabled، الطور ليس LOBBY/ROLE_GENERATION/GAME_OVER |
| `mafia:chat-history` | `{ roomId }` | `{ success, messages:[{ physicalId, name, text, at }] }` — نفس الرفض الصامت؛ آخر 200 |
| `voice:get-token` | `{ roomId }` | `{ success, authToken, meetingId, participantId ('p{physicalId}' أو 'host'), preset }` — remote فقط؛ الـ preset سيرفري حسب isHost/isAlive |

#### خارج نطاق التطبيق (لا تُنفَّذ)
أحداث leader/display/venue محمية بـ `socket.data.role==='leader'` أو display PIN: ‏`room:create`، `room:verify-display-pin`، `room:kick-player`، `room:renumber-players`، `room:move-seat`، `room:override-player`، `room:force-add-player`، `room:update-*`، `room:resync-template`، `leader:tools-ping`، `leader:sound-play`، `leader:record-penalty`، `setup:*`، `day:start-voting`، `day:voting-timeout`، `day:create-deal/remove-deal`، `day:cast-vote`، `day:un-narrow`، `day:resolve`، `day:*timer*`، `day:next/prev-speaker`، `admin:*`، `night:*` (بقيادة leader — عدا مسار المضيف)، `policewoman:*`، `game:transition-phase`، `game:set-*`، `game:restart`، `room:close/delete-room/reset-to-lobby/close-event`، `display:*`، `room:lucky-draw:*`، `leader:mafia-chat-history/-toggle`، `venue:join`.

### 7.2 server → client (كل ما يجب أن يستمع له التطبيق)

| Event | Payload | ملاحظات / المستهلك |
|---|---|---|
| `game:state-sync` | كائن حالة اللعبة الكامل | عند كل تعديل تقريباً. **remote: مُعقَّم** — أدوار الأحياء `null` (الموتى تبقى)، `nightActions`/`autoNightChoices` محذوفة، `mayorState` بعد الكشف فقط → 20-game-state-core.md |
| `game:phase-changed` | `{ phase, state?, teamCounts? }` | ‏state معقَّم بنفس الطريقة |
| `game:started` | شبه فارغ `{}` | بعد اكتمال الـ binding |
| `game:over` | `{ winner, ... }` | → 27-spectator-gameover.md |
| `game:restarted` | state | الـ leader أعاد اللعبة |
| `game:closed` / `game:room-deleted` / `event:closed` / `game:kicked` | `{ reason?/message? }` | إنهاء قسري → §4.4 و§6.10 |
| `game:player-disconnected` | `{ physicalId, isLeader }` | |
| `game:penalty-recorded` | `{ physicalId, penalties, maxPenalties, message, isKicked }` | |
| `player:kicked-self` | `{ reason? }` | لـ socket المطرود فقط → §4.4 |
| `player:penalty-ejected` | `{ reason, penalties, maxPenalties }` | |
| `player:seat-changed` | `{ oldPhysicalId, newPhysicalId }` | **تحديث المقعد المخزّن فوراً** → §6.6 |
| `room:player-joined` | `{ physicalId, name, totalPlayers, maxPlayers, gender, avatarUrl }` | roster اللوبي → 21-join-lobby.md |
| `room:config-updated` | ‏config جزئي: `{ mafiaChatEnabled }` أو `{ maxPlayers }` أو إعدادات عقوبات/قنبلة | |
| `player:role-assigned` | `{ physicalId, role, mafiaTeam?:[{physicalId,name,role,avatarUrl}], sibling? }` | كشف الدور؛ يُعاد عند twin transform → 22-role-cards.md |
| `mafia:team-updated` | `{ mafiaTeam:[...] }` | تحديث خفيف للفريق |
| `assassin:contracts-update` | `{ contracts, currentIndex, completedCount, totalRequired }` | القاتل المأجور فقط |
| `day:voting-started` | `{ candidates, hiddenPlayers, teamCounts, playersInfo:[{physicalId,name,avatarUrl}], playerVotes, durationSeconds\|null, mayorRevote?, mayorPhysicalId? }` | → 25-day-voting.md |
| `day:vote-update` | `{ candidates, totalVotesCast, tieBreakerLevel, playerVotes, leaderProxyVotes }` | العدّ الحي |
| `day:voting-complete` | `{ candidates, totalVotesCast }` | |
| `day:justification-started` | `{ accused, ... }` | |
| `day:justification-timer-started` / `day:justification-timer-stopped` | معلومات المؤقت | |
| `day:discussion-updated` | حالة النقاش (ترتيب المتحدثين، deals) | |
| `day:show-silenced` | معلومات المُسكَت | |
| `day:tie` | `{ tiedCandidates }` | |
| `day:withdrawal-period` | `{ needed, total, accusedIds? }` | |
| `day:withdrawal-update` | `{ count, needed, total, withdrawn }` | |
| `day:withdrawal-result` | `{ revote:boolean }` | |
| `day:elimination-pending` | `{ eliminated, revealedRoles, winResult, type, pendingBomb?, neutralWin?, mayorPostponed? }` | |
| `day:elimination-revealed` | payload الكشف | |
| `day:mayor-window` | `{ winner, top2, topVotes, mayorPhysicalId, voteWeight, timeoutSeconds:30, forMayor:true }` | **انتقائي**: leader/display + ‏socket العمدة فقط |
| `day:mayor-window-closed` | `{}` | |
| `day:mayor-revealed` | payload الكشف + `savedPhysicalId` | |
| `day:deal-created` / `day:deal-removed` | معلومات الصفقة | |
| `night:action-required` | `{ actionType, availableTargets:[{physicalId,name,avatarUrl}], timeoutSeconds, canSkip, stepRole, isDecoy }` | لكل socket على حدة، لكل حي في كل step ليلي auto؛ غير المنفّذ يصله `isDecoy:true` مع أهداف زائفة (كل الأحياء) → 23-night-phase.md |
| `night:sheriff-result` | `{ result:'MAFIA'\|'CITIZEN', targetPhysicalId, targetName }` | socket الشريف فقط (الحرباء تُقرأ CITIZEN) |
| `nurse:activation-request` | `{ message }` | socket الممرضة فقط عند موت الدكتور |
| `night:step-info` / `night:queue-step` / `night:queue-complete` | metadata للخطوة | غالباً display؛ اللاعب يستمع لـ `night:step-info` |
| `night:morning-recap` | recap مع مصفوفة `players` | **remote: أدوار الأحياء مُصفَّرة، `assassinState:null` للاعبين** → 24-morning-cinematics.md |
| `display:morning-event` | `{ type (مثل 'TWIN_TRANSFORM'), targetPhysicalId, targetName, extra }` | بانرات الصباح |
| `night:auto-started` | `{ totalAlive }` | |
| `game:timer-adjusted` | معلومات المؤقت | |
| `mafia:chat-message` | `{ physicalId, name, text, at }` | **بث انتقائي**: sockets المافيا الأحياء + الـ leader فقط → 26-notepad-mafia-chat.md |
| `confrontation:pending` | `{ status:'PENDING_TARGET'\|'PENDING_LEADER', requesterId, requesterName?, targetId, targetName? }` | |
| `confrontation:started` | `{ requesterId, targetId, durationSeconds:30, startedAt }` | |
| `confrontation:ended` | `{ reason:'target_declined'\|'leader_rejected'\|'time_up' }` | |

**leader-only** (عبر `emitLeaderOnly` — لا تصل sockets اللاعبين في remote، لكن **اللاعب المضيف يستقبلها** ويعالجها في 30-host-console.md): ‏`night:auto-step-ready`، `night:auto-step-approval`، `night:auto-step-started`، `night:auto-progress`، `leader:mafia-gallery-alert`، `leader:pinned-seat-conflict`، `policewoman:choice-available`.
**display-only تُتجاهل**: `display:sound-play`، `display:night-started`، `display:replay-*`، `display:lucky-draw*`.

## 8. نماذج Dart المطلوبة

قواعد التحويل من 02-models-data-layer.md (decimals نصوص، ‏socket timestamps ‏epoch-ms ⇒ `DateTime.fromMillisecondsSinceEpoch`، ‏`playerVotes` مفاتيح نصية ⇒ `Map<int,…>` عبر `int.parse(key)`).

```dart
// ── البنية التحتية ──
enum SocketConnectionState { disconnected, connecting, connected, rebinding, roomBound }

class SocketAuthPayload { String token; String playerToken; }   // '' عند الغياب — الحقلان الوحيدان في المصافحة

class SocketAckException implements Exception {
  final String message;                 // response['error'] أو النص الحرفي للـ timeout
  final Map<String, dynamic>? response; // الرد الكامل (code/requiresConfirmation/priceMismatch…)
}

// ── أغلفة ack ──
class RejoinPlayerResponse { RejoinedPlayer player; List<MafiaTeamMember> mafiaTeam; Map<String,dynamic>? sibling;
  Map<String,dynamic>? assassinContracts; String phase; String gameName; String roomCode;
  Map<String,dynamic>? votingState; int maxPenalties; bool mafiaChatEnabled; }
class RejoinedPlayer { int physicalId; String name; String? role; bool isAlive; String? gender; int? playerId; int penalties; }
class MafiaTeamMember { int physicalId; String name; String role; String? avatarUrl; }
class MyRoleResponse { String? role; bool confirmed; List<MafiaTeamMember>? mafiaTeam; Map<String,dynamic>? sibling; }
class FindRoomResponse { String roomId; String roomCode; String gameName; int playerCount; int maxPlayers; bool requireTicket; }
class ActiveRoomSummary { String roomId; String roomCode; String gameName; int playerCount; int maxPlayers; }

// room:auto-join — union (freezed sealed) لتعدد أشكال الفشل:
sealed class AutoJoinResult {}
class AutoJoinSuccess extends AutoJoinResult { int assignedSeat; String gameName; String? constraintViolation; bool restoredSeat; bool? isRemote; }
class AutoJoinNeedsConfirmation extends AutoJoinResult { String error; }             // requiresConfirmation:true
class AutoJoinPendingSurveys extends AutoJoinResult { int pendingCount; String redirect; } // code:'PENDING_SURVEYS'
class AutoJoinHostCannotPlay extends AutoJoinResult {}                               // code:'HOST_CANNOT_PLAY'
class AutoJoinRemoteSubRequired extends AutoJoinResult {}                            // code:'REMOTE_SUB_REQUIRED'
class AutoJoinPriceMismatch extends AutoJoinResult { String ticketPrice; String expectedPrice; String? selectedOfferName; }
class AutoJoinError extends AutoJoinResult { String error; String? code; }

class MyStateSnapshot {   // ack لـ room:get-my-state — التفسير في 20-game-state-core.md
  SnapshotPlayer player; String phase; bool isRemote; bool allowPlayerInvites; bool rolesConfirmed;
  Map<String,dynamic>? votingState; int maxPenalties; bool mafiaChatEnabled;
  Map<String,dynamic>? justificationData; Map<String,dynamic>? withdrawalState; Map<String,dynamic>? discussionState;
  NightStateSnapshot? nightState; Map<String,dynamic>? pendingResolution; Map<String,dynamic>? assassinContracts;
  Map<String,dynamic>? sibling; String? winner; List<RosterEntry> rosterInfo;
  List<Map<String,dynamic>>? allPlayers; List<Map<String,dynamic>>? playersInfo; int? round; }
class SnapshotPlayer { int physicalId; String name; String? role; bool isAlive; String? gender; int? playerId; int penalties; }
class NightStateSnapshot { String? nightStep; String? autoNightStepRole; int? autoNightPerformerId; NightConfig config; bool playerSubmitted; }
class NightConfig { int autoNightTime; }
class RosterEntry { int physicalId; String name; String? avatarUrl; bool isAlive; String? gender; String? rankTier; }

class HostedRoomResponse { String roomId; String roomCode; }
class CreateRemoteRoomResponse { String roomId; String roomCode; String displayPin; String gameName; String? sessionId; int maxPlayers; bool isRemote; }
class VoiceTokenResponse { String authToken; String meetingId; String participantId; String preset; }
class WithdrawVoteResponse { int count; int needed; }

// ── أحداث server→client (sealed) ──
sealed class SocketEvent {}
class GameStateSyncEvent extends SocketEvent { Map<String,dynamic> state; }
class PhaseChangedEvent extends SocketEvent { String phase; Map<String,dynamic>? state; Map<String,dynamic>? teamCounts; }
class GameStartedEvent extends SocketEvent {}
class GameOverEvent extends SocketEvent { String winner; Map<String,dynamic> raw; }
class GameRestartedEvent extends SocketEvent { Map<String,dynamic> state; }
class SessionTerminated extends SocketEvent { SessionTerminationKind kind; String? reason; }
enum SessionTerminationKind { closed, roomDeleted, eventClosed, kicked, kickedSelf, penaltyEjected }
class PlayerDisconnectedEvent extends SocketEvent { int physicalId; bool isLeader; }
class PenaltyRecordedEvent extends SocketEvent { int physicalId; int penalties; int maxPenalties; String message; bool isKicked; }
class SeatChangedEvent extends SocketEvent { int oldPhysicalId; int newPhysicalId; }
class RoomPlayerJoinedEvent extends SocketEvent { int physicalId; String name; int totalPlayers; int maxPlayers; String? gender; String? avatarUrl; }
class RoomConfigUpdatedEvent extends SocketEvent { Map<String,dynamic> partial; }
class RoleAssignedEvent extends SocketEvent { int physicalId; String role; List<MafiaTeamMember>? mafiaTeam; Map<String,dynamic>? sibling; }
class MafiaTeamUpdatedEvent extends SocketEvent { List<MafiaTeamMember> mafiaTeam; }
class AssassinContractsUpdateEvent extends SocketEvent { List<Map<String,dynamic>> contracts; int currentIndex; int completedCount; int totalRequired; }
class VotingStartedEvent extends SocketEvent { List<dynamic> candidates; List<dynamic> hiddenPlayers; Map<String,dynamic>? teamCounts;
  List<VotingPlayerInfo> playersInfo; Map<int,dynamic> playerVotes; int? durationSeconds; bool? mayorRevote; int? mayorPhysicalId; }
class VotingPlayerInfo { int physicalId; String name; String? avatarUrl; }
class VoteUpdateEvent extends SocketEvent { List<dynamic> candidates; int totalVotesCast; int? tieBreakerLevel; Map<int,dynamic> playerVotes; Map<String,dynamic>? leaderProxyVotes; }
class VotingCompleteEvent extends SocketEvent { List<dynamic> candidates; int totalVotesCast; }
class JustificationStartedEvent extends SocketEvent { Map<String,dynamic> raw; }
class DiscussionUpdatedEvent extends SocketEvent { Map<String,dynamic> raw; }
class ShowSilencedEvent extends SocketEvent { Map<String,dynamic> raw; }
class TieEvent extends SocketEvent { List<dynamic> tiedCandidates; }
class WithdrawalPeriodEvent extends SocketEvent { int needed; int total; List<int>? accusedIds; }
class WithdrawalUpdateEvent extends SocketEvent { int count; int needed; int total; List<dynamic>? withdrawn; }
class WithdrawalResultEvent extends SocketEvent { bool revote; }
class EliminationPendingEvent extends SocketEvent { dynamic eliminated; Map<String,dynamic>? revealedRoles; Map<String,dynamic>? winResult;
  String type; Map<String,dynamic>? pendingBomb; Map<String,dynamic>? neutralWin; bool? mayorPostponed; }
class EliminationRevealedEvent extends SocketEvent { Map<String,dynamic> raw; }
class MayorWindowEvent extends SocketEvent { dynamic winner; List<dynamic>? top2; dynamic topVotes; int mayorPhysicalId; int voteWeight; int timeoutSeconds; bool forMayor; }
class MayorWindowClosedEvent extends SocketEvent {}
class MayorRevealedEvent extends SocketEvent { Map<String,dynamic> raw; int? savedPhysicalId; }
class DealCreatedEvent extends SocketEvent { Map<String,dynamic> raw; }
class DealRemovedEvent extends SocketEvent { Map<String,dynamic> raw; }
class NightActionRequiredEvent extends SocketEvent { String actionType; List<VotingPlayerInfo> availableTargets;
  int timeoutSeconds; bool canSkip; String stepRole; bool isDecoy; }
class SheriffResultEvent extends SocketEvent { String result; int targetPhysicalId; String targetName; } // 'MAFIA'|'CITIZEN'
class NurseActivationRequestEvent extends SocketEvent { String message; }
class NightStepInfoEvent extends SocketEvent { Map<String,dynamic> raw; }
class MorningRecapEvent extends SocketEvent { Map<String,dynamic> raw; }   // raw['players'] مصفوفة
class MorningDisplayEvent extends SocketEvent { String type; int? targetPhysicalId; String? targetName; Map<String,dynamic>? extra; }
class NightAutoStartedEvent extends SocketEvent { int totalAlive; }
class GameTimerAdjustedEvent extends SocketEvent { Map<String,dynamic> raw; }
class MafiaChatMessageEvent extends SocketEvent { int physicalId; String name; String text; int at; } // at: epoch-ms
class ConfrontationPendingEvent extends SocketEvent { String status; int requesterId; String? requesterName; int targetId; String? targetName; }
class ConfrontationStartedEvent extends SocketEvent { int requesterId; int targetId; int durationSeconds; int startedAt; }
class ConfrontationEndedEvent extends SocketEvent { String reason; } // 'target_declined'|'leader_rejected'|'time_up'
// أحداث leader-only للمضيف (host console): نماذجها في 30-host-console.md
```

## 9. الحزم المستخدمة

| الحزمة | الغرض |
|---|---|
| `socket_io_client` (متوافق Socket.IO v4 — سيرفرنا v4) | الاتصال؛ ‏`setTransports(['polling','websocket'])`، ‏`emitWithAck` |
| `flutter_riverpod` | تعريض `SocketConnectionState` والـ Event Bus كـ providers |
| `freezed` + `json_serializable` | نماذج §8 (خاصة unions مثل `AutoJoinResult`) |
| `flutter_secure_storage` | قراءة التوكنات عند بناء `SocketAuthPayload` (ملكيتها في 05-session-auth.md) |
| `connectivity_plus` | مكافئ حدث `online` — مزامنة فورية عند عودة الشبكة |
| `vibration` | نمط الاهتزاز `[200,100,200]` لتوست تغيير المقعد |
| (مدمج) `WidgetsBindingObserver` | ‏`AppLifecycleState.resumed` — مكافئ visibilitychange/focus |

## 10. اختلافات Android / iOS

- **تعليق الـ sockets في الخلفية**: iOS يجمّد الاتصال والمؤقتات خلال ثوانٍ من الانتقال للخلفية؛ Android قد يمهل أطول لكن Doze يقطع أيضاً. الحل واحد للمنصتين ومبني أصلاً في البروتوكول: عند `resumed` → إعادة اتصال تلقائية (سياسة §6.2) + ‏rejoin ‏(§6.5) + استطلاع فوري (§6.9). **لا تحاول إبقاء الـ socket حياً في الخلفية على أي منصة** (foreground service على Android غير مطلوب — الـ PWA لا يفعل ذلك).
- **iOS ATS**: كلا الـ flavors (dev=staging وprod) HTTPS/WSS فلا استثناء ATS في البناءات المُصدَّرة؛ **فقط** عند التوجيه الاختياري نحو backend محلي (`http://localhost:4000`) يُضاف استثناء ATS في Info.plist لبناء debug وحده.
- **Android cleartext**: البناءات المُصدَّرة `usesCleartextTraffic=false` (تكافؤ 01 §13)؛ **فقط** للـ backend المحلي الاختياري على `http://` يُضاف `usesCleartextTraffic="true"` (أو network security config) في build ‏debug وحده.
- **الاهتزاز**: Android يتطلب إذن `android.permission.VIBRATE` في الـ manifest؛ iOS لا إذن له لكن أنماط الاهتزاز المخصصة محدودة — استخدم `vibration` مع fallback إلى `HapticFeedback.heavyImpact` إذا `hasVibrator == false`.
- **transports**: أبقِ `['polling','websocket']` على المنصتين — لا تتحول إلى websocket-only، فمسار الـ upgrade مطلوب للتوافق مع rewrites/proxy الإنتاج.

## 11. الأصول المطلوبة

- أيقونة ShieldCheck (درع بعلامة صح) لشاشة RESTORING SESSION — من حزمة أيقونات المشروع المحددة في 01-foundation-theme.md (الـ PWA يستخدم SVG مضمّناً بنمط outline). لا صور أو أصوات أخرى لهذه الطبقة.

## 12. معايير القبول — checklist تكافؤ مع النسخة الحالية

- [ ] الاتصال يتم بالمعاملات الحرفية: ‏transports ‏`['polling','websocket']`، ‏reconnection ∞، ‏delay ‏1000→5000ms، ‏timeout ‏20000ms.
- [ ] المصافحة ترسل `{ token, playerToken }` فقط — التحقق بـ backend logs أن `authPlayer` يُلصق، وأن `deviceId` غير مُرسل.
- [ ] حساب مربوط بموظف: بعد `/me` يُرسل `staffToken` كـ `token` في المصافحة ويحصل السوكيت على صلاحية leader (مكافئ PlayerContext).
- [ ] `reconnectSocketAuth` (تحديث auth + ‏disconnect + ‏connect) يعمل بعد: login، ‏change-password، استلام staffToken، ‏logout — ويُختبر أن الاتصال الجديد يحمل التوكن الجديد.
- [ ] عند كل `connect` مع جلسة غرفة محفوظة: يُرسل `room:rejoin-player { roomId, physicalId, phone }` تلقائياً (بالهاتف المطبّع `0…`) ثم `room:get-my-state` — قطع الشبكة يدوياً أثناء اللعب ثم إعادتها يستعيد الحالة خلال ≤3 ثوانٍ.
- [ ] المضيف بعد الانقطاع يستعيد صلاحياته بـ `room:rejoin-host`، وجهاز جديد بـ `room:my-hosted-room`.
- [ ] استطلاع `room:get-my-state` كل 3000ms يعمل أثناء وجود اللاعب في غرفة، ويُستطلع فوراً عند `AppLifecycleState.resumed` وعند عودة الشبكة.
- [ ] غلاف emit: مهلة 15000ms بالنص الحرفي `الخادم في وضع قطع الاتصال أو لا يستجيب (Timeout)`؛ الفشل يحمل الـ response كاملاً؛ ack callback يُمرَّر لكل الأحداث عدا `player:mafia-gallery-open`.
- [ ] `player:seat-changed`: المقعد المخزّن يتحدث فوراً، توست `تم تغيير رقمك: X ← Y` بخلفية `#C5A059` يختفي بعد 5 ثوانٍ، اهتزاز `[200,100,200]`.
- [ ] أحداث الإنهاء الخمسة (`game:closed`، `game:room-deleted`، `game:kicked`، `event:closed`، `player:kicked-self`) تصفّر الجلسة المحلية وتعيد لشاشة الدخول بالنصوص الحرفية (`تم إغلاق الغرفة` / `تم إنهاء الفعالية وإغلاق الغرفة`).
- [ ] رفض mafia chat الصامت (`{success:false}` بلا error) لا يعرض أي خطأ للمستخدم.
- [ ] شاشة RESTORING SESSION مطابقة: خلفية سوداء، أيقونة `#C5A059` تدور 360°/2s ‏linear ∞، نص `RESTORING SESSION...` بـ `#808080`.
- [ ] كل أحداث server→client في جدول §7.2 مسجَّلة على الـ Bus (اختبار: سيناريو لعبة كاملة مقابل النسخة الويب — لا حدث مفقود).
- [ ] الأحداث الفائتة أثناء الخلفية تُعوَّض من الاستطلاع خلال دورة واحدة بعد العودة (اختبار: قتل التطبيق بالخلفية أثناء انتقال طور).
- [ ] لا يوجد سوى instance واحد من الـ socket في التطبيق كله (اختبار: لا ازدواج أحداث بعد التنقل بين الشاشات).

## 13. ملاحظات أداء وأمان

- **توكن في المصافحة لا في الـ URL**: ‏`auth` تُرسل في جسم المصافحة — لا تمرر التوكن كـ query param أبداً. لا تطبع التوكنات في logs الإنتاج.
- **سرية الأدوار**: لا تخزّن الدور في كاش دائم؛ في الغرف remote السيرفر يصفّر أدوار الأحياء في كل الحمولات — لا تحاول «إكمالها» محلياً. دورك يصل فقط عبر `player:role-assigned` / ‏`room:get-my-role` / ‏`room:rejoin-player` / ‏`room:get-my-state`.
- **الـ decoy الليلي إلزامي**: تجاهل `night:action-required` عندما `isDecoy:true` يكشف الأدوار سلوكياً ويُظهر اللاعب مفقوداً عند الليدر — يجب عرض الـ picker وإرسال `player:night-action` دائماً (23-night-phase.md).
- **الرفض الصامت anti-probing**: لا تحوّل `{success:false}` في mafia chat إلى رسالة خطأ — ذلك يكشف وجود الميزة لغير المافيا.
- **listener واحد لكل حدث**: التسجيل على الـ socket مرة واحدة في الـ service؛ الشاشات تشترك في الـ Streams فقط — يمنع الازدواج والتسريب.
- **البطارية**: الاستطلاع كل 3 ثوانٍ يعمل فقط أثناء وجود اللاعب داخل غرفة نشطة (يتوقف في الشاشات العامة: الهوم، البروفايل…)، ويتوقف كلياً في الخلفية (المزامنة عند العودة تعوّض).
- **عاصفة إعادة الاتصال**: الاعتماد على backoff المدمج (1000→5000ms) — لا تضف إعادة محاولة يدوية فوق `reconnection` التلقائية، ولا تستدعِ `connect()` يدوياً إلا داخل `reconnectSocketAuth`.
- **التحقق من الحمولات**: كل حمولة واردة تمر بـ `fromJson` متسامح (حقول nullable وقيم افتراضية) — حدث بحمولة ناقصة يجب ألا يُسقط الـ Bus؛ غلّف الـ parsing بـ try/catch وسجّل الحدث المتعذر بدل رمي الاستثناء.
