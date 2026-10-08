import 'dotenv/config';
import { execSync } from 'child_process';

function main(): void {
  try {
    execSync('npx prisma db push --skip-generate', { stdio: 'inherit' });
    console.log('Database push completed successfully');
  } catch (error) {
    console.error('Database push failed:', error);
    process.exit(1);
  }
}

main();
