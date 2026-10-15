// Fila de envio com dois canais:
//   web   → WhatsApp Web (whatsapp-web.js), texto livre
//   cloud → WhatsApp Cloud API oficial da Meta, template aprovado + webhook

import { join } from 'node:path';
import { workingBrowserPath } from './browser.js';
import { ROOT, env } from './config.js';
import {
  findLeadByContact,
  findLeadByMsgId,
  getDb,
  logMessage,
  nextFollowup,
  nextQualified,
  sentToday,
  updateLead,
} from './db.js';
import { formatPhone } from './phone.js';
import { buildMessage, buildMessageAI, isOptOut } from './message.js';
import { inSendWindow, randomBetween, sleep } from './schedule.js';

const log = (...a) => console.log(new Date().toLocaleTimeString('pt-BR'), ...a);

/**
 * Trata uma mensagem recebida de um lead. `reply(text)` responde ao lead e
 * `notify(text)` avisa o dono; ambos podem falhar silenciosamente.
 */
async function handleReply(config, lead, body, { reply, notify }) {
  logMessage(lead.id, 'in', body);
  if (isOptOut(body, config.optoutPalavras)) {
    updateLead(lead.id, { status: 'optout', reply_text: body, replied_at: new Date().toISOString() });
    log(`🚫 ${lead.name} pediu para sair.`);
    if (config.templates.optoutResposta) await reply(config.templates.optoutResposta).catch(() => {});
    return;
  }
  if (lead.status === 'respondeu') return; // já avisado; a conversa agora é sua
  updateLead(lead.id, { status: 'respondeu', reply_text: body, replied_at: new Date().toISOString() });
  log(`🔥 RESPOSTA de ${lead.name} (${formatPhone(lead.phone)}): ${body.slice(0, 120)}`);
  if (env.ownerWhatsapp) {
    const text =
      `🔥 *Lead respondeu!*\n*${lead.name}* — ${formatPhone(lead.phone)}\n` +
      `${lead.category || ''} ${lead.city ? `· ${lead.city}` : ''}\n\n"${body.slice(0, 500)}"\n\nhttps://wa.me/${lead.phone}`;
    await notify(text).catch((e) => log('  ! não consegui avisar o dono:', e.message));
  }
}

const REPLYABLE = ['enviado', 'followup', 'respondeu'];

// ───────────────────────────── canal: WhatsApp Web ─────────────────────────────

export async function startWhatsApp({ visible = false } = {}) {
  const { default: wweb } = await import('whatsapp-web.js');
  const { default: qrcode } = await import('qrcode-terminal');
  const { Client, LocalAuth } = wweb;

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: join(ROOT, '.wwebjs_auth') }),
    puppeteer: {
      headless: !visible,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      // Mesmo navegador que funciona na busca (Chrome do computador ou o do puppeteer)
      executablePath: await workingBrowserPath(),
    },
  });

  client.on('qr', (qr) => {
    log('Escaneie o QR Code abaixo no WhatsApp do celular (Aparelhos conectados > Conectar um aparelho):');
    qrcode.generate(qr, { small: true });
  });
  client.on('auth_failure', (m) => log('Falha de autenticação:', m));
  client.on('disconnected', (r) => log('WhatsApp desconectado:', r));

  const ready = new Promise((resolve) => client.once('ready', resolve));
  await client.initialize();
  await ready;
  log('WhatsApp conectado ✅');
  return client;
}

