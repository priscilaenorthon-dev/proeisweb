# PROEIS Bot

Aplicação Next.js 14 que faz login automático no PROEIS, resolve CAPTCHA com
Gemini Vision e se inscreve em todos os serviços disponíveis. Inclui dashboard
web dark-mode e cron semanal no Vercel.

## Stack

- **Next.js 14** — App Router, TypeScript
- **Playwright** — automação de browser headless
- **Gemini Vision API** (`gemini-1.5-flash`) — resolução de CAPTCHA
- **Tailwind CSS** — interface dark mode
- **Browserless.io** — executa Playwright no Vercel serverless

## Estrutura

```
app/
  layout.tsx
  page.tsx                      ← dashboard principal
  api/
    run-scraper/route.ts        ← POST/GET: executa o bot
    servicos/route.ts           ← GET: retorna servicos.json
lib/
  scraper.ts                    ← lógica Playwright
  captcha.ts                    ← lógica Gemini Vision
data/
  servicos.json                 ← cache dos dados
```

## Variáveis de ambiente

Copie `.env.example` para `.env.local`:

```env
PROEIS_ID=seu_id_funcional
PROEIS_SENHA=sua_senha
GEMINI_API_KEY=sua_chave_gemini
BROWSERLESS_URL=wss://chrome.browserless.io?token=seu_token
```

## Desenvolvimento local

```bash
npm install
npx playwright install chromium   # baixa o browser (uma vez)
npm run dev
```

Acesse `http://localhost:3000`. Sem `BROWSERLESS_URL`, o Playwright usa
o Chromium local instalado pelo comando acima.

## Deploy no Vercel

1. Configure as 4 variáveis de ambiente no painel do Vercel
2. Conecte o repositório e clique em Deploy
3. O cron dispara toda **quinta-feira às 08h (Brasília)** = 11h UTC

## API

| Método | Rota               | Descrição                          |
|--------|--------------------|------------------------------------|
| `GET`  | `/api/servicos`    | Retorna dados do cache             |
| `POST` | `/api/run-scraper` | Executa o bot (botão do dashboard) |
| `GET`  | `/api/run-scraper` | Executa o bot (Vercel cron)        |
