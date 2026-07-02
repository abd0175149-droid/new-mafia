'use client';
import { StatCard, SectionTitle } from './shared';
import { formatCell } from '../lib/formatCell';
import type { ReportDocument, ReportSection, ReportColumn, Tone } from '../lib/reportsApi';

const toneToColor: Record<string, string> = {
  amber: 'amber', green: 'green', red: 'red', blue: 'blue', purple: 'purple', gray: 'amber',
};
const toneText: Record<string, string> = {
  amber: 'text-amber-400', green: 'text-emerald-400', red: 'text-rose-400',
  blue: 'text-blue-400', purple: 'text-purple-400', gray: 'text-gray-300',
};

function cellContent(row: Record<string, unknown>, col: ReportColumn) {
  const raw = row[col.key];
  if (col.format === 'badge') {
    return <span className="inline-block px-2 py-0.5 rounded-md bg-gray-700/60 text-gray-200 text-[11px] print:bg-gray-100 print:text-gray-800">{formatCell(raw, 'badge')}</span>;
  }
  return formatCell(raw, col.format);
}

function alignCls(a?: string) {
  return a === 'left' ? 'text-left' : a === 'center' ? 'text-center' : 'text-right';
}

function Table({ section }: { section: Extract<ReportSection, { type: 'table' }> }) {
  if (!section.rows?.length) {
    return <p className="text-center text-gray-600 py-6 text-sm">{section.emptyAr ?? 'لا توجد بيانات'}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-800 print:border-gray-300">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 bg-gray-900/60 print:bg-gray-100 print:border-gray-300">
            {section.columns.map((c) => (
              <th key={c.key} className={`${alignCls(c.align)} px-4 py-3 text-xs text-gray-400 print:text-gray-700 font-bold whitespace-nowrap`}>{c.labelAr}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {section.rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-800/40 hover:bg-gray-800/20 transition print:border-gray-200">
              {section.columns.map((c) => (
                <td key={c.key} className={`${alignCls(c.align)} px-4 py-2.5 text-gray-300 print:text-gray-800 whitespace-nowrap`}>{cellContent(row, c)}</td>
              ))}
            </tr>
          ))}
          {section.totalsRow && (
            <tr className="border-t-2 border-amber-500/40 bg-amber-500/5 font-bold">
              {section.columns.map((c) => (
                <td key={c.key} className={`${alignCls(c.align)} px-4 py-2.5 text-amber-200 print:text-black whitespace-nowrap`}>{cellContent(section.totalsRow!, c)}</td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Section({ section }: { section: ReportSection }) {
  switch (section.type) {
    case 'kpis':
      return (
        <div className="mb-6">
          {section.titleAr && <SectionTitle title={section.titleAr} icon="📊" />}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {section.items.map((k, i) => (
              <StatCard key={i} icon={k.icon ?? '•'} label={k.labelAr}
                value={formatCell(k.value, k.format)} sub={k.sub} color={toneToColor[k.tone ?? 'amber']} />
            ))}
          </div>
        </div>
      );
    case 'keyvalue':
      return (
        <div className="mb-6">
          {section.titleAr && <SectionTitle title={section.titleAr} icon="🧾" />}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {section.items.map((it, i) => (
              <div key={i} className="flex justify-between gap-2 px-3 py-2 rounded-lg bg-gray-800/30 border border-gray-800 print:border-gray-200">
                <span className="text-[11px] text-gray-500">{it.labelAr}</span>
                <span className="text-xs font-bold text-gray-200 print:text-black">{formatCell(it.value, it.format)}</span>
              </div>
            ))}
          </div>
        </div>
      );
    case 'table':
      return (
        <div className="mb-6">
          {section.titleAr && <SectionTitle title={section.titleAr} icon="📄" />}
          <Table section={section} />
        </div>
      );
    case 'group':
      return (
        <div className="mb-6">
          {section.titleAr && <h2 className="text-lg font-black text-white print:text-black border-r-4 border-amber-500 pr-3 mb-3">{section.titleAr}</h2>}
          {section.children.map((c, i) => <Section key={i} section={c} />)}
        </div>
      );
  }
}

export default function DocumentRenderer({ doc }: { doc: ReportDocument }) {
  const generated = (() => { try { return new Date(doc.header.generatedAt).toLocaleString('ar-IQ'); } catch { return doc.header.generatedAt; } })();
  return (
    <div>
      {/* رأس المستند */}
      <div className="mb-6 pb-4 border-b border-gray-800 print:border-gray-300">
        <h1 className="text-xl font-black text-white print:text-black">{doc.header.titleAr}</h1>
        {doc.header.subtitleAr && <p className="text-sm text-gray-500 mt-1">{doc.header.subtitleAr}</p>}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {(doc.header.filtersSummaryAr ?? []).filter(Boolean).map((f, i) => (
            <span key={i} className="text-[10px] bg-gray-800 text-gray-400 rounded-full px-2 py-0.5 print:bg-gray-100 print:text-gray-700">{f}</span>
          ))}
        </div>
        <p className="text-[10px] text-gray-600 mt-2">أُنشئ في: {generated}{doc.header.generatedByAr ? ` — بواسطة: ${doc.header.generatedByAr}` : ''}</p>
      </div>

      {doc.sections.map((s, i) => <Section key={i} section={s} />)}

      {/* الإجماليات */}
      {doc.totals?.length ? (
        <div className="mt-6 p-4 rounded-2xl bg-gray-800/40 border border-gray-800 print:border-gray-300 flex flex-wrap gap-6">
          {doc.totals.map((t, i) => (
            <div key={i} className="flex flex-col">
              <span className="text-[11px] text-gray-500">{t.labelAr}</span>
              <span className={`text-lg font-black ${toneText[t.tone ?? 'amber']} print:text-black`}>{formatCell(t.value, t.format)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
