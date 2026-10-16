import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { parseCardText, searchMaps, closeMapsBrowser } from '../src/discover/maps.js';
import { browserCandidates } from '../src/browser.js';

test('parseCardText lê telefone, nota, avaliações e categoria do card', () => {
  const info = parseCardText('Loja Bela Moda\n4,6(123)\nLoja de roupas · R. do Sol, 10\nAberto ⋅ Fecha às 18:00 · (81) 99876-5432\nSite\nRotas');
  assert.equal(info.rawPhone, '(81) 99876-5432');
  assert.equal(info.rating, 4.6);
  assert.equal(info.reviews, 123);
  assert.equal(info.category, 'Loja de roupas');
  assert.equal(info.address, 'R. do Sol, 10');
  assert.equal(parseCardText('Sem fone\nPadaria · Centro\nFechado ⋅ Abre às 07:00').rawPhone, null);
  assert.equal(parseCardText('X\n5,0(1.234)\nBar · Rua A').reviews, 1234);
  const en = parseCardText("Joe's\n4.7(1,204)\nPlumber · 12 Main St\nOpen 24 hours · (512) 555-0101", 'en');
  assert.equal(en.rawPhone, '(512) 555-0101');
  assert.equal(en.reviews, 1204);
  assert.equal(en.category, 'Plumber');
});

// Página falsa no formato da lista do Google Maps, para testar o raspador sem acessar o Google
const card = (id, name, lines, site) =>
  `<div class="card"><a class="hfpxzc" aria-label="${name}" href="/maps/place/${encodeURIComponent(name)}/data=!1s0x${id}:0x${id}"></a>` +
  `<div>${lines.map((l) => `<div>${l}</div>`).join('')}${site ? `<a href="${site}">Site</a>` : ''}<a href="https://www.google.com/x">Rotas</a></div></div>`;
const LIST = `<html><body><div role="feed">
${card('a1', 'Loja Bela Moda', ['4,6(123)', 'Loja de roupas · R. do Sol, 10', 'Aberto · (81) 99876-5432'], 'https://belamoda.com.br/')}
${card('a2', 'Ateliê Sem Fone', ['4,9(8)', 'Loja de roupas · Av. Norte, 5', 'Fechado · Abre às 09:00'])}
</div><p>Você chegou ao final da lista.</p></body></html>`;
const DETAIL = `<html><body><h1>Ateliê Sem Fone</h1><button data-item-id="phone:tel:81988887777">fone</button>
<a data-item-id="authority" href="https://instagram.com/atelie">site</a></body></html>`;

const hasBrowser = (await browserCandidates()).length > 0;

test('searchMaps lê a lista e abre a ficha só de quem veio sem telefone', { skip: !hasBrowser && 'sem navegador' }, async () => {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(req.url.includes('/maps/place/') ? DETAIL : LIST);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const progress = [];
    const found = await searchMaps({
      query: 'loja de roupas em Recife, PE',
      baseUrl: `http://127.0.0.1:${server.address().port}`,
      onProgress: (p) => progress.push(p.name),
    });
    assert.equal(found.length, 2);
    const [a, b] = found;
    assert.equal(a.name, 'Loja Bela Moda');
    assert.equal(a.rawPhone, '(81) 99876-5432');
    assert.equal(a.website, 'https://belamoda.com.br/');
    assert.equal(a.placeId, 'maps:0xa1:0xa1');
    assert.equal(b.rawPhone, '81988887777'); // veio da ficha
    assert.equal(b.website, 'https://instagram.com/atelie');
    assert.deepEqual(progress, ['Loja Bela Moda', 'Ateliê Sem Fone']);
  } finally {
    server.close();
  }
});

after(() => closeMapsBrowser());
