// Gera uma página HTML com os leads e um botão que abre o WhatsApp (wa.me) com a mensagem pronta.
// Você envia manualmente pelo seu próprio WhatsApp.

import { formatPhone } from './phone.js';
import { buildMessage, renderTemplate, shortName } from './message.js';

const KIND_LABEL = {
  sem_site: 'Sem site',
  site_social: 'Só rede social',
  site_problemas: 'Site com problemas',
  site_ok: 'Site ok → IA',
};

export function waLink(phone, text) {
  return `https://wa.me/${phone}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/** Mensagem para envio manual: a mensagem padrão do config (templates.manual) ou o template por motivo, sem rodapé. */
export function manualMessage(lead, config) {
  if (config.templates.manual) {
    return renderTemplate(config.templates.manual, {
      nome: shortName(lead.name),
      cidade: lead.city || '',
      categoria: (lead.category || '').toLowerCase(),
    });
  }
  return buildMessage(lead, { ...config, templates: { ...config.templates, rodape: '' } });
}

/** created_at vem do SQLite em UTC ("2026-10-16 13:00:00"); compara com a data local do computador. */
function isToday(createdAt, now = new Date()) {
  if (!createdAt) return false;
  return new Date(`${createdAt.replace(' ', 'T')}Z`).toDateString() === now.toDateString();
}

/** E-mail para leads internacionais: assunto e corpo de config.internacional. */
export function emailMessage(lead, config) {
  const vars = { nome: shortName(lead.name), cidade: lead.city || '', categoria: (lead.category || '').toLowerCase() };
  return { assunto: renderTemplate(config.internacional.assunto, vars), corpo: renderTemplate(config.internacional.email, vars) };
}

export function leadToCard(lead, config) {
  const reasons = lead.reasons ? JSON.parse(lead.reasons) : {};
  const email = lead.lang === 'en' ? emailMessage(lead, config) : null;
  return {
    canal: email ? 'email' : 'whatsapp',
    email: lead.email || '',
    assunto: email?.assunto || '',
    id: lead.id,
    nome: lead.name,
    nomeCurto: shortName(lead.name),
    categoria: lead.category || '',
    cidade: lead.city || '',
    endereco: lead.address || '',
    telefone: lead.phone,
    telefoneFmt: lead.phone ? formatPhone(lead.phone) : lead.raw_phone || '',
    tipoTelefone: lead.phone_type,
    site: lead.website || '',
    maps: lead.maps_url || '',
    nota: lead.rating,
    avaliacoes: lead.reviews || 0,
    score: lead.score ?? 0,
    tipo: reasons.kind || '',
    tipoLabel: KIND_LABEL[reasons.kind] || '',
    problemas: reasons.problems || [],
    mensagem: email ? email.corpo : manualMessage(lead, config),
    contatado: lead.status === 'contatado',
    whatsapp: lead.wa_check === 1 ? 'sim' : lead.wa_check === 0 ? 'nao' : '',
    hoje: isToday(lead.created_at),
  };
}

export function renderPanel(cards, { title = 'Leads AuroraTech', generatedAt = new Date() } = {}) {
  // JSON dentro de <script>: escapa "<" para não fechar a tag
  const data = JSON.stringify(cards).replace(/</g, '\\u003c');
  const when = generatedAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  :root { --bg:#f6f7f9; --card:#fff; --text:#1a1d21; --muted:#667085; --line:#e4e7ec; --accent:#6d28d9; --wa:#1fa855; --tag:#f2f4f7; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0f1115; --card:#181b21; --text:#e8eaed; --muted:#98a2b3; --line:#2a2f37; --accent:#a78bfa; --wa:#25d366; --tag:#232830; }
  }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  body { margin:0; background:var(--bg); color:var(--text); font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
  header { position:sticky; top:0; z-index:2; background:var(--bg); border-bottom:1px solid var(--line); padding:12px 16px; }
  h1 { font-size:18px; margin:0 0 8px; }
  h1 small { color:var(--muted); font-weight:400; font-size:13px; }
  .filters { display:flex; flex-wrap:wrap; gap:8px; }
  .filters input[type=search], .filters select { flex:1 1 160px; min-width:0; padding:8px 10px; border:1px solid var(--line); border-radius:8px; background:var(--card); color:var(--text); font:inherit; }
  .filters label { display:flex; align-items:center; gap:6px; color:var(--muted); font-size:14px; }
  .stats { color:var(--muted); font-size:13px; margin-top:6px; }
  main { max-width:900px; margin:0 auto; padding:12px 16px 40px; display:grid; gap:12px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:14px; }
  .card.done { opacity:.55; }
  .top { display:flex; justify-content:space-between; gap:8px; align-items:flex-start; }
  .name { font-weight:650; font-size:16px; }
  .meta { color:var(--muted); font-size:13px; }
  .score { font-weight:700; color:var(--accent); white-space:nowrap; }
  .tags { display:flex; flex-wrap:wrap; gap:6px; margin:8px 0; }
  .tag { background:var(--tag); border-radius:999px; padding:2px 10px; font-size:12px; }
  .tag.k { background:var(--accent); color:#fff; }
  .links { display:flex; flex-wrap:wrap; gap:12px; font-size:13px; margin-bottom:8px; }
  .links a { color:var(--accent); }
  ul.prob { margin:0 0 8px 18px; padding:0; color:var(--muted); font-size:13px; }
  textarea { width:100%; min-height:110px; padding:10px; border:1px solid var(--line); border-radius:8px; background:var(--bg); color:var(--text); font:inherit; font-size:14px; resize:vertical; }
  .actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:8px; align-items:center; }
  .btn { display:inline-flex; align-items:center; gap:6px; padding:10px 14px; border-radius:8px; border:1px solid var(--line); background:var(--card); color:var(--text); font:inherit; font-weight:600; cursor:pointer; text-decoration:none; }
  .btn.wa { background:var(--wa); border-color:var(--wa); color:#fff; }
  .btn.mail { background:var(--accent); border-color:var(--accent); color:#fff; }
  .subj { width:100%; margin-bottom:6px; padding:8px 10px; border:1px solid var(--line); border-radius:8px; background:var(--bg); color:var(--text); font:inherit; font-size:14px; }
  .tabs { display:flex; gap:8px; margin-bottom:8px; }
  .tabs a { padding:6px 12px; border-radius:999px; border:1px solid var(--line); color:var(--text); text-decoration:none; font-size:14px; }
  .tabs a.on { background:var(--accent); border-color:var(--accent); color:#fff; }
  .actions label { margin-left:auto; display:flex; align-items:center; gap:6px; color:var(--muted); font-size:14px; }
  .offline { margin-top:8px; padding:10px 12px; border-radius:8px; background:#fef3c7; color:#78350f; font-size:14px; }
  .empty { text-align:center; color:var(--muted); padding:40px 0; }
</style>
</head>
<body>
<header>
  <h1>${title} <small>· gerado em ${when}</small></h1>
  <nav class="tabs"><a href="?" id="tabWa">💬 WhatsApp (Brasil)</a><a href="?canal=email" id="tabEmail">✉️ E-mail (internacional)</a></nav>
  <div class="filters">
    <input type="search" id="q" placeholder="Buscar nome, nicho, cidade...">
    <select id="tipo"><option value="">Todos os motivos</option>${Object.entries(KIND_LABEL)
      .map(([k, v]) => `<option value="${k}">${v}</option>`)
      .join('')}</select>
    <select id="cat"><option value="">Todos os nichos</option></select>
    <label><input type="checkbox" id="hoje" checked> Só os de hoje</label>
    <label><input type="checkbox" id="hide" checked> Ocultar contatados</label>
    <label id="celLabel"><input type="checkbox" id="cel" checked> Só celular</label>
    <label id="verifLabel" hidden><input type="checkbox" id="verif"> Só WhatsApp verificado</label>
  </div>
  <div class="stats" id="stats"></div>
  <div class="offline" id="offline" hidden>⚠️ O robô está fechado, então o "Contatado" não foi salvo no robô (ficou guardado neste navegador).
    Abra o <b>Abrir Painel.command</b> e recarregue esta página para salvar. Sem isso, o lead pode aparecer de novo.</div>
  <div class="stats" id="novos" hidden><button class="btn" onclick="location.reload()">🔄 Há leads novos — clique para atualizar</button></div>
</header>
<main id="list"></main>
<script>
const CANAL = new URLSearchParams(location.search).get('canal') === 'email' ? 'email' : 'whatsapp';
const LEADS = ${data}.filter((l) => l.canal === CANAL);
const KEY = 'aurora-leads-contatados';
// Aberto pelo robô (http://localhost): "contatado" fica salvo no banco do robô e nunca se perde.
// Aberto como arquivo: fica salvo só neste navegador.
const SERVER = location.protocol.startsWith('http');
// Com o robô, o banco é a única fonte: o que ficou no navegador de outra versão não se mistura
// (os números dos leads mudam entre bancos e marcariam a empresa errada).
let done = {};
if (!SERVER) try { done = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}
for (const l of LEADS) if (l.contatado) done[l.id] = done[l.id] || true;
// Se o robô foi fechado, o "contatado" fica guardado aqui (pelo telefone/e-mail) e é enviado depois
const PENDING = 'aurora-leads-pendentes';
const pending = () => { try { return JSON.parse(localStorage.getItem(PENDING) || '[]'); } catch { return []; } };
const setPending = (list) => { try { localStorage.setItem(PENDING, JSON.stringify(list)); } catch {} };
const post = (item) => fetch('api/contatado', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item) })
  .then((r) => { if (!r.ok && r.status !== 404) throw new Error(r.status); });
function offline(on) {
  document.getElementById('offline').hidden = !on;
}
const save = (id) => {
  if (!SERVER) try { localStorage.setItem(KEY, JSON.stringify(done)); } catch {}
  if (SERVER && id != null) {
    const l = LEADS.find((x) => String(x.id) === String(id));
    const item = { id: Number(id), contatado: Boolean(done[id]), telefone: l?.telefone || null, email: l?.email || null };
    post(item).then(() => offline(false)).catch(() => {
      setPending([...pending().filter((p) => p.id !== item.id), item]);
      offline(true);
    });
  }
};
if (SERVER && pending().length) {
  // Reenvia o que ficou guardado quando o robô estava fechado
  Promise.allSettled(pending().map((p) => post(p).then(() => p.id))).then((res) => {
    const sent = new Set(res.filter((r) => r.status === 'fulfilled').map((r) => r.value));
    const left = pending().filter((p) => !sent.has(p.id));
    setPending(left);
    offline(left.length > 0);
  });
}
document.getElementById(CANAL === 'email' ? 'tabEmail' : 'tabWa').classList.add('on');
if (CANAL === 'email') document.getElementById('celLabel').hidden = true;
if (LEADS.some((l) => l.whatsapp)) document.getElementById('verifLabel').hidden = false;
if (SERVER) {
  // Avisa quando o robô encontrar leads novos
  setInterval(async () => {
    try {
      const r = await (await fetch('api/total?canal=' + CANAL)).json();
      if (r.total !== LEADS.length) {
        if (!LEADS.length) location.reload(); // primeiros leads: mostra direto
        else document.getElementById('novos').hidden = false;
      }
    } catch {}
  }, LEADS.length ? 20000 : 8000);
}
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const wa = (phone, text) => 'https://wa.me/' + phone + '?text=' + encodeURIComponent(text);
const gmail = (to, su, body) => 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(to) + '&su=' + encodeURIComponent(su) + '&body=' + encodeURIComponent(body);

for (const c of [...new Set(LEADS.map((l) => l.categoria).filter(Boolean))].sort()) {
  $('cat').insertAdjacentHTML('beforeend', '<option>' + esc(c) + '</option>');
}

function updateStats(shown) {
  const total = Object.keys(done).filter((id) => LEADS.some((l) => String(l.id) === id)).length;
  $('stats').textContent = (shown ?? $('list').querySelectorAll('.card').length) + ' leads na lista · ' + total + ' de ' + LEADS.length + ' já contatados';
}

function render() {
  const q = $('q').value.toLowerCase().trim();
  const rows = LEADS.filter((l) =>
    (!$('hoje').checked || l.hoje) &&
    (!$('hide').checked || !done[l.id]) &&
    (CANAL === 'email' || !$('cel').checked || l.tipoTelefone === 'celular' || l.whatsapp === 'sim') &&
    (!$('verif').checked || l.whatsapp === 'sim') &&
    (!$('tipo').value || l.tipo === $('tipo').value) &&
    (!$('cat').value || l.categoria === $('cat').value) &&
    (!q || (l.nome + ' ' + l.categoria + ' ' + l.cidade + ' ' + l.endereco).toLowerCase().includes(q)));
  updateStats(rows.length);
  $('list').innerHTML = rows.length ? rows.map((l) => \`
    <article class="card \${done[l.id] ? 'done' : ''}" data-id="\${l.id}">
      <div class="top">
        <div>
          <div class="name">\${esc(l.nome)}</div>
          <div class="meta">\${esc(l.categoria)}\${l.cidade ? ' · ' + esc(l.cidade) : ''}\${l.nota ? ' · ⭐ ' + l.nota + ' (' + l.avaliacoes + ')' : ''}</div>
        </div>
        <div class="score">\${l.score} pts</div>
      </div>
      <div class="tags">
        \${l.tipoLabel ? '<span class="tag k">' + esc(l.tipoLabel) + '</span>' : ''}
        \${l.canal === 'email'
          ? '<span class="tag">✉️ ' + esc(l.email) + '</span>' + (l.telefoneFmt ? '<span class="tag">📞 ' + esc(l.telefoneFmt) + '</span>' : '')
          : '<span class="tag">📞 ' + esc(l.telefoneFmt) + ' · ' + (l.tipoTelefone === 'celular' ? 'celular' : 'fixo') + '</span>'}
        \${l.whatsapp === 'sim' ? '<span class="tag">✅ WhatsApp verificado</span>' : ''}
      </div>
      \${l.problemas.length ? '<ul class="prob">' + l.problemas.map((p) => '<li>' + esc(p) + '</li>').join('') + '</ul>' : ''}
      <div class="links">
        \${l.site ? '<a href="' + esc(l.site) + '" target="_blank" rel="noopener">Ver site</a>' : ''}
        \${l.maps ? '<a href="' + esc(l.maps) + '" target="_blank" rel="noopener">Google Maps</a>' : ''}
        \${l.endereco ? '<span class="meta">' + esc(l.endereco) + '</span>' : ''}
      </div>
      \${l.canal === 'email' ? '<input class="subj" value="' + esc(l.assunto) + '" aria-label="Assunto">' : ''}
      <textarea>\${esc(l.mensagem)}</textarea>
      <div class="actions">
        \${l.canal === 'email'
          ? '<a class="btn mail" href="#" data-act="gmail">✉️ Abrir no Gmail</a><a class="btn" href="#" data-act="mailto">Abrir no app de e-mail</a>'
          : '<a class="btn wa" href="#" data-act="wa">💬 Abrir no WhatsApp</a>'}
        <button class="btn" data-act="copy">Copiar mensagem</button>
        <label><input type="checkbox" data-act="done" \${done[l.id] ? 'checked' : ''}> Contatado</label>
      </div>
    </article>\`).join('') : (LEADS.length ? '<p class="empty">Nenhum lead com esses filtros.</p>' : '<p class="empty">⏳ O robô está buscando os primeiros leads.<br>Esta página avisa quando eles chegarem — pode deixar aberta.</p>');
}

$('list').addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const card = el.closest('.card');
  const lead = LEADS.find((l) => String(l.id) === card.dataset.id);
  const text = card.querySelector('textarea').value;
  const subject = card.querySelector('.subj')?.value || '';
  const open = { wa: () => wa(lead.telefone, text), gmail: () => gmail(lead.email, subject, text), mailto: () => 'mailto:' + lead.email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(text) }[el.dataset.act];
  if (open) {
    e.preventDefault();
    if (el.dataset.act === 'mailto') location.href = open(); else window.open(open(), '_blank');
    done[lead.id] = new Date().toISOString(); save(lead.id);
    card.classList.add('done'); card.querySelector('[data-act=done]').checked = true;
    updateStats();
  } else if (el.dataset.act === 'copy') {
    try { await navigator.clipboard.writeText(text); el.textContent = 'Copiado ✓'; } catch { el.textContent = 'Selecione e copie'; }
    setTimeout(() => (el.textContent = 'Copiar mensagem'), 1500);
  }
});
$('list').addEventListener('change', (e) => {
  if (e.target.dataset.act !== 'done') return;
  const id = e.target.closest('.card').dataset.id;
  if (e.target.checked) done[id] = new Date().toISOString(); else delete done[id];
  save(id); render();
});
for (const id of ['q', 'tipo', 'cat', 'hoje', 'hide', 'cel', 'verif']) $(id).addEventListener('input', render);
render();
</script>
</body>
</html>
`;
}
