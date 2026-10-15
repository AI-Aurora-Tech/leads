#!/bin/bash
# Confere quais números têm WhatsApp (pelo WhatsApp Web, com QR code). Não envia nenhuma mensagem.
cd "$(dirname "$0")" || exit 1
source scripts/preparar.sh
echo "📱 Vai aparecer um QR Code: no celular, abra o WhatsApp > Aparelhos conectados > Conectar um aparelho."
echo "   Nenhuma mensagem é enviada; o robô só confere se cada número tem WhatsApp."
echo
npm run --silent verificar -- "$@"
pausa
