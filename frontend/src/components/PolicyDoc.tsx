'use client';

// ══════════════════════════════════════════════════════
// 📜 عارضُ الوثائق — سياسة الخصوصيّة وشروط الاستخدام
//
// 🔴 النصُّ يُجلب من الخادم لا يُكتب هنا: نسخةُ الوثيقة مربوطةٌ بموافقة اللاعب،
//    ونصٌّ في الواجهة يتغيّر مع كلّ نشر يجعل «وافق على النسخة ١٫٠» بلا معنى.
//
// عارضُ Markdown مبسّطٌ عمداً — عناوينُ وقوائمُ وجداولُ وغليظ. لا مكتبةَ لهذا.
// ══════════════════════════════════════════════════════

import { useEffect, useState } from 'react';

export interface PolicyDocument {
  kind: 'privacy' | 'terms';
  version: string;
  lang: string;
  title: string;
  body: string;
  changeSummary?: string;
  publishedAt?: string;
}

/** غليظٌ ورمزٌ داخل السطر */
function inline(t: string, key: string) {
  const parts = t.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return <strong key={`${key}-${i}`} className="text-white font-bold">{p.slice(2, -2)}</strong>;
    }
    if (p.startsWith('`') && p.endsWith('`')) {
      return (
        <code key={`${key}-${i}`} dir="ltr"
          className="font-mono text-[.85em] px-1 py-0.5 rounded"
          style={{ background: 'rgba(255,255,255,.05)', color: '#C5A059' }}>
          {p.slice(1, -1)}
        </code>
      );
    }
    return <span key={`${key}-${i}`}>{p}</span>;
  });
}

export function PolicyBody({ body }: { body: string }) {
  const lines = body.split('\n');
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  let table: string[][] = [];

  const flushList = (k: string) => {
    if (!list.length) return;
    out.push(
      <ul key={k} className="my-3 pr-5 space-y-2">
        {list.map((li, i) => (
          <li key={i} className="text-[14px] leading-[1.95] text-gray-300 list-disc marker:text-amber-500/70">
            {inline(li, `${k}-${i}`)}
          </li>
        ))}
      </ul>,
    );
    list = [];
  };
  const flushTable = (k: string) => {
    if (!table.length) return;
    const [head, ...rows] = table;
    out.push(
      <div key={k} className="my-4 overflow-x-auto rounded-xl" style={{ border: '1px solid rgba(255,255,255,.08)' }}>
        <table className="w-full text-[13px]" style={{ borderCollapse: 'collapse', minWidth: 320 }}>
          <thead>
            <tr>{head.map((c, i) => (
              <th key={i} className="px-3 py-2 text-right font-bold"
                style={{ color: '#C5A059', background: 'rgba(255,255,255,.04)', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
                {c}
              </th>
            ))}</tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>{r.map((c, ci) => (
                <td key={ci} className="px-3 py-2 text-gray-300 align-top"
                  style={{ borderBottom: '1px solid rgba(255,255,255,.05)' }}>
                  {inline(c, `t-${ri}-${ci}`)}
                </td>
              ))}</tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    table = [];
  };

  lines.forEach((raw, i) => {
    const t = raw.trim();
    const k = `l${i}`;

    if (t.startsWith('|')) {
      const cells = t.split('|').slice(1, -1).map(c => c.trim());
      if (cells.every(c => /^-+$/.test(c))) return;    // سطرُ الفصل
      flushList(k);
      table.push(cells);
      return;
    }
    flushTable(k + 'T');

    if (t.startsWith('- ')) { list.push(t.slice(2)); return; }
    flushList(k + 'L');

    if (/^\d+\.\s/.test(t)) { list.push(t.replace(/^\d+\.\s/, '')); return; }

    if (t.startsWith('## ')) {
      out.push(<h2 key={k} className="text-[19px] font-bold text-white mt-7 mb-2" style={{ fontFamily: 'Amiri, serif' }}>{t.slice(3)}</h2>);
      return;
    }
    if (t.startsWith('### ')) {
      out.push(<h3 key={k} className="text-[15px] font-bold text-amber-400/90 mt-5 mb-1.5">{t.slice(4)}</h3>);
      return;
    }
    if (!t) return;
    out.push(<p key={k} className="text-[14px] leading-[1.95] text-gray-300 my-2.5">{inline(t, k)}</p>);
  });
  flushList('endL');
  flushTable('endT');

  return <div>{out}</div>;
}

/** يجلب وثيقةً ويعرضها — يُستعمل في الصفحة العامّة وداخل البوّابة */
export function usePolicyDoc(kind: 'privacy' | 'terms') {
  const [doc, setDoc] = useState<PolicyDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    fetch(`/api/privacy/documents/${kind}`)
      .then(r => r.json())
      .then(d => { if (!dead) { if (d?.success) setDoc(d.document); else setError(d?.error || 'تعذّر الجلب'); } })
      .catch(() => { if (!dead) setError('تعذّر الاتّصال'); })
      .finally(() => { if (!dead) setLoading(false); });
    return () => { dead = true; };
  }, [kind]);

  return { doc, loading, error };
}
