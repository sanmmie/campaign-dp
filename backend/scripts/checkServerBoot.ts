import 'dotenv/config';
import { buildServer } from '../src/index';

async function main() {
  try {
    const app = await buildServer();
    await app.ready();
    const routes = app.printRoutes();
    console.log('SERVER BUILT OK');
    console.log('route table lines:', routes.split('\n').length);
    console.log(routes);
    await app.close();
  } catch (error: any) {
    console.log('SERVER BUILD FAILED');
    console.log('code:', error?.code);
    console.log('message:', error?.message);
  }
  process.exit(0);
}

void main();
