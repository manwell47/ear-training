const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  console.log('Request:', req.url);
  // Decode the URL so spaces and special characters are mapped to real filesystem names
  let decodedUrl = decodeURIComponent(req.url);
  let filePath = '.' + decodedUrl;
  if (filePath === './') filePath = './index.html';
  
  // Clean query string
  filePath = filePath.split('?')[0];

  const extname = path.extname(filePath);
  let contentType = 'text/html';
  switch (extname) {
    case '.js': contentType = 'text/javascript'; break;
    case '.css': contentType = 'text/css'; break;
    case '.json': contentType = 'application/json'; break;
    case '.png': contentType = 'image/png'; break;
    case '.jpg': contentType = 'image/jpg'; break;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if(error.code == 'ENOENT') {
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

server.listen(8080, () => {
  console.log('Server running on port 8080 with NO CACHE');
});
