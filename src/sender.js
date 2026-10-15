// Envio pelo WhatsApp Web (whatsapp-web.js) + escuta de respostas.

import { join } from 'node:path';
import { ROOT, env } from './config.js';
import { findLeadByContact, logMessage, nextFollowup, nextQualified, sentToday, updateLead, getDb } from './db.js';
import { formatPhone } from './phone.js';
import { buildMessage, buildMessageAI, isOptOut } from './message.js';
import { inSendWindow, randomBetween, sleep } from './schedule.js';

const log = (...a) => console.log(new Date().toLocaleTimeString('pt-BR'), ...a);

export async function startWhatsApp({ visible = false } = {}) {
  const { default: wweb } = await import('whatsapp-web.js');
  const { default: qrcode } = await import('qrcode-terminal');
  const { Client, LocalAuth } = wweb;

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: join(ROOT, '.wwebjs_auth') }),
    puppeteer: { headless: !visible, args: ['--no-sandbox', '--disable-setuid-sandbox'] },
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

async function contactOf(msg) {
  let number = msg.from.endsWith('@c.us') ? msg.from.replace('@c.us', '') : null;
  if (!number) {
    const contact = await msg.getContact().catch(() => null);
    number = contact?.number || null;
  }
  return { waId: msg.from, number };
}

async function notifyOwner(client, lead, body) {
  if (!env.ownerWhatsapp) return;
  const text =
    `🔥 *Lead respondeu!*\n*${lead.name}* — ${formatPhone(lead.phone)}\n` +
    `${lead.category || ''} ${lead.city ? `· ${lead.city}` : ''}\n\n"${body.slice(0, 500)}"\n\nhttps://wa.me/${lead.phone}`;
  await client.sendMessage(`${env.ownerWhatsapp}@c.us`, text).catch((e) => log('  ! não consegui avisar o dono:', e.message));
}

async function handleReply(client, config, lead, body) {
  logMessage(lead.id, 'in', body);
  if (isOptOut(body, config.optoutPalavras)) {
    updateLead(lead.id, { status: 'optout', reply_text: body, replied_at: new Date().toISOString() });
    log(`🚫 ${lead.name} pediu para sair.`);
    if (config.templates.optoutResposta && lead.wa_id) {
      await client.sendMessage(lead.wa_id, config.templates.optoutResposta).catch(() => {});
    }
    return;
  }
  if (lead.status === 'respondeu') return; // já avisado; a conversa agora é sua
  updateLead(lead.id, { status: 'respondeu', reply_text: body, replied_at: new Date().toISOString() });
  log(`🔥 RESPOSTA de ${lead.name} (${formatPhone(lead.phone)}): ${body.slice(0, 120)}`);
  await notifyOwner(client, lead, body);
}

export function listenReplies(client, config) {
  client.on('message', async (msg) => {
    try {
      if (msg.fromMe || msg.isStatus || msg.from.endsWith('@g.us') || msg.from === 'status@broadcast') return;
      const { waId, number } = await contactOf(msg);
      const lead = findLeadByContact(waId, number);
      if (!lead || !['enviado', 'followup', 'respondeu'].includes(lead.status)) return;
      await handleReply(client, config, lead, msg.body || `[${msg.type}]`);
    } catch (err) {
      log('  ! erro ao processar mensagem recebida:', err.message);
    }
  });
}

/** Respostas que chegaram enquanto o programa estava desligado. */
export async function checkMissedReplies(client, config) {
  const leads = getDb()
    .prepare("SELECT * FROM leads WHERE status IN ('enviado', 'followup') AND wa_id IS NOT NULL")
    .all();
  let found = 0;
  for (const lead of leads) {
    try {
      const chat = await client.getChatById(lead.wa_id);
      const msgs = await chat.fetchMessages({ limit: 10 });
      const since = new Date(lead.sent_at).getTime() / 1000;
      const incoming = msgs.filter((m) => !m.fromMe && m.timestamp >= since);
      if (incoming.length) {
        found++;
        await handleReply(client, config, lead, incoming.map((m) => m.body || `[${m.type}]`).join('\n'));
      }
    } catch {
      // chat inexistente / número mudou — ignora
    }
  }
  if (found) log(`${found} resposta(s) recebida(s) enquanto o sistema estava desligado.`);
}

async function sendOne(client, config, lead, { followup, useAI }) {
  let waId = lead.wa_id;
  if (!waId) {
    const numberId = await client.getNumberId(lead.phone);
    if (!numberId) {
      updateLead(lead.id, { status: 'sem_whatsapp' });
      log(`  – ${lead.name} (${formatPhone(lead.phone)}) não tem WhatsApp.`);
      return false;
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

  const now = new Date().toISOString();
  updateLead(lead.id, followup ? { status: 'followup', followup_at: now } : { status: 'enviado', sent_at: now, message: text });
  logMessage(lead.id, 'out', text);
  log(`  ✉️  ${followup ? 'Follow-up' : 'Mensagem'} enviada para ${lead.name} (${formatPhone(lead.phone)}) [score ${lead.score}]`);
  return true;
}

export async function runSender(config, { limit, visible = false } = {}) {
  const envio = config.envio;
  const dailyLimit = limit ?? envio.limiteDiario;
  const useAI = envio.usarIA && Boolean(env.anthropicKey);
  if (envio.usarIA && !env.anthropicKey) log('usarIA=true mas ANTHROPIC_API_KEY não está no .env — usando templates.');

  const client = await startWhatsApp({ visible });
  listenReplies(client, config);
  await checkMissedReplies(client, config);

  let stopping = false;
  process.on('SIGINT', async () => {
    if (stopping) process.exit(1);
    stopping = true;
    log('Encerrando...');
    await client.destroy().catch(() => {});
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

    const fu = envio.followupAposDias > 0 ? nextFollowup(envio.followupAposDias) : null;
    const lead = fu || nextQualified({ onlyMobile: envio.apenasCelular });
    if (!lead) {
      if (idleLogged !== 'vazio') log('Nenhum lead na fila. Rode "npm run buscar" e "npm run qualificar". Monitorando respostas...');
      idleLogged = 'vazio';
      await sleep(10 * 60_000);
      continue;
    }
    idleLogged = '';

    let sent = false;
    try {
      sent = await sendOne(client, config, lead, { followup: Boolean(fu), useAI });
    } catch (err) {
      log(`  ! erro ao enviar para ${lead.name}: ${err.message}`);
      updateLead(lead.id, { status: 'erro', notes: err.message.slice(0, 500) });
    }

    if (!sent) {
      await sleep(randomBetween(5, 15));
      continue;
    }
    sinceLongPause++;
    const wait =
      sinceLongPause >= envio.pausaLongaACada
        ? randomBetween(envio.pausaLongaMinSeg, envio.pausaLongaMaxSeg)
        : randomBetween(envio.delayMinSeg, envio.delayMaxSeg);
    if (sinceLongPause >= envio.pausaLongaACada) sinceLongPause = 0;
    log(`  ⏳ próxima em ${Math.round(wait / 1000)}s`);
    await sleep(wait);
  }
}
