import type { Metadata } from 'next';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'Phygital Mafia Engine | V2.1 Noir Edition',
  description: 'نظام متطور لإدارة ألعاب المافيا الهجينة - يدمج بين التواجد الفعلي والإدارة الرقمية اللحظية (Dark Noir Edition)',
  keywords: ['mafia', 'game', 'phygital', 'مافيا', 'لعبة'],
};

const APP_VERSION = '2.1.0';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
        <meta name="theme-color" content="#050505" />
        <meta name="version" content={APP_VERSION} />
        <script src="https://unpkg.com/@dotlottie/player-component@2.7.12/dist/dotlottie-player.mjs" type="module" />
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            var v = '${APP_VERSION}';
            var saved = localStorage.getItem('mafia_app_version');
            if (saved && saved !== v) {
              localStorage.setItem('mafia_app_version', v);
              location.reload();
            } else {
              localStorage.setItem('mafia_app_version', v);
            }
          })();
        `}} />
      </head>
      <body className="min-h-screen bg-[#050505] text-[#808080] font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
