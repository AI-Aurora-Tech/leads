import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DATA_DIR, ROOT } from './config.js';

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

export function getDb(file = join(DATA_DIR, 'leads.db')) {
  if (db) return db;
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
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
  if (!cols.has('email')) db.exec('ALTER TABLE leads ADD COLUMN email TEXT');
  // 'en' = lead internacional (contato por e-mail); NULL = Brasil (WhatsApp)
  if (!cols.has('lang')) db.exec('ALTER TABLE leads ADD COLUMN lang TEXT');
  // Nome normalizado: a mesma empresa na mesma cidade não entra duas vezes (ex.: com outro telefone)
  if (!cols.has('name_key')) db.exec('ALTER TABLE leads ADD COLUMN name_key TEXT');
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_leads_wa_msg ON leads(wa_msg_id);
    CREATE INDEX IF NOT EXISTS idx_leads_name_key ON leads(name_key, city);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_email ON leads(email) WHERE email IS NOT NULL;
    CREATE TABLE IF NOT EXISTS imports (path TEXT PRIMARY KEY, mtime REAL);
  `);
  if (file !== ':memory:') importOldDatabases();
  const fill = db.prepare('UPDATE leads SET name_key = ? WHERE id = ?');
  for (const r of db.prepare('SELECT id, name FROM leads WHERE name_key IS NULL').all()) fill.run(nameKey(r.name), r.id);
  return db;
}

/** "Clínica Sorriso Ltda." → "clinicasorriso" */
export function nameKey(name = '') {
  return name
    .split(/\s[-|–]\s/)[0]
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(ltda|me|epp|eireli|s\/?a|llc|inc|ltd)\.?$/, '')
    .replace(/[^a-z0-9]/g, '');
}

const CONTACTED = ['contatado', 'enviado', 'followup', 'respondeu', 'optout'];

/**
 * Bancos de versões antigas do robô (pasta data/ dentro de cada pasta baixada, ex.: "leads-main 2").
 * Junta tudo no banco fixo: quem você já contatou numa versão antiga nunca volta como lead novo.
 */
function oldDatabases() {
  const files = new Set([join(ROOT, 'data', 'leads.db')]);
  for (const dir of new Set([dirname(ROOT), join(homedir(), 'Downloads')])) {
    try {
      for (const name of readdirSync(dir)) if (/^leads/i.test(name)) files.add(join(dir, name, 'data', 'leads.db'));
    } catch {
      // pasta inexistente ou sem permissão
    }
  }
  return [...files].filter((f) => existsSync(f));
}

function importOldDatabases() {
  for (const file of oldDatabases()) {
    const mtime = Math.max(...[file, `${file}-wal`].filter((f) => existsSync(f)).map((f) => statSync(f).mtimeMs));
    const seen = db.prepare('SELECT mtime FROM imports WHERE path = ?').get(file);
    if (seen && seen.mtime >= mtime) continue;
    try {
      const { added, contacted } = importDatabase(file);
      db.prepare('INSERT OR REPLACE INTO imports (path, mtime) VALUES (?, ?)').run(file, mtime);
      if (added || contacted) console.log(`📥 Histórico antigo importado de ${file}: ${added} leads, ${contacted} já contatados.`);
    } catch (err) {
      console.log(`⚠️  Não consegui ler o histórico antigo em ${file}: ${err.message}`);
    }
  }
}

/** Abre uma cópia do banco antigo (o original nunca é alterado, e funciona mesmo sem o arquivo -shm). */
function openCopy(file) {
  const dir = mkdtempSync(join(tmpdir(), 'aurora-import-'));
  for (const suffix of ['', '-wal']) if (existsSync(file + suffix)) copyFileSync(file + suffix, join(dir, `leads.db${suffix}`));
  return new DatabaseSync(join(dir, 'leads.db'));
}

/** Copia leads e buscas de outro banco. Status de contato (contatado, optout…) sempre prevalece. */
export function importDatabase(file) {
  const src = openCopy(file);
  try {
    const mine = new Set(db.prepare('PRAGMA table_info(leads)').all().map((c) => c.name));
    const rows = src.prepare('SELECT * FROM leads').all();
    let added = 0;
    let contacted = 0;
    for (const row of rows) {
      const keys = Object.keys(row).filter((k) => k !== 'id' && mine.has(k));
      const res = db
        .prepare(`INSERT OR IGNORE INTO leads (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`)
        .run(...keys.map((k) => row[k]));
      added += res.changes;
      if (CONTACTED.includes(row.status)) {
        const up = db
          .prepare(
            `UPDATE leads SET status = ?, sent_at = COALESCE(sent_at, ?), channel = COALESCE(channel, ?)
             WHERE (place_id = ? OR phone = ?) AND status NOT IN (${CONTACTED.map(() => '?').join(', ')})`,
          )
          .run(row.status, row.sent_at ?? null, row.channel ?? null, row.place_id ?? null, row.phone ?? null, ...CONTACTED);
        contacted += res.changes || up.changes ? 1 : 0;
      }
    }
    try {
      for (const s of src.prepare('SELECT * FROM searches').all()) {
        db.prepare('INSERT OR IGNORE INTO searches (query, source, found, created_at) VALUES (?, ?, ?, ?)').run(s.query, s.source, s.found, s.created_at);
      }
    } catch {
      // banco muito antigo, sem tabela de buscas
    }
    return { added, contacted };
  } finally {
    src.close();
  }
}

export function findLeadByMsgId(msgId) {
  return getDb().prepare('SELECT * FROM leads WHERE wa_msg_id = ?').get(msgId);
}

/**
 * Insere um lead se ainda não existe: mesmo lugar, mesmo telefone, mesmo e-mail ou mesma empresa
 * (nome) na mesma cidade contam como repetido. Retorna true se inseriu.
 */
export function insertLead(lead) {
  const key = nameKey(lead.name);
  if (key && getDb().prepare('SELECT 1 FROM leads WHERE name_key = ? AND city IS ?').get(key, lead.city ?? null)) return false;
  // Brasil precisa de telefone (WhatsApp); internacional precisa de site (de onde sai o e-mail)
  const usable = lead.lang === 'en' ? lead.website || lead.email : lead.phone;
  const res = getDb()
    .prepare(
      `INSERT OR IGNORE INTO leads
        (place_id, name, phone, phone_type, raw_phone, address, city, category, website, rating, reviews, maps_url, source, query, status,
         email, lang, name_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      usable ? 'novo' : 'descartado',
      lead.email ?? null,
      lead.lang ?? null,
      key || null,
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
// Lead do painel: Brasil com telefone (e sem "não tem WhatsApp") ou internacional com e-mail
const PANEL_CONTACT = `((lang IS NULL AND phone IS NOT NULL AND (wa_check IS NULL OR wa_check = 1)) OR (lang = 'en' AND email IS NOT NULL))`;

export function panelLeads({ all = false } = {}) {
  return getDb()
    .prepare(
      `SELECT * FROM leads WHERE ${PANEL_CONTACT}
         ${all ? "AND status NOT IN ('optout', 'sem_whatsapp')" : "AND status IN ('qualificado', 'contatado')"}
       ORDER BY (status = 'contatado'), score DESC, reviews DESC`,
    )
    .all();
}

/**
 * Leads de hoje prontos para contato (já contatados contam).
 * Brasil: celulares sem "não tem WhatsApp". Internacional (lang 'en'): com e-mail.
 */
export function leadsToday(lang) {
  const contact =
    lang === 'en'
      ? "lang = 'en' AND email IS NOT NULL"
      : "lang IS NULL AND phone_type = 'celular' AND (wa_check IS NULL OR wa_check = 1)";
  return getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM leads WHERE ${contact}
         AND status IN ('qualificado', 'contatado') AND date(created_at, 'localtime') = date('now', 'localtime')`,
    )
    .get().n;
}

export function setContacted(id, contacted) {
  const lead = getDb().prepare('SELECT status FROM leads WHERE id = ?').get(id);
  if (!lead || !['qualificado', 'contatado'].includes(lead.status)) return false;
  updateLead(id, contacted ? { status: 'contatado', sent_at: new Date().toISOString(), channel: 'manual' } : { status: 'qualificado', sent_at: null });
  return true;
}
