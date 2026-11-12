# 🧵 Consertos da Lili

App web (PWA) para a Lili controlar os pedidos de costura pelo celular:
novo pedido com mensagem pronta para o WhatsApp, pedidos em costura / a receber /
concluídos, clientes e resumo do mês.

Feito com **HTML, CSS e JavaScript puro** + **Firebase** (Authentication e Firestore)
carregado por CDN. Não precisa instalar nada para rodar.

---

## 📁 Arquivos

| Arquivo | Para que serve |
|---|---|
| `index.html` | Estrutura das telas (boas-vindas, login, app, menu inferior) |
| `style.css` | Visual. Cores, fontes e tamanhos ficam nas variáveis do topo (`:root`) |
| `app.js` | Lógica das telas (novo pedido, pedidos, clientes, resumo, configurações) |
| `db.js` | **Único lugar que lê/grava dados.** Mesmas funções para Firebase e modo demonstração |
| `firebase-config.js` | Onde você cola a configuração do Firebase. Vazio = modo demonstração |
| `manifest.json`, `sw.js`, `icons/` | PWA: ícone na tela inicial e funcionamento com internet fraca |
| `firestore.rules` | Regras de segurança: só usuário logado lê/grava |
| `firebase.json` | Configuração para publicar no Firebase Hosting |

---

## 1. Testar em modo demonstração (sem Firebase)

Enquanto `firebase-config.js` estiver vazio, o app guarda tudo no próprio navegador
(localStorage) e já vem com alguns pedidos de exemplo.

O app usa módulos JavaScript, então **precisa ser aberto por um servidor local**
(abrir o `index.html` com duplo clique não funciona). Na pasta do projeto, rode:

```bash
python -m http.server 8080
```

ou, se tiver Node.js:

```bash
npx serve .
```

Abra **http://localhost:8080** e entre com:

- **Usuário:** `lili`
- **Senha:** `1234`

Para ver no tamanho de celular no computador: aperte `F12` e clique no ícone de celular
(“Toggle device toolbar”).

> Para recomeçar do zero: ⚙️ Configurações → **Apagar dados de teste**.

---

## 2. Criar o projeto no Firebase

1. Acesse <https://console.firebase.google.com> e clique em **Adicionar projeto**.
2. Dê um nome (ex.: `consertos-da-lili`). O Google Analytics pode ficar desativado.
3. Na página do projeto, clique no ícone **`</>`** (Web) para registrar um app da Web.
   - Apelido: `Consertos da Lili`. Pode marcar **Firebase Hosting**.
4. Vai aparecer um bloco `const firebaseConfig = { ... }`. **Copie esse objeto.**

### 2.1 Ativar o login (Authentication)

1. Menu lateral → **Criação → Authentication → Vamos começar**.
2. Aba **Método de login** → **E-mail/senha** → **Ativar** → Salvar.

### 2.2 Criar o usuário da Lili

1. Ainda em Authentication → aba **Usuários** → **Adicionar usuário**.
2. E-mail: **`eliani@consertosdalili.app`**
   (a Eliani só digita `eliani`; o app completa o resto sozinho).
3. Senha: escolha uma senha com **6 caracteres ou mais**.

> Quer outro usuário? Crie `nome@consertosdalili.app` e ela entra digitando só `nome`.
> Para mudar o domínio interno, altere `DOMINIO_USUARIO` em `firebase-config.js`.

### 2.3 Ativar o banco de dados (Firestore)

