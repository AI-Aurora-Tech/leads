#!/bin/bash
# Robô de leads da AuroraTech: busca empresas no Brasil todo e abre o painel.
# Clique duas vezes (Mac) ou rode no Terminal: bash "Gerar Leads.command"
cd "$(dirname "$0")" || exit 1
echo "=============================================="
echo "   🤖  Robô de Leads — AuroraTech"
echo "=============================================="
echo
source scripts/preparar.sh

echo "🔎 Buscando 50 leads novos. Ordem: 1) SP, RJ, MG e RS  2) empresas gringas (e-mail)  3) demais estados."
echo "   No final ele pergunta se você quer +50 ou encerrar e abrir o painel."
echo "   Pode rodar de novo no mesmo dia: ele continua de onde parou, sem repetir."
echo
npm run --silent gerar -- "$@"
STATUS=$?
echo
[ $STATUS -ne 0 ] && echo "❌ O robô parou por causa do erro acima. Se não souber resolver, copie a mensagem e me mande."
pausa
