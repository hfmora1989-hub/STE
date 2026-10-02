# Actualización de STE 2.0: usuarios y base compartida cifrada

**Estado al 2 de octubre de 2026:** código y copia cifrada preparados localmente; nada desplegado y cuentas aún no creadas en Firebase. Estos pasos escriben en la nube cuando el administrador los ejecuta. Sustituyen la guía anterior `ACTUALIZACION.md`. No publique desde el repositorio original de `04. STE`: volvería a incluir la base en el HTML.

## 1. Preparar el equipo y el proyecto

Use Node.js 22, Firebase CLI y Google Cloud CLI (`gcloud`) con una cuenta administradora de `ste2026-app`. Functions, Storage y Secret Manager requieren facturación habilitada: revise presupuesto y alertas. La región prevista es `us-central1`.

```powershell
Set-Location -LiteralPath 'C:\Users\HEC\OneDrive\Documentos\ChatGPT\Desarrollo\ste2026-actualizacion-local'
npm.cmd ci --ignore-scripts
npm.cmd --prefix functions ci --ignore-scripts
npm.cmd run check
firebase login
gcloud auth login
gcloud auth application-default login
gcloud auth application-default set-quota-project ste2026-app
```

Los comandos siguientes especifican el proyecto. Compruebe que las cuentas tienen acceso al mismo. No necesita descargar una clave JSON permanente de cuenta de servicio.

## 2. Crear identidad de servicio y almacenamiento privado

Se usa un bucket dedicado, separado de otros archivos. Si un recurso ya existe, revise su propietario y configuración antes de continuar; no lo borre ni reasigne automáticamente.

```powershell
gcloud services enable cloudfunctions.googleapis.com run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com identitytoolkit.googleapis.com storage.googleapis.com --project=ste2026-app
gcloud iam service-accounts create ste-api --display-name='STE API privada' --project=ste2026-app
gcloud storage buckets create gs://ste2026-app-ste-private --location=us-central1 --uniform-bucket-level-access --public-access-prevention --project=ste2026-app
gcloud storage buckets add-iam-policy-binding gs://ste2026-app-ste-private --member='serviceAccount:ste-api@ste2026-app.iam.gserviceaccount.com' --role=roles/storage.objectAdmin
gcloud iam roles create steApiIdentity --title='STE consulta y actualiza identidades' --permissions=firebaseauth.users.get,firebaseauth.users.update --stage=GA --project=ste2026-app
gcloud projects add-iam-policy-binding ste2026-app --member='serviceAccount:ste-api@ste2026-app.iam.gserviceaccount.com' --role=projects/ste2026-app/roles/steApiIdentity
```

En Firebase Console → Storage, agregue/importe `ste2026-app-ste-private` al proyecto. Permita al agente de Firebase Storage el acceso requerido por la importación; conserve IAM uniforme y prevención de acceso público. No conceda permisos a `allUsers` ni `allAuthenticatedUsers`. La cuenta de despliegue debe poder actuar como `ste-api`; las cuatro cuentas de la aplicación no necesitan ese permiso ni IAM en Google Cloud.

El destino `ste-private` ya está asociado al bucket en `sitio_firebase/.firebaserc`. Si el nombre no está disponible, cambie consistentemente ese destino, el parámetro de bucket y `scripts/Instalar-Migracion.ps1` antes de ejecutar.

## 3. Instalar la base existente, ya cifrada

En `.private/migration` se prepararon `dataset.enc`, `manifest.json`, `key.dpapi` y `audit.dpapi`. La copia preserva 78.461 liquidaciones, 21.281 visitas y 78.451 pagos; se comprobó el descifrado idéntico al original. Las claves están protegidas con Windows DPAPI, vinculadas al usuario Windows que hizo la preparación.

Ejecute este paso **en este mismo equipo y perfil Windows**. El script crea los dos secretos y sube exclusivamente la base cifrada a `private/dataset.enc`. No sobrescribe secretos diferentes ni otra base. Si se interrumpe, puede repetirlo: compara valores coincidentes en memoria, sin imprimirlos.

