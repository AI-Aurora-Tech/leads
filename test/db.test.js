import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDb, hideRepeats, importDatabase, insertLead, leadsToday, nameKey, panelLeads, setContacted, updateLead } from '../src/db.js';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyCheck, markExistingChats } from '../src/verify.js';

getDb(':memory:');

const base = { name: 'Padaria X', phoneType: 'celular', city: 'Recife, PE' };

test('não insere lead repetido (mesmo lugar ou mesmo telefone)', () => {
  assert.ok(insertLead({ ...base, name: 'Empresa p1', placeId: 'p1', phone: '5581999990001' }));
  assert.ok(!insertLead({ ...base, name: 'Empresa p1', placeId: 'p1', phone: '5581999990002' })); // mesmo lugar
  assert.ok(!insertLead({ ...base, name: 'Empresa p2', placeId: 'p2', phone: '5581999990001' })); // mesmo telefone (outra cidade/busca)
  assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM leads').get().n, 1);
});

test('contatado fica salvo no banco e continua fora da fila', () => {
  insertLead({ ...base, name: 'Empresa p3', placeId: 'p3', phone: '5581999990003' });
  const id = getDb().prepare("SELECT id FROM leads WHERE place_id = 'p3'").get().id;
  updateLead(id, { status: 'qualificado', score: 80 });
  assert.ok(setContacted(id, true));
  const lead = getDb().prepare('SELECT * FROM leads WHERE id = ?').get(id);
  assert.equal(lead.status, 'contatado');
  assert.equal(lead.channel, 'manual');
  assert.ok(panelLeads().some((l) => l.id === id)); // aparece no painel como contatado
  assert.ok(setContacted(id, false));
  assert.equal(getDb().prepare('SELECT status FROM leads WHERE id = ?').get(id).status, 'qualificado');
});

test('verificação de WhatsApp: sem WhatsApp sai do painel, com WhatsApp ganha selo', () => {
  insertLead({ ...base, name: 'Empresa p4', placeId: 'p4', phone: '5581999990004' });
  insertLead({ ...base, name: 'Empresa p5', placeId: 'p5', phone: '5581999990005' });
  const [a, b] = ['p4', 'p5'].map((p) => getDb().prepare('SELECT * FROM leads WHERE place_id = ?').get(p));
  updateLead(a.id, { status: 'qualificado' });
  updateLead(b.id, { status: 'qualificado' });
  assert.equal(applyCheck({ ...a, status: 'qualificado' }, { _serialized: '5581999990004@c.us' }), true);
  assert.equal(applyCheck({ ...b, status: 'qualificado' }, null), false);
  const ids = panelLeads().map((l) => l.id);
  assert.ok(ids.includes(a.id));
  assert.ok(!ids.includes(b.id));
  assert.equal(getDb().prepare('SELECT status, wa_check FROM leads WHERE id = ?').get(b.id).status, 'sem_whatsapp');
});

test('meta do dia conta só celulares qualificados de hoje', () => {
  const before = leadsToday();
  insertLead({ ...base, name: 'Empresa d1', placeId: 'd1', phone: '5581999990011' });
  insertLead({ ...base, name: 'Empresa d2', placeId: 'd2', phone: '558133330012', phoneType: 'fixo' });
  insertLead({ ...base, name: 'Empresa d3', placeId: 'd3', phone: '5581999990013' });
  const id = (p) => getDb().prepare('SELECT id FROM leads WHERE place_id = ?').get(p).id;
  updateLead(id('d1'), { status: 'qualificado' });
  updateLead(id('d2'), { status: 'qualificado' }); // fixo não conta
  updateLead(id('d3'), { status: 'qualificado', created_at: '2020-01-01 12:00:00' }); // de outro dia não conta
  assert.equal(leadsToday(), before + 1);
});

test('mesma empresa (nome) na mesma cidade não entra de novo, mesmo com outro telefone', () => {
  assert.equal(nameKey('Clínica Sorriso Ltda. - Dentista em Recife'), nameKey('CLINICA SORRISO'));
  assert.ok(insertLead({ ...base, name: 'Clínica Sorriso', placeId: 'n1', phone: '5581999990021' }));
  assert.ok(!insertLead({ ...base, name: 'Clinica Sorriso Ltda', placeId: 'n2', phone: '5581999990022' }));
  // cidade vizinha do mesmo estado (o Maps mostra empresas de Recife na busca de Olinda): repetido
  assert.ok(!insertLead({ ...base, name: 'Clínica Sorriso', city: 'Olinda, PE', placeId: 'n3', phone: '5581999990023' }));
  // outro estado: outra empresa
  assert.ok(insertLead({ ...base, name: 'Clínica Sorriso', city: 'Natal, RN', placeId: 'n4', phone: '5584999990024' }));
  // o mesmo profissional com o nome escrito de outro jeito
  assert.ok(insertLead({ ...base, name: 'Psicóloga Ana Souza - CRP 06/123', placeId: 'n5', phone: '5581999990025' }));
  assert.ok(!insertLead({ ...base, name: 'Ana Souza Psicologia', placeId: 'n6', phone: '5581999990026' }));
});

