# Tutorial: usando o Robô de Leads no Mac

O que o robô faz: procura empresas de **162 tipos de negócio** (de padaria a construtora) em **197 cidades e bairros do
Brasil todo** (todas as capitais, as maiores cidades do interior e os principais bairros de São Paulo, Rio, BH e Porto Alegre). Ele analisa o site de cada uma e monta um
**painel** com os melhores leads. Em cada lead tem o botão **💬 Abrir no WhatsApp**, que abre a conversa já com
a mensagem padrão da Aurora Tech escrita. Você só aperta enviar.

Também tem o **modo internacional** (passo 6): empresas dos EUA, Reino Unido, Canadá, Austrália, Irlanda e
Nova Zelândia, com o **e-mail** encontrado no site de cada uma, para você mandar a mensagem em inglês por e-mail.

**Garantias:**
- **Sem leads repetidos:** a mesma empresa entra uma vez só. O robô compara o lugar no Google, o telefone,
  o e-mail e o nome da empresa (ou do profissional) no mesmo estado: "Psicóloga Ana Souza" e "Ana Souza Psicologia"
  contam como a mesma pessoa.
  Quem você marca como **contatado** fica salvo e não volta como lead novo.
- **Confere o seu WhatsApp:** no fim de cada rodada, o robô olha as suas conversas e tira do painel quem você já
  contatou, mesmo que tenha sido fora do robô. Para ativar, conecte o WhatsApp **uma vez** com o **Verificar WhatsApp** (passo 5).
- **Variedade:** de cada busca entram só os **3 melhores** leads. Cada rodada de 50 passa por uns 17 nichos e cidades
  diferentes, em vez de vir tudo do mesmo tipo de negócio.
- **Histórico guardado fora da pasta do robô**, na pasta **`AuroraLeads`** da sua pasta pessoal. Baixar uma versão
  nova não apaga nada, e não precisa mais copiar a pasta `data`.
- **Só números de WhatsApp:** o painel mostra por padrão só **celulares**. Para ter certeza absoluta, rode o
  **Verificar WhatsApp** (passo 5): ele confere número por número no WhatsApp Web, sem enviar nada, e tira do
  painel quem não tem WhatsApp.

---

## 1. Instale o que precisa (só na primeira vez)

1. **Google Chrome**: se ainda não tiver, baixe em **https://www.google.com/chrome**. O robô usa o Chrome para pesquisar no Google Maps.
2. **Node.js**: acesse **https://nodejs.org**, baixe a versão **LTS** e instale (clique em *Continuar* até terminar).

## 2. Baixe o robô

1. Entre em **https://github.com/AI-Aurora-Tech/leads** (logado no GitHub)
2. Botão verde **`<> Code`** → **Download ZIP**
3. Clique duas vezes no ZIP na pasta **Downloads**. Vai aparecer a pasta **`leads-main`**.

> Já tinha uma versão antiga? **Não apague as pastas antigas antes de rodar a versão nova uma vez.** Na primeira
> vez, o robô procura as versões antigas na pasta Downloads (`leads-main`, `leads-main 2`…). Ele junta todos os
> leads e contatados delas no histórico fixo (`AuroraLeads`). Depois disso as pastas antigas podem ir para o lixo.

## 3. Rode o robô

1. Abra o **Terminal** (`⌘ Cmd + Espaço` → digite Terminal → Enter)
2. Digite `cd ` (com espaço), **arraste a pasta `leads-main` para a janela do Terminal** e aperte Enter
3. Digite e aperte Enter:
   ```
   bash "Gerar Leads.command"
   ```

Ele instala o que precisa (na primeira vez), confere o navegador e começa a buscar.
Para cada empresa encontrada aparece um ponto `.` e, depois de cada busca, o andamento (ex.: `12/50 leads novos nesta rodada`).

**Quando chega a 50 leads novos** (celulares, já analisados), ele pergunta:

```
👉 Quer mais 50 leads? Digite S para +50 ou N para encerrar e abrir o painel:
```

