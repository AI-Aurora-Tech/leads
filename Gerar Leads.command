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
read -r -p "📍 Cidade (ex: Campinas, SP — várias separadas por ;): " CIDADE
read -r -p "🏷️  Nicho (Enter = TODOS os nichos; ou ex: padaria;barbearia): " NICHO
if [ -z "$CIDADE" ]; then echo "Cidade é obrigatória."; pausa; exit 1; fi

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

echo
echo "✅ Pronto! Seus leads estão em: $(pwd)/data/leads.html"
open data/leads.html 2>/dev/null
pausa
