import http from 'node:http';
import { handleV010Request } from './v010-api.mjs';

const originalCreateServer = http.createServer.bind(http);
http.createServer = listener => originalCreateServer(async (req, res) => {
  if (res.writableEnded) return;
  const handled = await handleV010Request(req, res);
  if (!handled && !res.writableEnded) return listener(req, res);
});

await import('./server.mjs');
