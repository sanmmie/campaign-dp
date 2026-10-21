/**
 * Polls the deployed endpoints and reports latency and status.
 *
 * Usage:
 *   npm run check:uptime                       # production defaults
 *   npm run check:uptime -- --base https://...  # another deployment
 *   npm run check:uptime -- --samples 10
 *
 * Exits with code 1 when a check fails so it can gate a deployment.
 */
type CheckResult = {
  name: string;
  ok: boolean;
  status: number;
  minMs: number;
  medianMs: number;
  maxMs: number;
  error?: string;
};

type Options = {
  base: string;
  samples: number;
  timeoutMs: number;
};

function parseArgs(argv: string[]): Options {
  const options: Options = {
    base: process.env.UPTIME_BASE_URL ?? 'https://deltadp-backend.vercel.app',
    samples: 3,
    timeoutMs: 15_000,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--base' && argv[index + 1]) {
      options.base = (argv[index + 1] as string).replace(/\/$/, '');
      index += 1;
    } else if (arg === '--samples' && argv[index + 1]) {
      options.samples = Math.max(1, Number(argv[index + 1]) || 1);
      index += 1;
    } else if (arg === '--timeout' && argv[index + 1]) {
      options.timeoutMs = Math.max(1000, Number(argv[index + 1]) || 15_000);
      index += 1;
    }
  }

  return options;
}

async function probe(
  url: string,
  timeoutMs: number
): Promise<{ status: number; latencyMs: number }> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    return { status: response.status, latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

async function run(options: Options): Promise<CheckResult[]> {
  const endpoints = [
    { name: 'health', path: '/api/health', expect: 200 },
    { name: 'templates', path: '/api/templates', expect: 200 },
    { name: 'share config', path: '/api/share/config', expect: 200 },
    { name: 'subscriptions plans', path: '/api/subscriptions/plans', expect: 200 },
  ];

  const results: CheckResult[] = [];

  for (const endpoint of endpoints) {
    const url = `${options.base}${endpoint.path}`;
    const latencies: number[] = [];
    let status = 0;
    let error: string | undefined;

    for (let sample = 0; sample < options.samples; sample++) {
      try {
        const result = await probe(url, options.timeoutMs);
        status = result.status;
        latencies.push(result.latencyMs);
      } catch (caught) {
        error = caught instanceof Error ? caught.message : String(caught);
      }
    }

    latencies.sort((a, b) => a - b);
    const median = latencies.length
      ? latencies[Math.floor(latencies.length / 2)] ?? 0
      : 0;

    results.push({
      name: endpoint.name,
      ok: status === endpoint.expect && !error,
      status,
      minMs: latencies[0] ?? 0,
      medianMs: median,
      maxMs: latencies[latencies.length - 1] ?? 0,
      error,
    });
  }

  return results;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  console.log(`Uptime check against ${options.base} (${options.samples} sample(s) each)\n`);

  const results = await run(options);
  let failed = 0;

  for (const result of results) {
    if (!result.ok) failed += 1;
    const detail = result.error ? ` (${result.error})` : '';
    console.log(
      `${result.ok ? 'PASS' : 'FAIL'}  ${result.name.padEnd(22)} status=${result.status} min=${result.minMs}ms median=${result.medianMs}ms max=${result.maxMs}ms${detail}`
    );
  }

  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Uptime check crashed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
