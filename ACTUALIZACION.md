# Actualizar STE en Firebase Hosting

Versión preparada: 1.1.0 · Proyecto: `ste2026-app` · Sitio: https://ste2026-app.web.app/

**Estado de entrega: cambios locales; no se ha ejecutado ningún despliegue.**

La carpeta corregida es:

```text
C:\Users\HEC\OneDrive\Documentos\ChatGPT\Desarrollo\ste2026-actualizacion-local
```

El original de `C:\Users\HEC\OneDrive\Escritorio\DESARROLLO\04. STE` se conserva. Use la carpeta nueva para actualizar; publicar nuevamente desde una de las carpetas antiguas volvería a entregar el HTML con datos.

## 1. Qué cambiará para quienes usan la web

La web nueva no incluye registros de beneficiarios. Una sesión nueva mostrará «Sin datos cargados en este navegador». Cada usuario debe tener los archivos Excel autorizados para cargarlos desde su equipo. Los datos de cada navegador son independientes; cargar un Excel no actualiza a los demás usuarios.

Se conserva la compatibilidad con datos locales guardados previamente por la versión web vacía (`web-v1`). Los datos guardados por la versión con base embebida no se migran automáticamente: se deben recargar los Excel originales. La actualización no elimina de forma remota copias que otras personas hayan descargado o guardado antes.

Si se necesita un tablero compartido con cifras precargadas, debe prepararse una fuente de agregados o un servicio privado autorizado. No vuelva a insertar las bases individuales en el HTML.

## 2. Preparar y comprobar la versión local

Abra PowerShell. Estos comandos solo instalan dependencias locales, construyen y prueban; no publican:

```powershell
Set-Location -LiteralPath 'C:\Users\HEC\OneDrive\Documentos\ChatGPT\Desarrollo\ste2026-actualizacion-local'

node --version
if ($LASTEXITCODE -ne 0) { throw 'Instale Node.js LTS antes de continuar.' }

npm.cmd ci --ignore-scripts
if ($LASTEXITCODE -ne 0) { throw 'Falló la instalación. No continúe.' }

npm.cmd run check
if ($LASTEXITCODE -ne 0) { throw 'Falló la comprobación. No publique.' }
```

Se esperan las pruebas aprobadas y el mensaje «Verificación correcta». `npm ci` usa `package-lock.json` y descarga las versiones fijadas. SheetJS se obtiene del CDN oficial; no lo sustituya por `npm install xlsx`, que puede recuperar el paquete antiguo de npm.

Para revisar visualmente:

```powershell
npm.cmd run preview
```

Abra `http://127.0.0.1:5178`. Compruebe inicio vacío, carga de un Excel autorizado, consulta, filtro de localidad y fechas. El diálogo muestra errores de archivos inválidos y avisos de calidad. Para una muestra sin datos reales, ejecute antes `node scripts/test-fixtures.cjs` y use `test-output\VISITAS_FICTICIAS.xlsx`: cuatro visitas y mediana 4 km. Detenga la vista local con Ctrl+C.

No copie Excel, paquetes .b64, informes privados ni el HTML antiguo a `sitio_firebase/public`. El verificador rechazará archivos inesperados o modificados. No desactive ese control para forzar un despliegue.

## 3. Autenticarse y confirmar el proyecto

Los comandos siguientes usan la CLI oficial de Firebase mediante npx. La primera ejecución puede descargar la CLI. El inicio de sesión abre el navegador; use una cuenta que administre el proyecto `ste2026-app`.

```powershell
Set-Location -LiteralPath 'C:\Users\HEC\OneDrive\Documentos\ChatGPT\Desarrollo\ste2026-actualizacion-local\sitio_firebase'

npx.cmd --yes firebase-tools@latest login
if ($LASTEXITCODE -ne 0) { throw 'No se completó el inicio de sesión.' }

npx.cmd --yes firebase-tools@latest projects:list
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron consultar los proyectos.' }
```

Compruebe que aparece `ste2026-app`. `.firebaserc` ya apunta a ese proyecto y el comando de publicación también lo indica explícitamente. Si no aparece, use la cuenta correcta o solicite acceso al administrador; no cree otro proyecto para continuar.

## 4. Publicar cuando decida aplicar el cambio