1. Menu lateral → **Criação → Firestore Database → Criar banco de dados**.
2. Local: `southamerica-east1 (São Paulo)`.
3. Comece em **modo de produção**.
4. Aba **Regras** → apague o que estiver lá, cole o conteúdo de `firestore.rules` e clique em **Publicar**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{documento=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

> As coleções (`servicos`, `clientes`, `pedidos`, `config`) são criadas sozinhas
> no primeiro uso. Os serviços de exemplo também são cadastrados automaticamente.

### 2.4 Colar a configuração

Abra `firebase-config.js` e troque o objeto vazio pelo que você copiou:

```js
export const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "consertos-da-lili.firebaseapp.com",
  projectId: "consertos-da-lili",
  storageBucket: "consertos-da-lili.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

Rode o servidor local de novo e entre com `eliani` e a senha criada.
Pronto: agora os dados ficam na nuvem e aparecem em qualquer aparelho.

> A `apiKey` do Firebase Web não é segredo; quem protege os dados são as regras do Firestore
> (só usuário logado) e o fato de só você criar usuários.
> Para evitar que alguém crie conta sozinho, em Authentication → **Configurações →
> Ações do usuário**, desmarque **Ativar criação (inscrição)**.

---

## 3. Publicar no Firebase Hosting

Precisa do [Node.js](https://nodejs.org) instalado (versão LTS).

```bash
npm install -g firebase-tools
```

```bash
firebase login
```

Na pasta do projeto (onde está o `firebase.json`):

```bash
firebase use --add
```

(escolha o projeto criado e dê um apelido, ex.: `default`)

```bash
firebase deploy --only hosting,firestore:rules
```

No fim aparece o endereço, algo como **https://consertos-da-lili.web.app**. 🎉

> Sempre que mudar algum arquivo, rode o `firebase deploy` de novo.
> Se mudar bastante coisa, aumente a `VERSAO` no topo do `sw.js` para os celulares
> pegarem a versão nova mais rápido.

---

## 4. Colocar o app na tela inicial do celular da Lili

**Android (Chrome):** abra o endereço → menu **⋮** → **Adicionar à tela inicial** (ou **Instalar app**).

**iPhone (Safari):** abra o endereço → botão **Compartilhar** (quadrado com seta) → **Adicionar à Tela de Início**.

Ela entra uma vez com usuário e senha e **continua logada** no aparelho.

Depois, em ⚙️ **Configurações**, preencha a **chave Pix**, o **nome do titular** e a
**assinatura** — eles aparecem no fim da mensagem enviada para a cliente.

---

## 5. Como os dados ficam guardados (Firestore)

| Coleção | Campos |
|---|---|
| `servicos` | `nome`, `preco`, `ativo` |
| `clientes` | `nome`, `whatsapp` (só números), `criadoEm` |
| `pedidos` | `clienteId`, `clienteNome`, `whatsapp`, `itens: [{nome, preco, qtd}]`, `total`, `dataRecebimento`, `previsaoEntrega`, `dataEntrega`, `dataPagamento`, `formaPagamento`, `entregue`, `pago`, `observacao`, `criadoEm` |
| `config` | documento `geral`: `chavePix`, `titularPix`, `assinatura` |

Todas as datas são gravadas como **Timestamp** — dá para analisar depois
(tempo de entrega = `dataEntrega − dataRecebimento`, pendências = `pago == false` etc.).
Os nomes e preços dos serviços são copiados para dentro de cada pedido, então mudar um
preço depois **não altera** pedidos antigos.

Situação do pedido:

| Aba | Regra |
|---|---|
| Em costura | `entregue == false` (se já estiver pago, aparece a etiqueta “Já pago”) |
| A receber | `entregue == true` e `pago == false` |
| Concluídos | `entregue == true` e `pago == true` |

---

## 6. Ajustes comuns

- **Mudar cores/fontes:** variáveis no topo do `style.css`.
- **Mudar o texto da mensagem do WhatsApp:** função `gerarMensagem()` no `app.js`.
- **Mudar a lista inicial de serviços:** `SERVICOS_INICIAIS` no `db.js`
  (só vale para um banco vazio; depois use ⚙️ Configurações → Serviços).
- **Trocar Firebase por outro banco:** basta reescrever o adaptador no `db.js`;
  o resto do app não muda.
