# Plan de rediseño premium

> Leer este archivo al empezar cada sesión nueva. Una fase se marca como
> HECHA solo cuando Marvin la aprueba.

## Reglas fijas

- Rama `rediseno-premium`, nunca `main`. Solo localStorage/harness, nunca
  el Supabase real. No cambiar la forma de ninguna clave de datos.
- Estilo Apple monocromático. Tema claro/oscuro según el sistema por
  defecto, o elegido en el menú (Sistema / Claro / Oscuro), guardado por
  dispositivo en localStorage "ui-theme" (nunca en Supabase). Vidrio solo
  en barra superior, menú, modales y FAB.
- Cero emojis: solo íconos de línea del sprite (trazo 1.75, `currentColor`).
- Verde y rojo apagados solo para dinero; rojo también en errores y borrar.
- Excepción de color: la llama de la racha (vista Hoy) es lo único con
  naranja/dorado en todo el sistema. Nada más usa esos tonos.
- En cada fase: subir `CACHE_NAME`, agregar archivos nuevos a `APP_SHELL`,
  commit, capturas a 390 y 1280 en claro y oscuro, y esperar el OK.

## Fases

1. **Sistema visual** — HECHA.
2. **Navegación** — HECHA. Menú hamburguesa con vidrio, íconos del
   sprite, animación suave y sección activa marcada. En pantallas de más de
   1024px, barra lateral fija en vez de hamburguesa.
3. **Movimiento rápido** — HECHA (con diálogo centrado en desktop). El modal "Gasto rápido" pasa a
   "Movimiento rápido" con selector segmentado Gasto / Ingreso estilo iOS.
   Las categorías cambian según el tipo (`fin-cat-expense` o
   `fin-cat-income`). Reusar `saveFinTx()` con type `'expense'` o
   `'income'`. `#quick-expense` sigue funcionando y se agrega
   `#quick-income`.
4. **Reportes** — HECHA. Sección nueva con Chart.js en monocromo
   (verde/rojo solo en dinero), filtro semana / mes / 3 meses / año, y
   estados vacíos:
   - Finanzas: ingresos vs gastos por mes, gasto por categoría, balance
     acumulado.
   - Hábitos: cumplimiento semanal y mapa de calor anual tipo GitHub.
   - Inglés: horas por semana.
   - Horario: % de bloques cumplidos por semana.
5. **Pulido** — HECHA. Revisar todas las secciones, contraste en ambos
   temas, toques de 44px, safe areas de iPhone, y que nada se rompa con 0
   datos.

## Features después del rediseño

- **Racha con llama** (rama `racha-llama`) — EN REVISIÓN. Arriba de la
  lista de Hoy. Un día cuenta con dayPct ≥ 75; racha = días seguidos desde
  ayer hacia atrás, más hoy si ya pasó el 75%. Se calcula de `logs`, sin
  claves nuevas en Supabase; solo `streak-ignited-date` en localStorage
  (encendido animado una vez por día). Hitos 7, 30, 100 y 365.
