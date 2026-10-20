# Informe de mejoras autónomas — rama `mejoras-autonomas`

Fecha: 19 de octubre de 2026. Todo está en la rama `mejoras-autonomas` (pusheada); **no se tocó `main`**.
`security_audit.md` sigue sin trackear.

## Resumen

| # | Commit | Qué |
|---|--------|-----|
| 1 | `8d82e43` | Bloc de Marvin: tareas con check por materia |
| – | `c4ff03c` | Bloc de Marvin: ids únicos (arreglo de un bug encontrado al probar) |
| 2 | `75419be` | Horario semanal (Hoy / Semana / Editar) — `schedule.js` |
| 3 | `2fa4375` | Respaldo: exportar / importar todo en JSON — `backup.js` |
| 4 | `0d31626` | Pulido móvil: sin desborde horizontal, espacio para el FAB, safe areas |
| 4 | `0da923e` | Accesibilidad: labels, teclado, contraste, zonas táctiles de 44px |
| 4 | `a09fcef` | Estado de carga (y bloqueo de edición mientras carga) |
| 4 | `c8728bd` | Confirmaciones al borrar + bug de categoría al editar movimientos |
| 4 | `5da59bd` | Service worker: íconos en `APP_SHELL` |

Claves **nuevas**: `blocmarvin-tasks`, `schedule-blocks`, `schedule-done`. Ninguna clave existente cambió de forma.
Todos los guardados nuevos pasan por `guardedSave()`. No se agregaron librerías. No se borró ningún archivo ni funcionalidad.
`CACHE_NAME` quedó en `daily-tracker-v11`; `APP_SHELL` incluye `quick-expense.js`, `bloc-marvin.js`, `schedule.js` y `backup.js`.

---

## 1. Tareas con check en el Bloc de Marvin

- Card "Tareas" arriba de las notas: input + botón (Enter también agrega), `.chk` para marcar, botón Eliminar.
- Pendientes arriba; hechas abajo, atenuadas y tachadas. Contador "x/y hechas". Estado vacío.
- Pill "N pendiente(s)" en cada materia (desaparece con 0).
- `blocmarvin-tasks = { [subjectId]: [{ id, text, done, createdAt }] }`; se carga en `loadData()` con try/catch y se resetea en `handleSignOut()`.
- Al borrar una materia se borran sus tareas (el confirm ahora lo dice).
- Arreglo extra: en 390px el botón "Eliminar" de la materia se salía de la card → la fila ahora hace wrap.

**Bug encontrado y arreglado (`c4ff03c`)**: `addSubject()` usaba `'sub' + Date.now()`. Dos materias creadas en el mismo milisegundo compartían id y abrir/borrar una afectaba a ambas. Agregué `uid(prefix)` en `utils.js` (timestamp + sufijo aleatorio) y lo uso en Bloc, Horario y Tareas.

## 2. Horario semanal (`schedule.js`, sección "Horario")

- **Hoy**: bloques del día en orden, "Ahora · quedan X" en el bloque en curso y "Siguiente · en X" en el próximo; los ya pasados se atenúan. Cada bloque se tickea; se guarda por fecha. Se refresca solo cada minuto mientras la sección está a la vista.
- **Semana**: grilla horas × días. Columna de horas fija, scroll horizontal con snap, columna de hoy resaltada, línea roja con la hora actual, bloques solapados lado a lado. Al abrir la pestaña se scrollea hasta hoy. Tocar un bloque lo abre en el editor.
- **Editar**: agregar, editar, duplicar a otros días (elegís los días con botones) y eliminar (con confirm).
  - fin ≤ inicio → error y **no** guarda. Nombre vacío → error.
  - Solape → aviso en vivo en el form + pill "Se solapa" en la lista, pero **deja guardar**.
  - Después de agregar, el form propone el siguiente bloque a continuación (misma duración, mismo día y color), cómodo para cargar clases seguidas.
- Claves: `schedule-blocks = [{ id, day, start:'HH:MM', end:'HH:MM', name, color }]` y `schedule-done = { 'YYYY-MM-DD': { blockId: true } }`.

## 3. Respaldo (`backup.js`, sección "Respaldo")

