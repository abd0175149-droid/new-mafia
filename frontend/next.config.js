/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
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
    ];
  },
};

module.exports = nextConfig;

