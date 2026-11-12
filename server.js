import { createReadStream, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = process.cwd();
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8' };
const server = createServer((request, response) => {
  const path = request.url === '/' ? '/index.html' : request.url.split('?')[0];
  const file = normalize(join(root, path));
  if (!file.startsWith(root) || !existsSync(file)) { response.writeHead(404).end('Not found'); return; }
  response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store' });
  createReadStream(file).pipe(response);
});
const port = Number(process.env.PORT || 3000);
server.listen(port, () => console.log(`Carriage Watch running at http://localhost:${port}`));
