// Acha o e-mail de contato de uma empresa no site dela (página inicial e páginas de contato).

const EMAIL_RE = /[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,24}/gi;
const JUNK_DOMAINS = [
  'example.com', 'example.org', 'domain.com', 'email.com', 'yourdomain.com', 'yoursite.com', 'mysite.com', 'website.com',
  'test.com', 'sentry.io', 'wixpress.com', 'wix.com', 'godaddy.com', 'squarespace.com', 'sentry-next.wixpress.com',
];
const JUNK_LOCAL = /^(no-?reply|do-?not-?reply|noreply|user|username|name|yourname|your\.?name|email|firstname|john\.?doe|jane\.?doe)$/;
const GOOD_LOCAL = /^(info|contact|hello|hi|office|admin|enquiries|inquiries|enquiry|sales|team|bookings?|reception|appointments?|studio|mail)$/;
const CONTACT_LINK = /contact|about|get[- ]in[- ]touch|reach[- ]us|enquir|inquir|book/i;

/** Cloudflare esconde e-mails em data-cfemail (hex com XOR). */
export function decodeCfEmail(hex) {
  const key = parseInt(hex.slice(0, 2), 16);
  let out = '';
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  return out;
}

/** "www.shop.co.uk" → "shop.co.uk" */
export function baseDomain(host = '') {
  const parts = host.toLowerCase().replace(/^www\./, '').split('.');
  const sld = parts.at(-2);
  const n = parts.length >= 3 && parts.at(-1).length === 2 && ['co', 'com', 'org', 'net', 'ac', 'gov'].includes(sld) ? 3 : 2;
  return parts.slice(-n).join('.');
}

/** Todos os e-mails plausíveis de um HTML, do mais provável para o menos. */
export function extractEmails(html, siteUrl) {
  const found = new Set();
  const add = (e) => {
    const email = e.trim().toLowerCase().replace(/^mailto:/, '').split('?')[0];
    const [local, domain] = email.split('@');
    if (!domain || /\.(png|jpe?g|gif|webp|svg|css|js)$/.test(email)) return;
    if (JUNK_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`)) || JUNK_LOCAL.test(local)) return;
    found.add(email);
  };
  for (const m of html.matchAll(/href=["']mailto:([^"']+)["']/gi)) {
    try {
      for (const e of decodeURIComponent(m[1]).split(/[,;]/)) add(e);
    } catch {
      add(m[1]);
    }
  }
  for (const m of html.matchAll(/data-cfemail=["']([0-9a-f]+)["']/gi)) add(decodeCfEmail(m[1]));
  for (const m of html.replace(/&#64;|&#x40;/gi, '@').replace(/\s*(?:\[at\]|\(at\))\s*/gi, '@').matchAll(EMAIL_RE)) add(m[0]);

  let site = '';
  try {
    site = baseDomain(new URL(siteUrl).hostname);
  } catch {
    // sem site para comparar
  }
  const rank = (e) => {
    const [local, domain] = e.split('@');
    return (site && baseDomain(domain) === site ? 2 : 0) + (GOOD_LOCAL.test(local) ? 1 : 0);
  };
  return [...found].sort((a, b) => rank(b) - rank(a));
}

/** Links para páginas de contato/sobre do mesmo site (para procurar o e-mail lá). */
export function contactLinks(html, siteUrl) {
  const out = new Set();
  let origin;
  try {
    origin = new URL(siteUrl).origin;
  } catch {
    return [];
  }
  for (const m of html.matchAll(/<a\s[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    if (!CONTACT_LINK.test(m[1]) && !CONTACT_LINK.test(m[2])) continue;
    try {
      const url = new URL(m[1], siteUrl);
      if (url.origin === origin && /^https?:$/.test(url.protocol)) out.add(url.href);
    } catch {
      // link inválido
    }
  }
  return [...out].slice(0, 3);
}

async function fetchHtml(url, timeoutMs) {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', 'Accept-Language': 'en' },
  });
  return res.ok ? (await res.text()).slice(0, 500_000) : '';
}

/**
 * Procura o e-mail: primeiro na página inicial (`homeHtml`, se já baixada), depois nas páginas de contato.
 * @returns {Promise<string|null>}
 */
export async function findEmail(siteUrl, { homeHtml, timeoutMs = 10000 } = {}) {
  const home = homeHtml ?? (await fetchHtml(siteUrl, timeoutMs).catch(() => ''));
  const first = extractEmails(home, siteUrl);
  if (first.length) return first[0];
  let pages = contactLinks(home, siteUrl);
  if (!pages.length) pages = ['/contact', '/contact-us'].map((p) => new URL(p, siteUrl).href);
  for (const page of pages) {
    const emails = extractEmails(await fetchHtml(page, timeoutMs).catch(() => ''), siteUrl);
    if (emails.length) return emails[0];
  }
  return null;
}