test('hideRepeats tira da fila quem tem o mesmo nome de alguém já contatado no estado', () => {
  const db = getDb();
  db.prepare("INSERT INTO leads (place_id, name, name_key, uf, city, phone, status) VALUES ('h1', 'Bela Moda', 'belamoda', 'PE', 'Recife, PE', '5581999990051', 'contatado')").run();
  db.prepare("INSERT INTO leads (place_id, name, name_key, uf, city, phone, status) VALUES ('h2', 'Bela Moda', 'belamoda', 'PE', 'Olinda, PE', '5581999990052', 'qualificado')").run();
  db.prepare("INSERT INTO leads (place_id, name, name_key, uf, city, phone, status) VALUES ('h3', 'Bela Moda', 'belamoda', 'RN', 'Natal, RN', '5584999990053', 'qualificado')").run();
  assert.equal(hideRepeats(), 1);
  const st = (p) => db.prepare('SELECT status FROM leads WHERE place_id = ?').get(p).status;
  assert.equal(st('h2'), 'descartado');
  assert.equal(st('h3'), 'qualificado');
});

test('importa banco de versão antiga: contatado continua contatado', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'leads-')), 'leads.db');
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE leads (id INTEGER PRIMARY KEY, place_id TEXT UNIQUE, name TEXT, phone TEXT UNIQUE, city TEXT, status TEXT, sent_at TEXT);
            CREATE TABLE searches (query TEXT PRIMARY KEY, source TEXT, found INTEGER, created_at TEXT);`);
  old.prepare("INSERT INTO leads (place_id, name, phone, city, status, sent_at) VALUES ('i1', 'Velha 1', '5581999990031', 'Recife, PE', 'contatado', '2026-10-15')").run();
  old.prepare("INSERT INTO leads (place_id, name, phone, city, status) VALUES ('i2', 'Velha 2', '5581999990032', 'Recife, PE', 'qualificado')").run();
  old.prepare("INSERT INTO searches VALUES ('padaria em Recife, PE', 'maps', 2, '2026-10-15')").run();
  old.close();
  // o lead i2 já está no banco atual como qualificado; o i1 apareceu de novo (banco novo) como qualificado
  insertLead({ ...base, name: 'Velha 1', placeId: 'i1', phone: '5581999990031' });
  const id = getDb().prepare("SELECT id FROM leads WHERE place_id = 'i1'").get().id;
  updateLead(id, { status: 'qualificado' });
  importDatabase(file);
  assert.equal(getDb().prepare("SELECT status FROM leads WHERE place_id = 'i1'").get().status, 'contatado');
  assert.equal(getDb().prepare("SELECT status FROM leads WHERE place_id = 'i2'").get().status, 'qualificado');
  assert.ok(getDb().prepare("SELECT 1 FROM searches WHERE query = 'padaria em Recife, PE'").get());
});

test('quem já tem conversa no WhatsApp vira contatado (inclusive id antigo sem o 9)', () => {
  insertLead({ ...base, name: 'Chat 1', placeId: 'c1', phone: '5581999990041' });
  insertLead({ ...base, name: 'Chat 2', placeId: 'c2', phone: '5581999990042' });
  insertLead({ ...base, name: 'Chat 3', placeId: 'c3', phone: '5581999990043' });
  for (const p of ['c1', 'c2', 'c3']) getDb().prepare("UPDATE leads SET status = 'qualificado' WHERE place_id = ?").run(p);
  assert.equal(markExistingChats(['5581999990041@c.us', '558199990042@c.us', '120363000000@g.us']), 2);
  const st = (p) => getDb().prepare('SELECT status FROM leads WHERE place_id = ?').get(p).status;
  assert.equal(st('c1'), 'contatado');
  assert.equal(st('c2'), 'contatado');
  assert.equal(st('c3'), 'qualificado');
});
