# Testes

## Vitest — testes unitários

Testes de funções puras (sem DB/HTTP).

```bash
npm test              # roda 1x
npm run test:watch    # watch mode
```

Cobertura atual: helpers de `lib/auth/api-key`, `lib/billing/trial`,
`lib/utils/validators`, `lib/notify/evolution`.

Para adicionar: crie `tests/unit/<nome>.test.ts` importando de `@/lib/...`.

## Playwright — testes E2E

Rodam contra um servidor de pé (local ou staging).

### Pré-requisitos

```bash
# Instala browsers (1x)
npx playwright install chromium

# Garante que o app está rodando em http://localhost:3000
npm run dev
# (em outro terminal)
```

### Executar

```bash
npm run test:e2e           # headless
npm run test:e2e:ui        # UI interativa
```

Variáveis opcionais:

```bash
E2E_BASE_URL=https://staging.empresa.com.br \
E2E_EMAIL=admin@demo.com \
E2E_SENHA=Master@12345678 \
npm run test:e2e
```

## CI

Workflow `.github/workflows/ci.yml` roda em cada push/PR para `main`:
- `npm run lint` (continue-on-error)
- `npm test` (vitest)

E2E **não roda em CI** por enquanto (requer postgres + redis subindo).
Para habilitar, adicione um service container e seed mínimo.
