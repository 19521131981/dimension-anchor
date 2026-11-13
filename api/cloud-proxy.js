/* 云服务同源代理（单段入口）
   ------------------------------------------------------------------
   WorkBuddy 云服务只放行它自己的域名：浏览器从别的域名直接跨域调用会拿到
   403 access_denied（已实测）。这个函数站在服务端转发，请求由我们指定
   Origin，因此云服务会放行；浏览器这边又是同源调用，没有 CORS 问题。

   路由：/api/cloud-proxy?path=<上游路径>
   由 vercel.json 的 rewrite 把 /api/cloud/<path> 转成这个形式。
   目标域名写死在代码里，不接受任何外部传入的目标，避免变成开放代理。 */

const UPSTREAM = 'https://hall-of-constellations.app.workbuddy.host';
const ALLOWED_ORIGIN = 'https://hall-of-constellations.app.workbuddy.host';

const HOP_BY_HOP = [
  'host', 'origin', 'referer', 'cookie', 'connection', 'keep-alive',
  'transfer-encoding', 'upgrade', 'content-length', 'accept-encoding'
];

function readPath(q) {
  let p = q && q.path;
  if (Array.isArray(p)) p = p.join('/');
  p = String(p || '');
  try { p = decodeURIComponent(p); } catch (e) { /* 原样用 */ }
  return p.replace(/^\/+/, '');
}

export default async function handler(req, res) {
  const path = readPath(req.query);
  if (!path) { res.status(400).json({ error: 'missing path' }); return; }

  const src = new URL(req.url, 'http://internal');
  const target = new URL(UPSTREAM + '/' + path);
  target.search = src.search.replace(/^\?/, '').replace(/path=[^&]*&?/, '') ? src.search : '';

  const headers = {};
  for (const k of Object.keys(req.headers || {})) {
    const lk = k.toLowerCase();
    if (HOP_BY_HOP.indexOf(lk) >= 0) continue;
    if (lk === 'x-forwarded-host' || lk === 'x-forwarded-proto') continue;
    headers[k] = req.headers[k];
  }
  /* 云服务按 Origin 校验，这里换成它允许的域名 */
  headers['origin'] = ALLOWED_ORIGIN;
  headers['x-forwarded-host'] = 'hall-of-constellations.app.workbuddy.host';

  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (typeof req.body === 'string') body = req.body;
    else if (req.body && typeof req.body === 'object') body = JSON.stringify(req.body);
  }

  try {
    const r = await fetch(target.toString(), { method: req.method, headers, body, redirect: 'manual' });
    const buf = Buffer.from(await r.arrayBuffer());
    const passthrough = [
      'content-type', 'cache-control', 'access-control-allow-origin',
      'access-control-allow-credentials', 'access-control-allow-headers',
      'access-control-allow-methods', 'vary', 'location', 'retry-after',
      'etag', 'last-modified'
    ];
    for (const k of passthrough) {
      const v = r.headers.get(k);
      if (v) res.setHeader(k, v);
    }
    res.status(r.status).send(buf);
  } catch (e) {
    res.status(502).json({ error: 'proxy_failed', detail: String(e && e.message || e).slice(0, 200) });
  }
}