- **S** + Enter: busca mais 50 e pergunta de novo no final.
- **N** + Enter: para de buscar e **abre o painel** no navegador (`http://localhost:4000`) com os **leads do dia**.

**Ordem da busca** (ele só passa para a próxima fase quando termina todas as buscas da anterior):
1. **Estados principais:** SP, RJ, MG e RS (140 cidades e bairros), contato por WhatsApp
2. **Empresas gringas:** EUA, Reino Unido, Canadá, Austrália, Irlanda e Nova Zelândia, contato por **e-mail** (veja o passo 6)
3. **Demais estados do Brasil** (57 cidades, incluindo PR, SC e DF), contato por WhatsApp

O painel mostra os leads de WhatsApp na aba **💬 WhatsApp (Brasil)** e os de e-mail na aba **✉️ E-mail (internacional)**.
Para mudar quais estados vêm primeiro, use `"busca": { "estadosPrioritarios": ["SP", "RJ", "MG"] }` no `config.json` (passo 9).

**Dá para rodar várias vezes no mesmo dia** (de manhã, no meio do dia, no fim do dia). Cada vez ele busca **50 leads novos**,
continua de onde parou e nunca repete empresa. O painel mostra todos os leads do dia, de todas as rodadas.

> ⏱️ Sem chave do Google, cada rodada de 50 leads deve levar de 30 minutos a 1 hora (com a chave do passo 7 é bem mais rápido).
> Outra quantidade por rodada: `bash "Gerar Leads.command" --meta 30`.
> **Para parar antes:** `Ctrl + C`. Deixe a janela do Terminal aberta enquanto usa o painel.

Avisos amarelos do `npm` (`deprecated`, `vulnerabilities`, `install-scripts blocked`) são normais.

## 4. Use o painel

Por padrão aparecem só os leads **de hoje**. Desmarque **Só os de hoje** para ver também os de dias anteriores que você ainda não contatou.
Cada empresa aparece com pontuação, motivo (sem site, só Instagram, site com problemas…), telefone, avaliação,
links do site e do Google Maps, e a **mensagem padrão** pronta (dá para editar antes de enviar).

- **💬 Abrir no WhatsApp**: abre a conversa com a mensagem escrita. O lead fica marcado como **Contatado**, e isso fica salvo no robô.
- Filtros: busca por nome/cidade, motivo, nicho, **só os de hoje**, **só celular** (ligado por padrão) e **só WhatsApp verificado**.

💡 Instale o **WhatsApp para Mac** (App Store) para o botão abrir direto no app.

**Abrir o painel outro dia sem buscar de novo:** `bash "Abrir Painel.command"`

## 5. Verificar quais números têm WhatsApp (recomendado)

```
bash "Verificar WhatsApp.command"
```

1. Aparece um **QR Code** no Terminal. No celular, abra o WhatsApp → **Aparelhos conectados** → **Conectar um aparelho** e escaneie.
2. O robô confere até 300 números por rodada, com pausas como uma pessoa faria. **Nenhuma mensagem é enviada.**
3. Números **sem WhatsApp** saem do painel. Os confirmados ganham o selo **✅ WhatsApp verificado**.
4. **Quem já tem conversa com você no WhatsApp sai do painel** (fica como contatado), mesmo que você tenha
   falado com a empresa fora do robô ou numa versão antiga.

Rode de novo para conferir os próximos 300. Para outra quantidade: `bash "Verificar WhatsApp.command" --limite 100`.

## 6. Modo internacional: empresas de língua inglesa, por e-mail

```
bash "Gerar Leads Internacional.command"
```

O `Gerar Leads.command` já chega nas empresas gringas sozinho (fase 2). Este atalho serve para ir **direto** para elas:
ele busca **50 empresas** em 64 cidades de países de língua inglesa (72 tipos de negócio,
de dentista a encanador), pergunta se você quer **+50** e, ao encerrar, abre o painel na aba **✉️ E-mail (internacional)**.

