import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone } from '../src/phone.js';
import { spin, buildMessage, isOptOut, shortName } from '../src/message.js';
import { scoreLead, socialHost } from '../src/qualify.js';
import { inSendWindow } from '../src/schedule.js';
import { loadConfig } from '../src/config.js';

test('normalizePhone', () => {
  assert.deepEqual(normalizePhone('(19) 99876-5432'), { e164: '5519998765432', type: 'celular' });
  assert.deepEqual(normalizePhone('+55 11 3456-7890'), { e164: '551134567890', type: 'fixo' });
  assert.deepEqual(normalizePhone('019 9876-5432'), { e164: '5519998765432', type: 'celular' });
  assert.deepEqual(normalizePhone('0 15 19 99876-5432'), { e164: '5519998765432', type: 'celular' });
  assert.equal(normalizePhone('0800 123 4567'), null);
  assert.equal(normalizePhone('4004-0001'), null);
  assert.equal(normalizePhone('(20) 99876-5432'), null);
  assert.equal(normalizePhone(null), null);
});

test('spin resolve spintax aninhado', () => {
  assert.equal(spin('{a|b}', () => 0), 'a');
  assert.equal(spin('{x {1|2}|y}', () => 0), 'x 1');
  assert.equal(spin('sem chaves {nome}'), 'sem chaves {nome}');
});

test('shortName limpa nome do Google', () => {
  assert.equal(shortName('Clínica Sorriso - Dentista em Campinas'), 'Clínica Sorriso');
  assert.equal(shortName('Padaria Pão Bom LTDA'), 'Padaria Pão Bom');
});

test('isOptOut', () => {
  const w = loadConfig().optoutPalavras;
  assert.ok(isOptOut('SAIR', w));
  assert.ok(isOptOut('Não tenho interesse, obrigado', w));
  assert.ok(!isOptOut('Sim, pode mandar exemplos', w));
  assert.ok(!isOptOut('Quero saber o preço', w));
});

test('scoreLead prioriza quem não tem site', () => {
  const base = { reviews: 50, rating: 4.7, phone_type: 'celular' };
  const semSite = scoreLead({ ...base, website: null }, null);
  const insta = scoreLead({ ...base, website: 'https://instagram.com/x' }, null);
  const bom = scoreLead(
    { ...base, website: 'https://x.com.br' },
    { ok: true, https: true, hasViewport: true, loadMs: 800, hasChat: true, copyrightYear: 2026 },
    new Date('2026-10-15'),
  );
  const ruim = scoreLead(
    { ...base, website: 'http://x.com.br' },
    { ok: true, https: false, hasViewport: false, loadMs: 6000, hasChat: false, copyrightYear: 2018 },
    new Date('2026-10-15'),
  );
  assert.equal(semSite.reasons.kind, 'sem_site');
  assert.equal(insta.reasons.kind, 'site_social');
  assert.equal(insta.reasons.social, 'o Instagram');
  assert.equal(bom.reasons.kind, 'site_ok');
  assert.equal(ruim.reasons.kind, 'site_problemas');
  assert.ok(semSite.score > bom.score);
  assert.ok(ruim.score > bom.score);
  assert.equal(socialHost('https://www.facebook.com/abc'), 'o Facebook');
  assert.equal(socialHost('https://minhaempresa.com.br'), null);
});

test('buildMessage preenche variáveis e rodapé', () => {
  const config = loadConfig();
  const lead = { name: 'Pet Feliz - Pet Shop', reasons: JSON.stringify({ kind: 'site_problemas', problems: ['a', 'b', 'c'] }) };
  const msg = buildMessage(lead, config);
  assert.match(msg, /Pet Feliz/);
  assert.match(msg, /a e b/);
  assert.match(msg, /SAIR/);
  assert.doesNotMatch(msg, /\{\w+\}/);
  for (const kind of ['sem_site', 'site_social', 'site_ok']) {
    assert.doesNotMatch(buildMessage({ name: 'X', reasons: { kind } }, config), /[{}|]/);
  }
  assert.doesNotMatch(buildMessage({ name: 'X', reasons: {} }, config, { followup: true }), /[{}|]/);
});

test('inSendWindow respeita horário comercial em São Paulo', () => {
  const envio = loadConfig().envio;
  assert.ok(inSendWindow(envio, new Date('2026-10-15T13:00:00Z'))); // qui 10h BRT
  assert.ok(!inSendWindow(envio, new Date('2026-10-15T23:00:00Z'))); // qui 20h BRT
  assert.ok(!inSendWindow(envio, new Date('2026-10-17T13:00:00Z'))); // sáb
});
