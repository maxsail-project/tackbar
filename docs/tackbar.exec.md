# TackBar — Guía de ejecución local v0.5

Guía operativa para levantar TackBar en Windows/PowerShell, elegir datos TEST o privados y operar el piloto mediante `/admin`.

## 1. Datos TEST y privados

`TACKBAR_DATA_DIR` selecciona la raíz de persistencia del backend.

- Variable sin definir: dataset público y sanitizado en `C:\maxsail-project\tackbar\backend\test-data`.
- Variable definida: raíz privada indicada por el operador.

```powershell
$env:TACKBAR_DATA_DIR = "C:\private\tackbar-data"
```

Una raíz privada v0.5 puede contener:

```text
C:\private\tackbar-data\
├── sailors.json
├── boats.json
├── activities.json
├── sessions.json
├── ingestion_history.json
├── consent_events.json
├── originals\
└── tracks\
```

Los archivos aparecen cuando el flujo correspondiente los necesita. Los datos reales, originales, tracks, emails y secretos deben permanecer fuera del repositorio público. Las variables `$env:` afectan sólo a la terminal PowerShell actual.

## 2. Configuración Admin

Configure la credencial única de administración de la PoC en el backend:

```powershell
$env:TACKBAR_ADMIN_KEY = "change-me-local-only"
```

Use otro secreto en operación real y no lo añada a Git, URLs, documentación o logs. El frontend lo envía exclusivamente mediante `X-TackBar-Admin-Key`. Si la variable está ausente, vacía o contiene sólo espacios, la API Admin queda deshabilitada (`503`).

La UI conserva la clave únicamente en memoria React: no usa Local Storage, Session Storage, cookies ni IndexedDB. Refrescar el navegador exige introducirla de nuevo.

## 3. Backend con TEST

```powershell
cd C:\maxsail-project\tackbar\backend
Remove-Item Env:TACKBAR_DATA_DIR -ErrorAction SilentlyContinue
$env:TACKBAR_ADMIN_KEY = "change-me-local-only"
python -m uvicorn app.main:app --reload
```

Backend: `http://127.0.0.1:8000`

Health: `http://127.0.0.1:8000/health` (debe devolver `status: ok`).

Para comprobar deliberadamente Admin deshabilitado, elimine `TACKBAR_ADMIN_KEY` y reinicie el backend:

```powershell
Remove-Item Env:TACKBAR_ADMIN_KEY -ErrorAction SilentlyContinue
```

## 4. Backend con datos privados

```powershell
cd C:\maxsail-project\tackbar\backend
$env:TACKBAR_DATA_DIR = "C:\private\tackbar-data"
$env:TACKBAR_ADMIN_KEY = "change-me-local-only"
python -m uvicorn app.main:app --reload
```

Compruebe la selección con `$env:TACKBAR_DATA_DIR`. La carpeta elegida contiene datos privados del piloto, debe estar fuera de `C:\maxsail-project\tackbar` y nunca debe añadirse a Git.

## 5. Frontend

En una segunda terminal:

```powershell
cd C:\maxsail-project\tackbar\frontend
```

Si Node.js no está en `PATH`, configure la instalación local actual:

```powershell
$nodeDir = "C:\Users\mmannise\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.19.0-win-x64"
$env:Path = "$nodeDir;$env:Path"
```

```powershell
node --version
npm.cmd --version
npm.cmd run dev
```

Vite sirve normalmente en `http://localhost:5173` y envía `/api` mediante proxy a `http://127.0.0.1:8000`.

Entradas actuales:

```text
Admin:          http://localhost:5173/admin
Shared Viewer:  http://localhost:5173/s/<capability-token>
```

No existe un índice público de Sessions. Las rutas desconocidas muestran “Shared link required”.

## 6. Operación Admin

1. Abra `http://localhost:5173/admin`.
2. Introduzca el valor configurado como `TACKBAR_ADMIN_KEY`.
3. Utilice las pestañas **Sailors** y **Sessions**.

### Sailors y consentimiento

La lista distingue:

- **Pending · request needed**;
- **Pending · awaiting response**;
- **Active**;
- **Revoked**.

Las acciones semánticas disponibles son **Mark request sent**, **Confirm consent**, **Record decline** y **Record withdrawal**. Admin no edita directamente `consent_status`, timestamps, source o versión del acuerdo. Al confirmar, el backend registra automáticamente la versión vigente. El detalle muestra el historial estructurado con evento, fecha, origen y versión cuando existe.

El consentimiento gobierna la visibilidad compartida, no la ingestión técnica ni el Session matching. Una Activity puede ingerirse y pertenecer internamente a una Session aunque su Sailor no esté ACTIVE; sólo las Activities de Sailors ACTIVE se comparten.

### Sessions

Admin muestra el ID interno, `created_at`, `expires_at`, **Internal tracks**, **Shareable now** y el estado de capability.

