// UC-05 — SincronizarERP (full duplex)
// Regra R5: "Cada evento é enviado uma única vez." — a fila só devolve não enviados;
// o receptor (ERP) é idempotente por idempotencyKey.

import type { ErpAdapterPort, EventStorePort } from '../ports/ports.ts'

export interface SyncResult {
  enviados: number
}

export async function sincronizarERP(
  events: EventStorePort,
  erp: ErpAdapterPort,
): Promise<SyncResult> {
  // 1. importa catálogo do ERP para a agenda (full duplex — entrada)
  await erp.importCatalog()

  // 2. exporta eventos pendentes (full duplex — saída); a fila entrega cada um 1x
  const pendentes = await events.pending()
  await erp.syncEvents(pendentes)
  for (const ev of pendentes) await events.markSent(ev.idempotencyKey)

  return { enviados: pendentes.length }
}