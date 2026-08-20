# TackBar — Local Development Guide

Guía rápida para levantar TackBar localmente y seleccionar entre los datos públicos de TEST y los datos privados del piloto.

---

## 1. Estructura de datos

TackBar separa completamente los datos públicos de prueba de los datos reales del piloto.

### TEST — público

Los datos de prueba están dentro del repositorio:

```text
C:\maxsail-project\tackbar\backend\test-data
```

Contienen únicamente:

- participantes ficticios;
- emails `example.com`;
- barcos y números de vela ficticios;
- Activities y Sessions de prueba;
- tracks sanitizados;
- metadatos de ingestión ficticios.

Estos datos pueden estar versionados en GitHub.

### PROD / piloto — privado

Los datos reales están fuera del repositorio:

```text
C:\private\tackbar-data
```

Estructura:

```text
C:\private\tackbar-data\
├── participants.json
├── activities.json
├── sessions.json
├── ingestion_history.json
├── originals\
└── tracks\
```

Estos datos **NUNCA deben añadirse al repositorio Git**.

---

## 2. Selección del dataset

La selección se realiza mediante la variable de entorno:

```text
TACKBAR_DATA_DIR
```

### TEST

Si `TACKBAR_DATA_DIR` **no está definida**, TackBar utiliza:

```text
backend/test-data
```

### Datos privados

Si está definida:

```powershell
$env:TACKBAR_DATA_DIR = "C:\private\tackbar-data"
```

TackBar utiliza ese directorio como raíz de persistencia.

La variable se establece únicamente para la terminal PowerShell actual.

Al cerrar la terminal desaparece.

---

# 3. Levantar el backend con TEST

Abrir una terminal PowerShell en VS Code.

Ir al backend:

```powershell
cd C:\maxsail-project\tackbar\backend
```

Eliminar cualquier configuración privada que pudiera existir en esa terminal:

```powershell
Remove-Item Env:TACKBAR_DATA_DIR -ErrorAction SilentlyContinue
```

Arrancar FastAPI:

```powershell
python -m uvicorn app.main:app --reload
```

Debe aparecer algo parecido a:

```text
Uvicorn running on http://127.0.0.1:8000
Application startup complete.
```

El backend queda disponible en:

```text
http://127.0.0.1:8000
```

Health check:

```text
http://127.0.0.1:8000/health
```

Mantener esta terminal abierta.

---

# 4. Levantar el backend con datos privados

Abrir una terminal PowerShell.

```powershell
cd C:\maxsail-project\tackbar\backend
```

Configurar el directorio privado:

```powershell
$env:TACKBAR_DATA_DIR = "C:\private\tackbar-data"
```

Comprobar la variable:

```powershell
$env:TACKBAR_DATA_DIR
```

Debe devolver:

```text
C:\private\tackbar-data
```

Arrancar FastAPI:

```powershell
python -m uvicorn app.main:app --reload
```

En esta configuración el backend trabaja con los datos reales privados del piloto.

---

# 5. Levantar el frontend

Abrir una **segunda terminal** en VS Code.

Ir al frontend:

```powershell
cd C:\maxsail-project\tackbar\frontend
```

Node.js no siempre está disponible automáticamente en el `PATH`.

Configurar Node para la terminal actual:

```powershell
$nodeDir = "C:\Users\mmannise\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.19.0-win-x64"
$env:Path = "$nodeDir;$env:Path"
```

Opcionalmente comprobar:

```powershell
node --version
npm.cmd --version
```

Arrancar Vite:

```powershell
npm.cmd run dev
```

Debe aparecer algo similar a:

```text
Local: http://localhost:5173/
```

Abrir en el navegador:

```text
http://localhost:5173
```

Mantener esta terminal abierta.

---

# 6. Configuración habitual de desarrollo

Para trabajar normalmente con el dataset público TEST:

## Terminal 1 — Backend

```powershell
cd C:\maxsail-project\tackbar\backend

Remove-Item Env:TACKBAR_DATA_DIR -ErrorAction SilentlyContinue

python -m uvicorn app.main:app --reload
```

## Terminal 2 — Frontend

```powershell
cd C:\maxsail-project\tackbar\frontend

$nodeDir = "C:\Users\mmannise\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.19.0-win-x64"
$env:Path = "$nodeDir;$env:Path"

npm.cmd run dev
```

Navegador:

```text
http://localhost:5173
```

---

# 7. Trabajar con datos privados

Para utilizar los datos reales del piloto solo cambia la configuración del backend.

## Terminal 1 — Backend

