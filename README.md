# Agendamento Universal

> **O melhor e simples sistema de agendamento possível para integrar no ecossistema ERP genérico.**

Vertical-agnóstico, hexagonal, regras de negócio em português (design-time LLM), full duplex com ERPs.
Primeiro cliente: consultas médicas.

## Estrutura

```
regras/agendamento.pt-BR.md   ← fonte da verdade das regras (pt-BR)
src/domain/                   ← domínio puro (zero dependências externas)
  model.ts                    ← entidades: Patient, Practitioner, Schedule, Slot, Appointment
  rules.ts                    ← R1–R5 (espelha regras/*.md)
src/ports/ports.ts            ← portas: AgendaPort, PatientPort, NotifyPort, ErpEventPort
src/usecases/                 ← UC-01..UC-05 (funções puras tipadas)
tests/golden.test.ts          ← golden tests da correspondência .md ↔ código
tests/usecases.test.ts        ← testes dos casos de uso
```

## Local de trabalho

- Proposta e ADR: `docs.axio.eng.br/ampla/projetos/agendamento-universal` (hub multi-projeto)
- Decisões de arquitetura: ADR-001 (hexagonal, TS+Bun, FHIR-inspired, golden tests, LLM design-time)