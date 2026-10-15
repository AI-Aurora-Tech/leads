# AuroraTech Leads

Sistema de prospecção automática para a [AuroraTech](https://www.auroratech.app.br):

1. **Busca** empresas no Google (Places API ou Google Maps pelo navegador) por nicho + cidade
2. **Qualifica** cada uma: sem site, site que é só Instagram/Facebook, site fora do ar, sem HTTPS, não responsivo, lento, desatualizado, sem atendimento no WhatsApp…
3. **Gera a mensagem** personalizada com o motivo do contato (templates com variação de texto, ou IA com Claude)
4. **Envia pelo WhatsApp** — via WhatsApp Web (com limites e pausas que imitam uma pessoa) ou via **API oficial da Meta** (templates aprovados)
5. **Monitora respostas**: quem responde vira `respondeu` e você recebe um alerta no seu WhatsApp pessoal; quem pede para sair nunca mais recebe mensagem
6. **Follow-up** automático (1 vez) para quem não respondeu em 3 dias

## Jeito mais simples: painel de leads + botão do WhatsApp

> 🍎 **No Mac?** Siga o **[TUTORIAL-MAC.md](TUTORIAL-MAC.md)**: passo a passo do zero, sem precisar saber programar.

```bash
bash "Gerar Leads.command"        # busca no Brasil todo (113 nichos × 108 cidades) e abre o painel
bash "Abrir Painel.command"       # só abre o painel (http://localhost:4000)
bash "Verificar WhatsApp.command" # confere no WhatsApp Web quais números têm WhatsApp (não envia nada)
```

- O painel mostra cada lead com a **mensagem padrão** (`templates.manual` no config) e o botão **💬 Abrir no WhatsApp**.
  Quem você contata fica salvo no banco (`data/leads.db`).
- **Sem repetidos:** o mesmo lugar ou o mesmo telefone nunca entram duas vezes.
- **Navegador:** usa o Google Chrome/Edge/Brave instalado; se não houver, o Chrome do puppeteer.
- Opções avançadas: `npm run gerar -- --cidade "Recife, PE" --termo "padaria;barbearia"`.

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

## API oficial do WhatsApp (Meta Cloud API) — `--canal cloud`

Alternativa ao WhatsApp Web: envia pela API oficial da Meta, sem navegador e sem QR code.

**Regras da Meta que mudam tudo:**
- A **primeira mensagem tem que ser um template aprovado** (categoria *Marketing*). Texto livre só depois que o lead responder (janela de 24h).
- A política da Meta exige **opt-in** (o contato ter autorizado receber mensagens). Prospecção fria fere essa política: se muitos bloquearem/denunciarem, a **qualidade do número cai** e a Meta reduz seus limites ou restringe o número. Use volume baixo, mensagem relevante e botão de sair.
- **Paga por mensagem de marketing entregue** (no Brasil, cerca de US$ 0,06 cada; confira a tabela atual da Meta).
- Número novo começa limitado a **250 contatos novos por 24h**; sobe com verificação da empresa + boa qualidade.

### Passo a passo

1. **developers.facebook.com → seu app → WhatsApp → Configuração da API**
   - Copie o **Identificação do número de telefone** (Phone number ID) → `WHATSAPP_PHONE_NUMBER_ID` no `.env`.
   - No começo você tem um número de teste que só envia para até 5 números cadastrados. Para prospectar de verdade, clique em **Adicionar número de telefone** e use um **chip que não esteja no app WhatsApp** (ou apague a conta dele no app antes).
2. **Token permanente** (o token da tela de configuração expira em 24h):
   [business.facebook.com](https://business.facebook.com) → Configurações do negócio → **Usuários do sistema** → Adicionar (Admin) → **Atribuir ativos** (seu app + sua conta do WhatsApp) → **Gerar token** com as permissões `whatsapp_business_messaging` e `whatsapp_business_management` → `WHATSAPP_TOKEN`.
3. **Pagamento**: WhatsApp Manager → Configurações → adicione um cartão. Sem isso, os templates de marketing não são entregues.
4. **Teste** (isso também conclui a etapa "Testar casos de uso" do painel da Meta):
   ```bash
   node src/cli.js cloud-teste --para 5519999999999   # seu celular; envia o template hello_world
   ```
5. **Crie o template** em WhatsApp Manager → Modelos de mensagem → Criar modelo:
   - Categoria **Marketing**, nome **`aurora_prospeccao`**, idioma **Português (BR)**
   - Corpo (sugestão; variável não pode ficar no começo nem no fim do texto):
     ```
     Olá! Aqui é o Seu Nome, da AuroraTech. Encontrei a {{1}} no Google e notei que {{2}}. Criamos sites modernos e automatizamos o atendimento no WhatsApp com IA. Posso te mostrar alguns exemplos?
     ```
     Exemplos para a análise: `{{1}}` = `Clínica Sorriso`, `{{2}}` = `vocês ainda não têm um site próprio`
   - Botões de resposta rápida: **"Quero ver exemplos"** e **"Parar promoções"** (o sistema trata o segundo como opt-out)
   - A aprovação costuma levar de minutos a algumas horas.
   - Opcional: um template de follow-up com `{{1}}` = nome → configure em `cloud.templateFollowup.nome`.
6. **Webhook (para receber as respostas)**: o sistema abre um servidor local na porta 3000. Exponha para a internet:
   ```bash
   npx cloudflared tunnel --url http://localhost:3000     # ou: ngrok http 3000
   ```
   No app da Meta → WhatsApp → Configuração → Webhook: URL de callback = `https://SEU-TUNEL/webhook`,
   token de verificação = o mesmo `WHATSAPP_VERIFY_TOKEN` do `.env`. Depois, assine o campo **messages**.
   Coloque também `WHATSAPP_APP_SECRET` (Configurações do app → Básico → Chave secreta) para validar as chamadas.
   O sistema precisa estar rodando (`enviar`) quando você clicar em "Verificar e salvar".
7. **Envie**:
   ```bash
   node src/cli.js preview --canal cloud     # confere as variáveis de cada lead
   node src/cli.js enviar --canal cloud      # ou "canal": "cloud" no config.json
   ```

O que o sistema faz sozinho no canal cloud: envia o template com o nome e o motivo de cada lead. Também marca
`sem_whatsapp` (erro 131026) e `optout` (131050 ou "Parar promoções"), e avisa você quando alguém responde.
Se o token, a conta ou o template estiver com problema, ele para tudo para não queimar a fila.
O aviso de "lead respondeu" no seu WhatsApp pessoal (`OWNER_WHATSAPP`) só chega se você tiver mandado
alguma mensagem para o número da empresa nas últimas 24h (regra da janela). Ele também aparece no terminal.

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