- **Exportar todo (JSON)** → `daily-tracker-respaldo-YYYY-MM-DD.json` con `{ app, version, exportedAt, data }`.
  - Lista blanca de las 18 claves de la app. En modo localStorage **no** se cuela la sesión de Supabase (`sb-…-auth-token`) ni la cola de reintentos (lo probé plantando una clave falsa).
  - Valores tal cual están guardados (strings) → restaurar es idéntico byte a byte (verificado).
  - Si una clave tiene un guardado pendiente en la cola, se exporta ese valor (es el más nuevo).
  - Si no se puede leer algo (sin conexión), **no descarga nada** en vez de dar un respaldo incompleto.
  - Las 18 claves se leen en paralelo y la cola se lee una sola vez: antes eran 18 lecturas seguidas contra Supabase (≈2 s con 120 ms de latencia; ahora ≈0,15 s).
- **Importar**:
  - Valida todo el archivo: JSON válido, `app` correcta, versión no más nueva, cada valor parseable. Si algo está dañado, no importa nada.
  - Resumen "Ahora vs. Archivo" por cada dato (en negrita lo que cambia), qué no se toca y qué claves desconocidas se ignoran.
  - Casilla (marcada por defecto) "Descargar antes un respaldo de mis datos actuales", más un `confirm()` final.
  - Escribe con `guardedSave()`; si algo falla, queda en la cola y se avisa. Después recarga el estado (`load()`).
  - Las claves que no vienen en el archivo **no se borran**.

## 4. Pulido

- **Móvil**: "Crear meta" (Finanzas) y "Agregar" (actividades de Inglés) se salían de la card y generaban scroll horizontal en toda la página. Ahora `.add-row` hace wrap. El FAB ya no tapa lo último de cada página. FAB y toast respetan safe areas.
- **Accesibilidad**:
  - `aria-label` en todos los campos que solo tenían placeholder.
  - Los `.chk` (hábitos, mes, inglés, tareas, horario) son `role="checkbox"` con `aria-checked` y se usan con Espacio/Enter; el menú y los días de la semana son `role="button"`. El foco no se pierde al re-renderizar.
  - Contraste: saqué la `opacity` que dejaba el gris chico por debajo de 4.5:1.
  - `:focus-visible` con anillo claro.
  - En pantallas táctiles, botones/días/menú miden al menos 44px y los `.chk` reciben toques en 44px sin cambiar su tamaño visual (en desktop el look no cambia).
- **Estado de carga**: "Cargando tus datos…" con spinner, y las vistas + FAB quedan `inert` hasta que termina `load()`. Esto también evita un riesgo real: con Supabase lento se podía agregar o tickear algo sobre listas todavía vacías, y ese guardado pisaba los datos del servidor.
- **Confirmaciones**: borrar categoría y borrar tarea eran los únicos borrados sin confirm.
- **Bug arreglado**: editar un movimiento cuya categoría ya había sido borrada la cambiaba en silencio a la primera de la lista al guardar.
- Con **0 datos** (primer uso y listas vacías) ninguna sección tira errores.

---

## Cómo probé

- Servidor local en `127.0.0.1:8765` con `Cache-Control: no-store` y la app en un iframe de **390×780** (viewport de celular), con SW y caches limpios en cada recarga. Solo localStorage: **nunca contra Supabase** (entré a la app sin login, igual que la rama `window.storage`).
- Interacciones reales (clics, Enter, Tab, Espacio) para los flujos principales y JS para casos borde (horas inválidas, archivos dañados, mismo milisegundo).
- **Cola de reintentos**: reemplacé `S.set` por una función que falla → `blocmarvin-tasks`, `schedule-done` y las claves del import quedaron en `__sync_queue__` con el banner; al restaurar `S.set` y hacer flush, la cola quedó vacía y los datos guardados.
- **Persistencia**: recargué y verifiqué que tareas, bloques y checks seguían ahí, con la forma exacta de las claves.
- **Descargas**: para no bajar archivos a tu carpeta sin poder pedirte permiso, intercepté el clic del `<a download>` y leí el blob. La descarga real en el navegador **no** la probé.
- Barrido final: las 9 secciones sin errores de consola ni desborde horizontal.

## Decisiones que tomé solo

