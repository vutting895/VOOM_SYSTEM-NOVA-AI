import express from 'express';
import { resolve } from 'node:path';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT || 3000);

  // Browser APIs are served by the authenticated Cloudflare Workers.
  // Do not keep local mock routes that can report a broker as connected or
  // bypass Supabase session validation.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'api_route_not_configured' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(resolve(process.cwd(), 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(resolve(process.cwd(), 'dist/index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`VOOM NOVA frontend server listening on port ${port}`);
  });
}

startServer().catch((error) => {
  // Do not print request/session data or environment variables.
  console.error('VOOM NOVA frontend server failed to start:', error?.name || 'Error');
  process.exitCode = 1;
});
