# AgentGuard: despliegue público con Render, Neon y PayPal Sandbox

Esta guía describe el procedimiento externo. La conexión real Neon, la migración y el seed se completaron el **3 de octubre de 2026** con las credenciales suministradas; Render y la entrega de webhooks públicos siguen pendientes. El código, las pruebas locales y la evidencia Neon se describen en el [informe de preparación](deployment-report.md). Se conserva la arquitectura financiera validada y el `.env` local; no se ejecutan pagos al desplegar o comprobar readiness.

## Automatizado por el repositorio — AUTOMATED BY REPOSITORY

- `npm start` ejecuta `next start`: interfaz predeterminada `0.0.0.0`, puerto leído de `PORT`, sin un puerto fijo en el script. `npm run dev` sigue en loopback. `package.json` fija Node **22.x** y el lockfile mantiene las dependencias existentes.
- `npm run build` genera Prisma y compila Next. No migra, no ejecuta seed ni mueve dinero. `render.yaml` declara un Web Service, sin recursos de base de datos ni secretos; crear un Blueprint es una acción manual de la cuenta.
- `npm run db:deploy` ejecuta exclusivamente **Prisma migrate deploy** y oculta la salida que podría contener datos de conexión. `npm run db:seed` inicializa el catálogo/operador explícitamente; no se ejecuta durante arranque o reinicios.
- Las APIs verifican configuración antes de trabajar. Un origen público exige HTTPS, PostgreSQL con TLS, contraseña y secreto de sesión. Credenciales PayPal parciales, entorno live o un fallback implícito fallan de forma segura.
- `GET /api/ready` es público y no cacheable: solo `{ "status": "ok" }` con 200 o `{ "status": "unavailable" }` con 503. Comprueba configuración y que la tabla/operador inicial sean consultables; la espera de DB se limita a tres segundos. No comprueba OAuth, firma externa ni una inferencia en cada health check. `GET /api/health` conserva protección del operador.
- Retornos PayPal utilizan el origen de ejecución normalizado. La URL de retorno no prueba aprobación; el backend sigue verificando orden, carrito, importe y autorización antes de la comprobación final.
- Webhooks mantienen firma obligatoria, validación del certificado, deduplicación, auditoría y reconciliación de operaciones existentes; no crean un permiso ni inician capturas.

## Configuración manual — MANUAL USER CONFIGURATION

Necesitas acceso propio a GitHub, Neon, Render y la misma app REST Sandbox de PayPal. Se usó la conexión administrativa a PostgreSQL Neon; no se inició sesión en dashboards ni se publicó el servicio. No añadas `.env`, `.data`, passwords, cadenas de conexión o credenciales al repositorio, tickets, capturas ni logs.

### Configuración exacta de Render

| Campo                | Valor                                                                           |
| -------------------- | ------------------------------------------------------------------------------- |
| Tipo                 | Web Service, no Static Site                                                     |
| Language/Runtime     | Node                                                                            |
| Root Directory       | Raíz del repositorio                                                            |
| Build Command        | `npm ci && npm run build`                                                       |
| Start Command        | `npm start`                                                                     |
| Health Check Path    | `/api/ready`                                                                    |
| Node                 | 22.x mediante `engines`; evitar overrides a otra versión                        |
| Instancias iniciales | Una; el limitador actual vive en memoria por proceso                            |
| Puerto               | El `PORT` de Render; no fijar 3000 ni copiar el puerto local                    |
| Base                 | Neon remoto; no ejecutar `db:local` ni Docker PostgreSQL dentro del web service |

