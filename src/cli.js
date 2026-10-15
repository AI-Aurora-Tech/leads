#!/usr/bin/env -S node --disable-warning=ExperimentalWarning
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { env, loadConfig } from './config.js';
import { getDb, insertLead, markSearch, searchDone, updateLead, STATUSES } from './db.js';
import { normalizePhone, formatPhone } from './phone.js';
import { analyzeSite, scoreLead, socialHost } from './qualify.js';
import { buildMessage, buildMessageAI } from './message.js';

const HELP = `
AuroraTech Leads — prospecção automática + WhatsApp

Uso: node src/cli.js <comando> [opções]   (ou: npm run <comando> -- [opções])

  buscar       Procura empresas no Google
                 --termo "dentista"        nicho (padrão: todos os nichos do config)
                 --cidade "Campinas, SP"   cidade (padrão: todas as cidades do config)
                 --fonte places|maps       places = API oficial (precisa de chave) | maps = navegador, sem chave
                 --max 60                  máximo de resultados por busca
                 --refazer                 repete buscas já feitas

  qualificar   Analisa site/telefone de cada lead novo e calcula o score
                 --todos                   reanalisa também os já qualificados

  leads        Lista leads    --status qualificado  --top 30

  preview      Mostra as mensagens que seriam enviadas  --n 5  --ia

  enviar       Conecta no WhatsApp Web e envia para a fila, respeitando limites e horário.
               Fica rodando e monitorando respostas (Ctrl+C para parar).
                 --limite 25               limite diário (sobrescreve config)
                 --visivel                 mostra o navegador

  exportar     Gera CSV  --arquivo leads.csv  --status respondeu

  marcar       Muda status manualmente:  marcar <id> <status>

  resumo       Funil: quantos leads em cada status
`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    termo: { type: 'string' },
    cidade: { type: 'string' },
    fonte: { type: 'string' },
    max: { type: 'string' },
    refazer: { type: 'boolean' },
    todos: { type: 'boolean' },
    status: { type: 'string' },
    top: { type: 'string' },
    n: { type: 'string' },
    ia: { type: 'boolean' },
    limite: { type: 'string' },
    visivel: { type: 'boolean' },
    arquivo: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
});

const config = loadConfig();
const [cmd, ...args] = positionals;

