# Tablero del supervisor (Google Sheets + Apps Script)

Este runbook conecta Supabase con una hoja de Google en (casi) tiempo real, sin
hosting propio. Requisito: haber ejecutado ya el bloque SQL de
`supabase-migration.sql` (sección "INVENTARIO GENERAL POR ÁREAS...").

## 1. Crear la hoja

1. Crea una hoja de Google nueva (vacía).
2. Copia su ID desde la URL: `https://docs.google.com/spreadsheets/d/ESTE_ES_EL_ID/edit`.

## 2. Pegar el script

1. En la hoja: **Extensiones → Apps Script**.
2. Borra el contenido de `Código.gs` y pega el contenido de `WebhookReceiver.gs`.
3. Completa las constantes al inicio del archivo:
   - `TOKEN`: cualquier cadena secreta larga (ej. generada con un gestor de contraseñas).
   - `SHEET_ID`: el ID copiado en el paso 1.
   - `SUPABASE_URL` / `SUPABASE_KEY`: ya vienen con los valores actuales del proyecto (`src/services/supabase.ts`); actualízalos aquí si alguna vez cambian.
4. Guarda el proyecto (nombre sugerido: "InventarioCIA - Webhook").
5. En el editor, selecciona la función `inicializar` en el desplegable de funciones y presiona ▶ **Ejecutar**. Acepta los permisos que pida Google (Sheets + Triggers). Esto crea las pestañas "Registros", "Comparaciones", "Log" y programa el respaldo cada 1 minuto.

## 3. Desplegar como Web App

1. **Desplegar → Nueva implementación**.
2. Tipo: **Aplicación web**.
3. "Ejecutar como": **Yo (tu cuenta)**.
4. "Quién tiene acceso": **Cualquier usuario**.
5. Desplegar y copia la URL que termina en `/exec`.

## 4. Crear los Database Webhooks en Supabase

En el dashboard de Supabase: **Database → Webhooks → Create a new hook**, dos veces:

**Webhook 1 — Registros**
- Nombre: `webhook_registros`
- Tabla: `inv_registros`
- Eventos: **Insert**
- Tipo: HTTP Request, método **POST**
- URL: `https://script.google.com/macros/s/TU_ID_DE_DESPLIEGUE/exec?token=TU_TOKEN`
- Header: `Content-Type: application/json`

**Webhook 2 — Comparaciones**
- Nombre: `webhook_comparaciones`
- Tabla: `inv_comparaciones`
- Eventos: **Insert** y **Update**
- Mismo tipo/URL/header que el anterior.

## 5. Comportamiento esperado (no son errores)

- El log de webhooks en Supabase va a mostrar **código 302** en cada llamada. Es normal: Apps Script siempre responde `/exec` con una redirección, y Supabase no la sigue — mientras el `doPost` haya corrido, la fila ya quedó escrita en la hoja. Solo un 4xx/5xx real es un problema.
- Si un webhook llegara a fallar silenciosamente, la función `sincronizarDesdeSupabase` (trigger cada 1 minuto) vuelve a traer lo que falte directamente desde Supabase — la hoja termina siendo correcta aunque se pierda una notificación puntual.

## 6. Compartir con el supervisor

Comparte la hoja en modo **lector**. Las filas de "Comparaciones" con diferencia mayor a 1kg quedan resaltadas en rojo; si `misma_referencia` es falso, las columnas de referencia quedan en naranja (los operadores pudieron haber contado materiales distintos).

## Verificación rápida

1. Guarda un registro en la app (con área asignada) → debe aparecer en "Registros" en unos segundos.
2. Provoca una diferencia >1kg entre los 2 operadores de una misma área → debe aparecer resaltada en "Comparaciones".
3. Corrige el peso de uno de los dos en la app y sincroniza → la misma fila en "Comparaciones" se debe actualizar, no duplicar.
