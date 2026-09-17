# Plataforma web — CIA A.C.A Inventario

Panel de supervisión, sin login (uso interno, un solo revisor). Se conecta
directo a Supabase (mismo proyecto que la app móvil) con la anon key
pública — no maneja datos sensibles ni escribe nada, solo lectura.

- **En vivo** (`/`): pesadas (`inv_registros`) en tiempo real vía Supabase
  Realtime, filtrables por fecha y área.
- **Borrador** (`/borrador`): vista previa en HTML de la plantilla de
  inventario antes de generar el Excel definitivo (mismo formato XML
  Spreadsheet 2003 que usa la app móvil en `ResumenScreen`).

## Desarrollo

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Genera `dist/` como sitio estático. Se despliega automáticamente a
GitHub Pages con `.github/workflows/deploy-web.yml` al hacer push a
`main`/`master` con cambios en `web/`.

## Requisito en Supabase

Para que "En vivo" reciba pesadas en tiempo real hace falta correr en el
SQL Editor de Supabase el bloque `REALTIME PARA PLATAFORMA WEB` que está
al final de `supabase-migration.sql` (agrega `inv_registros` a la
publicación `supabase_realtime`).
