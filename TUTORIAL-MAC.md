# Tutorial: usando o Robô de Leads no Mac

Tempo para deixar tudo pronto: **cerca de 10 minutos**, só na primeira vez.
Depois, gerar leads de uma cidade nova é um comando só.

O que o robô faz: procura empresas de **todos os nichos** (113 tipos de negócio, de padaria a metalúrgica) na cidade
que você escolher. Analisa o site de cada uma (se tem site, se o site é só Instagram, se está fora do ar, se não funciona
no celular…) e monta uma **página com os melhores leads**. Cada lead vem com o botão **💬 Abrir no WhatsApp**,
que já abre a conversa com a mensagem escrita. Você só aperta enviar.

---

## 1. Instale o Node.js (o "motor" do robô)

1. Acesse **https://nodejs.org**
2. Clique no botão verde da versão **LTS** e baixe o instalador para macOS (`.pkg`)
3. Abra o arquivo baixado e clique em *Continuar* até terminar (vai pedir a senha do Mac)

**Confira se deu certo:**
1. Aperte `⌘ Cmd + Espaço`, digite **Terminal** e aperte Enter
2. Na janela que abrir, digite o comando abaixo e aperte Enter:
   ```
   node -v
   ```
3. Tem que aparecer algo como `v22.x.x` ou `v24.x.x`. Se aparecer `command not found`, feche o Terminal, abra de novo e tente outra vez.

## 2. Baixe o robô

1. Entre em **https://github.com/AI-Aurora-Tech/leads** (logado na sua conta do GitHub)
2. Clique no botão verde **`<> Code`** → **Download ZIP**
3. Vá na pasta **Downloads** e clique duas vezes no ZIP. Vai aparecer a pasta **`leads-main`**
4. (Recomendado) Arraste a pasta `leads-main` para **Documentos**

## 3. Rode o robô

### Jeito 1: pelo Terminal (funciona sempre)

1. Abra o **Terminal** (`⌘ Cmd + Espaço` → Terminal)
2. Digite `cd ` (com um espaço depois), **arraste a pasta `leads-main` para dentro da janela do Terminal** e aperte Enter
3. Digite e aperte Enter:
   ```
   bash "Gerar Leads.command"
   ```

### Jeito 2: clique duplo

Dentro da pasta, clique duas vezes em **`Gerar Leads.command`**.
Na primeira vez, o macOS bloqueia porque o arquivo veio da internet:
- Clique com o **botão direito** no arquivo → **Abrir** → **Abrir**; ou
- Vá em **Ajustes do Sistema → Privacidade e Segurança**, role até o fim e clique em **Abrir Mesmo Assim**.

### O que vai acontecer

1. **Na primeira vez**, ele instala tudo sozinho. Leva de 3 a 5 minutos e baixa um navegador que o robô usa para pesquisar no Google Maps.
   Avisos amarelos como `npm warn deprecated`, `vulnerabilities` ou `install-scripts blocked` são normais: pode ignorar.
2. Ele pergunta:
   - **Seu nome**: aparece na mensagem ("Aqui é *Seu Nome*, da AuroraTech"). Só pergunta uma vez.
   - **Cidade**: ex.: `Campinas, SP`. Para várias: `Campinas, SP;Sumaré, SP;Hortolândia, SP`
   - **Nicho**: aperte **Enter** (ou digite `todos`) para buscar **todos os nichos**, ou digite alguns: `padaria;barbearia;oficina mecânica`

   ⚠️ O robô trabalha com **telefones do Brasil**. Cidades de outros países (ex.: New York) não geram leads.
3. Ele começa a buscar nicho por nicho. Assim que aparecem os primeiros leads, **a página abre sozinha no navegador**.
   Ela vai sendo atualizada enquanto o robô trabalha: aperte `⌘ Cmd + R` na página para ver os novos.

> ⏱️ Buscar **todos** os nichos de uma cidade leva **de 1 a 2 horas** sem chave do Google (veja o passo 6 para acelerar).
> Você **não precisa esperar acabar**: comece a mandar mensagens assim que a página abrir.
> Para parar: `Ctrl + C` no Terminal. Se rodar de novo depois, **ele continua de onde parou**.

## 4. Use a página de leads

A página fica em `leads-main/data/leads.html`. Para abrir de novo depois, é só clicar duas vezes nesse arquivo.

