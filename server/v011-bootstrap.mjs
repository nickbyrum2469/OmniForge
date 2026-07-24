import http from 'node:http';
import { handleV011Request } from './v011-api.mjs';

const previousCreateServer = http.createServer.bind(http);
http.createServer = listener => previousCreateServer(async (req, res) => {
  if (res.writableEnded) return;
  const handled = await handleV011Request(req, res);
  if (!handled && !res.writableEnded) return listener(req, res);
});

await import('./v010-bootstrap.mjs');
