#version 460 core
#include <flutter/runtime_effect.glsl>

// ══════════════════════════════════════════════════════
// 🫧 زجاجٌ سائل — شيدر انكسارٍ عدسيّ
// ══════════════════════════════════════════════════════
// ما يميّز مادّة أبل عن «ضبابٍ + شفافية» ليس الضباب بل **الانكسار**:
// الحوافّ تعمل كعدسةٍ تحني ما خلفها، فيبدو الشريط جسماً ثلاثيّ الأبعاد
// لا مستطيلاً شفّافاً. هذا ما يفعله هذا الشيدر.
//
// عقد ImageFilter.shader (dart:ui): أوّل uniform يجب أن يكون vec2 يضبطه
// المحرّك بحجم النسيج، وأوّل sampler2D يضبطه بمدخل المرشِّح (الخلفية).

uniform vec2 uSize;        // ← يضبطه المحرّك
uniform float uRadius;     // نصف قطر الكبسولة (بكسل)
uniform float uRimWidth;   // سُمك الحزام المنكسر عند الحافّة
uniform float uRefract;    // أقصى إزاحةٍ عدسيّة (بكسل)
uniform float uSpecular;   // شدّة اللمعان الحوافّيّ
uniform float uTint;       // شدّة الصبغة البيضاء
uniform sampler2D uTex;    // ← يضبطه المحرّك: الخلفية

out vec4 fragColor;

// مسافة موقَّعة إلى مستطيلٍ مستدير الزوايا: سالبة داخله، صفر على حدّه.
float sdRoundRect(vec2 p, vec2 halfSize, float r) {
  vec2 q = abs(p) - halfSize + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

void main() {
  vec2 fc = FlutterFragCoord().xy;
  vec2 hs = uSize * 0.5;
  vec2 p  = fc - hs;

  float d = sdRoundRect(p, hs, uRadius);           // <0 داخل الكبسولة

  // شدّة العدسة: صفرٌ في القلب، أقصاها عند الحافّة تماماً.
  float edge = clamp(1.0 + d / max(uRimWidth, 1.0), 0.0, 1.0);
  float lens = edge * edge * edge;                 // انحناءٌ تكعيبيّ كالزجاج

  // اتّجاه الانكسار = تدرّج دالّة المسافة (عموديّ على الحافّة).
  float e = 1.0;
  float dx = sdRoundRect(p + vec2(e, 0.0), hs, uRadius)
           - sdRoundRect(p - vec2(e, 0.0), hs, uRadius);
  float dy = sdRoundRect(p + vec2(0.0, e), hs, uRadius)
           - sdRoundRect(p - vec2(0.0, e), hs, uRadius);
  vec2 n = normalize(vec2(dx, dy) + vec2(1e-6));

  // العدسة تجرّ المحتوى من خارج الحافّة إلى داخلها.
  vec2 uv = (fc - n * lens * uRefract) / uSize;

#ifdef IMPELLER_TARGET_OPENGLES
  uv.y = 1.0 - uv.y;
#endif

  uv = clamp(uv, vec2(0.002), vec2(0.998));
  vec4 col = texture(uTex, uv);

  // لمعانٌ حوافّيّ: حزامٌ رفيع عند الحدّ، أقوى في الأعلى — مصدر ضوءٍ علويّ.
  float rim  = smoothstep(0.55, 1.0, edge);
  float top  = 1.0 - clamp(fc.y / max(uSize.y, 1.0), 0.0, 1.0);
  float spec = rim * (0.30 + 0.70 * top) * uSpecular;

  // صبغةٌ بيضاء خفيفة تعطي الجسم كثافةً بلا أن تطمس ما خلفه.
  col.rgb = mix(col.rgb, col.rgb + vec3(0.06), uTint);
  col.rgb += vec3(spec);

  fragColor = col;
}
