# Crítica Arquitetônica + Revisão do Agendamento Universal

> **Data**: 2026-08-12 · **Autor**: Bruno Banho + assistente
> **Propósito**: Revisão honesta do que foi construído, identificação de bugs/design flaws, e decisão sobre o que manter/descartar.

---

## 1. O que é o Agendamento Universal (afinal)?

É um sistema de agendamento **genérico, hexagonal, simples** que vive dentro de um ecossistema ERP:
- **Primeiro cliente**: clínicas médicas (consultas)
- **Arquitetura**: domínio puro TS + Bun, portas + adaptadores (SQLite, ERP mock)
- **Regras**: declaradas em pt-BR (`regras/agendamento.pt-BR.md`), espelhadas em código com golden tests
- **Full duplex**: importa catálogo do ERP, exporta eventos de compromisso

---

## 2. Crítica: O que está errado ou questionável?

### 2.1. R2 ("Retorno tem prioridade sobre 1ª consulta") é uma regra sem fundamento

**Problema**: No modelo atual, slots são exclusivos (1 slot = 1 appointment). Se o slot já está booked, a regra R2 nunca se aplica na prática — o slot já foi reservado.

**Impacto**: Código morto em `agendarConsulta.ts` (linha 49) que tenta buscar "existing appointment" por `slotId` como se fosse `appointmentId`.

**Decisão**: Remover R2 do código do UC-02. Se no futuro precisarmos de fila de espera ou overbooking, R2 vira uma política de fila, não de prioridade sobre slot exclusivo.

### 2.2. Domínio incompleto

**Problema**: `Schedule` e `Practitioner` existem no modelo mas não são entidades de primeira classe. `Patient` tem só 2 campos.

**Impacto**: O canônico FHIR-inspired está pela metade.

**Decisão**: Expandir o domínio, mas manter simplicidade (não criar 50 entidades de uma vez).

### 2.3. Evento de remarcação com `kind: 'appointment.created'`

**Problema**: `remarcarConsulta.ts` (linha 43) usa `kind: 'appointment.created'` para um evento de remarcação. O ERP não consegue distinguir "criou" de "moveu".

**Impacto**: Full duplex quebrado — o ERP não sabe que o compromisso mudou de horário.

**Decisão**: Mudar para `kind: 'appointment.moved'` (novo kind) ou `kind: 'appointment.updated'`.

### 2.4. SincronizarERP é síncrono e sem retry

**Problema**: `sincronizarERP.ts` faz `importCatalog()` e `syncEvents()` de forma atômica. Se o ERP estiver offline, a sincronização falha e os eventos não são reenviados.

**Impacto**: Perda de eventos em caso de falha de rede.

**Decisão**: Adicionar retry exponencial + dead-letter queue.

### 2.5. Server.ts importa de `tests/`

**Problema**: `src/http/server.ts` importa `MemoryAgenda`, `MemoryErp` de `../../tests/memory.ts`. Camada de produção depende de código de teste.

**Impacto**: Anti-hexagonal. Se removermos os tests, o servidor quebra.

**Decisão**: Mover os adapters in-memory para `src/adapters/memory.ts` e importar de lá.

### 2.6. Sem foundation real (persistência, auth, ERP real)

**Problema**: O projeto tem SQLite (`SqliteAgenda`) mas o servidor ainda usa `MemoryAgenda` no seed demo. Não há migration, seed real, nem Supabase conectado.

**Decisão**: Conectar o Supabase como adapter real de persistência + auth.

### 2.7. Lock otimista no SQLite está correto, mas não testa concorrência real

**Problema**: O teste `sqlite.test.ts` usa `Promise.all([bookSlot('a', 1), bookSlot('a', 1)])` mas o SQLite em memória é single-threaded no Node — a concorrência real (2 processos) não é testada.

**Decisão**: Teste OK para o modelo atual (Bun.serve é single-threaded event loop). Se precisarmos de multi-processo, usar advisory locks do Postgres.

---

## 3. Crítica ao Intraclinica-ng

**Veredito**: Não, não vale a pena manter aquele trajeto.

### Problemas estruturais:
1. **Monolito frontend-first**: Angular 22 + Supabase direto (sem camada de domínio). Qualquer mudança de regra de negócio toca em 5+ lugares (componente, store, migration, seed, teste E2E).
2. **AGENTS.md de 62KB**: Documentação maior que o código. Processo pesado (Hive, worktree RAM constraints, vitest só após merge, ng build proibido em workers) para um projeto de 806 commits que ainda está em "pre-MVP" com resets destrutivos de DB.
3. **Node divergente**: CI usa Node 22 LTS, dev usa Node 25.9. Não documentado como "escolha", mas como "fato consumado".
4. **Testes em tarefa separada**: Unidade escrita só após merge — significa que código quebrado pode ficar na branch por horas.
5. **Docker E2E controlado por recurso**: Playwright em Docker com mem_limit/cpus. Funciona, mas adiciona complexidade operacional para um projeto que poderia ter E2E simples.
6. **Sem canônico**: O frontend fala diretamente com o Supabase (tabelas `vw_*`). Não há camada de tradução — se o ERP mudar, o frontend quebra.

### O que o agendamento-universal faz diferente (e melhor):
- **Domínio puro de 300 linhas**: Regras em pt-BR, golden tests, zero dependências externas.
- **Hexagonal de verdade**: Portas + adaptadores substituíveis. SQLite hoje, Postgres amanhã, TISS/FHIR depois.
- **E2E em 1 arquivo, 8 testes**: 7 API + 1 browser demo. Sem Docker, sem worktree, sem Hive.
- **Full duplex com eventos**: Import/export de catálogo, idempotência por chave, fila de eventos.
- **Simples primeiro**: 5 UC mínimos, cada um testável isoladamente.

---

## 4. Decisões tomadas

| Problema | Decisão | Implementado? |
|---|---|---|
| R2 sem fundamento | Remover do UC-02 | ✅ |
| Evento de remarcação com kind errado | Mudar para `appointment.moved` | ✅ |
| Server.ts importa de tests/ | Mover adapters para `src/adapters/memory.ts` | ✅ |
| Sem foundation real | Conectar Supabase como adapter | ⬜ |
| SincronizarERP sem retry | Adicionar retry exponencial | ⬜ |
| Domínio incompleto | Expandir `Schedule` e `Practitioner` | ⬜ |

---

## 5. Próximos passos (revisados)

1. ✅ Remover R2 do UC-02 + corrigir evento de remarcação
2. ✅ Mover adapters in-memory para `src/adapters/memory.ts`
3. ⬜ Conectar Supabase (adapter real + auth)
4. ⬜ Adicionar retry no SincronizarERP
5. ⬜ Expandir domínio (Schedule, Practitioner completos)
6. ⬜ LLM design-time: regras pt-BR → código (golden tests como contrato)

---

## 6. Veredito final

O agendamento-universal está no caminho certo. A arquitetura hexagonal + domínio puro + golden tests é a abordagem correta. O intraclinica-ng, apesar do esforço, é um exemplo do que **não** fazer: monolito frontend-first, processo pesado, sem camada de domínio.

**Próximo passo**: Conectar o Supabase como foundation real (persistência + auth), e só depois expandir para ERP real (TISS/FHIR).
