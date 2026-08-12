# Regras de Negócio — Agendamento (pt-BR)

Fonte da verdade das regras. O código em `src/domain/rules.ts` **espelha** estas regras;
os golden tests em `tests/` garantem a correspondência (cada regra tem exemplos verificáveis).

## Regras

### R1 — Pausa entre atendimentos (UC-01)
> "Médico não atende em 2 horários seguidos sem pausa de 15 min."

- Dois slots consecutivos de um mesmo médico devem ter **pausa mínima de 15 min** entre eles.
- Exemplo: 09:00–09:30 e 09:45–10:15 → OK (pausa de 15 min).
- Exemplo: 09:00–09:30 e 09:30–10:00 → **inválido** (pausa de 0 min).

### R2 — Prioridade do retorno (UC-02)
> "Retorno tem prioridade sobre 1ª consulta."

- Em conflito de disponibilidade, um **retorno** (follow-up) ganha o slot de uma 1ª consulta.
- Exemplo: 1ª consulta tenta 10:00; retorno tenta 10:00 → retorno fica, 1ª consulta busca outro horário.

### R3 — Janela de remarcação (UC-03)
> "Remarcação só até 24h antes."

- Remarcar exige `não antes de 24h` do horário original.
- Exemplo: consulta 12/08 10:00; remarcação em 11/08 11:00 (23h antes) → **negada**.
- Exemplo: consulta 13/08 10:00; remarcação em 12/08 09:00 (25h antes) → **permitida**.

### R4 — Cancelamento libera slot (UC-04)
> "Cancelamento libera o slot imediatamente."

- Ao cancelar, o slot volta à disponibilidade **no mesmo instante** (sem quarentena).
- Exemplo: cancelamento às 09:05 → slot livre às 09:05 para novo agendamento.

### R5 — Idempotência de eventos (UC-05)
> "Cada evento é enviado uma única vez."

- Todo evento carrega `idempotencyKey`; o ERP só processa a primeira ocorrência da chave.
- Exemplo: reenvio do evento `appt_123` com mesma chave → ignorado pelo ERP.

## Formato dos exemplos (golden tests)

Cada `Exemplo:` vira um caso no `tests/golden.test.ts`:
`{ regra: 'R1', input: ..., esperado: ... }`. Mudar uma regra exige mudar o `.md` **e** o teste.