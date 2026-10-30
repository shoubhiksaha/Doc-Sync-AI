// Serves DocSync AI's public domains from Cloud Run. Cloud Run in Mumbai can't map a custom
// domain itself, so this Worker forwards each request to the environment's run.app address and
// tells the app who the caller is: x-real-ip from Cloudflare, vouched for by PROXY_SECRET
// (see core/rate-limit.ts). Redirects that name the run.app address are pointed back at the domain.

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = JSON.parse(env.ORIGINS)[url.hostname];
    if (!origin) return new Response('Not found', { status: 404 });
    const target = new URL(url.pathname + url.search, origin);

    const headers = new Headers(request.headers);
    headers.set('x-real-ip', request.headers.get('cf-connecting-ip') ?? '');
    headers.set('x-forwarded-host', url.host);
    headers.set('x-forwarded-proto', 'https');
    headers.set('x-proxy-secret', env.PROXY_SECRET);

    const response = await fetch(target, {
      method: request.method,
      headers,
      body: request.body,
      redirect: 'manual',
    });

    const location = response.headers.get('location');
    if (!location) return response;
    const next = new URL(location, target);
    if (next.host !== target.host) return response;
    next.protocol = 'https:';
    next.host = url.host;
    const rewritten = new Response(response.body, response);
    rewritten.headers.set('location', next.toString());
    return rewritten;
  },
};

export default worker;
