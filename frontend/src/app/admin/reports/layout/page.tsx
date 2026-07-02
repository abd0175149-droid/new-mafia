'use client';
import dynamic from 'next/dynamic';

const PrintLayoutEditor = dynamic(() => import('../components/PrintLayoutEditor'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-[9999] bg-gray-950 flex items-center justify-center">
      <div className="animate-spin h-10 w-10 border-4 border-amber-500 border-t-transparent rounded-full" />
    </div>
  ),
});

export default function PrintLayoutPage() {
  return <PrintLayoutEditor />;
}
