# Tutorial: usando o Robô de Leads no Mac

O que o robô faz: procura empresas de **113 tipos de negócio** (de padaria a metalúrgica) em **108 cidades do
Brasil todo** (todas as capitais e as maiores cidades do interior). Ele analisa o site de cada uma e monta um
**painel** com os melhores leads. Em cada lead tem o botão **💬 Abrir no WhatsApp**, que abre a conversa já com
a mensagem padrão da Aurora Tech escrita. Você só aperta enviar.

**Garantias:**
- **Sem leads repetidos:** a mesma empresa (ou o mesmo telefone, mesmo vindo de outra busca ou cidade) entra uma vez só.
  Quem você marca como **contatado** fica salvo no banco do robô e não volta como lead novo.
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

> Já tinha uma versão antiga? Copie a pasta **`data`** da pasta antiga para a nova. É lá que ficam seus leads
> e quem você já contatou.

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

Rode de novo para conferir os próximos 300. Para outra quantidade: `bash "Verificar WhatsApp.command" --limite 100`.

## 6. Dicas para não ter o número bloqueado

- Mande no máximo **30 a 40 mensagens por dia**, com um intervalo entre uma e outra
- Comece pelos leads de **maior pontuação**
- Responda rápido quem responder. Quem não tiver interesse: agradeça e não insista

## 7. (Opcional) Chave do Google: buscas muito mais rápidas

Com a chave da **Google Places API**, cada busca leva segundos e traz até 60 empresas, em vez de 20.
O Google dá um crédito mensal gratuito.

1. **https://console.cloud.google.com** → crie um projeto
2. **APIs e serviços → Biblioteca** → **Places API (New)** → **Ativar**
3. Cadastre um cartão em **Faturamento** (cobra só acima do crédito gratuito)
4. **APIs e serviços → Credenciais → Criar credenciais → Chave de API** → copie
5. No Terminal, dentro da pasta do robô: `open -e .env`. Cole a chave depois de `GOOGLE_PLACES_API_KEY=` e salve.

## 8. Personalizar (opcional)

Crie um arquivo `config.json` na pasta do robô só com o que quiser mudar. Por exemplo, para trocar a mensagem
e buscar só em algumas cidades:

```json
{
  "templates": { "manual": "Olá! Aqui é a Aurora Tech..." },
  "busca": { "cidades": ["Recife, PE", "Olinda, PE"] }
}
```

A configuração completa (nichos, cidades, mensagem) está em `config.example.json`, que serve de referência.

## 9. Problemas comuns

| Problema | Solução |
|---|---|
| "Não consegui abrir nenhum navegador" | Instale o **Google Chrome** (passo 1) e rode de novo |
| `command not found: node` | Instale o Node.js (passo 1) e **abra um Terminal novo** |
| Muitas buscas com "0 encontrados" | O Google pode ter mostrado um captcha. Pare (`Ctrl + C`), espere uns minutos e rode de novo: ele refaz só essas |
| O painel não abre | Abra no navegador o endereço `http://localhost:4000` (com o robô rodando) |
| Configuração antiga | Se aparecer "Configuração antiga guardada em config.antigo.json", é normal: o robô passou a usar a configuração nova |