const commands = {
  async buscar() {
    const fonte = values.fonte || config.busca.fonte;
    if (fonte === 'places' && !env.placesKey) {
      console.log('Sem GOOGLE_PLACES_API_KEY no .env — usando --fonte maps (navegador).');
    }
    const source = fonte === 'places' && env.placesKey ? 'places' : 'maps';
    const search =
      source === 'places'
        ? (await import('./discover/places.js')).searchPlaces
        : (await import('./discover/maps.js')).searchMaps;
    const termos = values.termo ? [values.termo] : config.busca.nichos;
    const cidades = values.cidade ? [values.cidade] : config.busca.cidades;
    const max = Number(values.max || config.busca.maxPorBusca);

    let totalNew = 0;
    for (const cidade of cidades) {
      for (const termo of termos) {
        const query = `${termo} em ${cidade}`;
        if (!values.refazer && searchDone(query)) {
          console.log(`↷ ${query} (já buscado — use --refazer)`);
          continue;
        }
        process.stdout.write(`🔎 ${query} ... `);
        try {
          const found = await search({ query, apiKey: env.placesKey, max });
          let added = 0;
          for (const p of found) {
            const phone = normalizePhone(p.rawPhone);
            if (insertLead({ ...p, phone: phone?.e164, phoneType: phone?.type, city: cidade, query })) added++;
          }
          markSearch(query, source, found.length);
          totalNew += added;
          console.log(`${found.length} encontrados, ${added} novos`);
        } catch (err) {
          console.log(`erro: ${err.message}`);
        }
      }
    }
    console.log(`\n✅ ${totalNew} leads novos. Próximo passo: npm run qualificar`);
  },

  async qualificar() {
    const db = getDb();
    const rows = db
      .prepare(`SELECT * FROM leads WHERE status ${values.todos ? "IN ('novo', 'qualificado', 'descartado')" : "= 'novo'"} AND phone IS NOT NULL`)
      .all();
    console.log(`Analisando ${rows.length} leads...`);
    const minScore = config.qualificacao.scoreMinimo;
    let ok = 0;
    const queue = [...rows];
    const worker = async () => {
      for (let lead; (lead = queue.shift()); ) {
        const site = lead.website && !socialHost(lead.website) ? await analyzeSite(lead.website, config.qualificacao.timeoutSiteMs) : null;
        const { score, reasons } = scoreLead(lead, site);
        const status = score >= minScore ? 'qualificado' : 'descartado';
        if (status === 'qualificado') ok++;
        updateLead(lead.id, { score, reasons: JSON.stringify(reasons), status });
        console.log(`  ${String(score).padStart(3)}  ${reasons.kind.padEnd(14)} ${lead.name}`);
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
    console.log(`\n✅ ${ok} qualificados (score ≥ ${minScore}). Veja: npm run preview`);
  },

  leads() {
    const top = Number(values.top || 30);
    const rows = getDb()
      .prepare(`SELECT * FROM leads ${values.status ? 'WHERE status = ?' : ''} ORDER BY score DESC NULLS LAST, id DESC LIMIT ?`)
      .all(...(values.status ? [values.status, top] : [top]));
    for (const l of rows) {
      const kind = l.reasons ? JSON.parse(l.reasons).kind : '';
      console.log(
        `#${String(l.id).padEnd(5)} ${String(l.score ?? '-').padStart(3)}  ${l.status.padEnd(12)} ${(l.phone ? formatPhone(l.phone) : '-').padEnd(16)} ${kind.padEnd(14)} ${l.name}`,
      );
    }
  },

  async preview() {
    const n = Number(values.n || 5);
    const rows = getDb().prepare("SELECT * FROM leads WHERE status = 'qualificado' ORDER BY score DESC LIMIT ?").all(n);
    if (!rows.length) console.log('Nenhum lead qualificado. Rode buscar + qualificar.');
    for (const l of rows) {
      const text = values.ia ? await buildMessageAI(l, config) : buildMessage(l, config);
      console.log(`\n━━━ #${l.id} ${l.name} · ${formatPhone(l.phone)} · score ${l.score}\n${text}`);
    }
  },

  async enviar() {
    const { runSender } = await import('./sender.js');
    await runSender(config, { limit: values.limite ? Number(values.limite) : undefined, visible: values.visivel });
  },

  exportar() {
    const file = values.arquivo || 'leads.csv';
    const rows = getDb()
      .prepare(`SELECT * FROM leads ${values.status ? 'WHERE status = ?' : ''} ORDER BY score DESC NULLS LAST`)
      .all(...(values.status ? [values.status] : []));
    const cols = ['id', 'status', 'score', 'name', 'phone', 'phone_type', 'category', 'city', 'address', 'website', 'rating', 'reviews', 'maps_url', 'sent_at', 'replied_at', 'reply_text', 'notes'];
    const esc = (v) => (v == null ? '' : `"${String(v).replace(/"/g, '""')}"`);
    const csv = [cols.join(';'), ...rows.map((r) => cols.map((c) => esc(r[c])).join(';'))].join('\n');
    writeFileSync(file, `﻿${csv}`);
    console.log(`✅ ${rows.length} leads exportados para ${file}`);
  },

  marcar() {
    const [id, status] = args;
    if (!id || !STATUSES.includes(status)) {
      console.log(`Uso: marcar <id> <status>\nStatus válidos: ${STATUSES.join(', ')}`);
      process.exitCode = 1;
      return;
    }
    updateLead(Number(id), { status });
    console.log(`#${id} → ${status}`);
  },

  resumo() {
    const rows = getDb().prepare('SELECT status, COUNT(*) AS n FROM leads GROUP BY status').all();
    const map = Object.fromEntries(rows.map((r) => [r.status, r.n]));
    for (const s of STATUSES) console.log(`${s.padEnd(14)} ${map[s] ?? 0}`);
  },
};

if (!cmd || values.help || !commands[cmd]) {
  console.log(HELP);
} else {
  await commands[cmd]();
}
