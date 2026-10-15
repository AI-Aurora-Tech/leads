import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import { parseWebhook, reasonDetail, startWebhook, templateFor, verifySignature, cloudClient } from '../src/cloud.js';
import { loadConfig } from '../src/config.js';

const cloud = loadConfig().cloud;

test('templateFor monta variáveis {{1}} nome e {{2}} motivo', () => {
  const lead = { name: 'Pet Amigo - Pet Shop', reasons: JSON.stringify({ kind: 'site_social', social: 'o Instagram' }) };
  assert.deepEqual(templateFor(lead, cloud), {
    name: 'aurora_prospeccao',
    language: 'pt_BR',
    bodyParams: ['Pet Amigo', 'o link de site de vocês leva para o Instagram'],
  });
  assert.equal(templateFor(lead, cloud, { followup: true }), null); // follow-up sem template configurado
  const perKind = { ...cloud, templates: { sem_site: { nome: 'aurora_sem_site', variaveis: ['nome'] } } };
  assert.deepEqual(templateFor({ name: 'X', reasons: { kind: 'sem_site' } }, perKind).bodyParams, ['X']);
});

test('reasonDetail cobre todos os tipos', () => {
  assert.match(reasonDetail({ kind: 'sem_site' }), /site próprio/);
  assert.equal(reasonDetail({ kind: 'site_problemas', problems: ['o site está lento para carregar'] }), 'o site está lento para carregar');
  assert.match(reasonDetail({ kind: 'site_ok' }), /IA/);
});

const payload = {
  object: 'whatsapp_business_account',
  entry: [{ changes: [{ value: {
    messages: [
      { from: '5519998765432', id: 'wamid.in1', timestamp: '1760000000', type: 'text', text: { body: 'Quero ver!' } },
      { from: '5519998765432', id: 'wamid.in2', timestamp: '1760000001', type: 'button', button: { text: 'Parar promoções' } },
    ],
    statuses: [{ id: 'wamid.out1', status: 'failed', recipient_id: '5519998765432', errors: [{ code: 131026, title: 'Message undeliverable' }] }],
  } }] }],
};

test('parseWebhook extrai mensagens, botões e status', () => {
  const { messages, statuses } = parseWebhook(payload);
  assert.deepEqual(messages.map((m) => m.text), ['Quero ver!', 'Parar promoções']);
  assert.equal(statuses[0].errors[0].code, 131026);
});

test('verifySignature', () => {
  const body = Buffer.from('{"a":1}');
  const sig = `sha256=${createHmac('sha256', 's3cr3t').update(body).digest('hex')}`;
  assert.ok(verifySignature(body, sig, 's3cr3t'));
  assert.ok(!verifySignature(body, sig, 'outro'));
  assert.ok(!verifySignature(body, undefined, 's3cr3t'));
});

test('webhook: verificação GET e POST assinado', async () => {
  const got = { messages: [], statuses: [] };
  const server = startWebhook({
    port: 0, verifyToken: 'tok', appSecret: 'sec', log: () => {},
    onMessage: (m) => got.messages.push(m), onStatus: (s) => got.statuses.push(s),
  });
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/webhook`;
  try {
    const ok = await fetch(`${base}?hub.mode=subscribe&hub.verify_token=tok&hub.challenge=123`);
    assert.equal(await ok.text(), '123');
    assert.equal((await fetch(`${base}?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=1`)).status, 403);

    const body = JSON.stringify(payload);
    const sig = `sha256=${createHmac('sha256', 'sec').update(body).digest('hex')}`;
    assert.equal((await fetch(base, { method: 'POST', body, headers: { 'x-hub-signature-256': 'sha256=00' } })).status, 401);
    assert.equal((await fetch(base, { method: 'POST', body, headers: { 'x-hub-signature-256': sig } })).status, 200);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(got.messages.length, 2);
    assert.equal(got.statuses.length, 1);
  } finally {
    server.close();
  }
});

test('cloudClient.sendTemplate monta o payload da Graph API', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ contacts: [{ wa_id: '5519998765432' }], messages: [{ id: 'wamid.X' }] }), { status: 200 });
  });
  const api = cloudClient({ token: 'T', phoneNumberId: '123', version: 'v23.0' });
  const res = await api.sendTemplate('5519998765432', { name: 'aurora_prospeccao', bodyParams: ['Pet Amigo', 'motivo'] });
  assert.deepEqual(res, { msgId: 'wamid.X', waId: '5519998765432' });
  assert.equal(calls[0].url, 'https://graph.facebook.com/v23.0/123/messages');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer T');
  const sent = JSON.parse(calls[0].init.body);
  assert.equal(sent.template.language.code, 'pt_BR');
  assert.deepEqual(sent.template.components[0].parameters, [{ type: 'text', text: 'Pet Amigo' }, { type: 'text', text: 'motivo' }]);
});

test('cloudClient propaga erro com código da Meta', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    new Response(JSON.stringify({ error: { message: 'Invalid OAuth access token', code: 190 } }), { status: 401 }));
  const api = cloudClient({ token: 'T', phoneNumberId: '123' });
  await assert.rejects(api.sendTemplate('55', { name: 'x' }), /\(código 190\)/);
});
