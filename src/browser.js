// Escolhe um navegador que funcione: primeiro o Chrome/Edge/Brave já instalado no computador
// (mais confiável), depois o Chrome que o puppeteer baixa.

import { existsSync } from 'node:fs';
import { join } from 'node:path';

export class BrowserMissingError extends Error {
  constructor(detail) {
    super(
      'Não consegui abrir nenhum navegador para pesquisar no Google Maps.\n' +
        '   Instale o Google Chrome (https://www.google.com/chrome) e rode o robô de novo.' +
        (detail ? `\n   Detalhe técnico: ${detail}` : ''),
    );
    this.name = 'BrowserMissingError';
  }
}

export function systemBrowserPaths(platform = process.platform, env = process.env) {
  if (platform === 'darwin') {
    const apps = [
      'Google Chrome.app/Contents/MacOS/Google Chrome',
      'Chromium.app/Contents/MacOS/Chromium',
      'Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      'Brave Browser.app/Contents/MacOS/Brave Browser',
    ];
    return apps.flatMap((a) => [join('/Applications', a), join(env.HOME || '', 'Applications', a)]);
  }
  if (platform === 'win32') {
    const roots = [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(Boolean);
    return roots.flatMap((r) => [
      join(r, 'Google/Chrome/Application/chrome.exe'),
      join(r, 'Microsoft/Edge/Application/msedge.exe'),
    ]);
  }
  return ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
}

/** Caminhos de navegador em ordem de preferência (só os que existem). */
export async function browserCandidates() {
  const list = [];
  if (process.env.CHROME_PATH) list.push(process.env.CHROME_PATH);
  list.push(...systemBrowserPaths());
  try {
    const { default: puppeteer } = await import('puppeteer');
    list.push(puppeteer.executablePath());
  } catch {
    // puppeteer sem navegador baixado
  }
  return [...new Set(list)].filter((p) => p && existsSync(p));
}

let working; // caminho que já funcionou nesta execução

/** Abre um navegador com o puppeteer, tentando cada candidato até um funcionar. */
export async function launchBrowser(options = {}) {
  const { default: puppeteer } = await import('puppeteer');
  const candidates = working ? [working] : await browserCandidates();
  let lastError;
  for (const executablePath of candidates) {
    try {
      const browser = await puppeteer.launch({ ...options, executablePath });
      working = executablePath;
      return browser;
    } catch (err) {
      lastError = err;
    }
  }
  working = undefined;
  throw new BrowserMissingError(lastError?.message.split('\n')[0]);
}

/** Primeiro navegador que abre de verdade — usado pelo WhatsApp Web. */
export async function workingBrowserPath() {
  if (working) return working;
  const browser = await launchBrowser({ headless: true, args: ['--no-sandbox'] });
  await browser.close();
  return working;
}
