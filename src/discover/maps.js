// Busca sem chave de API: abre o Google Maps num navegador (puppeteer) e lê os resultados.
// Mais lento e sujeito a mudanças de layout do Google — use a Places API quando puder.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class BrowserMissingError extends Error {
  constructor() {
    super(
      'O navegador do robô não está instalado. Rode no Terminal, dentro da pasta do robô:\n' +
        '     npx puppeteer browsers install chrome\n' +
        '   (ou instale o Google Chrome normal: https://www.google.com/chrome) e tente de novo.',
    );
    this.name = 'BrowserMissingError';
  }
}

/** Abre o Chrome do puppeteer; se ele não foi baixado, tenta o Google Chrome instalado no computador. */
export async function launchBrowser(options) {
  const { default: puppeteer } = await import('puppeteer');
  try {
    return await puppeteer.launch(options);
  } catch (err) {
    if (!/could not find (chrome|expected browser)|browser was not found/i.test(err.message)) throw err;
    try {
      return await puppeteer.launch({ ...options, channel: 'chrome' });
    } catch {
      throw new BrowserMissingError();
    }
  }
}

export async function searchMaps({ query, max = 60, headless = true }) {
  const browser = await launchBrowser({ headless, args: ['--lang=pt-BR', '--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9' });
    await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=pt-BR`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    // Tela de consentimento de cookies (UE / alguns IPs)
    const consent = await page.$('form[action*="consent"] button');
    if (consent) {
      await consent.click();
      await page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {});
    }

    const feed = await page.waitForSelector('div[role="feed"]', { timeout: 20000 }).catch(() => null);
    if (!feed) {
      // Busca muito específica abre direto a ficha de um único lugar
      const single = await readPlace(page);
      return single ? [single] : [];
    }

    let links = [];
    for (let i = 0; i < 40 && links.length < max; i++) {
      await page.evaluate(() => {
        const f = document.querySelector('div[role="feed"]');
        f?.scrollBy(0, 2500);
      });
      await sleep(1200);
      links = await page.$$eval('div[role="feed"] a[href*="/maps/place/"]', (as) => [
        ...new Set(as.map((a) => a.href)),
      ]);
      const end = await page.evaluate(() => document.body.innerText.includes('Você chegou ao final da lista'));
      if (end) break;
    }

    const results = [];
    for (const link of links.slice(0, max)) {
      try {
        await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForSelector('h1', { timeout: 15000 });
        await sleep(800);
        const place = await readPlace(page);
        if (place) results.push(place);
      } catch (err) {
        console.warn(`  ! falha ao ler ${link.slice(0, 80)}...: ${err.message}`);
      }
      await sleep(500 + Math.random() * 1000);
    }
    return results;
  } finally {
    await browser.close();
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
  const idMatch = url.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i);
  return {
    ...data,
    placeId: idMatch ? `maps:${idMatch[1]}` : `maps:${data.name}|${data.address}`,
    mapsUrl: url,
    source: 'maps',
  };
}
