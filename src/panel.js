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

export function leadToCard(lead, config) {
  const reasons = lead.reasons ? JSON.parse(lead.reasons) : {};
  return {
    id: lead.id,
    nome: lead.name,
    nomeCurto: shortName(lead.name),
    categoria: lead.category || '',
    cidade: lead.city || '',
    endereco: lead.address || '',
    telefone: lead.phone,
    telefoneFmt: formatPhone(lead.phone),
    tipoTelefone: lead.phone_type,
    site: lead.website || '',
    maps: lead.maps_url || '',
    nota: lead.rating,
    avaliacoes: lead.reviews || 0,
    score: lead.score ?? 0,
    tipo: reasons.kind || '',
    tipoLabel: KIND_LABEL[reasons.kind] || '',
    problemas: reasons.problems || [],
    mensagem: manualMessage(lead, config),
    contatado: lead.status === 'contatado',
    whatsapp: lead.wa_check === 1 ? 'sim' : lead.wa_check === 0 ? 'nao' : '',
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
  .actions label { margin-left:auto; display:flex; align-items:center; gap:6px; color:var(--muted); font-size:14px; }
  .empty { text-align:center; color:var(--muted); padding:40px 0; }
</style>
</head>
<body>
<header>
  <h1>${title} <small>· gerado em ${when}</small></h1>
  <div class="filters">
    <input type="search" id="q" placeholder="Buscar nome, nicho, cidade...">
    <select id="tipo"><option value="">Todos os motivos</option>${Object.entries(KIND_LABEL)
      .map(([k, v]) => `<option value="${k}">${v}</option>`)
      .join('')}</select>
    <select id="cat"><option value="">Todos os nichos</option></select>
    <label><input type="checkbox" id="hide" checked> Ocultar contatados</label>
    <label><input type="checkbox" id="cel" checked> Só celular</label>
    <label id="verifLabel" hidden><input type="checkbox" id="verif"> Só WhatsApp verificado</label>
  </div>
  <div class="stats" id="stats"></div>
  <div class="stats" id="novos" hidden><button class="btn" onclick="location.reload()">🔄 Há leads novos — clique para atualizar</button></div>
</header>
<main id="list"></main>
<script>
const LEADS = ${data};
const KEY = 'aurora-leads-contatados';
// Aberto pelo robô (http://localhost): "contatado" fica salvo no banco do robô e nunca se perde.
// Aberto como arquivo: fica salvo só neste navegador.
const SERVER = location.protocol.startsWith('http');
let done = {};
try { done = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}
for (const l of LEADS) if (l.contatado) done[l.id] = done[l.id] || true;
const save = (id) => {
  try { localStorage.setItem(KEY, JSON.stringify(done)); } catch {}
  if (SERVER && id != null) {
    fetch('api/contatado', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: Number(id), contatado: Boolean(done[id]) }) }).catch(() => {});
  }
};
if (LEADS.some((l) => l.whatsapp)) document.getElementById('verifLabel').hidden = false;
if (SERVER) {
  // Avisa quando o robô encontrar leads novos
  setInterval(async () => {
    try {
      const r = await (await fetch('api/total')).json();
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
    (!$('hide').checked || !done[l.id]) &&
    (!$('cel').checked || l.tipoTelefone === 'celular' || l.whatsapp === 'sim') &&
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
        <span class="tag">📞 \${esc(l.telefoneFmt)} · \${l.tipoTelefone === 'celular' ? 'celular' : 'fixo'}</span>
        \${l.whatsapp === 'sim' ? '<span class="tag">✅ WhatsApp verificado</span>' : ''}
      </div>
      \${l.problemas.length ? '<ul class="prob">' + l.problemas.map((p) => '<li>' + esc(p) + '</li>').join('') + '</ul>' : ''}
      <div class="links">
        \${l.site ? '<a href="' + esc(l.site) + '" target="_blank" rel="noopener">Ver site</a>' : ''}
        \${l.maps ? '<a href="' + esc(l.maps) + '" target="_blank" rel="noopener">Google Maps</a>' : ''}
        \${l.endereco ? '<span class="meta">' + esc(l.endereco) + '</span>' : ''}
      </div>
      <textarea>\${esc(l.mensagem)}</textarea>
      <div class="actions">
        <a class="btn wa" href="#" data-act="wa">💬 Abrir no WhatsApp</a>
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
  if (el.dataset.act === 'wa') {
    e.preventDefault();
    window.open(wa(lead.telefone, text), '_blank');
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
for (const id of ['q', 'tipo', 'cat', 'hide', 'cel', 'verif']) $(id).addEventListener('input', render);
render();
</script>
</body>
</html>
`;
}
