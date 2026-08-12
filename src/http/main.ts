// Entrypoint — sobe a API com seed demo.
// Uso: bun run src/http/main.ts (PORT env opcional, default 3000)

import { createApp, seedDemo } from './server.ts'

const server = createApp(seedDemo())
console.log(`agendamento-universal API em http://localhost:${server.port}`)