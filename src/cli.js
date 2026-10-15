#!/usr/bin/env -S node --disable-warning=ExperimentalWarning
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { env, loadConfig } from './config.js';
import { getDb, insertLead, markSearch, panelLeads, searchDone, updateLead, STATUSES } from './db.js';
import { startPanelServer } from './server.js';
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
                 --visivel                 mostra o navegador trabalhando (fonte maps)
                 --refazer                 repete buscas já feitas

  qualificar   Analisa site/telefone de cada lead novo e calcula o score
                 --todos                   reanalisa também os já qualificados

  gerar        Faz tudo: busca todos os nichos nas cidades do config (Brasil todo), qualifica
               e abre o painel em http://localhost:4000. Para continuar depois, rode de novo.
               (aceita as opções do buscar; vários valores separados por ";")

  painel       Abre o painel de leads (http://localhost:4000) com botão "Abrir no WhatsApp".
               O que você marca como contatado fica salvo no banco do robô.
                 --arquivo leads.html      gera um HTML solto em vez do painel

  verificar    Confere no WhatsApp Web (QR code) quais números têm WhatsApp, sem enviar nada.
                 --limite 300              quantos números conferir nesta rodada

  navegador    Confere se o robô consegue abrir um navegador

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

/** Embaralhamento determinístico (mesma ordem em toda execução), para retomar de onde parou. */
function shuffle(items, seed = 20261015) {
  const out = [...items];
  let x = seed;
  const rand = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Abre um arquivo ou endereço no navegador padrão (Mac, Windows ou Linux). */
function openFile(file) {
  const abs = /^https?:/.test(file) ? file : resolve(file);
  const [bin, ...argv] =
    process.platform === 'darwin' ? ['open', abs] : process.platform === 'win32' ? ['cmd', '/c', 'start', '', abs] : ['xdg-open', abs];
  try {
    spawn(bin, argv, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
    console.log(`   Abrindo ${file} no navegador...`);
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
    const maps = source === 'maps' ? await import('./discover/maps.js') : null;
    const search = maps ? maps.searchMaps : (await import('./discover/places.js')).searchPlaces;
    // Vários valores separados por ";" — ex.: --termo "padaria;barbearia" --cidade "Campinas, SP;Sumaré, SP"
    const list = (v) => v.split(';').map((x) => x.trim()).filter(Boolean);
    const todos = (v) => !v || /^(todos|todas|tudo|all|\*)$/i.test(v.trim());
    const termos = todos(values.termo) ? config.busca.nichos : list(values.termo);
    const cidades = values.cidade ? list(values.cidade) : config.busca.cidades;
    const max = Number(values.max || (source === 'maps' ? config.busca.maxPorBuscaNavegador : config.busca.maxPorBusca));
    console.log(`${termos.length} nicho(s) × ${cidades.length} cidade(s), até ${max} empresas por busca (fonte: ${source}).`);

    // Ordem embaralhada (sempre a mesma) para trazer leads variados do Brasil todo desde o começo
    const combos = shuffle(cidades.flatMap((cidade) => termos.map((termo) => ({ cidade, termo }))));
    const pending = values.refazer ? combos : combos.filter(({ cidade, termo }) => !searchDone(`${termo} em ${cidade}`));
    if (pending.length < combos.length) console.log(`↷ ${combos.length - pending.length} buscas já feitas antes foram puladas.`);

    let totalNew = 0;
    for (const [i, { cidade, termo }] of pending.entries()) {
      const query = `${termo} em ${cidade}`;
      process.stdout.write(`[${i + 1}/${pending.length}] 🔎 ${query} `);
      try {
        const found = await search({
          query,
          apiKey: env.placesKey,
          max,
          headless: !values.visivel,
          onProgress: () => process.stdout.write('.'),
        });
        process.stdout.write(' ');
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
        if (err.name === 'MapsBlockedError') {
          // Google pediu captcha: espera e segue (essa busca é refeita numa próxima rodada)
          console.log(`\n⏸️  ${err.message} Esperando 15 minutos antes de continuar...`);
          await new Promise((r) => setTimeout(r, 15 * 60_000));
          continue;
        }
        if (err.name === 'BrowserMissingError') {
          console.log(`\n\n❌ ${err.message}`);
          process.exitCode = 1;
          return; // sem navegador nenhuma busca funciona — não adianta tentar as outras
        }
        console.log(`erro: ${err.message.split('\n')[0].slice(0, 160)}`);
      }
    }
    await maps?.closeMapsBrowser();
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

  /** Abre o painel servido pelo robô; com --arquivo, gera um HTML solto. */
  async painel({ wait = true } = {}) {
    if (values.arquivo) {
      const rows = panelLeads({ all: values.todos });
      writeFileSync(values.arquivo, renderPanel(rows.map((l) => leadToCard(l, config))));
      console.log(`✅ ${rows.length} leads no arquivo ${values.arquivo}`);
      return;
    }
    let url = 'http://localhost:4000/';
    try {
      ({ url } = await startPanelServer(config, { port: 4000 }));
    } catch (err) {
      if (err.code !== 'EADDRINUSE') throw err;
      console.log(`🌐 O painel já está aberto em outra janela do robô: ${url}`);
      wait = false;
    }
    openFile(url);
    if (wait) {
      console.log('   Deixe esta janela aberta enquanto usa o painel. Para sair: Ctrl+C.');
      await new Promise(() => {});
    }
  },

  // Busca e já qualifica a cada busca; o painel (http://localhost:4000) mostra os leads novos
  // enquanto o resto ainda está sendo buscado.
  async gerar() {
    values.todos = false;
    await commands.painel({ wait: false });
    const refresh = async () => {
      const ok = await commands.qualificar({ quiet: true });
      console.log(`   ↳ +${ok} qualificados · ${panelLeads().length} leads no painel`);
    };
    await commands.buscar({ afterEach: refresh });
    if (process.exitCode) process.exit(process.exitCode);
    await refresh();
    console.log('\n✅ Busca concluída. O painel continua aberto — Ctrl+C para sair.');
    await new Promise(() => {});
  },

  /** Confere no WhatsApp Web (QR code) quais números têm WhatsApp, sem enviar nada. */
  async verificar() {
    const { verifyNumbers } = await import('./verify.js');
    await verifyNumbers({ limit: Number(values.limite || 300), visible: values.visivel });
  },

  /** Confere se há um navegador que o robô consiga abrir. */
  async navegador() {
    const { launchBrowser, BrowserMissingError } = await import('./browser.js');
    try {
      const browser = await launchBrowser({ headless: true, args: ['--no-sandbox'] });
      console.log(`✅ Navegador OK: ${browser.process()?.spawnfile ?? ''}`);
      await browser.close();
    } catch (err) {
      if (!(err instanceof BrowserMissingError)) throw err;
      console.log(`❌ ${err.message}`);
      process.exitCode = 1;
    }
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