**Este bloque sí reemplaza la versión pública actual.** Ejecútelo desde `sitio_firebase`, después de revisar la versión local. El predeploy está configurado para comprobar la salida y abortar si falla.

```powershell
Set-Location -LiteralPath 'C:\Users\HEC\OneDrive\Documentos\ChatGPT\Desarrollo\ste2026-actualizacion-local\sitio_firebase'

node ..\scripts\verify.cjs
if ($LASTEXITCODE -ne 0) { throw 'El paquete no pasó la verificación. No publique.' }

npx.cmd --yes firebase-tools@latest deploy --only hosting --project ste2026-app
if ($LASTEXITCODE -ne 0) { throw 'Firebase no confirmó la publicación. Revise el mensaje.' }
```

Espere la confirmación de publicación de Firebase y la URL. Se publica únicamente Hosting; no se crean bases de datos, usuarios ni funciones.

## 5. Verificar la actualización publicada

1. Abra https://ste2026-app.web.app/ en una ventana privada nueva. Debe aparecer sin datos de beneficiarios. Una ventana habitual puede conservar sus cargas locales y no sirve por sí sola para esta comprobación.
2. Abra las tres pestañas y compruebe que no aparece un error de carga.
3. En un perfil de trabajo autorizado, cargue los Excel originales y compruebe un registro conocido. Para esta fotografía de los datos, la mediana de La Candelaria debería ser 6,08 km con 34 visitas, si se usan exactamente los archivos del diagnóstico.
4. Compruebe que Desde posterior a Hasta muestra un error explicativo y que un Excel incompleto no sustituye el archivo anterior.
5. Pruebe «Ver como tabla» y «Descargar CSV». La generación CSV tiene pruebas automáticas, pero la herramienta de navegador de esta sesión no pudo confirmar la descarga final; conviene comprobar ese paso manualmente.

Para verificar también la identidad del HTML servido, desde la raíz de la copia corregida:

```powershell
Set-Location -LiteralPath 'C:\Users\HEC\OneDrive\Documentos\ChatGPT\Desarrollo\ste2026-actualizacion-local'
$steProbeFile = Join-Path $env:TEMP ('ste-verificacion-' + [guid]::NewGuid().ToString() + '.html')
try {
    curl.exe --fail --silent --show-error --compressed 'https://ste2026-app.web.app/' --output $steProbeFile
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo descargar el HTML publicado.' }
    $steLocalHash = (Get-FileHash -LiteralPath '.\sitio_firebase\public\index.html' -Algorithm SHA256).Hash
    $steRemoteHash = (Get-FileHash -LiteralPath $steProbeFile -Algorithm SHA256).Hash
    if ($steLocalHash -ne $steRemoteHash) { throw 'El HTML publicado no coincide con el local. Revise el despliegue antes de darlo por terminado.' }
    'HTML publicado coincide con la versión local verificada.'
} finally {
    if (Test-Path -LiteralPath $steProbeFile) { Remove-Item -LiteralPath $steProbeFile }
}
```

## 6. Versiones anteriores y recuperación

El cambio de la versión activa no borra las copias históricas ni las descargas realizadas previamente. El administrador debe revisar el historial de Hosting, posibles canales de vista previa, repositorios y copias compartidas que contengan datos. Esta revisión administrativa no se ha realizado ni automatizado en la entrega.

No utilice como rollback el HTML anterior con beneficiarios embebidos. Conserve esta carpeta completa como base segura para volver a desplegar o corregir. Si una actualización posterior falla, reconstruya esta versión, ejecute `npm.cmd run check` y publique su salida verificada siguiendo el paso 4.

## 7. Actualizaciones futuras

Edite exclusivamente `src`. Ejecute `npm.cmd run check`, pruebe localmente y publique desde `sitio_firebase`. Distribuya el proyecto completo con `build-manifest.json`, configuración y scripts: copiar solo `public/index.html` ya no basta porque los recursos están separados y versionados por hash.

La CSP permite scripts únicamente del propio sitio; no vuelva a añadir scripts inline. Las bibliotecas y hojas de estilo públicas pueden cachearse por su nombre con hash. El HTML continúa sin caché persistente.

Referencias oficiales: [configuración y cabeceras de Hosting](https://firebase.google.com/docs/hosting/full-config), [versiones y canales](https://firebase.google.com/docs/hosting/manage-hosting-resources), [instalación oficial de SheetJS](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/).
