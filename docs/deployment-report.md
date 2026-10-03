# AgentGuard: informe de preparación del despliegue público

Preparación del repositorio para Render Web Service, Neon PostgreSQL y PayPal Sandbox. Las validaciones de código son locales; la inicialización real de Neon se completó el **3 de octubre de 2026** con la conexión suministrada por el usuario. No se hizo deploy Render, push, cobro nuevo o registro de webhooks. La [guía de despliegue](deployment.md) contiene la secuencia manual completa de 22 pasos.

## A. Archivos cambiados — FILES CHANGED

| Área                         | Archivos                                                                                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arranque y release           | `package.json`, `package-lock.json`, `render.yaml`, `playwright.config.ts`                                                                                             |
| Ejemplo/CI                   | `.env.example`, `.github/workflows/ci.yml`                                                                                                                             |
| Configuración de servidor    | `src/lib/environment.ts`, `src/lib/config.ts`, `src/lib/http.ts`                                                                                                       |
| Readiness                    | `src/app/api/ready/route.ts`                                                                                                                                           |
| Autenticación/límite         | `src/lib/security/auth.ts`, `src/lib/security/login-identity.ts`, `src/app/api/session/route.ts`                                                                       |
| Proveedores/webhook          | `src/lib/ai/providers/ollama.ts`, `src/app/api/paypal/webhook/route.ts`                                                                                                |
| Etiquetas de modos           | `src/components/app-shell.tsx`, `src/components/mandates.tsx`                                                                                                          |
| Herramientas administrativas | `scripts/check-deployment.ts`, `scripts/deploy-database.mjs`, `scripts/check-secrets.mjs`, `prisma/seed.ts`                                                            |
| Regresiones                  | `tests/deployment.test.ts`, `tests/readiness.test.ts`, `tests/login-rate-limit.test.ts`, `tests/public-auth-api.test.ts`, `tests/auth.test.ts`, `tests/paypal.test.ts` |
| Documentación                | `README.md`, `docs/deployment.md`, este informe y nota de edición histórica en `docs/informe-maestro-agentguard.md`                                                    |

El informe maestro ya existía en el working tree antes de esta tarea; se preservó y se añadió la referencia al estado posterior. `.env` conserva exactamente su contenido inicial. No se cambiaron versiones de dependencias, esquema Prisma, migración SQL, motor de políticas, máquina de estados, locks, claves de idempotencia ni servicios financieros.

## B. Cambios de despliegue — DEPLOYMENT FIXES

Se habilitó el binding de producción soportado por Next, se declaró Node 22, se añadieron validación en servidor y readiness público, migraciones explícitas sin seed automático, ejemplo sin secretos, descriptor Render y guía para la inicialización remota. Render incluye devDependencies para el build y el seed mediante NPM_CONFIG_INCLUDE; no se añade una API pagada.

La validación exige DB presente, PostgreSQL/TLS en público, origen absoluto HTTPS sin credenciales/path/query, auth fuera del demo local, credenciales PayPal completas o simulación explícita, Sandbox-only y selección de motor coherente. No devuelve valores de entorno. Se aplica antes de APIs operativas, login y webhook; readiness transforma fallos en un status mínimo 503. Puede compilarse antes de finalizar la configuración del servicio, pero no queda ready para tráfico público con origen/auth inválidos.

## C. Binding — SERVER BINDING RESULT

El script de producción es `next start`, verificado contra la documentación y el CLI instalados de Next 16.3.8. Su interfaz predeterminada es 0.0.0.0 y su puerto proviene de PORT. No se fija 3000 en el script. Dev conserva `--hostname 127.0.0.1`; para producción exclusivamente local se puede pasar ese mismo flag manualmente. El E2E de producción usa PORT y no un argumento de puerto para comprobar el comportamiento.

## D. Base — DATABASE DEPLOYMENT READINESS

Prisma 6 conserva datasource PostgreSQL por DATABASE_URL y Decimal(12,2). No se incorporó una URL Neon ni se modificaron límites monetarios. La migración inicial crea tablas/índices/foreign keys, sin reset, borrado ni truncado. Permanecen requestId único y el índice único transactionId+operation de PayPalOperation y referencias financieras externas únicas.

`db:deploy` ejecuta migrate deploy y captura su salida para no divulgar datasource/errores privados; no ejecuta seed. Seed se llama solo explícitamente, conserva los upserts y su historia etiquetada SIMULATED, y ahora evita imprimir el objeto de error. Se ejecutó dos veces secuencialmente contra la base local existente. El arranque/build no siembra ni borra datos.