1. **Solapes del horario**: avisan pero no bloquean (pediste "avisar"). fin ≤ inicio sí bloquea. Bloques contiguos (09–10 y 10–11) no cuentan como solape. No hay bloques que crucen medianoche.
2. **Colores del horario**: 4 etiquetas (Claro, Verde, Rojo, Gris) mapeadas a variables existentes, sin paleta nueva.
3. **`day` = `Date.getDay()`** (0 = domingo), igual que `DOW` en `utils.js`. Las vistas igual muestran la semana de lunes a domingo.
4. **"Horario" y "Respaldo" van al final del menú**, para no mover lo que ya usás.
5. **Borrar un bloque no limpia sus checks viejos** en `schedule-done` (quedan ids huérfanos, que no molestan). Preferí no tocar historial.
6. **Respaldo con valores crudos (strings)** en vez de JSON "lindo": el archivo se lee peor a mano, pero restaurar es exacto.
7. **El import no borra** las claves que faltan en el archivo, solo reemplaza las que vienen.
8. **`uid()` solo en código nuevo y en el Bloc.** Hábitos, finanzas e inglés siguen con `prefijo + Date.now()`; ahí el choque solo pasa con dos altas en el mismo milisegundo y no quise tocar módulos ajenos a las tareas.
9. Confirm al borrar tareas, por consistencia con el resto de la app (lo pediste en el punto 4), aunque hace el borrado un paso más lento.
10. El commit `0d31626` cambió `style.css` sin subir `CACHE_NAME`; lo subí en el commit siguiente (`0da923e`). Como el SW es stale-while-revalidate, el impacto es nulo si deployás la rama completa.

## Qué quedó sin hacer y por qué

- **Offline real con Supabase**: el SW no cachea los CDN (`supabase-js`, `Chart.js`), así que sin conexión `initSupabase()` falla y la app no arranca aunque el shell esté cacheado. Es de antes. Arreglarlo implica cambiar la estrategia del SW para recursos de terceros; no lo hice sin tu OK.
- **`loadData()` no mira la cola de reintentos**: si hay cambios pendientes y la app se recarga con conexión, muestra lo del servidor (más viejo), y un cambio nuevo sobre esa clave pisa el valor encolado. Es de antes (lo vi al probar el import con fallos). Lo ideal sería que `safeGet` use primero el valor de la cola; no lo toqué porque cambia el comportamiento de storage para toda la app.
- **No probé con pantalla táctil real** (`pointer: coarse`): las reglas de 44px están verificadas en el CSS, pero no las vi en un dispositivo.
- **Capturas**: Chrome falló varias veces al capturar pantalla durante la sesión. El estado de carga lo verifiqué por DOM (clase, `inert`, layout), sin captura.
- **Estados vacíos "más cuidados"** en secciones viejas (Analíticas, Mes): no fallan con 0 datos, pero no los rediseñé; prioricé lo demás.

## Qué revisar en el celular (vista previa de Vercel de esta rama)

1. **Bloc**: agregar tareas con Enter del teclado del celu, tickear, que bajen tachadas; el pill de pendientes en la lista de materias.
2. **Horario → Semana**: que el scroll horizontal se sienta cómodo (snap), que la columna de horas quede fija y que se vea la línea roja de "ahora".
3. **Horario → Editar**: los selectores de hora nativos de iOS/Android, y el aviso de solape.
4. **Respaldo → Exportar** en iPhone (PWA instalada): que se abra la hoja de compartir/guardar con el `.json`. Es lo que menos pude probar.
5. **Respaldo → Importar**: elegir el archivo desde Archivos/Drive, ver el resumen, confirmar.
6. **Áreas táctiles**: botones Eliminar/Editar, checks y menú más fáciles de tocar; que nada se vea raro por la altura mínima de 44px.
7. **Primera carga con Supabase**: debería verse "Cargando tus datos…" un instante y no dejarte tocar nada hasta que cargue.
8. Con **notch / Dynamic Island**: el FAB y el toast no deberían quedar debajo del área segura.
9. **Que el SW actualice** (`v11`): al abrir la PWA la primera vez puede mostrar la versión vieja; la segunda apertura ya trae todo.
