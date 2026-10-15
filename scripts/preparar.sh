#!/bin/bash
# Preparação comum aos atalhos do Mac: Node, dependências e navegador.
# Uso: source scripts/preparar.sh   (a partir da pasta do robô)

pausa() { echo; read -r -p "Aperte Enter para fechar..." _; }

if ! command -v node >/dev/null 2>&1; then
  echo "❌ O Node.js não está instalado. Baixe a versão LTS em https://nodejs.org, instale e rode de novo."
  open "https://nodejs.org" 2>/dev/null
  pausa; exit 1
fi
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=13)?0:1)'; then
  echo "❌ Seu Node.js ($(node -v)) é antigo. Instale a versão LTS em https://nodejs.org e rode de novo."
  open "https://nodejs.org" 2>/dev/null
  pausa; exit 1
fi

if [ ! -d node_modules ]; then
  echo "📦 Primeira vez: instalando o robô (leva alguns minutos)..."
  npm install --no-audit --no-fund || { echo "❌ Falha no npm install. Veja a mensagem acima."; pausa; exit 1; }
  echo
fi

# Versões antigas do atalho copiavam a configuração inteira para config.json, o que travava
# as novidades (cidades, mensagem padrão). Guarda essa cópia e volta a usar o padrão.
if [ -f config.json ] && grep -q '"aurora_prospeccao"' config.json; then
  mv config.json config.antigo.json
  echo "ℹ️  Configuração antiga guardada em config.antigo.json (agora o robô usa a configuração nova)."
fi
[ -f .env ] || cp .env.example .env

# Navegador: usa o Google Chrome do Mac; se não houver, tenta baixar um
if ! npm run --silent navegador; then
  echo "🌐 Tentando baixar um navegador para o robô (~150 MB)..."
  npx --no-install puppeteer browsers install chrome >/dev/null 2>&1
  if ! npm run --silent navegador; then
    echo
    echo "❌ Instale o Google Chrome (https://www.google.com/chrome) e rode o robô de novo."
    open "https://www.google.com/chrome" 2>/dev/null
    pausa; exit 1
  fi
fi
echo
