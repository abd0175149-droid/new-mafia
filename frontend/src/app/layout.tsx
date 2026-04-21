import type { Metadata } from 'next';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'Phygital Mafia Engine | V2.0 Noir Edition',
  description: 'نظام متطور لإدارة ألعاب المافيا الهجينة - يدمج بين التواجد الفعلي والإدارة الرقمية اللحظية (Dark Noir Edition)',
  keywords: ['mafia', 'game', 'phygital', 'مافيا', 'لعبة'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
        <meta name="theme-color" content="#050505" />
        <meta name="version" content="2.0.0" />
        <script src="https://unpkg.com/@dotlottie/player-component@2.7.12/dist/dotlottie-player.mjs" type="module" />
      </head>
      <body className="min-h-screen bg-[#050505] text-[#808080] font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
