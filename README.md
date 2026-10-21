# FT_POMODORO

Pomodoro compartilhado com timer sincronizado entre todos os participantes de uma sala.

## Arquitetura

- **Next.js/Vercel**: interface.
- **Cloudflare Worker**: API HTTP.
- **Cloudflare D1**: persistência SQLite das salas.
- **Durable Objects**: WebSockets, presença e serialização dos comandos.
- **Durable Object Alarms**: troca de fase mesmo sem uma aba controladora aberta.

O servidor envia somente mudanças de estado. Durante a contagem, cada navegador calcula o tempo restante a partir de `endsAt` e do relógio do servidor; não há escrita ou mensagem a cada segundo.

## Desenvolvimento local

```bash
npm install
cp .env.example .env.local
npm run worker:db:migrate:local
```

Configure `AUTH_GOOGLE_ID` e `AUTH_GOOGLE_SECRET` com credenciais OAuth do Google. No Google Cloud, cadastre a origem `http://localhost:3000` e o callback `http://localhost:3000/api/auth/callback/google`. Para produção, cadastre também o domínio da Vercel e o callback `https://SEU-DOMINIO/api/auth/callback/google`.

Gere segredos aleatórios separados para `AUTH_SECRET` e `REALTIME_JWT_SECRET`. Configure o primeiro no `.env.local` e na Vercel. Para o Worker local, copie `.dev.vars.example` para `.dev.vars`; para produção, cadastre `REALTIME_JWT_SECRET` com `npx wrangler secret put REALTIME_JWT_SECRET`. Use o mesmo valor de realtime na Vercel e no Worker.

Em terminais separados:

```bash
npm run worker:dev
npm run dev
```

Abra `http://localhost:3000`. O Worker local responde em `http://localhost:8787`.

## Validação

```bash
npm run worker:typecheck
npx tsc --noEmit
npm run build
npm test
```

Para testar a sincronização, abra a mesma chave de sala em dois navegadores ou em uma janela anônima.

## Publicação do backend

1. Autentique o Wrangler com `npx wrangler login`.
2. Crie o banco com `npx wrangler d1 create ft-pomo`.
3. Copie o `database_id` retornado para `worker/wrangler.jsonc`.
4. Troque `APP_ORIGIN` no mesmo arquivo pelo domínio da Vercel. Para permitir desenvolvimento e produção, use os dois separados por vírgula.
5. Execute `npm run worker:db:migrate` e `npm run worker:deploy`.
6. Na Vercel, configure `NEXT_PUBLIC_REALTIME_API_URL` com a URL publicada do Worker e faça um novo deploy.

## Regras atuais

- É necessário entrar com Google para criar ou acessar uma sala.
- Todos os participantes autenticados podem controlar o timer.
- O perfil soma apenas sessões de foco concluídas naturalmente.
- O grupo de crédito é registrado no início do foco; entradas posteriores não recebem crédito.
- Usuários autenticados podem consultar o ranking semanal fora de uma sala. A participação é opcional e vem desativada por padrão.
- O ranking semanal soma o tempo das sessões de foco concluídas entre segunda-feira 00:00 UTC e a segunda-feira seguinte. Quem opta por participar aparece com o nome da conta.
- Cada sala pode ter uma meta coletiva por semana, de 1 a 500 horas. O progresso soma cada sessão de foco concluída uma vez, entre segunda-feira 00:00 UTC e a segunda-feira seguinte. Usuários autenticados com a chave da sala podem consultar ou criar o desafio.
- Foco aceita de 1 a 120 minutos; pausa, de 1 a 60 minutos.
- As configurações da sessão usam um controle circular arrastável, com os valores de foco e pausa editáveis no centro. A volta completa de foco acima de 60 minutos permanece marcada no anel.
- Notificações de desktop são opcionais, dependem da permissão do navegador e ficam desligadas por padrão; a escolha é guardada neste navegador.
- Na sala, copiar o código, ver o estado da conexão, abrir configurações e sair ficam juntos em uma linha de quatro controles.
- Salas expiram após 24 horas sem uma alteração no timer.
- Salas expiradas são removidas diariamente.
- Participantes são presença em tempo real e não ficam armazenados no banco.
