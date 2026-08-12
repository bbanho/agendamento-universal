# Agent Directives: Agendamento Universal

## 1. Git — Sempre SSH
- **NUNCA** usar HTTPS para git (`git clone https://…`, `git push https://…`). HTTPS pede credenciais interativas e falha em automação.
- Usar **sempre** SSH: `git@github.com:bbanho/<repo>.git`.
- Se um remote estiver em HTTPS, corrigir com: `git remote set-url origin git@github.com:bbanho/<repo>.git`.

## 2. Arquitetura (hexagonal — pura)
- **Domínio puro** (`src/domain/`) — zero dependências externas, zero imports de infra. Entidades + regras.
- **Regras de negócio em pt-BR** — fonte da verdade: `regras/agendamento.pt-BR.md`; o código em `src/domain/rules.ts` espelha via **golden tests** (`tests/golden.test.ts`). Mudar regra = mudar `.md` E teste.
- **Portas** (`src/ports/`) — interfaces; o domínio depende delas, nunca de infra.
- **Adaptadores** — fora do núcleo (ex.: `tests/memory.ts` como referência). Adicionar ERP novo = novo adaptador, sem tocar o domínio.
- **Casos de uso** (`src/usecases/`) — funções puras tipadas, cada uma testável isoladamente.
- **Full duplex com ERP** — eventos com `idempotencyKey`; a fila entrega cada evento UMA vez; o receptor (ERP) é idempotente.

## 3. Qualidade
- **Typecheck**: `bunx tsc --noEmit` deve passar.
- **Testes**: `bun test` deve passar (17+ testes: golden R1–R5 + UC-01..05).
- **Concorrência**: reserva de slot com lock otimista (versão) — nunca agendar sem checar versão.

## 4. Documentação
- Proposta e ADR: wiki VitePress no hub `docs.axio.eng.br/ampla/projetos/` (fonte: repo `amplainformatica-erp-integrado/wiki/projetos/`).
- Decisões de arquitetura viram ADR (ex.: ADR-001) antes de código.
