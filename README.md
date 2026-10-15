# AuroraTech Leads

Sistema de prospecção automática para a [AuroraTech](https://www.auroratech.app.br):

1. **Busca** empresas no Google (Places API ou Google Maps pelo navegador) por nicho + cidade
2. **Qualifica** cada uma: sem site, site que é só Instagram/Facebook, site fora do ar, sem HTTPS, não responsivo, lento, desatualizado, sem atendimento no WhatsApp…
3. **Gera a mensagem** personalizada com o motivo do contato (templates com variação de texto, ou IA com Claude)
4. **Envia pelo WhatsApp Web** com limites e pausas que imitam uma pessoa
5. **Monitora respostas**: quem responde vira `respondeu` e você recebe um alerta no seu WhatsApp pessoal; quem pede para sair nunca mais recebe mensagem
6. **Follow-up** automático (1 vez) para quem não respondeu em 3 dias

## Instalação (no seu computador)

Requer **Node.js 22.13+**.

```bash
git clone https://github.com/AI-Aurora-Tech/leads.git
cd leads
npm install
cp .env.example .env              # preencha as chaves (todas opcionais)
cp config.example.json config.json  # ajuste seu nome, cidades, nichos e limites
```

No `config.json`, troque pelo menos `remetente.nome` e a lista `busca.cidades`.

## Uso rápido

```bash
npm run buscar -- --termo "clínica odontológica" --cidade "Campinas, SP"
npm run buscar                 # roda TODOS os nichos x TODAS as cidades do config
npm run qualificar             # analisa sites e dá nota (score) a cada lead
npm run leads                  # lista os melhores leads
npm run preview                # mostra as mensagens que seriam enviadas
npm run enviar                 # abre o WhatsApp Web (QR code na 1ª vez) e começa a enviar
```

O `enviar` fica rodando: envia dentro do horário comercial, para no limite diário e continua ouvindo respostas.
Pare com `Ctrl+C`. Outros comandos:

```bash
node src/cli.js resumo                          # funil por status
node src/cli.js exportar --status respondeu     # CSV (abre no Excel)
node src/cli.js marcar 42 descartado            # muda status na mão
node src/cli.js preview --ia                    # testa mensagens geradas pela IA
```

## Fontes de busca

| Fonte | Como | Prós / contras |
|---|---|---|
| `places` (padrão) | [Google Places API (New)](https://console.cloud.google.com/apis/library/places.googleapis.com) — coloque `GOOGLE_PLACES_API_KEY` no `.env` | Rápida e estável. Até 60 resultados por busca. O Google dá crédito mensal gratuito; acima disso é cobrado. |
| `maps` | Abre o Google Maps num navegador e lê os resultados | Sem chave, mas mais lenta e pode quebrar se o Google mudar o layout. |

Sem chave configurada, o sistema usa `maps` automaticamente.

## Score (quem recebe mensagem primeiro)

| Sinal | Pontos |
|---|---|
| Sem site | +50 |
| "Site" é Instagram/Facebook/Linktree/etc. | +40 |
| Site fora do ar | +40 |
| Não responsivo (celular) | +20 |
| Sem HTTPS | +15 |
| Lento (> 4s) / rodapé com ano antigo | +10 cada |
| Sem chat/WhatsApp no site (oportunidade para IA) | +10 |
| Muitas avaliações no Google (empresa com movimento) | +5 a +20 |
| Telefone é celular | +10 |

Leads com score abaixo de `qualificacao.scoreMinimo` (30) são descartados. Empresas com site bom recebem a mensagem de **automação com IA** em vez da de site.

## ⚠️ Leia antes de enviar: como não ter o número bloqueado

O WhatsApp não tem API oficial para mensagens frias pelo WhatsApp Web. Automação pelo navegador **viola os termos de uso** do WhatsApp e o número pode ser banido se muita gente bloquear/denunciar. Para reduzir o risco:

- **Use um chip separado** (WhatsApp Business), nunca o seu número principal.
- **Aqueça o número**: use-o normalmente por 1–2 semanas antes; comece com `limiteDiario` de 10–15 e suba aos poucos (25–40 no máximo).
- Mantenha os intervalos aleatórios (padrão: 90–240 s, pausa longa a cada 8 envios) e o horário comercial.
- **Responda rápido** quem responder — conversa de mão dupla é o que mais protege o número.
- Mensagem curta, personalizada, sem link na primeira mensagem.
- O rodapé "responda SAIR" é respeitado automaticamente: o contato vai para `optout` e nunca mais recebe nada. Também ajuda com a **LGPD** (contato B2B com dados públicos da empresa, base de legítimo interesse, com opção de saída).

Para volume alto e sem risco de banimento, o caminho oficial é a WhatsApp Business Cloud API com templates aprovados pela Meta (pago por conversa).

## Personalização com IA (opcional)

Com `ANTHROPIC_API_KEY` no `.env` e `"usarIA": true` no `config.json`, cada primeira mensagem é escrita pelo Claude
usando os dados do lead (nicho, avaliações, problemas do site). Se a IA falhar, usa o template. Teste antes com `node src/cli.js preview --ia`.

## Status dos leads

`novo` → `qualificado` → `enviado` → `followup` → `respondeu` 🔥
Outros: `descartado`, `sem_whatsapp`, `optout`, `erro`.

Os dados ficam em `data/leads.db` (SQLite). A sessão do WhatsApp fica em `.wwebjs_auth/` (não compartilhe essa pasta).

## Testes

```bash
npm test
```
