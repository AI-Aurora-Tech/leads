#!/bin/bash
# Robô de leads da AuroraTech: busca empresas no Brasil todo e abre o painel.
# Clique duas vezes (Mac) ou rode no Terminal: bash "Gerar Leads.command"
cd "$(dirname "$0")" || exit 1
echo "=============================================="
echo "   🤖  Robô de Leads — AuroraTech"
echo "=============================================="
echo
source scripts/preparar.sh

echo "🔎 Buscando empresas no Brasil todo (113 nichos × 108 cidades)."
echo "   O painel abre no navegador e avisa quando chegam leads novos."
echo "   Para parar: Ctrl+C. Rodando de novo, ele continua de onde parou."
echo
npm run --silent gerar -- "$@"
STATUS=$?
echo
[ $STATUS -ne 0 ] && echo "❌ O robô parou por causa do erro acima. Se não souber resolver, copie a mensagem e me mande."
pausa
