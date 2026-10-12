const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  console.log('Request:', req.url);
  // Decode the URL so spaces and special characters are mapped to real filesystem names
  let decodedUrl = decodeURIComponent(req.url);
  let filePath = '.' + decodedUrl;

  // Clean query string first so "/?t=..." still resolves to index.html
  // (previously the root mapping ran before stripping the query, so any
  //  cache-busted request to "/" tried to read the "./" directory → 500).
  filePath = filePath.split('?')[0];
  if (filePath === './') filePath = './index.html';

  const extname = path.extname(filePath);
  let contentType = 'text/html';
  switch (extname) {
    case '.js': contentType = 'text/javascript'; break;
    case '.mjs': contentType = 'text/javascript'; break;
    case '.css': contentType = 'text/css'; break;
    case '.json': contentType = 'application/json'; break;
    case '.png': contentType = 'image/png'; break;
    case '.jpg': contentType = 'image/jpg'; break;
    case '.jpeg': contentType = 'image/jpeg'; break;
    case '.svg': contentType = 'image/svg+xml'; break;
    // Audio assets. Content-Type does not affect fetch().arrayBuffer() +
    // decodeAudioData(), but serving real OGGs as text/html is misleading.
    case '.ogg': contentType = 'audio/ogg'; break;
    case '.wav': contentType = 'audio/wav'; break;
    case '.mp3': contentType = 'audio/mpeg'; break;
    case '.m4a': contentType = 'audio/mp4'; break;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code == 'ENOENT') {
        res.writeHead(404);
        res.end('Not found\n');
      } else {
        res.writeHead(500);
        res.end('Server error\n');
      }
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store'
      });
      res.end(content, 'utf-8');
    }
  });
});

// Port is configurable so the app can be served on an alternate port when the
// default one is already taken (e.g. Steam's web helper binds 127.0.0.1:8080).
// Default remains 8080 to preserve existing workflows.
const PORT = Number(process.env.PORT) || 8080;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} with NO CACHE -> http://localhost:${PORT}/`);
});
