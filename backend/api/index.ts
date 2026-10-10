import { buildServer } from '../src/index';

type Server = Awaited<ReturnType<typeof buildServer>>;

let server: Server | null = null;

async function getServer(): Promise<Server> {
  if (!server) {
    server = await buildServer();
    await server.ready();
  }
  return server;
}

async function readBody(request: Request): Promise<string | undefined> {
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return await request.text();
  }

  if (
    contentType.includes('multipart/form-data') ||
    contentType.includes('application/octet-stream')
  ) {
    const buffer = await request.arrayBuffer();
    return buffer.byteLength ? Buffer.from(buffer).toString('base64') : undefined;
  }

  return await request.text();
}

async function handleRequest(request: Request): Promise<Response> {
  try {
    const app = await getServer();

    const url = new URL(request.url);
    const method = request.method as
      | 'GET'
      | 'POST'
      | 'PUT'
      | 'DELETE'
      | 'PATCH'
      | 'OPTIONS'
      | 'HEAD';
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const body = await readBody(request);

    // Pass body as-is for Fastify inject (string for JSON, string for others)
    const payload = body;

    // Ensure content-type is set for JSON payloads
    if (typeof body === 'string' && body.trim().startsWith('{')) {
      headers['content-type'] = 'application/json';
    }

    const response = await app.inject({
      method,
      url: url.pathname + url.search,
      headers,
      payload,
    });

    const responseHeaders = new Headers();
    for (const [key, value] of Object.entries(response.headers)) {
      if (value !== undefined) {
        const strValue = Array.isArray(value) ? (value[0] ?? '') : String(value);
        responseHeaders.set(key, strValue);
      }
    }

    return new Response(response.body, {
      status: response.statusCode,
      headers: responseHeaders,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}

export function GET(request: Request): Promise<Response> {
  return handleRequest(request);
}
export function POST(request: Request): Promise<Response> {
  return handleRequest(request);
}
export function PUT(request: Request): Promise<Response> {
  return handleRequest(request);
}
export function DELETE(request: Request): Promise<Response> {
  return handleRequest(request);
}
export function PATCH(request: Request): Promise<Response> {
  return handleRequest(request);
}
export function OPTIONS(request: Request): Promise<Response> {
  return handleRequest(request);
}
export function HEAD(request: Request): Promise<Response> {
  return handleRequest(request);
}