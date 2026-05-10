'use client';
import { useRef } from 'react';

interface Props {
  reportName: string;
  reportDescription: string;
  children: React.ReactNode;
}

export default function ReportPrintView({ reportName, reportDescription, children }: Props) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      {/* Print Button */}
      <button
        onClick={handlePrint}
        className="print:hidden flex items-center gap-2 px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-lg text-xs transition border border-gray-700"
      >
        🖨️ طباعة التقرير
      </button>

      {/* Print-only cover page + content wrapper */}
      <div ref={printRef}>
        {/* Cover Page (print only) */}
        <div className="hidden print:block print:page-break-after-always">
          <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>
            <div style={{ fontSize: '60px', marginBottom: '20px' }}>🎭</div>
            <h1 style={{ fontSize: '28px', fontWeight: 900, marginBottom: '8px', color: '#1a1a1a' }}>نادي المافيا</h1>
            <p style={{ fontSize: '13px', color: '#666', marginBottom: '40px' }}>Mafia Club — تقارير وتحليلات</p>
            <div style={{ width: '80px', height: '3px', backgroundColor: '#f59e0b', margin: '0 auto 40px' }} />
            <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#222', marginBottom: '12px' }}>{reportName}</h2>
            <p style={{ fontSize: '14px', color: '#666', maxWidth: '400px' }}>{reportDescription}</p>
            <div style={{ marginTop: '60px', fontSize: '12px', color: '#999' }}>
              <p>تاريخ التقرير: {new Date().toLocaleDateString('ar-IQ', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
              <p style={{ marginTop: '4px' }}>تم الإعداد آلياً بواسطة نظام إدارة النادي</p>
            </div>
          </div>
        </div>

        {/* Report Header (print only) */}
        <div className="hidden print:block print:mb-6">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #f59e0b', paddingBottom: '12px', marginBottom: '20px' }}>
            <div>
              <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a' }}>🎭 نادي المافيا — {reportName}</h1>
            </div>
            <div style={{ fontSize: '11px', color: '#999' }}>
              {new Date().toLocaleDateString('ar-IQ')}
            </div>
          </div>
        </div>

        {/* Content */}
        {children}

        {/* Footer (print only) */}
        <div className="hidden print:block print:mt-8" style={{ borderTop: '1px solid #ddd', paddingTop: '12px', textAlign: 'center', fontSize: '10px', color: '#999' }}>
          <p>نادي المافيا — تقرير مُعَدّ آلياً | الصفحة <span className="print-page-number" /> | {new Date().toLocaleDateString('ar-IQ')}</p>
        </div>
      </div>
    </>
  );
}
