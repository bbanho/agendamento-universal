// Golden tests — garantem que src/domain/rules.ts espelha regras/agendamento.pt-BR.md
// Cada Exemplo: do .md vira um caso aqui. Mudar regra = mudar .md E teste.

import { describe, expect, test } from 'bun:test'
import { canReschedule, hasEnoughBreak, resolvePriority } from '../src/domain/rules.ts'
import type { Appointment, Slot } from '../src/domain/model.ts'

function slot(start: string, durationMin = 30, id = start): Slot {
  return { id, scheduleId: 's1', practitionerId: 'p1', start, durationMin, status: 'free', version: 1 }
}
function appt(kind: 'first' | 'followUp', id = `a-${kind}`): Appointment {
  return { id, patientId: 'pa1', slotId: 'sl1', practitionerId: 'p1', kind, start: '2026-08-12T10:00:00', status: 'scheduled' }
}

describe('R1 — pausa mínima de 15 min', () => {
  test('09:00–09:30 + 09:45 → OK (pausa de 15 min)', () => {
    expect(hasEnoughBreak(slot('2026-08-12T09:00:00'), slot('2026-08-12T09:45:00'))).toBe(true)
  })
  test('09:00–09:30 + 09:30 → inválido (pausa de 0 min)', () => {
    expect(hasEnoughBreak(slot('2026-08-12T09:00:00'), slot('2026-08-12T09:30:00'))).toBe(false)
  })
  test('09:00–09:30 + 09:40 → inválido (pausa de 10 min < 15)', () => {
    expect(hasEnoughBreak(slot('2026-08-12T09:00:00'), slot('2026-08-12T09:40:00'))).toBe(false)
  })
})

describe('R2 — retorno tem prioridade sobre 1ª consulta', () => {
  test('retorno vence 1ª consulta', () => {
    expect(resolvePriority(appt('first'), appt('followUp'))).toEqual(appt('followUp'))
  })
  test('1ª consulta não vence retorno', () => {
    expect(resolvePriority(appt('followUp'), appt('first'))).toEqual(appt('followUp'))
  })
  test('mesmo tipo → mantém primeiro', () => {
    expect(resolvePriority(appt('first', 'a1'), appt('first', 'a2'))).toEqual(appt('first', 'a1'))
  })
})

describe('R3 — remarcação só até 24h antes', () => {
  test('23h antes → negada', () => {
    const r = canReschedule('2026-08-12T10:00:00', '2026-08-11T11:00:00')
    expect(r.ok).toBe(false)
  })
  test('25h antes → permitida', () => {
    const r = canReschedule('2026-08-13T10:00:00', '2026-08-12T09:00:00')
    expect(r.ok).toBe(true)
  })
  test('exatamente 24h antes → permitida', () => {
    const r = canReschedule('2026-08-12T10:00:00', '2026-08-11T10:00:00')
    expect(r.ok).toBe(true)
  })
})