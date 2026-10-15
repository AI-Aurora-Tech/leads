// Janela de envio (horário comercial) e atrasos aleatórios — reduzem o risco de bloqueio do número.

export function localParts(timeZone, date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return { weekday, hour: Number(parts.hour), minute: Number(parts.minute) };
}

export function inSendWindow(envio, date = new Date()) {
  const { weekday, hour } = localParts(envio.fusoHorario, date);
  return envio.diasSemana.includes(weekday) && hour >= envio.horarioInicio && hour < envio.horarioFim;
}

export function randomBetween(minSec, maxSec, rand = Math.random) {
  return Math.round((minSec + rand() * (maxSec - minSec)) * 1000);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
