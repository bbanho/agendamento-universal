// UC-01 — ConsultarDisponibilidade
// "Médico não atende em 2 horários seguidos sem pausa de 15 min." (R1)

import type { Slot } from '../domain/model.ts'
import { hasEnoughBreak } from '../domain/rules.ts'
import type { AgendaPort } from '../ports/ports.ts'

export interface DisponibilidadeInput {
  scheduleId: string
  from: string
  to: string
}

export interface Disponibilidade {
  slots: Slot[]
  /** pares de slots que violam R1 (para diagnóstico) */
  violations: Array<{ prev: string; next: string }>
}

export async function consultarDisponibilidade(
  agenda: AgendaPort,
  input: DisponibilidadeInput,
): Promise<Disponibilidade> {
  const slots = (await agenda.listFreeSlots(input.scheduleId, input.from, input.to))
    .filter((s) => s.status === 'free')
    .sort((a, b) => a.start.localeCompare(b.start))

  const violations: Disponibilidade['violations'] = []
  for (let i = 1; i < slots.length; i++) {
    if (!hasEnoughBreak(slots[i - 1], slots[i])) {
      violations.push({ prev: slots[i - 1].id, next: slots[i].id })
    }
  }
  return { slots, violations }
}