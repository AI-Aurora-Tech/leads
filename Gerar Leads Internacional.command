#!/bin/bash
# Robô de leads da AuroraTech — internacional: empresas de países de língua inglesa, contato por e-mail.
# Clique duas vezes (Mac) ou rode no Terminal: bash "Gerar Leads Internacional.command"
cd "$(dirname "$0")" || exit 1
echo "=============================================="
echo "   🌎  Robô de Leads Internacional — AuroraTech"
echo "=============================================="
echo
source scripts/preparar.sh

echo "🔎 Buscando 50 empresas com e-mail (EUA, Reino Unido, Canadá, Austrália, Irlanda e Nova Zelândia)."
echo "   No final ele pergunta se você quer +50 ou encerrar e abrir o painel de e-mails."
echo "   Pode rodar de novo no mesmo dia: ele continua de onde parou, sem repetir."
echo
npm run --silent gerar -- --internacional "$@"
STATUS=$?
echo
[ $STATUS -ne 0 ] && echo "❌ O robô parou por causa do erro acima. Se não souber resolver, copie a mensagem e me mande."
pausa
