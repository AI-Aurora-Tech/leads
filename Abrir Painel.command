#!/bin/bash
# Abre o painel com os leads já encontrados (sem buscar novos).
cd "$(dirname "$0")" || exit 1
source scripts/preparar.sh
npm run --silent painel
pausa