```powershell
.\scripts\Instalar-Migracion.ps1 -Apply
gcloud secrets add-iam-policy-binding STE_DATA_KEYS --member='serviceAccount:ste-api@ste2026-app.iam.gserviceaccount.com' --role=roles/secretmanager.secretAccessor --project=ste2026-app
gcloud secrets add-iam-policy-binding STE_AUDIT_KEY --member='serviceAccount:ste-api@ste2026-app.iam.gserviceaccount.com' --role=roles/secretmanager.secretAccessor --project=ste2026-app
Copy-Item -LiteralPath functions\.env.example -Destination functions\.env.ste2026-app
```

El archivo `.env.ste2026-app` contiene solo `STE_PRIVATE_BUCKET=ste2026-app-ste-private`. No coloque contraseñas ni claves allí. Después de la instalación, respalde las claves en un mecanismo administrativo seguro y documente su custodia. No destruya el perfil Windows antes de completar esa operación.

El ZIP de código excluye `.private`. Para migrar desde otro equipo, instale primero desde este equipo o planifique una transferencia segura de claves; copiar los archivos DPAPI a otro usuario no permite descifrarlos. No regenere una clave `v1` para la base existente.

Si necesita repetir la preparación a partir del original, `scripts/Cifrar-Base-Existente.ps1 -SourceHtml <ruta>` cifra solo en memoria y se niega a reemplazar una carpeta de migración existente. No contiene la base original dentro del código.

## 4. Habilitar Authentication y crear usuarios

En Firebase Console → Authentication habilite **Correo electrónico/contraseña**, protección contra enumeración de correos y los dominios autorizados `ste2026-app.web.app` y `ste2026-app.firebaseapp.com`. No habilite acceso anónimo.

```powershell
.\scripts\Crear-Usuarios.ps1
```

Ingrese la contraseña inicial indicada por el solicitante, incluido el espacio entre ambas palabras. El script la lee oculta y no la guarda en código, archivos ni historial de comandos. Se crean estas cuatro cuentas:

| Correo | Consulta | Carga/reemplazo |
|---|---|---|
| lknope@scain.co | Toda la base | Sí |
| jcaina@scain.co | Toda la base | Sí |
| aramos@scain.co | Toda la base | Sí |
| hmora@scain.co | Toda la base | Sí |

Si una cuenta ya está provisionada, conserva su contraseña. Si existe sin `steAccess`, el script se detiene para revisión administrativa: no la reasigna. Si la ejecución queda interrumpida entre creación y claims, esa cuenta queda sin acceso; revísela manualmente. Registrarse mediante el SDK público no concede acceso a la API.

Después de crear las cuentas, configure en Firebase la política de contraseñas obligatoria: mínimo 12 caracteres, mayúscula, minúscula, número y símbolo. También debe aplicarse a futuros cambios y recuperaciones fuera de esta interfaz. Verifique el primer ingreso antes de dar por terminada la actualización.

Cada usuario debe entrar, solicitar/abrir la verificación de correo y cambiar la contraseña inicial por una personal. Hasta completar ambos pasos, consultas, tablero y cargas devuelven 403. No marque manualmente `emailVerified` ni quite el requisito de cambio. Los correos de verificación/recuperación se envían cuando la persona los solicita en la interfaz; no se enviaron durante la preparación local.

## 5. Desplegar

```powershell
npm.cmd run check
Push-Location sitio_firebase
try {
    firebase deploy --only 'storage:ste-private' --project ste2026-app
    if ($LASTEXITCODE -ne 0) { throw 'Fallaron las reglas; no continúe.' }
    firebase deploy --only 'functions:ste-secure' --project ste2026-app
    if ($LASTEXITCODE -ne 0) { throw 'Falló la API; no continúe.' }
    firebase deploy --only hosting --project ste2026-app
    if ($LASTEXITCODE -ne 0) { throw 'Falló Hosting.' }
} finally { Pop-Location }
```

