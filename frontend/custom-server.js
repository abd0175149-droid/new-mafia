// ══════════════════════════════════════════════════════
// 🚀 Custom Standalone Server — with HTTP Proxy for /api/*
// Replaces Next.js broken standalone rewrites
// ══════════════════════════════════════════════════════
const http = require('http');
const path = require('path');
const url = require('url');

const dir = path.join(__dirname);
process.env.NODE_ENV = 'production';
process.chdir(__dirname);

const currentPort = parseInt(process.env.PORT, 10) || 3000;
const hostname = process.env.HOSTNAME || '0.0.0.0';
const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:4001';

// Parse backend URL
const backendParsed = new URL(BACKEND_URL);
const BACKEND_HOST = backendParsed.hostname;
const BACKEND_PORT = parseInt(backendParsed.port) || 4001;

console.log(`🔌 Proxy: /api/* → ${BACKEND_URL}`);
console.log(`🔌 Proxy: /socket.io/* → ${BACKEND_URL}`);
console.log(`🔌 Proxy: /uploads/* → ${BACKEND_URL}`);

// ── Load Next.js ──
const nextConfig = require('./.next/required-server-files.json').config;

// Remove rewrites to avoid double-proxying
if (nextConfig._originalRewrites) {
  nextConfig._originalRewrites = { beforeFiles: [], afterFiles: [], fallback: [] };
}

process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(nextConfig);

const { createServer: createNextServer } = require('next');
const next = createNextServer({
  dev: false,
  dir,
  conf: nextConfig,
  hostname,
  port: currentPort,
});

const nextHandler = next.getRequestHandler();

// ── Proxy function ──
function proxyRequest(req, res) {
  const options = {
    hostname: BACKEND_HOST,
    port: BACKEND_PORT,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: `${BACKEND_HOST}:${BACKEND_PORT}`,
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error('❌ Proxy error:', err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Backend unavailable' }));
    }
  });

  req.pipe(proxyReq, { end: true });
}

// ── Start server ──
next.prepare().then(() => {
  const server = http.createServer((req, res) => {
    const pathname = url.parse(req.url).pathname;

    // Proxy /api/*, /socket.io/*, /uploads/* directly to backend
    if (
      pathname.startsWith('/api/') ||
      pathname.startsWith('/socket.io/') ||
      pathname.startsWith('/uploads/')
    ) {
      return proxyRequest(req, res);
    }

    // Everything else → Next.js
    return nextHandler(req, res);
  });

  // Handle WebSocket upgrade for Socket.IO
  server.on('upgrade', (req, socket, head) => {
    const pathname = url.parse(req.url).pathname;
    if (pathname.startsWith('/socket.io/')) {
      const options = {
        hostname: BACKEND_HOST,
        port: BACKEND_PORT,
        path: req.url,
        method: req.method,
        headers: {
          ...req.headers,
          host: `${BACKEND_HOST}:${BACKEND_PORT}`,
        },
      };

      const proxyReq = http.request(options);
      proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
        socket.write(
          'HTTP/1.1 101 Switching Protocols\r\n' +
          Object.entries(proxyRes.headers)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\r\n') +
          '\r\n\r\n'
        );
        proxySocket.pipe(socket);
        socket.pipe(proxySocket);
      });

      proxyReq.on('error', (err) => {
        console.error('❌ WebSocket proxy error:', err.message);
        socket.destroy();
      });

      proxyReq.end();
    }
  });

  server.listen(currentPort, hostname, () => {
    console.log(`✅ Custom server ready on http://${hostname}:${currentPort}`);
  });
});
