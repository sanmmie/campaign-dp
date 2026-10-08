import { buildServer } from './index';

let server: Awaited<ReturnType<typeof buildServer>> | null = null;

async function getServer() {
  if (!server) {
    server = await buildServer();
    await server.ready();
  }
  return server;
}

export default async function handler(
  request: Request,
  _context: { waitUntil: (promise: Promise<unknown>) => void }
): Promise<Response> {
  const app = await getServer();
  
  const url = new URL(request.url);
  const method = request.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';
  const headers = Object.fromEntries(request.headers.entries());
  const body = request.body ? await request.arrayBuffer() : undefined;

  const response = await app.inject({
    method,
    url: url.pathname + url.search,
    headers: headers as Record<string, string>,
    payload: body ? JSON.parse(new TextDecoder().decode(body)) : undefined,
  });

  const responseHeaders = new Headers();
  Object.entries(response.headers).forEach(([key, value]) => {
    if (value !== undefined) {
      const strValue = Array.isArray(value) ? (value[0] ?? '') : String(value);
      responseHeaders.set(key, strValue);
    }
  });
  responseHeaders.set('Content-Type', 'application/json');

  return new Response(response.body, {
    status: response.statusCode,
    headers: responseHeaders,
  });
}