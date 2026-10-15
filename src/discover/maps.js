// Busca sem chave de API: abre o Google Maps num navegador (puppeteer) e lê os resultados.
// Os dados vêm direto da lista de resultados (rápido); só abre a ficha de quem veio sem telefone.
// Mais sujeito a mudanças de layout do Google do que a Places API.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../config.js';
import { launchBrowser } from '../browser.js';

export { BrowserMissingError } from '../browser.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class MapsBlockedError extends Error {
  constructor() {
    super('O Google pediu verificação (captcha) por excesso de buscas.');
    this.name = 'MapsBlockedError';
  }
}

const PHONE_RE = /(?:\+?55\s?)?\(?0?\d{2}\)?[\s-]?9?\d{4}[\s-]?\d{4}/;

/** Extrai telefone, nota, avaliações e categoria do texto de um card da lista do Maps. */
export function parseCardText(text = '') {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const phone = text.match(PHONE_RE)?.[0] ?? null;
  const rr = text.match(/(\d[,.]\d)\s*\(([\d.]+)\)/);
  const infoLine = lines.find((l) => l.includes('·') && !/^(aberto|fechado|abre|fecha|aberto 24)/i.test(l));
  const category = infoLine ? infoLine.split('·')[0].trim() || null : null;
  const address = infoLine ? infoLine.split('·').slice(1).join('·').trim() || null : null;
  return {
    rawPhone: phone,
    rating: rr ? Number(rr[1].replace(',', '.')) : null,
    reviews: rr ? Number(rr[2].replace(/\./g, '')) : 0,
    category,
    address,
  };
}

let browserPromise;
let browserHeadless;

/** Um navegador só para a execução inteira (abrir um por busca era lento). */
async function getBrowser(headless) {
  if (browserPromise && browserHeadless === headless) {
    const b = await browserPromise.catch(() => null);
    if (b?.connected) return b;
  }
  browserHeadless = headless;
  browserPromise = launchBrowser({
    headless,
    args: ['--lang=pt-BR', '--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900'],
  });
  return browserPromise;
}

export async function closeMapsBrowser() {
  const b = await browserPromise?.catch(() => null);
  browserPromise = undefined;
  await b?.close().catch(() => {});
}

function placeIdFrom(url, name, address) {
  const m = url?.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i);
  return m ? `maps:${m[1]}` : `maps:${name}|${address ?? ''}`;
}

async function checkBlocked(page) {
  const blocked =
    page.url().includes('/sorry/') ||
    (await page.evaluate(() => /tráfego incomum|unusual traffic|não sou um robô/i.test(document.body?.innerText || '')).catch(() => false));
  if (blocked) throw new MapsBlockedError();
}

async function saveDebug(page) {
  try {
    mkdirSync(join(ROOT, 'data'), { recursive: true });
    const file = join(ROOT, 'data', 'debug-maps.png');
    await page.screenshot({ path: file });
    return file;
  } catch {
    return null;
  }
}

/**
 * @param onProgress chamado a cada empresa lida (para mostrar progresso)
 * @param timeLimitMs tempo máximo por busca — nunca trava indefinidamente
 */
