const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const mime = {
  html: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  json: 'application/json',
  md: 'text/markdown',
  png: 'image/png',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
};

http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];
  const relPath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const filePath = path.join(root, relPath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }

    const ext = path.extname(filePath).slice(1).toLowerCase();
    res.writeHead(200, { 'Content-Type': mime[ext] || 'text/plain; charset=utf-8' });
    res.end(data);
  });
}).listen(8080, () => {
  console.log(`Server running on port 8080 from ${root}`);
});