Render requiere bind público y ofrece Web Services para Next con lógica de servidor. El repositorio usa el CLI instalado, cuyo `start` admite `PORT` y predetermina `0.0.0.0`. Véanse [Web Services y puertos](https://render.com/docs/web-services#port-binding), [Next en Render](https://render.com/docs/deploy-nextjs-app) y [selección de Node](https://render.com/docs/node-version). Render termina TLS delante del proceso HTTP; Secure se deriva del origen HTTPS configurado, conservando protección de origen y sin CORS wildcard. [TLS y proxy de Render](https://render.com/docs/web-services#connecting-from-the-public-internet).

El descriptor usa el plan Free como ejemplo sin aprovisionar bases ni ejecutar migraciones. Selecciona el plan apropiado en tu cuenta antes de la demo y revisa sus límites actuales; no supone disponibilidad continua. [Límites de servicios gratuitos](https://render.com/docs/free). No es obligatorio usar Blueprint: los mismos campos pueden configurarse manualmente. `sync: false` exige introducir valores en el dashboard. Tras registrar el webhook, añade su ID al Environment del servicio; no es un secreto generado por el descriptor.

### Variables del primer despliegue

| Variable               | Configuración manual requerida                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`         | Cadena de conexión Neon con `sslmode=require` o verificación TLS más estricta. Se guarda solo en Render/proceso administrativo. |
| `NEXT_PUBLIC_APP_URL`  | Origen HTTPS realmente asignado, sin path, usuario, query o fragment. Nunca localhost en Render.                                |
| `AI_PROVIDER`          | `deterministic` para el primer despliegue.                                                                                      |
| `DEMO_MODE`            | `true` para habilitar explícitamente ese parser y ejemplos; **no** omite login remoto.                                          |
| `OPERATOR_PASSWORD`    | Valor aleatorio privado, mínimo 12 caracteres; usa uno bastante más largo generado por un gestor de contraseñas.                |
| `SESSION_SECRET`       | Valor aleatorio privado de al menos 32 caracteres; generado separadamente, sin reutilizar password.                             |
| `PAYPAL_CLIENT_ID`     | Credencial de la misma app REST Sandbox existente.                                                                              |
| `PAYPAL_CLIENT_SECRET` | Su secreto, solo en Environment privado de Render.                                                                              |
| `PAYPAL_ENV`           | `sandbox`; live permanece deshabilitado.                                                                                        |
| `PAYPAL_WEBHOOK_ID`    | Inicialmente vacío; configurar tras registrar el endpoint. No es el Client ID ni el ID de un evento.                            |

`NODE_ENV=production` está en el descriptor. `PORT` y `RENDER` los proporciona la plataforma; no se necesitan valores locales copiados. Evita importar el `.env` completo al dashboard.

Configura también **NPM_CONFIG_INCLUDE=dev** durante instalación/build: Prisma CLI, tsx y Tailwind están en devDependencies y son necesarios para compilar e inicializar. Esto permite conservar el Build Command exacto con `npm ci` incluso bajo NODE_ENV=production; no cambia versiones ni añade dependencias. [Opciones include/omit de npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/#include).

Variables opcionales conservadas: `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `OLLAMA_TIMEOUT_MS` son para la demo **local**; `OPENAI_API_KEY`, `OPENAI_MODEL` solo para selección opcional `openai`. El primer despliegue público no necesita ninguna de ellas ni una API de IA pagada. No expongas Ollama con un túnel y no instales el modelo 30B en el web process.

Si deliberadamente no configuras ninguna credencial PayPal, `DEMO_MODE=true` habilita pagos **SIMULATED** claramente etiquetados; esa variante no satisface la validación de PayPal Sandbox real. Nunca configures solo una credencial.

### Secuencia exacta de configuración y validación

1. **Crear Neon PostgreSQL.** En la consola crea un proyecto/base/rol para esta demo y elige una región cercana a Render. Es una base nueva separada del PostgreSQL local; el seed no migra el historial existente.
2. **Copiar DATABASE_URL al entorno administrativo y, después, al Environment de Render.** Usa la cadena PostgreSQL del panel Connect de Neon y conserva los parámetros TLS. No la escribas en `.env`, documentación ni comandos con secretos literales. Para un Web Service único puedes comenzar con conexión directa y un número moderado de conexiones. Neon también documenta URLs pooled con Prisma; no hay `directUrl` adicional obligatorio en este esquema. [Compatibilidad Prisma de Neon](https://neon.com/blog/better-postgres-with-prisma-experience).
3. **Aplicar migraciones.** Desde este checkout con Node 22 y la URL remota solo en el entorno del proceso: `npm ci`, `npm run db:generate`, `npm run db:deploy`. Si falla, detener el procedimiento y comprobar de forma privada conectividad, rol, TLS y estado de migraciones. No usar reset, db push ni borrar tablas.
4. **Ejecutar seed una vez.** `npm run db:seed`. Crea operador, agentes, catálogo, plantilla y ejemplos etiquetados SIMULATED. Los upserts no reescriben productos/mandatos existentes; la historia inicial se agrega solo si no hay transacciones. Repetible en ejecución secuencial, no un proceso para correr concurrentemente ni en cada restart. La app no inicia un pago desde seed.
5. **Crear Render Web Service.** New → Web Service. Elige Node y la configuración exacta de la tabla anterior. No uses Static Site ni `next dev`.
6. **Conectar GitHub.** Autoriza el repositorio/branch que contiene los cambios revisados. Antes de subir ejecuta `npm run secret:check` y verifica que `.env`/`.data` siguen ignorados. Esta preparación no hizo push ni configuró secretos en GitHub Actions.
7. **Configurar Environment.** Introduce las variables de la tabla. Si Render muestra ya el dominio asignado, úsalo como origen desde el primer deploy. Si el dominio no se conoce aún, el primer intento queda deliberadamente no ready hasta completar los pasos 11–13; no se permite un default localhost ni checkout con un origen provisional sin confirmar.
8. **Generar OPERATOR_PASSWORD.** Usa un gestor de contraseñas para generar una clave aleatoria larga y pégala únicamente en el campo privado de Render. Evita imprimirla en una terminal o guardarla en el repo. Conservar el valor para el operador en un gestor privado.
9. **Generar SESSION_SECRET.** Genera otro secreto aleatorio de al menos 32 caracteres y guárdalo únicamente en Render. No reutilices el password ni una clave PayPal. Cambiarlo invalida todas las firmas de sesión existentes.
10. **Deploy.** Ejecuta el primer deploy con `npm ci && npm run build` y `npm start`. El arranque no hace migraciones ni seed; Neon debe estar preparado con los pasos 3–4. Readiness 503 indica configuración o inicialización pendiente y no se debe ocultar cambiando el health path.
11. **Obtener la URL HTTPS asignada.** Revisa el dominio en la pantalla del servicio; incluye cualquier sufijo real que Render haya asignado.
12. **Establecer NEXT_PUBLIC_APP_URL.** Copia exactamente el origen HTTPS real, sin slash de ruta, al Environment. No uses el ejemplo PUBLIC_RENDER_DOMAIN literalmente, localhost ni un hostname guessed.
13. **Redeploy.** Guarda Environment y redeploy/restart según dashboard. Callbacks y comprobaciones leen el origen al ejecutar; redeploy asegura que el proceso utilice el entorno nuevo. No probar pagos antes de corregir el origen.
14. **Probar login.** En una ventana privada abre `/login`; las APIs `/api/session`, `/api/health`, `/api/catalog` y transacciones deben devolver 401 sin cookie. Inicia sesión y comprueba HttpOnly, Secure, SameSite=Strict y expiración. `DEMO_MODE=true` no concede identidad remota. Logout elimina la cookie del navegador; por el diseño stateless, una copia previamente robada del token conserva validez hasta expiración/rotación del secreto, no hay revocación individual en DB.
15. **Probar /api/ready.** Sin cookie: HTTP 200 y exactamente `{ "status": "ok" }`. No URLs ni configuración. Una DB vacía/sin operador, conexión fallida o configuración insegura debe dar 503. Render utiliza este endpoint para aceptar tráfico. [Health checks](https://render.com/docs/health-checks).
16. **Probar dashboard y persistencia.** Ya autenticado, abrir catálogo, mandatos, approvals y dashboard. Verificar conexión a Neon y que los ejemplos se etiqueten SIMULATED. Reiniciar el servicio y comprobar que los datos permanecen. No esperar el recibo Sandbox local en Neon: no se ha migrado su base.
17. **Probar checkout Sandbox público.** Crear/revisar/activar un mandato nuevo para tres Alpha por 537, sin extras, límite 700/600. Verificar DETERMINISTIC FALLBACK y PAYPAL SANDBOX por separado. Crear orden AUTHORIZE, aprobar como comprador Personal Sandbox, volver al origen correcto y autorizar. Comprobar backend verification, FINAL_POLICY_CHECK, CAPTURED y referencias reales. No repetir capturas de la transacción local histórica ni sustituir IDs reales por SIM-*.
18. **Crear PayPal webhook.** En la misma app REST **Sandbox** añadir el endpoint público según el procedimiento específico de abajo; seleccionar eventos y guardar.
19. **Configurar PAYPAL_WEBHOOK_ID.** Copiar el ID del webhook recién registrado al Environment privado de Render. No pegar IDs de otra app o entorno.
20. **Redeploy.** Aplicar la variable. Ejecutar `npm run deployment:check -- --public --require-webhook` desde un shell/proceso con el entorno remoto configurado, sin imprimir valores. Este comando prueba consistencia y DB, no firma/delivery externos.
21. **Verificar un webhook firmado real.** Ejecutar una compra Sandbox nueva después de registrar el webhook o reenviar un evento real de esa misma app. Confirmar entrega 2xx, ID persistido en WebhookEvent, auditoría y reconciliación permitida. Reenviar el mismo evento: duplicate y sin nueva operación financiera. No considerar un POST unsigned, un simulador o tests locales como evidencia de firma entregada real.
22. **Smoke test final.** Repetir login/readiness/catálogo, compile draft y human activation; ALLOW537, BLOCK812 con cero operaciones, REQUIRE_APPROVAL675, capture idempotente; revisar dashboard/receipt y persistencia tras reinicio. Documentar fecha, modo e IDs de la evidencia pública sin secretos y solo entonces anunciar entrega pública verificada.

### Comandos Neon sin reescribir el .env local

Ejecuta desde `D:\Hackaton` en una **terminal administrativa nueva**. El input enmascarado evita secretos literales en el historial. El ejemplo guarda la URL solo en memoria/entorno de esa terminal, no en archivos. Mantén la ventana privada y no muestres variables con `echo`, `Get-ChildItem Env:` o dumps de procesos.

En Windows, detén primero tu servidor de aplicación y espera a que terminen tests antes de `npm ci` o `db:generate`: pueden mantener cargada la DLL de Prisma. Conserva los procesos/datos de PostgreSQL y Ollama; no es necesario borrar archivos ni detener todos los procesos Node.

```powershell
npm ci
$neonInput = Read-Host "Neon DATABASE_URL (entrada privada)" -AsSecureString
$env:DATABASE_URL = [System.Net.NetworkCredential]::new("", $neonInput).Password
try {
    npm run db:generate
    if ($LASTEXITCODE -ne 0) { throw "Prisma generation failed" }
    npm run db:deploy
    if ($LASTEXITCODE -ne 0) { throw "Migration deployment failed" }
    npm run db:seed
    if ($LASTEXITCODE -ne 0) { throw "Initial seed failed" }
} finally {
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
    $neonInput.Dispose()
}
```

La variable de entorno tiene prioridad sobre dotenv; el archivo local sigue intacto. Cierra esa terminal al terminar. En Render Shell los comandos equivalentes son:

```sh
npm run db:generate
npm run db:deploy
npm run db:seed
npm run deployment:check -- --public
# Después de registrar/configurar el webhook:
npm run deployment:check -- --public --require-webhook
```

Si el plan no ofrece shell, usa la terminal administrativa anterior. No se instala Neon CLI ni se necesita una nueva dependencia. No ejecutes `db:setup` en cada restart: incluye seed y está pensado para preparación local. Migraciones posteriores se aplican como paso de release explícito antes de habilitar el nuevo código; el deploy de app no garantiza por sí solo que el esquema haya cambiado.

### Pasos exactos de PayPal Developer Dashboard

1. Inicia sesión en [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/) con la cuenta propietaria de las credenciales existentes.
2. Ve a **Apps & Credentials** y selecciona **Sandbox**, no Live.
3. Abre la **misma REST app** del Client ID configurado en Render. No crees otra app ni sustituyas credenciales para este procedimiento.
4. En **Sandbox Webhooks / Webhooks**, selecciona **Add Webhook**.
5. En Webhook URL introduce el origen HTTPS real seguido de `/api/paypal/webhook`. Debe resolver públicamente y no redirigir a login.
6. Selecciona **CHECKOUT.ORDER.APPROVED**, **PAYMENT.AUTHORIZATION.CREATED**, **PAYMENT.AUTHORIZATION.VOIDED**, **PAYMENT.CAPTURE.COMPLETED**, **PAYMENT.CAPTURE.PENDING** y **PAYMENT.CAPTURE.DENIED**, luego **Save**. El backend solo reconcilia los tipos y estados admitidos; una notificación aprobada no ejecuta una captura por sí sola.
7. Copia el **Webhook ID** registrado a PAYPAL_WEBHOOK_ID en Render y redeploy. [Registro/verificación de webhooks](https://developer.paypal.com/api/rest/webhooks/rest/).
8. Comprueba una cuenta **Personal Sandbox** de comprador separada de la Business Sandbox de la app. La app recibe fondos de prueba; las credenciales REST no sustituyen la aprobación del comprador.
9. Tras una compra nueva, abre **Sandbox → Webhooks Events**, selecciona la app, filtra el evento/recurso y examina delivery/details. [Dashboard de eventos](https://developer.paypal.com/api/rest/webhooks/events-dashboard/).
10. Usa **Resend** sobre el evento real para verificar deduplicación. En la base/recibo debe existir evidencia consistente; repetir el evento no genera CAPTURE adicional. Eventos relevantes sin una operación local reconocible pueden devolver 503 para permitir reintento.

La verificación del servidor exige headers de firma y un cert URL HTTPS PayPal, llama verify-webhook-signature y solo acepta SUCCESS. El Webhook ID enlaza la firma con el endpoint de esta app. Registrar una URL no prueba entrega, y delivery 2xx sin evidencia local no prueba una nueva captura.

### Autenticación, límites y modos

La sesión HMAC expira a las ocho horas. El password permanece en servidor y Secure se activa por el origen HTTPS incluso detrás del proxy HTTP interno. Origin exacto + JSON siguen obligatorios en mutaciones; no se añade CORS wildcard ni se confía en un query `paypal=approved`.

El login conserva **cinco intentos/minuto en un bucket compartido**. `TrustedLoginIdentity` define el contrato para un futuro adapter de ingress/transport verificado. El adapter actual no está configurado: X-Forwarded-For, CF-Connecting-IP y True-Client-IP del request **no** seleccionan un bucket nuevo. No se afirma que el hallazgo de disponibilidad esté corregido. Una instancia reduce la variación entre procesos, pero no aporta rate limiting distribuido ni elimina la denegación temporal entre callers; escalar requiere almacenamiento e identidad confiables.

| Entorno               | Motor de interpretación                   | Pago                                                  | Acceso                                     |
| --------------------- | ----------------------------------------- | ----------------------------------------------------- | ------------------------------------------ |
| Local/video existente | LOCAL — OLLAMA, inferencia real           | PAYPAL SANDBOX con credenciales o SIMULATED sin ambas | Demo automático solo en loopback explícito |
| Público inicial       | DETERMINISTIC FALLBACK, parser **sin IA** | PAYPAL SANDBOX con ambas credenciales                 | Sesión del operador obligatoria            |
| Opcional explícito    | OPENAI (OPTIONAL)                         | Independiente del proveedor de IA                     | Sesión obligatoria fuera de loopback       |

La landing explica el objetivo del producto; el modo efectivo de cada consola se obtiene de la sesión. El fallback no se presenta como una inferencia real. El modelo local mantiene su configuración y no se publica en una URL remota.

### Criterios para cerrar el despliegue

Repositorio preparado no equivale a servicios externos validados. Solo declarar listo el procedimiento final con configuración completa, controles locales verdes y sin secretos rastreados; solo declarar **despliegue público validado** tras evidencia de Render, Neon, login HTTPS, checkout Sandbox y webhook firmado real.

Pendientes operativos del MVP: límite global de login y almacenamiento en memoria, expiración de órdenes abandonadas, reconciliación durable/outbox, backup/restore y observabilidad de la cuenta. No se habilita dinero live ni se usa este procedimiento como certificación financiera de producción.