export async function searchMaps({
  query,
  max = 20,
  headless = true,
  onProgress = () => {},
  timeLimitMs = 180000,
  maxDetails = 5,
  baseUrl = 'https://www.google.com',
}) {
  const deadline = Date.now() + timeLimitMs;
  const browser = await getBrowser(headless);
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  try {
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9' });
    await page.goto(`${baseUrl}/maps/search/${encodeURIComponent(query)}?hl=pt-BR`, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });

    // Tela de consentimento de cookies (alguns países/IPs)
    const consent = await page.$('form[action*="consent"] button');
    if (consent) {
      await consent.click();
      await page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {});
    }
    await checkBlocked(page);

    const feed = await page.waitForSelector('div[role="feed"]', { timeout: 20000 }).catch(() => null);
    if (!feed) {
      // Busca muito específica abre direto a ficha de um único lugar
      const single = await readPlace(page).catch(() => null);
      if (single) return [single];
      await checkBlocked(page);
      const shot = await saveDebug(page);
      throw new Error(`a lista de resultados não apareceu${shot ? ` (imagem da tela em ${shot})` : ''}`);
    }

    // Rola a lista até ter cards suficientes
    let count = 0;
    for (let i = 0; i < 25 && Date.now() < deadline; i++) {
      count = await page.$$eval('div[role="feed"] a[href*="/maps/place/"]', (as) => new Set(as.map((a) => a.href)).size);
      if (count >= max) break;
      const end = await page.evaluate(() => /chegou ao final da lista|reached the end of the list/i.test(document.body.innerText));
      if (end) break;
      await page.evaluate(() => document.querySelector('div[role="feed"]')?.scrollBy(0, 3000));
      await sleep(1000);
    }

    // Lê os cards direto da lista
    const cards = await page.$$eval('div[role="feed"] a[href*="/maps/place/"]', (as) => {
      const seen = new Set();
      const out = [];
      for (const a of as) {
        if (seen.has(a.href)) continue;
        seen.add(a.href);
        // sobe até o bloco do card (que contém o link e os textos)
        let card = a.parentElement;
        for (let k = 0; k < 4 && card && card.innerText.split('\n').length < 3; k++) card = card.parentElement;
        const site = [...(card?.querySelectorAll('a[href^="http"]') || [])]
          .map((x) => x.href)
          .find((h) => !/google\.|gstatic\.|goo\.gl/.test(h));
        out.push({ name: a.getAttribute('aria-label') || '', href: a.href, text: card?.innerText || '', website: site || null });
      }
      return out;
    });

    const results = [];
    let details = 0;
    for (const c of cards.slice(0, max)) {
      if (!c.name) continue;
      const info = parseCardText(c.text);
      let place = {
        ...info,
        name: c.name,
        website: c.website,
        placeId: placeIdFrom(c.href, c.name, info.address),
        mapsUrl: c.href,
        source: 'maps',
      };
      // Sem telefone na lista: abre a ficha (poucas por busca, para não demorar)
      if (!place.rawPhone && details < maxDetails && Date.now() < deadline) {
        details++;
        try {
          const detail = await browser.newPage();
          detail.setDefaultTimeout(20000);
          try {
            await detail.goto(c.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await detail.waitForSelector('h1', { timeout: 15000 });
            await sleep(600);
            const full = await readPlace(detail);
            if (full) place = { ...place, ...Object.fromEntries(Object.entries(full).filter(([, v]) => v)) };
          } finally {
            await detail.close().catch(() => {});
          }
        } catch {
          // segue com o que veio da lista
        }
      }
      results.push(place);
      onProgress(place);
    }
    return results;
  } finally {
    await page.close().catch(() => {});
  }
}

async function readPlace(page) {
  const data = await page.evaluate(() => {
    const txt = (sel) => document.querySelector(sel)?.textContent?.trim() || null;
    const attr = (sel, a) => document.querySelector(sel)?.getAttribute(a) || null;
    const phoneId = attr('button[data-item-id^="phone:tel:"]', 'data-item-id');
    const ratingLabel = attr('div.F7nice span[aria-label]', 'aria-label') || '';
    const reviewsText = document.querySelector('div.F7nice')?.textContent || '';
    const reviewsMatch = reviewsText.match(/\(([\d.]+)\)/);
    return {
      name: txt('h1'),
      rawPhone: phoneId ? phoneId.replace('phone:tel:', '') : null,
      website: attr('a[data-item-id="authority"]', 'href'),
      address: attr('button[data-item-id="address"]', 'aria-label')?.replace(/^Endereço:\s*/, '') || null,
      category: txt('button[jsaction*="category"]'),
      rating: parseFloat((ratingLabel.match(/[\d,]+/) || [''])[0].replace(',', '.')) || null,
      reviews: reviewsMatch ? Number(reviewsMatch[1].replace(/\./g, '')) : 0,
    };
  });
  if (!data.name) return null;
  const url = page.url();
  return { ...data, placeId: placeIdFrom(url, data.name, data.address), mapsUrl: url, source: 'maps' };
}
