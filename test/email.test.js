import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { baseDomain, contactLinks, decodeCfEmail, extractEmails, findEmail } from '../src/email.js';
import { emailMessage, leadToCard } from '../src/panel.js';
import { loadConfig } from '../src/config.js';

test('extractEmails: mailto, texto, Cloudflare; ignora lixo; prefere o domínio do site', () => {
  // "info@joes.com" codificado no formato do Cloudflare (chave 0x42)
  const cf = '42' + [...'info@joes.com'].map((c) => (c.charCodeAt(0) ^ 0x42).toString(16).padStart(2, '0')).join('');
  assert.equal(decodeCfEmail(cf), 'info@joes.com');
  const html = `
    <a href="mailto:Owner%40Gmail.com?subject=hi">Email</a>
    <span class="__cf_email__" data-cfemail="${cf}">[email protected]</span>
    <img src="logo@2x.png"> contato: sales [at] joes.com · noreply@joes.com · you@example.com`;
  const emails = extractEmails(html, 'https://www.joes.com/');
  assert.deepEqual(emails, ['info@joes.com', 'sales@joes.com', 'owner@gmail.com']);
  assert.equal(baseDomain('www.shop.co.uk'), 'shop.co.uk');
});

test('contactLinks acha páginas de contato do mesmo site', () => {
  const html = '<a href="/about-us">About</a><a href="https://facebook.com/contact">fb</a><a href="/services">Services</a><a href="/x">Get in touch</a>';
  assert.deepEqual(contactLinks(html, 'https://joes.com/'), ['https://joes.com/about-us', 'https://joes.com/x']);
});

test('findEmail procura na página de contato quando a inicial não tem e-mail', async () => {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(req.url === '/contact-us' ? '<p>Write to hello@site.test</p>' : '<a href="/contact-us">Contact</a>');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    assert.equal(await findEmail(`http://127.0.0.1:${server.address().port}/`), 'hello@site.test');
  } finally {
    server.close();
  }
});

test('lead internacional vira card de e-mail com assunto e mensagem em inglês', () => {
  const config = loadConfig();
  const lead = { id: 9, name: "Joe's Plumbing - Austin", lang: 'en', email: 'info@joes.com', raw_phone: '+1 512-555-0100', city: 'Austin, TX, USA' };
  const card = leadToCard(lead, config);
  assert.equal(card.canal, 'email');
  assert.equal(card.email, 'info@joes.com');
  assert.equal(card.assunto, "Quick idea for Joe's Plumbing");
  assert.match(card.mensagem, /^Hi Joe's Plumbing team!/);
  assert.match(card.mensagem, /unsubscribe/);
  assert.equal(card.telefoneFmt, '+1 512-555-0100');
  assert.equal(emailMessage(lead, config).assunto, card.assunto);
  assert.equal(leadToCard({ id: 1, name: 'Padaria', phone: '5581999990001' }, config).canal, 'whatsapp');
});
