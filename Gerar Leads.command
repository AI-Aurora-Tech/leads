#!/bin/bash
# Robô de leads da AuroraTech — clique duas vezes (Mac) ou rode: bash "Gerar Leads.command"
cd "$(dirname "$0")" || exit 1

pausa() { echo; read -r -p "Aperte Enter para fechar..." _; }

echo "=============================================="
echo "   🤖  Robô de Leads — AuroraTech"
echo "=============================================="
echo

# 1) Node.js instalado e na versão certa?
if ! command -v node >/dev/null 2>&1; then
  echo "❌ O Node.js não está instalado."
  echo "   Baixe a versão LTS em https://nodejs.org, instale e rode o robô de novo."
  open "https://nodejs.org" 2>/dev/null
  pausa; exit 1
fi
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=13)?0:1)'; then
  echo "❌ Seu Node.js ($(node -v)) é antigo. Instale a versão LTS em https://nodejs.org e rode de novo."
  open "https://nodejs.org" 2>/dev/null
  pausa; exit 1
fi

# 2) Primeira execução: instala dependências e cria as configurações
if [ ! -d node_modules ]; then
  echo "📦 Primeira vez: instalando o robô (leva alguns minutos e baixa um navegador)..."
  npm install || { echo "❌ Falha no npm install. Veja a mensagem acima."; pausa; exit 1; }
  echo
fi
# O npm novo bloqueia o script que baixa o navegador do robô; baixa explicitamente se faltar
if ! node --input-type=module -e "import p from 'puppeteer'; import { existsSync } from 'node:fs'; process.exit(existsSync(p.executablePath()) ? 0 : 1)" 2>/dev/null; then
  echo "🌐 Baixando o navegador que o robô usa para pesquisar no Google Maps (~150 MB, só na primeira vez)..."
  if ! npx --no-install puppeteer browsers install chrome; then
    echo "⚠️  Não consegui baixar o navegador do robô. Vou tentar usar o Google Chrome do seu Mac."
    echo "   Se não tiver o Chrome instalado, baixe em https://www.google.com/chrome e rode de novo."
  fi
  echo
fi

[ -f config.json ] || cp config.example.json config.json
[ -f .env ] || cp .env.example .env

# 3) Nome que aparece na mensagem ("Aqui é <nome>, da AuroraTech")
if grep -q '"Seu Nome"' config.json; then
  read -r -p "👤 Seu nome (vai aparecer na mensagem): " NOME
  if [ -n "$NOME" ]; then
    NOME="$NOME" node -e '
      const fs = require("fs");
      const c = JSON.parse(fs.readFileSync("config.json", "utf8"));
      c.remetente = { ...(c.remetente || {}), nome: process.env.NOME };
      fs.writeFileSync("config.json", JSON.stringify(c, null, 2));'
  fi
fi

# 4) O que buscar
echo
echo "   (o robô trabalha com telefones do Brasil — cidades de outros países não geram leads)"
read -r -p "📍 Cidade (ex: Campinas, SP — várias separadas por ;): " CIDADE
read -r -p "🏷️  Nicho (Enter ou 'todos' = TODOS os nichos; ou ex: padaria;barbearia): " NICHO
if [ -z "$CIDADE" ]; then echo "Cidade é obrigatória."; pausa; exit 1; fi
NICHO_LOWER=$(printf '%s' "$NICHO" | tr '[:upper:]' '[:lower:]' | tr -d ' ')
case "$NICHO_LOWER" in todos|todas|tudo|all|"*") NICHO="" ;; esac

echo
echo "🔎 Buscando... O painel abre no navegador assim que os primeiros leads aparecerem"
echo "   e vai sendo atualizado (aperte F5 / Cmd+R na página). Para parar: Ctrl+C."
echo "   Se parar no meio, rode de novo: ele continua de onde parou."
echo

if [ -n "$NICHO" ]; then
  npm run --silent gerar -- --cidade "$CIDADE" --termo "$NICHO"
else
  npm run --silent gerar -- --cidade "$CIDADE"
fi

STATUS=$?
echo
if [ $STATUS -ne 0 ]; then
  echo "❌ O robô parou por causa do erro acima. Se não souber resolver, copie a mensagem e me mande."
else
  echo "✅ Pronto! Seus leads estão em: $(pwd)/data/leads.html"
  open data/leads.html 2>/dev/null
fi
pausa
