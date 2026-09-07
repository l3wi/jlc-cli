import { describe, expect, it } from 'bun:test';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { handleRequest } from './routes.js';

describe('search page query handling', () => {
  it('does not embed a query closing-script payload into the served HTML', async () => {
    const server = createServer((req, res) => {
      void handleRequest(req, res);
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });

    try {
      const address = server.address() as AddressInfo;
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const payload = '</script><script>globalThis.__review_xss=1</script>';
      const baseline = await fetch(baseUrl).then(response => response.text());
      for (const path of ['/', '/index.html']) {
        const url = new URL(path, baseUrl);
        url.searchParams.set('q', payload);
        const response = await fetch(url);
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
        const html = await response.text();
        expect(html).not.toContain('globalThis.__review_xss');
        expect(html).toBe(baseline);
      }
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
      });
    }
  });
});