La función HTTP admite invocación de plataforma para que el navegador la alcance. Sus rutas privadas exigen un ID token válido y no revocado, correo autorizado y verificado, y cambio inicial completado. No confunda invocación HTTP pública con acceso público a datos.

**Mientras no publique, el sitio antiguo sigue expuesto.** Si la preparación tarda, el administrador puede poner Hosting en mantenimiento para cortar la exposición. Revise además canales de preview, dominios alternos y versiones antiguas con datos. Reemplazar una publicación no borra copias descargadas ni cierra páginas antiguas abiertas.

## 6. Validar producción antes de habilitar el trabajo diario

1. En incógnito solo debe aparecer el acceso. Los recursos públicos no deben contener registros ni claves.
2. POST sin token a las cuatro rutas de datos debe devolver 401; cuentas ajenas, 403. GET no entrega la base.
3. Pruebe los cuatro primeros ingresos y un token revocado/usuario deshabilitado.
4. Compruebe cifras de migración y un expediente autorizado. La respuesta debe contener únicamente ese documento. No hay endpoint de listado general, exportación o descarga completa.
5. Confirme que Cloud Storage y Firebase Storage deniegan lectura directa anónima y de usuarios de la aplicación. Revise IAM del bucket y permisos heredados; las reglas no limitan a administradores IAM.
6. Compruebe HTTPS, respuestas `private, no-store`, objeto AES-GCM y acceso a secretos solo para el servicio y administradores necesarios. No cree enlaces firmados ni tokens de descarga.
7. Revise eventos `ste_audit`: acciones e identificadores HMAC sin cuerpos ni documentos. Configure alertas de denegaciones/uso anómalo y, según la política del proyecto, Data Access Audit Logs.

Estos controles de producción están pendientes: la preparación local no los sustituye ni certifica IAM/Auth reales.

## Operación y recuperación

- Límites por cuenta: 30 peticiones/minuto, 300 consultas individuales/día, 30 cargas/día, con días UTC. Incluyen consultas sin resultados. Son persistentes entre instancias; ajuste según necesidad real. No impiden extracción lenta ni copia de información que una persona está autorizada a ver.
- Para revocar una cuenta: deshabilítela en Authentication, revoque refresh tokens, retírela de `functions/access.json` y redespliegue Functions. Cerrar la interfaz no revoca por sí mismo un token robado.
- La interfaz cierra sesión tras 15 minutos de inactividad o 60 minutos; la sesión existe en memoria y recargar requiere ingresar otra vez. El servidor valida tokens en cada petición; no se presenta el temporizador cliente como una garantía de caducidad del token.
- Las cargas son atómicas. Conflictos de versión devuelven 409 y requieren repetir. Visitas/pagos sustituyen su consolidado; liquidaciones conservan lotes no reemplazados. No hay borrado masivo en la interfaz.
- Configure recuperación de objetos/soft delete y retención conforme a la política del responsable; no aplique una retención que impida actualizar el objeto activo. Los respaldos siguen cifrados y requieren sus claves.
- Rotación: añada una clave nueva al keyring manteniendo anteriores, cambie `active`, actualice `STE_DATA_KEYS` y redespliegue Functions. Pause cargas mientras ejecuta `scripts/rotate-data.cjs --apply ste2026-app` con el keyring solo en memoria. Verifique antes de retirar claves antiguas; pueden ser necesarias para respaldos. No use `secrets:prune` sin revisar recuperación. Rotar `STE_AUDIT_KEY` reinicia los identificadores usados para cuotas.
- Ante fallo, mantenga el sitio en mantenimiento o restaure una versión segura. Nunca restaure el HTML anterior con beneficiarios.
- Esta operación no cifra ni elimina los Excel/HTML originales, cachés de otros equipos o copias de terceros. Gestione esas copias con el responsable de datos.

Referencias: [ID tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens), [secretos en Functions](https://firebase.google.com/docs/functions/config-env), [destinos Firebase](https://firebase.google.com/docs/cli/targets), [prevención de acceso público](https://docs.cloud.google.com/storage/docs/public-access-prevention).
