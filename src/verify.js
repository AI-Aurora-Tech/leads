// Confere quais números têm WhatsApp usando o WhatsApp Web (QR code), sem enviar nenhuma mensagem.
// Números sem WhatsApp saem do painel; os confirmados ganham o selo "WhatsApp verificado".

import { getDb, updateLead } from './db.js';
import { formatPhone } from './phone.js';
import { randomBetween, sleep } from './schedule.js';
import { startWhatsApp } from './sender.js';

const log = (...a) => console.log(new Date().toLocaleTimeString('pt-BR'), ...a);

export function pendingChecks(limit) {
  return getDb()
    .prepare(
      `SELECT * FROM leads WHERE wa_check IS NULL AND phone IS NOT NULL AND status IN ('qualificado', 'contatado')
       ORDER BY score DESC, reviews DESC LIMIT ?`,
    )
    .all(limit);
}

/** Aplica o resultado da consulta ao lead. `numberId` é o retorno de client.getNumberId. */
export function applyCheck(lead, numberId) {
  if (numberId) {
    updateLead(lead.id, { wa_check: 1, wa_id: numberId._serialized });
    return true;
  }
  updateLead(lead.id, { wa_check: 0, status: lead.status === 'contatado' ? 'contatado' : 'sem_whatsapp' });
  return false;
}

/**
 * Marca como contatado todo lead com quem você JÁ TEM conversa no WhatsApp (mesmo que o contato
 * tenha sido feito fora do robô ou numa versão antiga). `chatIds` = ids das conversas ("5581...@c.us").
 */
export function markExistingChats(chatIds) {
  const ids = new Set(chatIds);
  const rows = getDb()
    .prepare(`SELECT id, phone FROM leads WHERE phone IS NOT NULL AND status IN ('novo', 'qualificado', 'descartado', 'sem_whatsapp')`)
    .all();
  let n = 0;
  for (const { id, phone } of rows) {
    // Contas antigas de celular do Brasil às vezes aparecem sem o 9 depois do DDD
    const variants = [phone, phone.length === 13 && phone[4] === '9' ? phone.slice(0, 4) + phone.slice(5) : null];
    if (variants.some((v) => v && ids.has(`${v}@c.us`))) {
      updateLead(id, { status: 'contatado', channel: 'whatsapp_existente', sent_at: new Date().toISOString() });
      n++;
    }
  }
  return n;
}

export async function verifyNumbers({ limit = 300, visible = false } = {}) {
  const client = await startWhatsApp({ visible });
  const chats = await client.getChats().catch(() => []);
  const known = markExistingChats(chats.filter((c) => !c.isGroup).map((c) => c.id._serialized));
  if (known) log(`💬 ${known} leads já tinham conversa com você no WhatsApp: marcados como contatados (saem do painel).`);

  const leads = pendingChecks(limit);
  if (!leads.length) {
    log('Nenhum número novo para verificar. Rode a busca primeiro.');
    await client.destroy().catch(() => {});
    return;
  }
  log(`Vou conferir ${leads.length} números (nenhuma mensagem é enviada).`);
  process.on('SIGINT', async () => {
    log('Encerrando...');
    await client.destroy().catch(() => {});
    process.exit(0);
  });

  let ok = 0;
  let no = 0;
  for (const [i, lead] of leads.entries()) {
    try {
      const has = applyCheck(lead, await client.getNumberId(lead.phone));
      has ? ok++ : no++;
      log(`[${i + 1}/${leads.length}] ${has ? '✅' : '❌'} ${formatPhone(lead.phone)}  ${lead.name}`);
    } catch (err) {
      log(`  ! erro em ${lead.name}: ${err.message.split('\n')[0]}`);
    }
    // Ritmo de pessoa: pausas curtas e uma pausa maior a cada 50 consultas
    await sleep((i + 1) % 50 === 0 ? randomBetween(60, 120) : randomBetween(1.5, 4));
  }
  log(`Pronto: ${ok} com WhatsApp, ${no} sem WhatsApp (saíram do painel).`);
  await client.destroy().catch(() => {});
}
