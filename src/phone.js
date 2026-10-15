// Normalização de telefones brasileiros para o formato usado pelo WhatsApp (55 + DDD + número).

const VALID_DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/**
 * @returns {{ e164: string, type: 'celular' | 'fixo' } | null}
 *   e164 sem o "+", ex: "5519999998888". null quando não é um número de contato válido
 *   (0800, 4004, DDD inexistente, etc.).
 */
export function normalizePhone(raw) {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, '');
  if (d.startsWith('0800') || d.startsWith('0300') || d.startsWith('0500') || d.startsWith('0900')) return null;

  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  // Remove zero de longa distância + código de operadora (ex: 0 15 19 99999-8888)
  if (d.startsWith('0') && (d.length === 13 || d.length === 14)) d = d.slice(3);
  if (d.startsWith('0') && (d.length === 11 || d.length === 12)) d = d.slice(1);

  if (d.length !== 10 && d.length !== 11) return null;

  const ddd = Number(d.slice(0, 2));
  if (!VALID_DDDS.has(ddd)) return null;
  let local = d.slice(2);

  // Celular antigo sem o nono dígito
  if (local.length === 8 && /^[6-9]/.test(local)) local = `9${local}`;

  if (local.length === 9 && local.startsWith('9')) return { e164: `55${ddd}${local}`, type: 'celular' };
  if (local.length === 8 && /^[2-5]/.test(local)) return { e164: `55${ddd}${local}`, type: 'fixo' };
  return null;
}

export function formatPhone(e164) {
  const ddd = e164.slice(2, 4);
  const n = e164.slice(4);
  return n.length === 9 ? `(${ddd}) ${n.slice(0, 5)}-${n.slice(5)}` : `(${ddd}) ${n.slice(0, 4)}-${n.slice(4)}`;
}
