import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ROOT } from './config.js';

export const STATUSES = [
  'novo', // encontrado, ainda não qualificado
  'qualificado', // pronto para envio
  'descartado', // score baixo / sem telefone válido
  'sem_whatsapp', // número não tem WhatsApp
  'enviado', // 1ª mensagem enviada
  'followup', // follow-up enviado
  'respondeu', // lead respondeu — trabalhar manualmente!
  'contatado', // você mandou mensagem manualmente pelo painel
  'optout', // pediu para não receber mais
  'erro',
];

let db;

export function getDb(file = join(ROOT, 'data', 'leads.db')) {
  if (db) return db;
  if (file !== ':memory:') mkdirSync(join(ROOT, 'data'), { recursive: true });
  db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      place_id TEXT UNIQUE,
      name TEXT NOT NULL,
      phone TEXT UNIQUE,
      wa_id TEXT,
      phone_type TEXT,
      raw_phone TEXT,
      address TEXT,
      city TEXT,
      category TEXT,
      website TEXT,
      rating REAL,
      reviews INTEGER,
      maps_url TEXT,
      source TEXT,
      query TEXT,
      score INTEGER,
      reasons TEXT,
      status TEXT NOT NULL DEFAULT 'novo',
      message TEXT,
      sent_at TEXT,
      followup_at TEXT,
      replied_at TEXT,
      reply_text TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL REFERENCES leads(id),
      direction TEXT NOT NULL,
      body TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS searches (
      query TEXT PRIMARY KEY,
      source TEXT,
      found INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  // Migrações de colunas adicionadas depois da 1ª versão
  const cols = new Set(db.prepare('PRAGMA table_info(leads)').all().map((c) => c.name));
  if (!cols.has('wa_id')) db.exec('ALTER TABLE leads ADD COLUMN wa_id TEXT');
  if (!cols.has('wa_msg_id')) db.exec('ALTER TABLE leads ADD COLUMN wa_msg_id TEXT');
  if (!cols.has('channel')) db.exec('ALTER TABLE leads ADD COLUMN channel TEXT');
  // 1 = número tem WhatsApp, 0 = não tem, NULL = não verificado
  if (!cols.has('wa_check')) db.exec('ALTER TABLE leads ADD COLUMN wa_check INTEGER');
  db.exec('CREATE INDEX IF NOT EXISTS idx_leads_wa_msg ON leads(wa_msg_id)');
  return db;
}

export function findLeadByMsgId(msgId) {
  return getDb().prepare('SELECT * FROM leads WHERE wa_msg_id = ?').get(msgId);
}

/** Insere um lead se o place_id e o telefone ainda não existem. Retorna true se inseriu. */
export function insertLead(lead) {
  const res = getDb()
    .prepare(
      `INSERT OR IGNORE INTO leads
        (place_id, name, phone, phone_type, raw_phone, address, city, category, website, rating, reviews, maps_url, source, query, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      lead.placeId ?? null,
      lead.name,
      lead.phone ?? null,
      lead.phoneType ?? null,
      lead.rawPhone ?? null,
      lead.address ?? null,
      lead.city ?? null,
      lead.category ?? null,
      lead.website ?? null,
      lead.rating ?? null,
      lead.reviews ?? null,
      lead.mapsUrl ?? null,
      lead.source ?? null,
      lead.query ?? null,
      lead.phone ? 'novo' : 'descartado',
    );
  return res.changes > 0;
}

export function updateLead(id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const sets = keys.map((k) => `${k} = ?`).join(', ');
  getDb()
    .prepare(`UPDATE leads SET ${sets}, updated_at = datetime('now') WHERE id = ?`)
    .run(...keys.map((k) => fields[k]), id);
}

export function logMessage(leadId, direction, body) {
  getDb().prepare('INSERT INTO messages (lead_id, direction, body) VALUES (?, ?, ?)').run(leadId, direction, body);
}

export function findLeadByContact(waId, number) {
  const db = getDb();
  const byWa = waId && db.prepare('SELECT * FROM leads WHERE wa_id = ?').get(waId);
  if (byWa) return byWa;
  if (!number) return undefined;
  // Celulares antigos podem estar registrados no WhatsApp sem o nono dígito
  const alt = number.length === 12 ? `${number.slice(0, 4)}9${number.slice(4)}` : number;
  return db.prepare('SELECT * FROM leads WHERE phone = ? OR phone = ?').get(number, alt);
}

export function nextFollowup(days) {
  return getDb()
    .prepare(
      `SELECT * FROM leads WHERE status = 'enviado' AND followup_at IS NULL
         AND sent_at <= ? ORDER BY sent_at LIMIT 1`,
    )
    .get(new Date(Date.now() - days * 86400_000).toISOString());
}

export function nextQualified({ onlyMobile = false } = {}) {
  return getDb()
    .prepare(
      `SELECT * FROM leads WHERE status = 'qualificado' ${onlyMobile ? "AND phone_type = 'celular'" : ''}
       ORDER BY score DESC, reviews DESC LIMIT 1`,
    )
    .get();
}

export function searchDone(query) {
  return getDb().prepare('SELECT 1 FROM searches WHERE query = ?').get(query);
}

export function markSearch(query, source, found) {
  getDb()
    .prepare('INSERT OR REPLACE INTO searches (query, source, found) VALUES (?, ?, ?)')
    .run(query, source, found);
}

export function sentToday(timeZone) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
  // sent_at é gravado em ISO UTC; compara pela data local
  const rows = getDb()
    .prepare("SELECT sent_at, followup_at FROM leads WHERE sent_at >= datetime('now', '-2 days') OR followup_at >= datetime('now', '-2 days')")
    .all();
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone });
  let n = 0;
  for (const r of rows) {
    if (r.sent_at && fmt.format(new Date(r.sent_at)) === today) n++;
    if (r.followup_at && fmt.format(new Date(r.followup_at)) === today) n++;
  }
  return n;
}

/** Leads que aparecem no painel: qualificados ou já contatados, nunca os que sabidamente não têm WhatsApp. */
export function panelLeads({ all = false } = {}) {
  return getDb()
    .prepare(
      `SELECT * FROM leads WHERE phone IS NOT NULL AND (wa_check IS NULL OR wa_check = 1)
         ${all ? "AND status NOT IN ('optout', 'sem_whatsapp')" : "AND status IN ('qualificado', 'contatado')"}
       ORDER BY (status = 'contatado'), score DESC, reviews DESC`,
    )
    .all();
}

export function setContacted(id, contacted) {
  const lead = getDb().prepare('SELECT status FROM leads WHERE id = ?').get(id);
  if (!lead || !['qualificado', 'contatado'].includes(lead.status)) return false;
  updateLead(id, contacted ? { status: 'contatado', sent_at: new Date().toISOString(), channel: 'manual' } : { status: 'qualificado', sent_at: null });
  return true;
}