- Só entram empresas com **e-mail encontrado no site** (página inicial ou página de contato). Sem e-mail, ela é descartada.
- A mensagem vem **em inglês** (a mesma ideia da mensagem padrão), com assunto `Quick idea for <empresa>`. Dá para editar antes de enviar.
- **✉️ Abrir no Gmail** abre o e-mail pronto no Gmail. **Abrir no app de e-mail** usa o app Mail do Mac. Os dois marcam o lead como contatado.
- No painel, troque entre **💬 WhatsApp (Brasil)** e **✉️ E-mail (internacional)** pelas abas no topo.

**Dicas para o e-mail não cair no spam:**
- Mande no máximo **20 a 30 por dia** no começo, aos poucos.
- Mande de um endereço com o seu domínio (ex.: `contato@auroratech.app.br`), não de um Gmail pessoal, se puder.
- Quem responder "unsubscribe" não deve receber mais nada. A frase de saída já vem no fim da mensagem: deixe ela lá.
  Isso também atende às leis de e-mail comercial desses países. **Canadá e Austrália** são os mais rígidos: lá só
  vale escrever para e-mails que a empresa publica no próprio site, e sobre assunto ligado ao negócio dela, que é
  o que o robô faz.

## 7. Dicas para não ter o número bloqueado

- Mande no máximo **30 a 40 mensagens por dia**, com um intervalo entre uma e outra
- Comece pelos leads de **maior pontuação**
- Responda rápido quem responder. Quem não tiver interesse: agradeça e não insista

## 8. (Opcional) Chave do Google: buscas muito mais rápidas

Com a chave da **Google Places API**, cada busca leva segundos e traz até 60 empresas, em vez de 20.
O Google dá um crédito mensal gratuito.

1. **https://console.cloud.google.com** → crie um projeto
2. **APIs e serviços → Biblioteca** → **Places API (New)** → **Ativar**
3. Cadastre um cartão em **Faturamento** (cobra só acima do crédito gratuito)
4. **APIs e serviços → Credenciais → Criar credenciais → Chave de API** → copie
5. No Terminal: `open -e ~/AuroraLeads/.env`. Cole a chave depois de `GOOGLE_PLACES_API_KEY=` e salve.
   (Esse arquivo fica na pasta fixa, então vale para todas as versões que você baixar.)

## 9. Personalizar (opcional)

Crie um arquivo `config.json` na pasta `AuroraLeads` (vale para todas as versões) só com o que quiser mudar. Por exemplo, para trocar a mensagem
e buscar só em algumas cidades:

```json
{
  "templates": { "manual": "Olá! Aqui é a Aurora Tech..." },
  "busca": { "cidades": ["Recife, PE", "Olinda, PE"] },
  "internacional": { "assunto": "Quick idea for {nome}", "cidades": ["Austin, TX, USA"] }
}
```

A configuração completa (nichos, cidades, mensagem) está em `config.example.json`, que serve de referência.

## 10. Problemas comuns

| Problema | Solução |
|---|---|
| "Não consegui abrir nenhum navegador" | Instale o **Google Chrome** (passo 1) e rode de novo |
| `command not found: node` | Instale o Node.js (passo 1) e **abra um Terminal novo** |
| Muitas buscas com "0 encontrados" | O Google pode ter mostrado um captcha. Pare (`Ctrl + C`), espere uns minutos e rode de novo: ele refaz só essas |
| Apareceu de novo alguém que já contatei | Conecte o WhatsApp com o **Verificar WhatsApp** (passo 5): a partir daí, toda rodada tira do painel quem já tem conversa com você. Use sempre o botão **💬 Abrir no WhatsApp** (é ele que marca como contatado) e deixe o Terminal aberto enquanto usa o painel. Se ainda acontecer, me mande o nome da empresa |
| Aviso amarelo "O robô está fechado" no painel | Você fechou o Terminal. Rode o **Abrir Painel.command** e recarregue a página: os contatos marcados são salvos na hora |
| O painel não abre | Abra no navegador o endereço `http://localhost:4000` (com o robô rodando) |
| Configuração antiga | Se aparecer "Configuração antiga guardada em config.antigo.json", é normal: o robô passou a usar a configuração nova |