Cada empresa aparece com:
- **Pontos (score)**: quanto maior, mais chance de precisar do seu serviço. A lista já vem ordenada.
- **Motivo**: *Sem site*, *Só rede social*, *Site com problemas* (com a lista dos problemas) ou *Site ok → IA*
- Telefone (avisa se é celular ou fixo), avaliação no Google, link do site e do Google Maps
- **Mensagem pronta**, que você pode editar na própria caixa de texto antes de enviar

Botões:
- **💬 Abrir no WhatsApp**: abre a conversa com a mensagem escrita (no WhatsApp para Mac ou no WhatsApp Web).
  O lead fica marcado como **Contatado** e some da lista com o filtro "Ocultar contatados".
- **Copiar mensagem**: caso prefira colar em outro lugar
- Filtros no topo: busca por nome, **motivo**, **nicho** e **só celular** (fixo raramente tem WhatsApp)

💡 Instale o **WhatsApp para Mac** (App Store). Assim o botão abre direto no app, mais rápido que no WhatsApp Web.

## 5. Dicas para não ter o número bloqueado (mesmo enviando na mão)

- Mande no máximo **30 a 40 mensagens por dia** e espere um pouco entre uma e outra
- Comece pelos leads de **maior pontuação** e **celular**
- Personalize: dê uma olhada rápida no Google Maps/site antes e ajuste uma frase
- Responda rápido quem responder. Quem disser que não tem interesse: agradeça e não insista

## 6. (Opcional) Chave do Google: buscas bem mais rápidas e mais leads

Sem chave, o robô pesquisa abrindo o Google Maps (até 20 empresas por nicho). Com a chave da **Google Places API**,
ele traz até 60 por nicho em segundos. O Google dá um crédito mensal gratuito, que cobre milhares de buscas.

1. Acesse **https://console.cloud.google.com** e crie um projeto (ex.: "Leads")
2. Menu → **APIs e serviços → Biblioteca** → procure **Places API (New)** → **Ativar**
3. Cadastre um cartão em **Faturamento**. O Google exige isso, mas só cobra acima do crédito gratuito.
4. **APIs e serviços → Credenciais → Criar credenciais → Chave de API** → copie a chave
5. No Terminal, dentro da pasta do robô, rode:
   ```
   open -e .env
   ```
   Cole a chave na linha `GOOGLE_PLACES_API_KEY=` (sem espaços), salve (`⌘ Cmd + S`) e feche.

Pronto: da próxima vez o robô usa a chave automaticamente.

## 7. Personalizar

Abra as configurações com `open -e config.json` (no Terminal, dentro da pasta):
- **`templates`**: os textos das mensagens. `{Oi|Olá}` sorteia uma das opções; `{nome}` vira o nome da empresa.
- **`busca.nichos`**: a lista de nichos. Adicione ou remova à vontade, mantendo as aspas e vírgulas.
- **`qualificacao.scoreMinimo`**: aumente para ver só os leads mais quentes.

Comandos úteis (no Terminal, dentro da pasta):
```
npm run painel                                  # regera a página com o que já foi buscado
node src/cli.js exportar                        # planilha leads.csv (abre no Numbers/Excel)
node src/cli.js resumo                          # quantos leads em cada etapa
```

## 8. Problemas comuns

| Problema | Solução |
|---|---|
| `Could not find Chrome` ou "O navegador do robô não está instalado" | No Terminal, dentro da pasta: `npx puppeteer browsers install chrome`. Ou instale o [Google Chrome](https://www.google.com/chrome), que o robô usa no lugar |
| `command not found: node` | Instale o Node.js (passo 1) e **abra um Terminal novo** |
| "não pode ser aberto porque é de um desenvolvedor não identificado" | Use o Jeito 1 (Terminal) ou o botão direito → Abrir |
| Muitos nichos com "0 encontrados" | O Google pode ter mostrado um captcha. Espere uns minutos e rode de novo (ele refaz só os que deram 0), ou use a chave (passo 6) |
| A página não mostra os leads novos | Aperte `⌘ Cmd + R` na página |
| Quero buscar uma cidade de novo do zero | `bash "Gerar Leads.command"` não repete buscas já feitas. Para refazer: `npm run gerar -- --cidade "Campinas, SP" --refazer` |

## 9. Atualizar o robô para uma versão nova

1. Baixe o ZIP de novo (passo 2)
2. Da pasta **antiga**, copie para a **nova**: a pasta **`data`** (seus leads), o **`config.json`** e o **`.env`**.
   Para ver o `.env`, que é um arquivo oculto, aperte `⌘ Cmd + Shift + .` no Finder.