async function webChannel(config, { visible, useAI }) {
  const client = await startWhatsApp({ visible });
  const replyFns = (lead) => ({
    reply: (text) => client.sendMessage(lead.wa_id, text),
    notify: (text) => client.sendMessage(`${env.ownerWhatsapp}@c.us`, text),
  });

  client.on('message', async (msg) => {
    try {
      if (msg.fromMe || msg.isStatus || msg.from.endsWith('@g.us') || msg.from === 'status@broadcast') return;
      let number = msg.from.endsWith('@c.us') ? msg.from.replace('@c.us', '') : null;
      if (!number) number = (await msg.getContact().catch(() => null))?.number || null;
      const lead = findLeadByContact(msg.from, number);
      if (!lead || !REPLYABLE.includes(lead.status)) return;
      await handleReply(config, lead, msg.body || `[${msg.type}]`, replyFns(lead));
    } catch (err) {
      log('  ! erro ao processar mensagem recebida:', err.message);
    }
  });

  // Respostas que chegaram enquanto o programa estava desligado
  const pending = getDb()
    .prepare("SELECT * FROM leads WHERE status IN ('enviado', 'followup') AND wa_id IS NOT NULL")
    .all();
  for (const lead of pending) {
    try {
      const chat = await client.getChatById(lead.wa_id);
      const since = new Date(lead.sent_at).getTime() / 1000;
      const incoming = (await chat.fetchMessages({ limit: 10 })).filter((m) => !m.fromMe && m.timestamp >= since);
      if (incoming.length) {
        await handleReply(config, lead, incoming.map((m) => m.body || `[${m.type}]`).join('\n'), replyFns(lead));
      }
    } catch {
      // chat inexistente / número mudou — ignora
    }
  }

  return {
    delays: config.envio,
    supportsFollowup: true,
    async send(lead, { followup }) {
      let waId = lead.wa_id;
      if (!waId) {
        const numberId = await client.getNumberId(lead.phone);
        if (!numberId) {
          updateLead(lead.id, { status: 'sem_whatsapp' });
          log(`  – ${lead.name} (${formatPhone(lead.phone)}) não tem WhatsApp.`);
          return null;
        }
        waId = numberId._serialized;
        updateLead(lead.id, { wa_id: waId });
      }
      const text = followup
        ? buildMessage(lead, config, { followup: true })
        : useAI
          ? await buildMessageAI(lead, config)
          : buildMessage(lead, config);

      // Simula digitação, como uma pessoa faria
      const chat = await client.getChatById(waId);
      await chat.sendStateTyping().catch(() => {});
      await sleep(Math.min(12000, 2000 + text.length * 25));
      await client.sendMessage(waId, text);
      await chat.clearState().catch(() => {});
      return { text };
    },
    close: () => client.destroy(),
  };
}

// ───────────────────────────── canal: Cloud API (Meta) ─────────────────────────────

// Erros de entrega da Cloud API que mudam o status do lead
const CLOUD_ERROR_STATUS = {
  131026: 'sem_whatsapp', // número sem WhatsApp / não pode receber
  131050: 'optout', // usuário parou de receber mensagens de marketing
};

async function cloudChannel(config) {
  const { cloudClient, startWebhook, templateFor } = await import('./cloud.js');
  const cc = config.cloud;
  const api = cloudClient({ token: env.waToken, phoneNumberId: env.waPhoneNumberId, version: cc.versaoGraph });

  const info = await api.phoneInfo();
  log(`Cloud API conectada ✅ ${info.verified_name} (${info.display_phone_number}) · qualidade: ${info.quality_rating}`);
  if (info.quality_rating === 'RED') log('⚠️  Qualidade VERMELHA: pare os envios por alguns dias para não ter o número restrito.');

  const server = startWebhook({
    port: cc.portaWebhook,
    verifyToken: env.waVerifyToken,
    appSecret: env.waAppSecret,
    log,
    async onMessage(m) {
      const lead = findLeadByContact(`${m.from}@c.us`, m.from);
      if (!lead || !REPLYABLE.includes(lead.status)) return;
      // Depois que o lead responde, abre a janela de 24h e texto livre passa a ser permitido
      await handleReply(config, lead, m.text, {
        reply: (text) => api.sendText(m.from, text),
        notify: (text) => api.sendText(env.ownerWhatsapp, text),
      });
    },
    async onStatus(s) {
      if (s.status !== 'failed') return;
      const lead = findLeadByMsgId(s.msgId);
      if (!lead) return;
      const err = s.errors[0] ?? {};
      const status = CLOUD_ERROR_STATUS[err.code] ?? 'erro';
      updateLead(lead.id, { status, notes: `${err.code ?? ''} ${err.title ?? ''} ${err.error_data?.details ?? ''}`.trim() });
      log(`  ✖ entrega falhou para ${lead.name}: ${err.code} ${err.title ?? ''}`);
    },
  });

  return {
    delays: { ...config.envio, delayMinSeg: cc.delayMinSeg, delayMaxSeg: cc.delayMaxSeg, pausaLongaACada: Infinity },
    supportsFollowup: Boolean(cc.templateFollowup?.nome),
    async send(lead, { followup }) {
      const tpl = templateFor(lead, cc, { followup });
      if (!tpl) throw new Error('Template não configurado em config.json → cloud.template');
      const { msgId, waId } = await api.sendTemplate(lead.phone, tpl);
      updateLead(lead.id, { wa_msg_id: msgId, ...(waId ? { wa_id: `${waId}@c.us` } : {}) });
      return { text: `[template ${tpl.name}] ${tpl.bodyParams.join(' | ')}` };
    },
    close: () => new Promise((r) => server.close(r)),
  };
}

