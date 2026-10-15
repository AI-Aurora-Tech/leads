import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDb, insertLead, leadsToday, panelLeads, setContacted, updateLead } from '../src/db.js';
import { applyCheck } from '../src/verify.js';

getDb(':memory:');

const base = { name: 'Padaria X', phoneType: 'celular', city: 'Recife, PE' };

test('não insere lead repetido (mesmo lugar ou mesmo telefone)', () => {
  assert.ok(insertLead({ ...base, placeId: 'p1', phone: '5581999990001' }));
  assert.ok(!insertLead({ ...base, placeId: 'p1', phone: '5581999990002' })); // mesmo lugar
  assert.ok(!insertLead({ ...base, placeId: 'p2', phone: '5581999990001' })); // mesmo telefone (outra cidade/busca)
  assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM leads').get().n, 1);
});

test('contatado fica salvo no banco e continua fora da fila', () => {
  insertLead({ ...base, placeId: 'p3', phone: '5581999990003' });
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
  insertLead({ ...base, placeId: 'p4', phone: '5581999990004' });
  insertLead({ ...base, placeId: 'p5', phone: '5581999990005' });
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
  insertLead({ ...base, placeId: 'd1', phone: '5581999990011' });
  insertLead({ ...base, placeId: 'd2', phone: '558133330012', phoneType: 'fixo' });
  insertLead({ ...base, placeId: 'd3', phone: '5581999990013' });
  const id = (p) => getDb().prepare('SELECT id FROM leads WHERE place_id = ?').get(p).id;
  updateLead(id('d1'), { status: 'qualificado' });
  updateLead(id('d2'), { status: 'qualificado' }); // fixo não conta
  updateLead(id('d3'), { status: 'qualificado', created_at: '2020-01-01 12:00:00' }); // de outro dia não conta
  assert.equal(leadsToday(), before + 1);
});
