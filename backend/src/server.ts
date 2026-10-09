import 'dotenv/config';
import { buildServer } from './index';
import { env } from './config/env';
import { prisma } from './db/prisma';

async function main(): Promise<void> {
  const app = await buildServer();
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  console.log(`Server running on http://0.0.0.0:${env.PORT}`);
}

process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

void main();