// ───────────────────────────── loop de envio ─────────────────────────────

export async function runSender(config, { limit, visible = false, canal } = {}) {
  const envio = config.envio;
  const channelName = canal || config.canal || 'web';
  const dailyLimit = limit ?? envio.limiteDiario;
  const useAI = envio.usarIA && Boolean(env.anthropicKey);
  if (envio.usarIA && !env.anthropicKey) log('usarIA=true mas ANTHROPIC_API_KEY não está no .env — usando templates.');

  const channel = channelName === 'cloud' ? await cloudChannel(config) : await webChannel(config, { visible, useAI });
  const delays = channel.delays;

  let stopping = false;
  process.on('SIGINT', async () => {
    if (stopping) process.exit(1);
    stopping = true;
    log('Encerrando...');
    await channel.close().catch(() => {});
    process.exit(0);
  });

  let sinceLongPause = 0;
  let idleLogged = '';
  while (!stopping) {
    if (!inSendWindow(envio)) {
      if (idleLogged !== 'janela') log('Fora do horário de envio. Aguardando (respostas continuam sendo monitoradas)...');
      idleLogged = 'janela';
      await sleep(5 * 60_000);
      continue;
    }
    if (sentToday(envio.fusoHorario) >= dailyLimit) {
      if (idleLogged !== 'limite') log(`Limite diário de ${dailyLimit} mensagens atingido. Monitorando respostas até amanhã...`);
      idleLogged = 'limite';
      await sleep(10 * 60_000);
      continue;
    }

    const fu = channel.supportsFollowup && envio.followupAposDias > 0 ? nextFollowup(envio.followupAposDias) : null;
    const lead = fu || nextQualified({ onlyMobile: envio.apenasCelular });
    if (!lead) {
      if (idleLogged !== 'vazio') log('Nenhum lead na fila. Rode "npm run buscar" e "npm run qualificar". Monitorando respostas...');
      idleLogged = 'vazio';
      await sleep(10 * 60_000);
      continue;
    }
    idleLogged = '';

    let sent = null;
    try {
      sent = await channel.send(lead, { followup: Boolean(fu) });
    } catch (err) {
      log(`  ! erro ao enviar para ${lead.name}: ${err.message}`);
      updateLead(lead.id, { status: 'erro', notes: err.message.slice(0, 500) });
      // Erros de conta/token/template param tudo — melhor parar do que queimar a fila inteira
      if (/\((código )?(190|132\d{3}|131031|131042|131048|368)\)/.test(err.message)) {
        log('Erro de configuração/conta na Cloud API. Corrija e rode novamente.');
        await channel.close().catch(() => {});
        process.exit(1);
      }
    }

    if (!sent) {
      await sleep(randomBetween(5, 15));
      continue;
    }
    const now = new Date().toISOString();
    updateLead(
      lead.id,
      fu ? { status: 'followup', followup_at: now } : { status: 'enviado', sent_at: now, message: sent.text, channel: channelName },
    );
    logMessage(lead.id, 'out', sent.text);
    log(`  ✉️  ${fu ? 'Follow-up' : 'Mensagem'} enviada para ${lead.name} (${formatPhone(lead.phone)}) [score ${lead.score}]`);

    sinceLongPause++;
    const longPause = sinceLongPause >= delays.pausaLongaACada;
    const wait = longPause
      ? randomBetween(delays.pausaLongaMinSeg, delays.pausaLongaMaxSeg)
      : randomBetween(delays.delayMinSeg, delays.delayMaxSeg);
    if (longPause) sinceLongPause = 0;
    log(`  ⏳ próxima em ${Math.round(wait / 1000)}s`);
    await sleep(wait);
  }
}
