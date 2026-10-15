import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leadToCard, renderPanel, waLink } from '../src/panel.js';
import { loadConfig } from '../src/config.js';

test('waLink codifica a mensagem', () => {
  assert.equal(waLink('5519998765432', 'Oi & tchau?'), 'https://wa.me/5519998765432?text=Oi%20%26%20tchau%3F');
  assert.equal(waLink('5519998765432'), 'https://wa.me/5519998765432');
});

test('painel: mensagem manual sem rodapé e HTML seguro', () => {
  const config = loadConfig();
  const lead = { id: 1, name: 'Loja </script><b>X', phone: '5519998765432', phone_type: 'celular', score: 80, reviews: 3,
    reasons: JSON.stringify({ kind: 'sem_site', problems: [] }) };
  const card = leadToCard(lead, config);
  assert.doesNotMatch(card.mensagem, /SAIR/);
  assert.equal(card.tipoLabel, 'Sem site');
  const html = renderPanel([card]);
  assert.equal(html.match(/<\/script>/g).length, 1); // só o fechamento real da tag
  assert.match(html, /wa\.me/);
});
