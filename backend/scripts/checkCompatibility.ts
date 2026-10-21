/**
 * Verifies that the deployed frontend and API answer correctly for the
 * browser mix the product targets, and that deep links resolve to the SPA
 * shell instead of a 404.
 *
 * Usage:
 *   npm run check:compatibility
 *   npm run check:compatibility -- --frontend https://... --backend https://...
 */
type Browser = {
  name: string;
  userAgent: string;
};

type Probe = {
  browser: string;
  target: string;
  url: string;
  status: number;
  ok: boolean;
  detail: string;
};

const BROWSERS: Browser[] = [
  {
    name: 'Android Chrome (entry-level Android 11)',
    userAgent:
      'Mozilla/5.0 (Linux; Android 11; SM-A125F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
  },
  {
    name: 'Android WebView (in-app browser)',
    userAgent:
      'Mozilla/5.0 (Linux; Android 12; TECNO Spark 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  },
  {
    name: 'iOS Safari (iPhone 13)',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  },
  {
    name: 'Desktop Chrome',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  },
  {
    name: 'Desktop Firefox',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  },
];

function parseArgs(argv: string[]): { frontend: string; backend: string } {
  let frontend = process.env.FRONTEND_URL ?? 'https://campaign-dp.vercel.app';
  let backend = process.env.BACKEND_URL ?? 'https://deltadp-backend.vercel.app';

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--frontend' && argv[index + 1]) {
      frontend = (argv[index + 1] as string).replace(/\/$/, '');
      index += 1;
    } else if (arg === '--backend' && argv[index + 1]) {
      backend = (argv[index + 1] as string).replace(/\/$/, '');
      index += 1;
    }
  }

  return { frontend, backend };
}

async function fetchWithTimeout(
  url: string,
  userAgent: string,
  timeoutMs = 30_000
): Promise<{ status: number; body: string; headers: Headers }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': userAgent, accept: 'text/html,application/json' },
      signal: controller.signal,
      redirect: 'follow',
    });
    const body = await response.text();
    return { status: response.status, body, headers: response.headers };
  } finally {
    clearTimeout(timer);
  }
}

async function main(): Promise<void> {
  const { frontend, backend } = parseArgs(process.argv.slice(2));
  const probes: Probe[] = [];

  const record = (
    browser: string,
    target: string,
    url: string,
    status: number,
    ok: boolean,
    detail: string
  ) => probes.push({ browser, target, url, status, ok, detail });

  for (const browser of BROWSERS) {
    // Frontend shell
    try {
      const result = await fetchWithTimeout(`${frontend}/`, browser.userAgent);
      const hasShell = result.body.includes('<div id="root">');
      record(
        browser.name,
        'frontend shell',
        `${frontend}/`,
        result.status,
        result.status === 200 && hasShell,
        hasShell ? 'SPA shell served' : 'missing #root element'
      );
    } catch (error) {
      record(
        browser.name,
        'frontend shell',
        `${frontend}/`,
        0,
        false,
        error instanceof Error ? error.message : String(error)
      );
    }

    // Deep link (client-side route) must resolve to the shell, not a 404
    try {
      const result = await fetchWithTimeout(`${frontend}/templates`, browser.userAgent);
      const hasShell = result.body.includes('<div id="root">');
      record(
        browser.name,
        'deep link',
        `${frontend}/templates`,
        result.status,
        result.status === 200 && hasShell,
        hasShell ? 'deep link resolved' : 'deep link did not return the SPA shell'
      );
    } catch (error) {
      record(
        browser.name,
        'deep link',
        `${frontend}/templates`,
        0,
        false,
        error instanceof Error ? error.message : String(error)
      );
    }

    // API health
    try {
      const result = await fetchWithTimeout(`${backend}/api/health`, browser.userAgent);
      record(
        browser.name,
        'api health',
        `${backend}/api/health`,
        result.status,
        result.status === 200,
        'API reachable'
      );
    } catch (error) {
      record(
        browser.name,
        'api health',
        `${backend}/api/health`,
        0,
        false,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  let failed = 0;
  for (const probe of probes) {
    if (!probe.ok) failed += 1;
    console.log(
      `${probe.ok ? 'PASS' : 'FAIL'}  ${probe.browser.padEnd(38)} ${probe.target.padEnd(15)} status=${probe.status} ${probe.detail}`
    );
  }

  console.log(`\n${probes.length - failed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Compatibility check crashed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
