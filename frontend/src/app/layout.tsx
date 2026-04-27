import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'Phygital Mafia Engine | V2.1 Noir Edition',
  description: 'نظام متطور لإدارة ألعاب المافيا الهجينة - يدمج بين التواجد الفعلي والإدارة الرقمية اللحظية (Dark Noir Edition)',
  keywords: ['mafia', 'game', 'phygital', 'مافيا', 'لعبة'],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Mafia Club',
  },
};

export const viewport: Viewport = {
  themeColor: '#050505',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

const APP_VERSION = '2.5.0';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
        <meta name="version" content={APP_VERSION} />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <script src="https://unpkg.com/@dotlottie/player-component@2.7.12/dist/dotlottie-player.mjs" type="module" />
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            var v = '${APP_VERSION}';
            var saved = localStorage.getItem('mafia_app_version');
            if (saved && saved !== v) {
              localStorage.setItem('mafia_app_version', v);
              // مسح كل الكاشات وإعادة التحميل
              if ('caches' in window) {
                caches.keys().then(function(names) {
                  names.forEach(function(name) { caches.delete(name); });
                });
              }
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function(regs) {
                  regs.forEach(function(reg) { reg.unregister(); });
                  setTimeout(function() { location.reload(true); }, 300);
                });
              } else {
                location.reload(true);
              }
              return;
            }
            localStorage.setItem('mafia_app_version', v);

            // ── تسجيل Service Worker ──
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js').then(function(reg) {
                  console.log('✅ PWA: Service Worker registered', reg.scope);
                  reg.addEventListener('updatefound', function() {
                    var newWorker = reg.installing;
                    if (newWorker) {
                      newWorker.addEventListener('statechange', function() {
                        if (newWorker.state === 'activated') {
                          console.log('🔄 PWA: New version activated — reloading...');
                          location.reload();
                        }
                      });
                    }
                  });
                  // فحص تحديث فوري
                  reg.update();
                }).catch(function(err) {
                  console.warn('⚠️ PWA: SW registration failed', err);
                });
              });
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