```powershell
cd C:\maxsail-project\tackbar\backend

$env:TACKBAR_DATA_DIR = "C:\private\tackbar-data"

python -m uvicorn app.main:app --reload
```

## Terminal 2 — Frontend

Se levanta exactamente igual que con TEST:

```powershell
cd C:\maxsail-project\tackbar\frontend

$nodeDir = "C:\Users\mmannise\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.19.0-win-x64"
$env:Path = "$nodeDir;$env:Path"

npm.cmd run dev
```

---

# 8. Estado actual de la integración frontend/backend

Actualmente el Session Viewer todavía utiliza fixtures públicos de TEST incluidos en el frontend.

Por tanto:

```text
TACKBAR_DATA_DIR
```

controla el almacenamiento utilizado por el backend, pero **todavía no cambia los datos que muestra el Session Viewer**.

La integración prevista será:

```text
Frontend
   ↓
FastAPI read API
   ↓
TACKBAR_DATA_DIR
   ↓
TEST o datos privados
```

La API read-only y la integración frontend/backend corresponden a una etapa posterior.

---

# 9. Ingestión Gmail real

La ingestión de correo real debe utilizar siempre almacenamiento privado.

Configurar:

```powershell
$env:TACKBAR_DATA_DIR = "C:\private\tackbar-data"
```

Ir al backend:

```powershell
cd C:\maxsail-project\tackbar\backend
```

Procesar Gmail:

```powershell
python scripts/check_gmail.py
```

La ingestión Gmail requiere explícitamente `TACKBAR_DATA_DIR` y rechaza rutas situadas dentro del repositorio.

Esto evita que datos reales puedan terminar accidentalmente en:

```text
backend/test-data
```

Si es necesario regenerar el índice de tracks:

```powershell
python scripts/build_tracks_index.py
```

---

# 10. Tests backend

Desde:

```powershell
cd C:\maxsail-project\tackbar\backend
```

Ejecutar:

```powershell
pytest tests
```

Última referencia después de implementar la separación TEST / datos privados:

```text
81 passed
```

---

# 11. Tests frontend

Desde:

```powershell
cd C:\maxsail-project\tackbar\frontend
```

Configurar Node:

```powershell
$nodeDir = "C:\Users\mmannise\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.19.0-win-x64"
$env:Path = "$nodeDir;$env:Path"
```

Ejecutar:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
```

---

# 12. Smoke test manual

Después de levantar TackBar comprobar:

```text
Session Viewer

✓ Primary Activity
✓ Compare Activity
✓ dos tracks en el mapa
✓ Analysis Window
✓ Replay
✓ velocidades x1 / x2 / x5 / x10
✓ gráfico SOG
✓ gráfico COG
✓ Summary Metrics
```

---

# 13. Parar TackBar

En la terminal del backend:

```text
Ctrl + C
```

En la terminal del frontend:

```text
Ctrl + C
```

---

# 14. Regla de privacidad

La separación fundamental de TackBar es:

```text
GitHub público
│
├── código
├── documentación
├── tests
└── backend/test-data
        ↓
     datos fake /
     sanitizados


C:\private\tackbar-data
│
├── participantes reales
├── Activities reales
├── Sessions reales
├── originales
└── tracks
        ↓
     PRIVADO
```

Regla:

> Los datos reales de participantes y navegación nunca se almacenan en el repositorio público.

El repositorio puede contener un dataset TEST completo siempre que sea ficticio, sanitizado e intencionadamente publicable.

---

# 15. Piloto TackBar

El piloto será cerrado y por invitación.

Modelo previsto:

```text
invited
   ↓
aviso de privacidad
   ↓
aceptación explícita
   ↓
active
```

Solo los participantes activos estarán autorizados a generar nuevas Activities mediante ingestión.

La identidad externa inicial del participante seguirá siendo su email normalizado:

```text
strip().lower()
```

El registro/invitación y control de acceso se implementarán en una etapa posterior.

---

# 16. Chuleta de 30 segundos

Si solo quieres volver a levantar TackBar con TEST después de un tiempo:

## Terminal 1

```powershell
cd C:\maxsail-project\tackbar\backend
Remove-Item Env:TACKBAR_DATA_DIR -ErrorAction SilentlyContinue
python -m uvicorn app.main:app --reload
```

## Terminal 2

```powershell
cd C:\maxsail-project\tackbar\frontend

$nodeDir = "C:\Users\mmannise\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.19.0-win-x64"
$env:Path = "$nodeDir;$env:Path"

npm.cmd run dev
```

## Navegador

```text
http://localhost:5173
```

That's it.
