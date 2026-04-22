const http = require('http');
const https = require('https');

const TARGET = 'club-mafia.grade.sbs';
const PORT = 3000;

const server = http.createServer((req, res) => {
  const options = {
    hostname: TARGET,
    port: 443,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: TARGET,
      // Remove encoding headers so we get plain text back
      'accept-encoding': 'identity',
    },
  };

  // Remove local-only headers
  delete options.headers['connection'];

  const proxy = https.request(options, (proxyRes) => {
    // Copy headers but fix content-related ones
    const headers = { ...proxyRes.headers };
    delete headers['content-security-policy'];
    delete headers['strict-transport-security'];
    
    res.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(res);
  });

  proxy.on('error', (err) => {
    console.error('Proxy error:', err.message);
    if (!res.headersSent) {
      res.writeHead(502);
      res.end('Proxy Error: ' + err.message);
    }
  });

  req.pipe(proxy);
});

server.listen(PORT, () => {
  console.log(`🔀 Proxy running: http://localhost:${PORT} → https://${TARGET}`);
  console.log('   Ready for TestSprite...');
});
