# NEXO IA — backend (fundação)

Este projeto é a fundação real da **NEXO IA**: um backend em Node.js + TypeScript,
com banco Postgres de verdade e multitenant, que orquestra a **Responses API**
oficial da OpenAI por trás de um contrato de ferramentas (function calling)
somente leitura. Ele nasce ao lado do protótipo `index.html` (publicado como
Artifact), não dentro dele — o porquê está em `docs/NEXO_IA.md`, seção
"Por que isto não entrou no Artifact".

Leia `docs/NEXO_IA.md` primeiro — é o documento completo (arquitetura, decisões,
como rodar, o que foi testado, o que falta). Este README é só o quick start.

## Quick start

```bash
cp .env.example .env        # preencha DATABASE_URL, JWT_SECRET, OPENAI_API_KEY
npm install
npm run db:migrate          # cria as tabelas no Postgres apontado por DATABASE_URL
npm run db:seed             # popula duas corretoras fictícias pra testar
npm run build                # checagem de TypeScript + compila pra dist/
npm test                     # roda a suíte automatizada (isolamento + orquestrador)
npm run dev                  # sobe o servidor em modo desenvolvimento
```

Usuários de teste criados pelo seed:

| Empresa            | E-mail                  | Senha      | Papel  |
|---------------------|--------------------------|------------|--------|
| Corretora Alpha      | joao@alpha.com.br        | alpha123   | admin  |
| Corretora Alpha      | patricia@alpha.com.br    | alpha123   | vendedor |
| Bela Vista Seguros   | renata@belavista.com.br  | bela123    | admin  |
| Bela Vista Seguros   | bruno@belavista.com.br   | bela123    | vendedor |

```bash
curl -X POST http://localhost:3333/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"joao@alpha.com.br","senha":"alpha123"}'

curl -X POST http://localhost:3333/api/ia/chat \
  -H "Authorization: Bearer SEU_TOKEN_AQUI" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Quais apólices vencem nos próximos 30 dias?"}]}'
```

## Testar com a interface de chat

Pra testar sem `curl`, `frontend-reference/nexo-ia-chat-demo.html` é uma
página de chat autocontida (sem build, sem dependências) que fala com esta
API — login com um usuário do seed, depois manda mensagens e vê a resposta
da NEXO IA, incluindo quais ferramentas ela acionou. Não é o frontend do
NEXO, é só uma ferramenta de teste — o frontend de verdade repete o mesmo
padrão (ver `nexo-ia-client.js`, no mesmo diretório).

Abrir o `.html` direto como arquivo (`file://`) **não funciona**: o
navegador manda `Origin: null` nesse caso, e o `cors` do Express não
reflete isso de volta. Sirva a pasta por HTTP em vez disso:

```bash
# com o backend já rodando (npm run dev) em outro terminal:
python3 -m http.server 8080 --directory frontend-reference
# ou: npx serve frontend-reference -l 8080
```

E aponte `CORS_ORIGIN` no `.env` pra essa mesma origem antes de subir o
backend:

```bash
CORS_ORIGIN="http://localhost:8080"
```

Depois abra `http://localhost:8080/nexo-ia-chat-demo.html`, entre com um dos
usuários do seed (já vêm preenchidos) e converse. O campo "ID do cliente"
(opcional) simula o botão "NEXO IA" dentro da ficha de um cliente — cole ali
o `id` de um cliente do seed pra ver a IA responder já sabendo de quem se
trata, sem você repetir o nome na pergunta.

Isso foi testado de ponta a ponta neste ambiente de desenvolvimento: login,
envio de mensagem e tratamento de erro funcionam. A resposta da OpenAI em si
só chega com uma `OPENAI_API_KEY` válida rodando num ambiente com saída de
rede liberada pra `api.openai.com` — ver `docs/NEXO_IA.md`, seção 8.
