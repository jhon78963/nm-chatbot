# UPRIT legacy — MongoDB

Novedades Maritex usa **solo PostgreSQL (Prisma)** para el chatbot. No configures `MONGODB_URI`.

El código en `src/infrastructure/database/mongodb/` y scripts en `deploy/*.mjs` son restos del fork **chatbot-uprit** (admisiones universitarias). Se mantienen como referencia histórica hasta eliminarlos en un PR dedicado.

## NM Maritex (activo)

- Persistencia: tablas Prisma en `nm_services` (conversaciones, mensajes, agentes, quick replies)
- Motor de respuestas: `HybridChatService` + `context/knowledge_base.md` + herramientas de catálogo NM
- Panel asesores: iframe en el ERP Angular (`app.novedadesmaritex.net.pe`), no el panel React UPRIT en `admin/`

## UPRIT (legacy, no desplegar en NM)

- MongoDB Atlas + programas académicos + `IntentRouterService`
- Panel React en `admin/` con tokens `uprit_agent_*`
- Deploy independiente documentado en `docs/handoff-pr-prompts.md`, `postman/chatbot-uprit.*`

Para reactivar UPRIT haría falta restaurar el bootstrap Mongo en un fork separado; no mezclar con el stack NM.
