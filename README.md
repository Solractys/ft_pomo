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

- Todos os participantes podem controlar o timer.
- Foco aceita de 1 a 120 minutos; pausa, de 1 a 60 minutos.
- Salas expiram após 24 horas sem uma alteração no timer.
- Salas expiradas são removidas diariamente.
- Participantes são presença em tempo real e não ficam armazenados no banco.
