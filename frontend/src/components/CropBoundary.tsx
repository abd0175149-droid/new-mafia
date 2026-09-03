'use client';

// ══════════════════════════════════════════════════════
// 🛡️ حاجزُ واجهة قصّ الصورة
//
// 🔴 خطأٌ واحدٌ في القصّ كان يُسقط **التطبيق كلَّه**: يخرج من شجرة React
//    فيلتقطه حاجزُ Next.js الجذريّ ويعرض «Application error: a client-side
//    exception has occurred» على شاشةٍ سوداء — واللاعبُ لا يفهم أنّ سببها
//    محاولةُ تغيير صورةٍ، ولا يجد طريقاً للعودة إلا إغلاق التطبيق.
//    بُلّغ عنه فعلاً من تطبيقٍ مثبَّتٍ على iOS.
//
//    الآن: يبقى الخطأ داخل هذه الورقة، ويرى اللاعبُ رسالةً ومخرجاً.
//
// 🔴 ونصُّ الخطأ يُعرض ولا يُخفى: الجهازُ عند اللاعب لا عندنا، ولا سبيلَ إلى
//    طرفيّته. فالرسالةُ التي يصوّرها هي كلُّ ما نملك لتشخيص العطب التالي.
// ══════════════════════════════════════════════════════

import React from 'react';

interface Props { children: React.ReactNode; onClose: () => void }
interface State { msg: string | null }

export class CropBoundary extends React.Component<Props, State> {
  state: State = { msg: null };

  static getDerivedStateFromError(error: unknown): State {
    const e = error as any;
    return { msg: String(e?.message || e || 'خطأ غير معروف').slice(0, 200) };
  }

  componentDidCatch(error: Error) {
    console.error('🛡️ ImageCropper crashed:', error);
  }

  render() {
    if (this.state.msg === null) return this.props.children;
    return (
      <div
        dir="rtl"
        style={{
          position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.92)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: 24, gap: 14, textAlign: 'center',
        }}
      >
        <span style={{ fontSize: 40 }}>😕</span>
        <p style={{ color: '#fff', fontSize: 15, fontWeight: 700, margin: 0 }}>
          تعذّر تعديل الصورة على هذا الجهاز
        </p>
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12.5, lineHeight: 1.8, margin: 0 }}>
          جرّبْ صورةً أصغر أو من معرض الصور مباشرةً.
          <br />
          وإن تكرّر، أرسل هذه الرسالة للإدارة:
        </p>
        <code
          dir="ltr"
          style={{
            color: '#fbbf24', fontSize: 11, background: 'rgba(251,191,36,0.08)',
            border: '1px solid rgba(251,191,36,0.25)', borderRadius: 10,
            padding: '8px 12px', maxWidth: '100%', overflowWrap: 'anywhere',
          }}
        >
          {this.state.msg}
        </code>
        <button
          onClick={() => { this.setState({ msg: null }); this.props.onClose(); }}
          style={{
            marginTop: 6, padding: '10px 30px', borderRadius: 12, border: 'none',
            background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
            color: '#000', fontWeight: 700, fontSize: 14, cursor: 'pointer',
          }}
        >
          إغلاق
        </button>
      </div>
    );
  }
}