- **Internal tracks**: membresía técnica completa de la Session.
- **Shareable now**: Activities cuyo Sailor está actualmente ACTIVE.

Los valores no tienen por qué coincidir.

## 7. Capability y acceso compartido

El `session_id` es interno y no autoriza acceso público. La autorización compartida usa:

```text
/s/<capability_token>
```

Poseer una capability válida basta para abrir la Session en v0.5, pero el backend expone únicamente Activities de Sailors ACTIVE.

Estados:

- **Active**: link utilizable; Admin ofrece Copy/Open.
- **Expired**: alcanzó `expires_at`; no da acceso.
- **Revoked**: deshabilitado explícitamente.
- **Never generated**: no existe token.

**Regenerate capability** crea un token/link nuevo y el anterior deja de funcionar. **Revoke capability** deshabilita el acceso sin borrar Session ni Activities. Admin usa el `capability_path` del backend, nunca el Session ID.

### Renovación

Admin renueva por 30 días de forma predeterminada o por un valor entre 1 y 365:

```text
expires_at = hora UTC actual + X días
```

No suma días a la expiración anterior. `created_at`, membresía y token permanecen sin cambios; tampoco elimina una revocación ni rota automáticamente el token.

Una Session expirada con token no revocado puede volver a funcionar con el mismo link tras renovarse si tiene contenido compartible. Una capability explícitamente revocada permanece revocada.

## 8. Shared Session Viewer

Flujo actual:

```text
Admin obtiene/copia una capability activa
→ abre o comparte /s/<token>
→ Session Viewer
```

No hay “Recent Sessions” público. Compruebe Primary Activity, Compare Activity opcional, uno/dos tracks, telemetría GPS/SOG/COG/HEEL, Analysis Window, Replay x1/x2/x5/x10, gráficos SOG/COG/HEEL/TRIM y Summary Metrics.

## 9. Gmail e ingestión

La UI Admin todavía **no** incluye Review mailbox now, historial/errores de ingestión ni reprocess. Esas funciones corresponden a incrementos posteriores de v0.5.

El script existente sigue disponible como fallback operativo/diagnóstico y exige almacenamiento privado fuera del repositorio:

```powershell
cd C:\maxsail-project\tackbar\backend
$env:TACKBAR_DATA_DIR = "C:\private\tackbar-data"
python scripts/check_gmail.py
```

No es todavía el flujo final de Admin. Para reconstruir el índice de tracks existente:

```powershell
python scripts/build_tracks_index.py
```

## 10. Tests

```powershell
cd C:\maxsail-project\tackbar\backend
python -m pytest tests
```

```powershell
cd C:\maxsail-project\tackbar\frontend
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
```

Los conteos exactos evolucionan; todas las comprobaciones deben terminar correctamente.

## 11. Smoke test manual v0.5

- **Backend:** `/health` devuelve `status: ok`.
- **Admin auth:** clave incorrecta rechazada; correcta aceptada; refresh exige reentrada.
- **Sailors:** cuatro grupos, detalle/historial y refetch tras acción semántica.
- **Sessions:** Internal tracks, Shareable now, expiración y capability state visibles; cero compartibles sigue siendo inspeccionable.
- **Capability:** Copy/Open activo; Regenerate invalida el link anterior y habilita el nuevo; Revoke invalida el link sin borrar datos.
- **Renewal:** renovar 30 días produce expiración aproximadamente 30 días desde ahora; el token activo no rota y una capability revocada sigue revocada.
- **Viewer:** `/s/<token-válido>` carga mapa, selección, Analysis Window, replay, charts y Summary; sólo expone Activities ACTIVE.
- **Seguridad:** la clave no aparece en Local/Session Storage; requests Admin incluyen `X-TackBar-Admin-Key`; requests shared no lo incluyen.

## 12. Parar TackBar

Pulse `Ctrl + C` en las terminales de backend y frontend.

## 13. Privacidad

```text
Repositorio público
├── código, documentación y tests
└── backend/test-data (fake/sanitizado)

C:\private\tackbar-data
├── Sailors/consentimiento, Activities y Sessions reales
├── originales
└── tracks
```

> Los datos reales de Sailors, Boats, correo y navegación, y los secretos Admin, nunca se almacenan en el repositorio público.

## 14. Chuleta de 30 segundos

Terminal 1:

```powershell
cd C:\maxsail-project\tackbar\backend
Remove-Item Env:TACKBAR_DATA_DIR -ErrorAction SilentlyContinue
$env:TACKBAR_ADMIN_KEY = "change-me-local-only"
python -m uvicorn app.main:app --reload
```

Terminal 2:

```powershell
cd C:\maxsail-project\tackbar\frontend
npm.cmd run dev
```

Navegador: `http://localhost:5173/admin`. Desde Admin copie o abra `/s/<token>` para validar el Viewer compartido.