**Neon inicializado y verificado:** lectura final `2026-10-03T05:20:51.241Z`. La base no tenía tablas públicas antes de la inicialización. Se generó Prisma, se aplicó una migración y se ejecutó el seed explícito: un operador, un agente, dos comerciantes, seis productos, tres mandatos/versiones y siete transacciones de demostración; cero operaciones PayPal y cero transacciones Sandbox. Se verificaron conexión SQL, cero migraciones fallidas, los dos índices únicos de idempotencia y el importe Decimal(12,2).

La conexión original, incluido `sslmode=require`, se usó exclusivamente en el entorno de los procesos administrativos. Una negociación PostgreSQL SSLRequest con TLS verificó además el certificado y el nombre del servidor en el endpoint de Neon; no se utilizó `pg_stat_ssl` del backend como prueba del tramo cliente-proxy, porque Neon termina TLS en su proxy. Véase la [descripción oficial del protocolo y proxy de Neon](https://neon.com/blog/quicker-serverless-postgres). La evidencia no secreta está en `.data/neon-inspection.json` y `.data/neon-initialization-validation.json`, ignorados por Git. `.env` conserva su contenido y su base local; los recibos locales no se copiaron a Neon.

## E. Autenticación — AUTH READINESS

Acceso remoto con DEMO_MODE=true sigue exigiendo sesión; tests cubren requests remotos y headers que aparentan loopback. Render no habilita identidad automática de demo. Cookie HMAC: HttpOnly, Secure bajo HTTPS, SameSite=Strict y ocho horas de duración, con expiración numérica válida/firma exacta. El password exige mínimo 12 y el secreto mínimo 32 caracteres. Logout expira la cookie con Secure cuando corresponde y el request posterior sin cookie falla 401.

Se preserva el diseño stateless: logout elimina la sesión del navegador, no revoca una copia robada del token de forma individual. Rotación de SESSION_SECRET invalida todas las firmas; la expiración limita su vida. No se añadieron registro, OAuth ni RBAC.

## F. Login — RATE LIMIT STATUS

**El hallazgo de disponibilidad no está resuelto.** Se conservan cinco intentos/minuto compartidos y el almacenamiento por proceso. La nueva abstracción TrustedLoginIdentity permite un futuro adapter de identidad verificada de transporte/ingress; el handler actual no instala ninguno y usa la clave compartida. No lee X-Forwarded-For, CF-Connecting-IP ni True-Client-IP para permitir buckets nuevos. Tests prueban spoofing sin cambio de cuota, contrato del adapter y límite/expiración. Una instancia inicial no equivale a un limitador distribuido ni evita la denegación temporal entre callers.

## G. Callbacks — PAYPAL CALLBACK READINESS

Origen normalizado leído en runtime mediante acceso dinámico, sin inlining del valor en el servidor. Tests comprueban return/cancel HTTPS públicos, sin localhost y conservando intent AUTHORIZE. Volver con `paypal=approved` sigue sin probar buyer approval. CREATE → verificación → AUTHORIZE → FINAL POLICY CHECK → CAPTURE/VOID y su idempotencia permanecen intactos.

## H. Webhooks — WEBHOOK READINESS

La ruta pública conserva verificación PayPal SUCCESS, cert URL HTTPS PayPal, Webhook ID configurado, deduplicación y registro de auditoría. Solo reconcilia operaciones financieras existentes, no inicia una captura ni agrega autorización. Antes del handler ahora se valida la configuración de servidor. Sigue devolviendo errores controlados y permite reintentar eventos relevantes sin operación local reconocida.

PAYPAL_WEBHOOK_ID puede quedar vacío durante bootstrap; los mensajes se rechazarán hasta configurarlo. `deployment:check -- --public --require-webhook` exige la configuración final, pero no afirma haber recibido una firma. **No se validó entrega pública real en esta tarea.**

## I. Motor público — PUBLIC AI MODE

Primera publicación: proveedor deterministic y demo explícito; etiqueta DETERMINISTIC FALLBACK. El builder aclara que no hay inferencia IA; el badge de pagos tiene su dimensión PAYMENT MODE y puede seguir PAYPAL SANDBOX. Ollama mantiene el endpoint/modelo/timeout locales y el contrato estructurado; su función de configuración se reutiliza para las validaciones. El servidor público rechaza intentar usar Ollama local como proveedor remoto. OpenAI sigue opcional y no se requiere su key.

## J. Validaciones — TEST RESULTS

Además de la suite, se verificaron readiness/health del servidor local restaurado, igualdad del `.env`, la captura histórica 537 intacta, el bloqueo histórico con cero operaciones y el mismo conteo de cuatro transacciones Sandbox. Una inferencia estructurada real a través del proveedor Ollama compartido completó `{ "ok": true }` en **93,647 s**, sin llamadas de pago. El primer intento adicional agotó el timeout configurado durante la carga/servicio; el reintento, con las otras validaciones terminadas, devolvió HTTP 200. No se aumentó el timeout ni se modificó el modelo/configuración local. Evidencias no secretas en `.data/deployment-local-ai-validation.json` y `.data/deployment-state-validation.json`, ignoradas por Git.

| Check                                     | Result                                                                            |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| npm run typecheck                         | PASS                                                                              |
| npm run lint                              | PASS                                                                              |
| npm run format:check                      | PASS                                                                              |
| npm test                                  | **146 passed / 14 files**, PostgreSQL local; baseline 112 preserved               |
| npm run build                             | PASS; Next 16.3.8 production, /api/ready dynamic                                  |
| Production Chromium headed E2E            | **4 passed**; PORT=3002, 1.2 min                                                  |
| Production PORT / readiness probe         | PASS; Windows all-interface listener [::]:3002, GET ready 200 with only status ok |
| npm run deployment:check                  | PASS; local configuration and DB, no financial operations                         |
| npm run db:deploy                         | PASS; local migrate deploy, no seed                                               |
| npm run db:seed twice sequentially        | PASS; existing data preserved                                                     |
| Repository secret check                   | SAFE                                                                              |
| Browser bundles secret check              | SAFE; 22 JavaScript files                                                         |
| Actual Neon connection / migration / seed | PASS; remote SQL connection, TLS endpoint certificate, schema and seed verified   |
| Actual Render / signed public webhook     | NOT EXECUTED                                                                      |

Las integraciones usan PostgreSQL local y sustituyen el límite de proveedores; los pagos de E2E son SIMULATED. No se aumentaron timeouts para ocultar fallos. El primer build falló por una DLL Prisma bloqueada en Windows al coincidir generación y seed; se repitió después de finalizar los procesos que la utilizaban, sin borrar datos ni cambiar dependencias. Ese fallo local no se presenta como evidencia de un fallo Render.

## K. Secretos — SECRET-SCAN RESULT

**SAFE**

Se inspeccionaron archivos rastreados y archivos nuevos no ignorados contra valores sensibles configurados y patrones de credenciales/cadenas privadas. `.env` sigue ignorado; `.data`, artefactos de navegador y bases físicas siguen excluidos. Se verificó igualdad SHA-256 del `.env` antes/después sin incluir su contenido. El scan es una comprobación acotada de la versión actual, no una auditoría universal del historial Git o de toda dependencia instalada.

## L. Render — EXACT RENDER SETTINGS

```text
Runtime: Node 22.x
Build Command: npm ci && npm run build
Start Command: npm start
Health Check Path: /api/ready
Root Directory: repository root
```

El descriptor no crea una base, secretos, claves ni cuentas. NPM_CONFIG_INCLUDE asegura que Prisma/tsx/Tailwind estén instalados durante build. PORT es suministrado por Render. Configuración oficial consultada: [Render Next.js](https://render.com/docs/deploy-nextjs-app), [binding/TLS](https://render.com/docs/web-services), [health checks](https://render.com/docs/health-checks), [Node](https://render.com/docs/node-version) y [npm include](https://docs.npmjs.com/cli/v11/commands/npm-ci/#include).

## M. Variables — EXACT ENVIRONMENT VARIABLE NAMES TO CONFIGURE

Primer despliegue y webhook, nombres solamente:

```text
DATABASE_URL
NEXT_PUBLIC_APP_URL
AI_PROVIDER
DEMO_MODE
OPERATOR_PASSWORD
SESSION_SECRET
PAYPAL_CLIENT_ID
PAYPAL_CLIENT_SECRET
PAYPAL_ENV
PAYPAL_WEBHOOK_ID
NODE_ENV
NPM_CONFIG_INCLUDE
```

Solo para modos opcionales/locales, nombres solamente:

```text
OLLAMA_BASE_URL
OLLAMA_MODEL
OLLAMA_TIMEOUT_MS
OPENAI_API_KEY
OPENAI_MODEL
```

Suministradas por plataforma:

```text
PORT
RENDER
```

## N. Neon — EXACT NEON COMMANDS I MUST RUN

Estos pasos de inicialización ya se ejecutaron para la base Neon suministrada el 3 de octubre de 2026, usando las dependencias existentes. Se conservan como procedimiento reproducible para una nueva base. Con DATABASE_URL remoto suministrado de manera privada al entorno administrativo y Node 22, sin modificar `.env`:

```sh
npm ci
npm run db:generate
npm run db:deploy
npm run db:seed
```

Seed solo durante inicialización explícita. La [guía](deployment.md#comandos-neon-sin-reescribir-el-env-local) incluye entrada privada en PowerShell y eliminación de la variable al terminar. Antes de habilitar tráfico:

```sh
npm run deployment:check -- --public
# Tras registrar el webhook y configurar su ID:
npm run deployment:check -- --public --require-webhook
```

Los checks validan consistencia/DB y no ejecutan OAuth, inference o pagos. No usar migrate reset ni db push en producción. La base Neon no contiene automáticamente los recibos históricos locales.

## O. PayPal — EXACT PAYPAL DASHBOARD STEPS I MUST PERFORM

Dashboard → Apps & Credentials → **Sandbox** → misma REST app de las credenciales → Sandbox Webhooks → Add Webhook → origen público HTTPS real + `/api/paypal/webhook` → seleccionar eventos → Save → Webhook ID al Environment de Render → redeploy.

Eventos: CHECKOUT.ORDER.APPROVED, PAYMENT.AUTHORIZATION.CREATED, PAYMENT.AUTHORIZATION.VOIDED, PAYMENT.CAPTURE.COMPLETED, PAYMENT.CAPTURE.PENDING, PAYMENT.CAPTURE.DENIED. Ejecutar una operación real Sandbox nueva, comprobar delivery/evidencia local y Resend del mismo evento para duplicate sin captura extra. No basta un simulador unsigned. Detalle: [pasos de dashboard](deployment.md#pasos-exactos-de-paypal-developer-dashboard), [PayPal webhooks](https://developer.paypal.com/api/rest/webhooks/rest/) y [eventos/resend](https://developer.paypal.com/api/rest/webhooks/events-dashboard/).

## P. Configuración pendiente — MANUAL CONFIGURATION REMAINING

Neon ya está inicializado. Queda publicar los cambios revisados en GitHub; crear/configurar Render, introducir allí DATABASE_URL y el origen real; generar password/secreto privados; introducir credenciales Sandbox existentes; probar login/readiness/persistencia/checkout; registrar webhook, introducir su ID y recibir un evento firmado real. Esa configuración externa está descrita en 22 pasos. No hace falta una API IA pagada.

## Q. Bloqueos — BLOCKERS

No quedan bloqueos de código identificados para iniciar el procedimiento descrito una vez completadas las validaciones locales. La conexión y la inicialización Neon están verificadas. Faltan la configuración de DATABASE_URL en Render, el dominio del servicio, password/secreto y Webhook ID públicos. Esas ausencias impiden declarar el despliegue externo validado; no se corrigieron con valores inventados. El límite compartido de login sigue como limitación conocida para esta demo pública de un operador; debe revisarse con ingress y almacenamiento confiables antes de escalar. PayPal live permanece fuera de alcance.

## R. Respuestas — ANSWER THESE QUESTIONS

| Question                                                | Answer                                                                     |
| ------------------------------------------------------- | -------------------------------------------------------------------------- |
| Is the repository ready to deploy to Render?            | **YES**, with the documented manual configuration                          |
| Is the database code ready for Neon?                    | **YES**; actual Neon connection, migration and seed verified               |
| Is remote operator authentication ready?                | **YES**, with password/secret configured                                   |
| Is PayPal Sandbox public checkout code ready?           | **YES**, with the real HTTPS origin and Sandbox credentials                |
| Is signed webhook code ready for public delivery?       | **YES**, with Webhook ID registered/configured                             |
| Has actual public webhook delivery been validated?      | **NO**                                                                     |
| Is local Ollama still functional?                       | **YES**, real local structured inference verified; configuration preserved |
| Does public deployment require a paid AI API?           | **NO**                                                                     |
| Is AgentGuard ready for the final deployment procedure? | **YES**, subject to external setup and smoke test                          |

Los YES de readiness describen preparación del código para una configuración correcta y el procedimiento manual, no servicios externos ya desplegados. La captura local histórica USD 537 no prueba checkout de una base Neon ni webhook entregado a Render.
