// Regras R1–R5 — espelham regras/agendamento.pt-BR.md (fonte da verdade)
// Golden tests em tests/golden.test.ts garantem a correspondência.

import type { Appointment, Conflict, Result, Slot } from './model.ts'

const PAUSA_MIN_MIN = 15 // R1

// R1 — "Médico não atende em 2 horários seguidos sem pausa de 15 min."
export function hasEnoughBreak(prev: Slot, next: Slot): boolean {
  const endPrev = new Date(prev.start).getTime() + prev.durationMin * 60_000
  const startNext = new Date(next.start).getTime()
  return startNext - endPrev >= PAUSA_MIN_MIN * 60_000
}

// R2 — "Retorno tem prioridade sobre 1ª consulta."
// Retorna o vencedor: retorno vence empate; senão, mantém ordem de chegada.
export function resolvePriority(a: Appointment, b: Appointment): Appointment {
  if (a.kind === 'followUp' && b.kind === 'first') return a
  if (b.kind === 'followUp' && a.kind === 'first') return b
  return a // empate (mesmo tipo): primeiro que chegou
}

// R3 — "Remarcação só até 24h antes."
const JANELA_REMARCACAO_H = 24 // R3
export function canReschedule(originalStart: string, now: string): Result<true> {
  const diffH = (new Date(originalStart).getTime() - new Date(now).getTime()) / 3_600_000
  if (diffH < JANELA_REMARCACAO_H) {
    return fail(`Remarcação negada: faltam ${diffH.toFixed(1)}h (mínimo ${JANELA_REMARCACAO_H}h antes)`)
  }
  return ok(true)
}

// R4 — "Cancelamento libera o slot imediatamente." (comportamento do UC-04: status livre na hora)

// R5 — idempotência tratada na camada de eventos (chave por evento, ver ports/eventos)

function ok<T>(value: T): Result<T> {
  return { ok: true, value }
}
function fail<T>(reason: string): Result<T> {
  return { ok: false, conflict: { reason } }
}