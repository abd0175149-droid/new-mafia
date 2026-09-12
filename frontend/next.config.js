/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // 🏙️ أصول شاشة القاعة ثلاثيّة الأبعاد: أسماء ثابتة ⇒ كاش سنة (تغييرُ أصلٍ = تغييرُ اسمه)
  async headers() {
    return [{ source: '/3d/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] }];
  },
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:4000';
    return [
      // تحويل طلبات API للباك إند
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      // تحويل Socket.IO للباك إند
      {
        source: '/socket.io/:path*',
        destination: `${backendUrl}/socket.io/:path*`,
      },
      // تحويل الملفات المرفوعة للباك إند
      {
        source: '/uploads/:path*',
        destination: `${backendUrl}/uploads/:path*`,
      },
      // ── 📱 ملفّا ربط التطبيق الأصليّ ──
      // يجب أن يُقدَّما من جذر الدومين بهذين المسارين بالضبط — لا nginx هنا،
      // فالتحويل من خادم Next هو الطريق. الباك إند يبنيهما من متغيّرات البيئة
      // ويردّ 404 ما لم تُضبط (ملفّ خاطئ أسوأ من غائب: أندرويد يخزّن الفشل).
      {
        source: '/.well-known/assetlinks.json',
        destination: `${backendUrl}/api/app/assetlinks`,
      },
      {
        source: '/.well-known/apple-app-site-association',
        destination: `${backendUrl}/api/app/apple-app-site-association`,
      },
    ];
  },
};

module.exports = nextConfig;

