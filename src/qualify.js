// Qualificação: quanto maior o score, maior a chance da empresa precisar de site/sistema/IA.

const SOCIAL_HOSTS = {
  'instagram.com': 'o Instagram',
  'facebook.com': 'o Facebook',
  'fb.com': 'o Facebook',
  'linktr.ee': 'um Linktree',
  'wa.me': 'o WhatsApp',
  'whatsapp.com': 'o WhatsApp',
  'api.whatsapp.com': 'o WhatsApp',
  'ifood.com.br': 'o iFood',
  'tiktok.com': 'o TikTok',
  'youtube.com': 'o YouTube',
  'linkedin.com': 'o LinkedIn',
  'sites.google.com': 'um Google Sites',
  'business.site': 'um site gratuito do Google',
  'negocio.site': 'um site gratuito do Google',
  'goo.gl': 'um link encurtado',
  'bit.ly': 'um link encurtado',
};

const BUILDER_MARKERS = ['wix.com', 'wixsite', 'webnode', 'site123', 'blogspot', 'godaddysites', 'weebly', 'jimdo', 'webflow.io'];
const CHAT_MARKERS = ['wa.me/', 'api.whatsapp.com', 'whatsapp', 'tawk.to', 'jivochat', 'zendesk', 'intercom', 'crisp.chat', 'manychat', 'botpress', 'chatbot', 'blip.ai'];

export function socialHost(url) {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.replace(/^www\.|^m\.|^web\./, '');
    for (const [h, label] of Object.entries(SOCIAL_HOSTS)) {
      if (host === h || host.endsWith(`.${h}`)) return label;
    }
  } catch {
    return null;
  }
  return null;
}

/** Baixa o site e devolve sinais técnicos. Nunca lança erro. */
export async function analyzeSite(url, timeoutMs = 10000) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
    });
    const html = (await res.text()).slice(0, 500_000).toLowerCase();
    const loadMs = Date.now() - started;
    const years = [...html.matchAll(/(?:©|&copy;|copyright)[^0-9]{0,40}((?:19|20)\d{2})(?:\s*[-–]\s*((?:19|20)\d{2}))?/g)].map(
      (m) => Number(m[2] || m[1]),
    );
    return {
      ok: res.ok,
      status: res.status,
      finalUrl: res.url,
      https: res.url.startsWith('https://'),
      loadMs,
      hasViewport: html.includes('name="viewport"') || html.includes("name='viewport'") || html.includes('name=viewport'),
      builder: BUILDER_MARKERS.find((m) => html.includes(m) || res.url.includes(m)) || null,
      hasChat: CHAT_MARKERS.some((m) => html.includes(m)),
      copyrightYear: years.length ? Math.max(...years) : null,
      tooSmall: html.length < 3000,
    };
  } catch (err) {
    return { ok: false, error: err.name === 'TimeoutError' ? 'timeout' : err.message, loadMs: Date.now() - started };
  }
}

/**
 * @param lead linha da tabela leads
 * @param site resultado de analyzeSite (ou null se não há site / é rede social)
 * @returns {{ score: number, reasons: { kind: string, problems: string[], social?: string } }}
 */
export function scoreLead(lead, site, now = new Date()) {
  let score = 0;
  const problems = [];
  let kind;
  const social = socialHost(lead.website);

  if (!lead.website) {
    kind = 'sem_site';
    score += 50;
  } else if (social) {
    kind = 'site_social';
    score += 40;
  } else if (!site?.ok) {
    kind = 'site_problemas';
    score += 40;
    problems.push(site?.error === 'timeout' ? 'o site está demorando muito para abrir' : 'o site não está abrindo');
  } else {
    if (!site.https) {
      score += 15;
      problems.push('o site aparece como "não seguro" no navegador (sem HTTPS)');
    }
    if (!site.hasViewport) {
      score += 20;
      problems.push('o site não se adapta bem ao celular');
    }
    if (site.loadMs > 4000) {
      score += 10;
      problems.push('o site está lento para carregar');
    }
    if (site.copyrightYear && site.copyrightYear < now.getFullYear() - 2) {
      score += 10;
      problems.push(`o site parece desatualizado (rodapé de ${site.copyrightYear})`);
    }
    if (site.tooSmall) score += 5;
    if (site.builder) score += 5;
    kind = problems.length ? 'site_problemas' : 'site_ok';
  }

  // Sem chat/WhatsApp no site → oportunidade de atendimento com IA
  if (!site?.hasChat) score += 10;

  // Empresa com movimento (avaliações) tende a ter orçamento
  const reviews = lead.reviews ?? 0;
  if (reviews >= 100) score += 15;
  else if (reviews >= 30) score += 10;
  else if (reviews >= 5) score += 5;
  if ((lead.rating ?? 0) >= 4.5 && reviews >= 10) score += 5;

  if (lead.phone_type === 'celular') score += 10;

  return { score, reasons: { kind, problems, ...(social ? { social } : {}) } };
}
