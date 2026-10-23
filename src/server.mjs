import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AppError } from '../public/shared.mjs';
import { ConfigStore } from './config.mjs';
import { askProvider, testProvider, validateTurn } from './provider.mjs';
import { ProjectStore } from './projects.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
async function readJson(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new AppError('请求需要使用 JSON。', 415);
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 8 * 1024 * 1024) throw new AppError('请求过大，请缩小图片后重试。', 413); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new AppError('请求内容不完整。'); }
}
export async function createApp({ directory = join(root, '.local'), env = process.env, fetchImpl = fetch } = {}) {
  const config = new ConfigStore(directory, env); await config.load();
  const projects = new ProjectStore(join(directory,'projects'));
  let active = false;
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      const host = req.headers.host;
      if (!host || !/^((127\.0\.0\.1)|(localhost)):\d+$/.test(host)) throw new AppError('只允许本机访问。', 403);
      const origin = `http://${host}`;
      if (req.headers.origin && req.headers.origin !== origin) throw new AppError('请求来源不受支持。', 403);
      if (!['GET', 'HEAD'].includes(req.method) && req.headers['x-yingci-request'] !== '1') throw new AppError('请求校验失败，请刷新页面。', 403);
      const url = new URL(req.url, origin);
      if (req.method === 'GET' && url.pathname === '/api/projects') return json(res,200,await projects.list());
      if (url.pathname.startsWith('/api/projects/')) {
        const id=url.pathname.slice('/api/projects/'.length);
        if(req.method==='GET') return json(res,200,await projects.get(id));
        if(req.method==='PUT') return json(res,200,await projects.save(id,await readJson(req)));
        if(req.method==='DELETE') return json(res,200,await projects.delete(id));
      }
      if (req.method === 'GET' && url.pathname === '/api/config') return json(res, 200, { ...config.public(), testMode: env.YINGCI_TEST_MODE === '1' });
      if (req.method === 'PUT' && url.pathname === '/api/config') return json(res, 200, { ...await config.save(await readJson(req)), testMode: env.YINGCI_TEST_MODE === '1' });
      if (req.method === 'POST' && url.pathname === '/api/test') {
        const candidate = config.preview(await readJson(req));
        return json(res, 200, await testProvider(candidate, { signal: AbortSignal.timeout(30_000), fetchImpl }));
      }
      if (req.method === 'POST' && url.pathname === '/api/chat') {
        if (active) throw new AppError('另一个请求正在进行，请等它结束后再发送。', 409);
        if (!config.public().configured) throw new AppError('先连接一个支持图片的 AI 模型，就可以开始自由创作。', 503, 'NOT_CONFIGURED');
        active = true;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 90_000);
        res.on('close', () => { if (!res.writableEnded) controller.abort(); });
        try {
          const turn = validateTurn(await readJson(req));
          return json(res, 200, await askProvider(config.get(), turn, { signal: controller.signal, fetchImpl }));
        }
        finally { active = false; clearTimeout(timeout); }
      }
      if (url.pathname.startsWith('/api/')) throw new AppError('没有找到这个接口。', 404);
      if (!['GET', 'HEAD'].includes(req.method)) throw new AppError('请求方法不受支持。', 405);
      let path;
      try { path = decodeURIComponent(url.pathname); } catch { throw new AppError('路径格式不正确。'); }
      const publicDir = join(root, 'public');
      const target = resolve(publicDir, `.${path === '/' ? '/index.html' : path}`);
      if (!target.startsWith(publicDir + sep) || path.includes('\\') || !MIME[extname(target)]) throw new AppError('没有找到这个文件。', 404);
      let info;
      try { info = await stat(target); } catch { throw new AppError('没有找到这个文件。', 404); }
      if (!info.isFile()) throw new AppError('没有找到这个文件。', 404);
      res.writeHead(200, { 'Content-Type': MIME[extname(target)], 'Content-Length': info.size, 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : await readFile(target));
    } catch (error) {
      if (!res.headersSent && !res.destroyed) json(res, error.status || 500, { error: error instanceof AppError ? error.message : '本机服务遇到问题，请稍后重试。', code: error.code || 'SERVER_ERROR' });
    }
  });
  server.requestTimeout = 100_000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 4328);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT 必须是 1024 到 65535 的整数。');
  const server = await createApp();
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用。请设置其他 PORT。` : '服务启动失败。'); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`映词已启动：http://127.0.0.1:${port}`));
}
