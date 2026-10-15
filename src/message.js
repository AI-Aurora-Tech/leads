// Montagem das mensagens: templates com spintax ({a|b|c}) + variáveis, ou geração com IA (Claude).

export function spin(text, rand = Math.random) {
  let out = text;
  // Resolve de dentro para fora, permitindo spintax aninhado
  const re = /\{([^{}]*\|[^{}]*)\}/;
  let m;
  while ((m = out.match(re))) {
    const opts = m[1].split('|');
    out = out.slice(0, m.index) + opts[Math.floor(rand() * opts.length)] + out.slice(m.index + m[0].length);
  }
  return out;
}

export function greeting(timeZone = 'America/Sao_Paulo', date = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(date));
  if (hour < 12) return 'bom dia';
  if (hour < 18) return 'boa tarde';
  return 'boa noite';
}

/** Nome "amigável": remove sufixos jurídicos e excesso de descrição do Google ("Clínica X - Dentista em Campinas"). */
export function shortName(name) {
  return name
    .split(/\s[-|–]\s/)[0]
    .replace(/\b(ltda|me|epp|eireli|s\/?a)\.?$/i, '')
    .trim();
}

function joinList(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`;
}

export function renderTemplate(template, vars) {
  return spin(template).replace(/\{(\w+)\}/g, (all, key) => (key in vars ? vars[key] : all));
}

export function buildMessage(lead, config, { followup = false, rand = Math.random } = {}) {
  const reasons = typeof lead.reasons === 'string' ? JSON.parse(lead.reasons || '{}') : lead.reasons || {};
  const kind = followup ? 'followup' : reasons.kind || 'site_ok';
  const list = config.templates[kind] || config.templates.site_ok;
  const template = list[Math.floor(rand() * list.length)];
  const vars = {
    nome: shortName(lead.name),
    saudacao: greeting(config.envio.fusoHorario),
    remetente: config.remetente.nome,
    empresa: config.remetente.empresa,
    site: config.remetente.site,
    cidade: lead.city || '',
    categoria: (lead.category || '').toLowerCase(),
    redeSocial: reasons.social || 'uma rede social',
    problemas: joinList((reasons.problems || []).slice(0, 2)),
  };
  let text = renderTemplate(template, vars);
  if (!followup) text += config.templates.rodape;
  return text;
}

let anthropic;

/** Gera a 1ª mensagem com Claude, usando os dados do lead. Cai para o template em caso de erro. */
export async function buildMessageAI(lead, config) {
  const fallback = buildMessage(lead, config);
  try {
    if (!anthropic) {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      anthropic = new Anthropic();
    }
    const reasons = typeof lead.reasons === 'string' ? JSON.parse(lead.reasons || '{}') : lead.reasons || {};
    const response = await anthropic.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 2000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system:
        `Você escreve a primeira mensagem de prospecção no WhatsApp para ${config.remetente.nome}, da ${config.remetente.empresa} ` +
        `(${config.remetente.site}), que cria sites, sistemas sob medida e integrações com IA (ex.: atendimento automático no WhatsApp). ` +
        'Regras: português do Brasil, tom humano e cordial, sem parecer robô ou propaganda; no máximo 450 caracteres; ' +
        'cite um detalhe concreto da empresa (o motivo do contato); termine com UMA pergunta simples de sim/não; ' +
        'não invente fatos, preços ou resultados; sem emojis em excesso (no máximo 1); sem links. ' +
        'Responda somente com o texto da mensagem.',
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            saudacao: greeting(config.envio.fusoHorario),
            empresa: shortName(lead.name),
            categoria: lead.category,
            endereco: lead.address,
            site: lead.website,
            avaliacao: lead.rating,
            numeroDeAvaliacoes: lead.reviews,
            diagnostico: reasons,
          }),
        },
      ],
    });
    if (response.stop_reason === 'refusal') return fallback;
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    if (!text || text.length > 700) return fallback;
    return text + config.templates.rodape;
  } catch (err) {
    console.warn(`  ! IA indisponível (${err.message}); usando template.`);
    return fallback;
  }
}

export function isOptOut(text, words) {
  const t = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
  return words.some((w) => {
    const n = w
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
    return t === n || new RegExp(`(^|\\W)${n}(\\W|$)`).test(t);
  });
}
