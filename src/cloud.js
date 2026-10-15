// Canal oficial: WhatsApp Cloud API (Meta). Primeira mensagem sempre via template aprovado;
// respostas chegam pelo webhook.
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api

import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { shortName } from './message.js';

export class CloudApiError extends Error {
  constructor(status, body) {
    const err = body?.error ?? {};
    super(`Cloud API ${status}: ${err.message || JSON.stringify(body)}${err.code ? ` (código ${err.code})` : ''}`);
    this.code = err.code;
  }
}

export function cloudClient({ token, phoneNumberId, version = 'v23.0' }) {
  if (!token || !phoneNumberId) {
    throw new Error('Configure WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID no .env (veja o README, seção "API oficial").');
  }
  const base = `https://graph.facebook.com/${version}`;

  async function call(path, { method = 'GET', body } = {}) {
    const res = await fetch(`${base}/${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new CloudApiError(res.status, data);
    return data;
  }

  return {
    phoneInfo: () => call(`${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,code_verification_status`),

    /** @returns {{ msgId: string, waId: string | undefined }} */
    async sendTemplate(to, { name, language = 'pt_BR', bodyParams = [] }) {
      const data = await call(`${phoneNumberId}/messages`, {
        method: 'POST',
        body: {
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name,
            language: { code: language },
            ...(bodyParams.length
              ? { components: [{ type: 'body', parameters: bodyParams.map((text) => ({ type: 'text', text })) }] }
              : {}),
          },
        },
      });
      return { msgId: data.messages?.[0]?.id, waId: data.contacts?.[0]?.wa_id };
    },

    /** Texto livre: só funciona até 24h depois da última mensagem do contato. */
    sendText: (to, text) =>
      call(`${phoneNumberId}/messages`, {
        method: 'POST',
        body: { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } },
      }),
  };
}

/** Texto curto que explica o motivo do contato — vira a variável {{2}} do template. */
export function reasonDetail(reasons) {
  switch (reasons.kind) {
    case 'sem_site':
      return 'vocês ainda não têm um site próprio';
    case 'site_social':
      return `o link de site de vocês leva para ${reasons.social || 'uma rede social'}`;
    case 'site_problemas':
      return reasons.problems?.[0] || 'o site de vocês pode estar perdendo clientes';
    default:
      return 'vocês ainda podem automatizar o atendimento no WhatsApp com IA';
  }
}

/**
 * Monta o template + variáveis para um lead.
 * Template padrão (crie no WhatsApp Manager): {{1}} = nome da empresa, {{2}} = motivo do contato.
 */
export function templateFor(lead, cloudConfig, { followup = false } = {}) {
  const reasons = typeof lead.reasons === 'string' ? JSON.parse(lead.reasons || '{}') : lead.reasons || {};
  const tpl = followup ? cloudConfig.templateFollowup : cloudConfig.templates?.[reasons.kind] || cloudConfig.template;
  if (!tpl?.nome) return null;
  const vars = { nome: shortName(lead.name), motivo: reasonDetail(reasons) };
  // Variáveis não podem ter quebra de linha, tab ou mais de 4 espaços seguidos
  const clean = (s) => String(s).replace(/[\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, 200);
  return {
    name: tpl.nome,
    language: tpl.idioma || 'pt_BR',
    bodyParams: (tpl.variaveis || ['nome', 'motivo']).map((v) => clean(vars[v] ?? v)),
  };
}

export function verifySignature(rawBody, header, appSecret) {
  if (!appSecret) return true; // sem segredo configurado, não valida
  if (!header?.startsWith('sha256=')) return false;
  const expected = Buffer.from(`sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`);
  const got = Buffer.from(header);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

/** Extrai mensagens recebidas e status de entrega de um POST do webhook. */
export function parseWebhook(payload) {
  const messages = [];
  const statuses = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value ?? {};
      for (const m of v.messages ?? []) {
        const text =
          m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? `[${m.type}]`;
        messages.push({ from: m.from, id: m.id, text, timestamp: Number(m.timestamp) });
      }
      for (const s of v.statuses ?? []) {
        statuses.push({ msgId: s.id, status: s.status, to: s.recipient_id, errors: s.errors ?? [] });
      }
    }
  }
  return { messages, statuses };
}

export function startWebhook({ port, verifyToken, appSecret, onMessage, onStatus, log = console.log }) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/webhook') {
      res.writeHead(404).end();
      return;
    }
    if (req.method === 'GET') {
      const ok = url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === verifyToken;
      if (ok) log('Webhook verificado pela Meta ✅');
      res.writeHead(ok ? 200 : 403).end(ok ? url.searchParams.get('hub.challenge') : 'forbidden');
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405).end();
      return;
    }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      const raw = Buffer.concat(chunks);
      if (!verifySignature(raw, req.headers['x-hub-signature-256'], appSecret)) {
        res.writeHead(401).end();
        return;
      }
      res.writeHead(200).end('ok'); // responde rápido; a Meta reenvia se demorar
      try {
        const { messages, statuses } = parseWebhook(JSON.parse(raw.toString('utf8')));
        for (const m of messages) await onMessage(m);
        for (const s of statuses) await onStatus(s);
      } catch (err) {
        log('  ! erro no webhook:', err.message);
      }
    });
  });
  server.listen(port, () => log(`Webhook ouvindo em http://localhost:${port}/webhook`));
  return server;
}
