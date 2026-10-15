#!/usr/bin/env -S node --disable-warning=ExperimentalWarning
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { env, loadConfig } from './config.js';
import { getDb, insertLead, markSearch, searchDone, updateLead, STATUSES } from './db.js';
import { normalizePhone, formatPhone } from './phone.js';
import { analyzeSite, scoreLead, socialHost } from './qualify.js';
import { buildMessage, buildMessageAI } from './message.js';
import { leadToCard, manualMessage, renderPanel, waLink } from './panel.js';

const HELP = `
AuroraTech Leads — prospecção automática + WhatsApp

Uso: node src/cli.js <comando> [opções]   (ou: npm run <comando> -- [opções])

  buscar       Procura empresas no Google
                 --termo "dentista"        nicho(s) (padrão: todos os nichos do config)
                 --cidade "Campinas, SP"   cidade(s) (padrão: as cidades do config)
                 --fonte places|maps       places = API oficial (precisa de chave) | maps = navegador, sem chave
                 --max 60                  máximo de resultados por busca
                 --refazer                 repete buscas já feitas

  qualificar   Analisa site/telefone de cada lead novo e calcula o score
                 --todos                   reanalisa também os já qualificados

  gerar        Faz tudo de uma vez: busca TODOS os nichos, qualifica e abre o painel no navegador.
               O painel é atualizado a cada nicho buscado. Ex.: gerar --cidade "Campinas, SP"
               (aceita as opções do buscar; vários valores separados por ";")

  painel       Gera data/leads.html: lista de leads com botão "Abrir no WhatsApp" e mensagem pronta
                 --arquivo data/leads.html  --todos (inclui já enviados/descartados)

  leads        Lista leads    --status qualificado  --top 30

  preview      Mostra as mensagens que seriam enviadas  --n 5  --ia

  enviar       Envia para a fila, respeitando limites e horário.
               Fica rodando e monitorando respostas (Ctrl+C para parar).
                 --canal web|cloud         web = WhatsApp Web (QR code) | cloud = API oficial da Meta
                 --limite 25               limite diário (sobrescreve config)
                 --visivel                 mostra o navegador (canal web)

  cloud-teste  Testa a API oficial: mostra dados do número e, com --para, envia o template
                 --para 5519999999999      número de teste
                 --template hello_world    template a enviar (padrão: hello_world, idioma en_US)

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
    canal: { type: 'string' },
    para: { type: 'string' },
    template: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
});

const config = loadConfig();

/** Abre o arquivo no navegador padrão (Mac, Windows ou Linux). */
function openFile(file) {
  const abs = resolve(file);
  const [bin, ...argv] =
    process.platform === 'darwin' ? ['open', abs] : process.platform === 'win32' ? ['cmd', '/c', 'start', '', abs] : ['xdg-open', abs];
  try {
    spawn(bin, argv, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
    console.log(`   🌐 Abrindo ${file} no navegador... (atualize a página para ver novos leads)`);
  } catch {
    // sem navegador disponível — o caminho do arquivo já foi mostrado
  }
}
const [cmd, ...args] = positionals;

const commands = {
  async buscar({ afterEach } = {}) {
    const fonte = values.fonte || config.busca.fonte;
    if (fonte === 'places' && !env.placesKey) {
      console.log('Sem GOOGLE_PLACES_API_KEY no .env — usando --fonte maps (navegador).');
    }
    const source = fonte === 'places' && env.placesKey ? 'places' : 'maps';
    const search =
      source === 'places'
        ? (await import('./discover/places.js')).searchPlaces
        : (await import('./discover/maps.js')).searchMaps;
    // Vários valores separados por ";" — ex.: --termo "padaria;barbearia" --cidade "Campinas, SP;Sumaré, SP"
    const list = (v) => v.split(';').map((x) => x.trim()).filter(Boolean);
    const todos = (v) => !v || /^(todos|todas|tudo|all|\*)$/i.test(v.trim());
    const termos = todos(values.termo) ? config.busca.nichos : list(values.termo);
    const cidades = values.cidade ? list(values.cidade) : config.busca.cidades;
    const max = Number(values.max || (source === 'maps' ? config.busca.maxPorBuscaNavegador : config.busca.maxPorBusca));
    console.log(`${termos.length} nicho(s) × ${cidades.length} cidade(s), até ${max} empresas por busca (fonte: ${source}).`);

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
          let noPhone = 0;
          for (const p of found) {
            const phone = normalizePhone(p.rawPhone);
            if (!phone) noPhone++;
            if (insertLead({ ...p, phone: phone?.e164, phoneType: phone?.type, city: cidade, query })) added++;
          }
          if (found.length) markSearch(query, source, found.length); // vazio = tenta de novo na próxima vez
          totalNew += added;
          console.log(`${found.length} encontrados, ${added} novos${noPhone ? ` (${noPhone} sem telefone brasileiro)` : ''}`);
          if (added && afterEach) await afterEach();
        } catch (err) {
          console.log(`erro: ${err.message}`);
          if (err.name === 'BrowserMissingError') {
            process.exitCode = 1;
            return; // sem navegador nenhuma busca funciona — não adianta tentar as outras
          }
        }
      }
    }
    console.log(`\n✅ ${totalNew} leads novos.${afterEach ? '' : ' Próximo passo: npm run qualificar'}`);
  },

  async qualificar({ quiet = false } = {}) {
    const db = getDb();
    const rows = db
      .prepare(`SELECT * FROM leads WHERE status ${values.todos ? "IN ('novo', 'qualificado', 'descartado')" : "= 'novo'"} AND phone IS NOT NULL`)
      .all();
    if (!quiet) console.log(`Analisando ${rows.length} leads...`);
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
        if (!quiet) console.log(`  ${String(score).padStart(3)}  ${reasons.kind.padEnd(14)} ${lead.name}`);
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
    if (!quiet) console.log(`\n✅ ${ok} qualificados (score ≥ ${minScore}). Veja: npm run preview`);
    return ok;
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
    const canal = values.canal || config.canal;
    const { templateFor } = canal === 'cloud' ? await import('./cloud.js') : {};
    for (const l of rows) {
      if (canal === 'cloud') {
        const tpl = templateFor(l, config.cloud);
        console.log(`\n━━━ #${l.id} ${l.name} · ${formatPhone(l.phone)} · score ${l.score}`);
        console.log(tpl ? `template ${tpl.name} (${tpl.language})\n${tpl.bodyParams.map((p, i) => `  {{${i + 1}}} = ${p}`).join('\n')}` : 'sem template configurado');
        continue;
      }
      const text = values.ia ? await buildMessageAI(l, config) : buildMessage(l, config);
      console.log(`\n━━━ #${l.id} ${l.name} · ${formatPhone(l.phone)} · score ${l.score}\n${text}`);
    }
  },

  painel({ quiet = false } = {}) {
    const file = values.arquivo || 'data/leads.html';
    const rows = getDb()
      .prepare(
        `SELECT * FROM leads WHERE phone IS NOT NULL ${values.todos ? "AND status != 'optout'" : "AND status = 'qualificado'"}
         ORDER BY score DESC, reviews DESC`,
      )
      .all();
    writeFileSync(file, renderPanel(rows.map((l) => leadToCard(l, config))));
    if (!quiet) console.log(`✅ ${rows.length} leads no painel: ${file}\n   Abra no navegador (no celular, o botão abre direto o app do WhatsApp).`);
    return { file, count: rows.length };
  },

  // Busca nicho por nicho e já atualiza o painel a cada busca: dá para começar a contatar
  // enquanto o resto ainda está sendo buscado.
  async gerar() {
    values.todos = false;
    let opened = false;
    const refresh = async () => {
      const ok = await commands.qualificar({ quiet: true });
      const { file, count } = commands.painel({ quiet: true });
      console.log(`   ↳ +${ok} qualificados · painel com ${count} leads`);
      if (!opened && count) {
        opened = true;
        openFile(file);
      }
    };
    await commands.buscar({ afterEach: refresh });
    if (process.exitCode) return;
    await refresh();
    const { file } = commands.painel();
    if (!opened) openFile(file);
  },

  async enviar() {
    const { runSender } = await import('./sender.js');
    await runSender(config, {
      limit: values.limite ? Number(values.limite) : undefined,
      visible: values.visivel,
      canal: values.canal,
    });
  },

  async 'cloud-teste'() {
    const { cloudClient } = await import('./cloud.js');
    const api = cloudClient({ token: env.waToken, phoneNumberId: env.waPhoneNumberId, version: config.cloud.versaoGraph });
    const info = await api.phoneInfo();
    console.log('Número conectado:', info);
    if (values.para) {
      const to = values.para.replace(/\D/g, '');
      const name = values.template || 'hello_world';
      const res = await api.sendTemplate(to, { name, language: name === 'hello_world' ? 'en_US' : 'pt_BR' });
      console.log(`✅ Template "${name}" enviado para ${to}:`, res);
    }
  },

  exportar() {
    const file = values.arquivo || 'leads.csv';
    const rows = getDb()
      .prepare(`SELECT * FROM leads ${values.status ? 'WHERE status = ?' : ''} ORDER BY score DESC NULLS LAST`)
      .all(...(values.status ? [values.status] : []));
    const cols = ['id', 'status', 'score', 'name', 'whatsapp', 'phone', 'phone_type', 'category', 'city', 'address', 'website', 'rating', 'reviews', 'maps_url', 'sent_at', 'replied_at', 'reply_text', 'notes'];
    const esc = (v) => (v == null ? '' : `"${String(v).replace(/"/g, '""')}"`);
    for (const r of rows) if (r.phone) r.whatsapp = waLink(r.phone, r.reasons ? manualMessage(r, config) : '');
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
  try {
    await commands[cmd]();
  } catch (err) {
    console.error(`Erro: ${err.message}`);
    process.exitCode = 1;
  }
}
