# CIA A.C.A — Control de Inventario

App Android interna para registro de pesadas con báscula, offline-first, con fotos, escáner de códigos, OCR, y sincronización a la nube.

Desarrollada en **React Native / Expo SDK 54** para el equipo de inventario de la planta.

---

## Documentación para IA

El archivo **`AGENTS.md`** contiene el contexto completo del proyecto: stack técnico, estructura, funcionalidades, BD, comandos, problemas resueltos y pendientes.

Al iniciar una nueva sesión, la IA debe leer `AGENTS.md` primero para tener contexto completo.

---

## Inicio Rápido

```powershell
cd InventarioCIA54
npx expo start --clear
```

Escanea el QR con **Expo Go** en Android.

## Generar APK

```powershell
npx eas login
npx eas build --profile preview --platform android
```
