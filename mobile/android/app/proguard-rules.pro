# ══════════════════════════════════════════════════════
# قواعد R8 — §13 في الملفّ ٩٠
# ══════════════════════════════════════════════════════
# 🔴 R8 يحذف ما لا يراه مُستعمَلاً. هذه الأنواع تُستدعى انعكاسياً من
#    الطبقة الأصلية أو من JSON، فحذفها يظهر عطلاً وقتَ التشغيل فقط —
#    لا في التحليل ولا في البناء.

# Flutter وقنواته
-keep class io.flutter.** { *; }
-dontwarn io.flutter.embedding.**

# Firebase Messaging — المستقبِلات تُستدعى من النظام
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

# RealtimeKit / WebRTC — الجسور الأصلية
-keep class io.dyte.** { *; }
-keep class org.webrtc.** { *; }
-dontwarn org.webrtc.**

# just_audio / ExoPlayer
-keep class com.google.android.exoplayer2.** { *; }
-dontwarn com.google.android.exoplayer2.**

# تحلية java.time لـ flutter_local_notifications
-dontwarn java.lang.invoke.**

# ── ktor داخل RealtimeKit ──
# 🔴 `IntellijIdeaDebugDetector` يستدعي `java.lang.management.*` — وهي حزمة
#    JMX من جافا المكتبيّة **غير موجودة على أندرويد إطلاقاً**. المسار
#    مُحاطٌ بـ try/catch في ktor فلا يُنفَّذ أبداً، لكنّ R8 يراه مرجعاً
#    ناقصاً ويفشل. التجاهل هو الحلّ الصحيح لا الإبقاء.
-dontwarn java.lang.management.**
-dontwarn io.ktor.util.debug.**
-dontwarn org.slf4j.**
