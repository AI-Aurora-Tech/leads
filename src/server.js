// Painel de leads servido localmente (http://localhost:4000). Diferente do arquivo HTML solto,
// aqui o "contatado" é gravado no banco do robô: nenhum lead aparece de novo como novo.

import { createServer } from 'node:http';
import { panelLeads, setContacted } from './db.js';
import { leadToCard, renderPanel } from './panel.js';

export function startPanelServer(config, { port = 4000, log = console.log } = {}) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/') {
      const html = renderPanel(panelLeads().map((l) => leadToCard(l, config)));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(html);
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/total') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ total: panelLeads().length }));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/contatado') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        try {
          const { id, contatado } = JSON.parse(body);
          const ok = setContacted(Number(id), Boolean(contatado));
          res.writeHead(ok ? 200 : 404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok }));
        } catch {
          res.writeHead(400).end();
        }
      });
      return;
    }
    res.writeHead(404).end();
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    // Só aceita conexões do próprio computador
    server.listen(port, '127.0.0.1', () => {
      const url = `http://localhost:${server.address().port}/`;
      log(`🌐 Painel de leads: ${url}`);
      resolve({ server, url });
    });
  });
}
