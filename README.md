# STE — versión 2.0.0: acceso y base compartida cifrada

**La documentación vigente es [ACTUALIZACION-SEGURA.md](ACTUALIZACION-SEGURA.md), [SEGURIDAD.md](SEGURIDAD.md) y [VALIDACION-SEGURA.md](VALIDACION-SEGURA.md).** Se prepararon localmente autenticación por correo, cuatro usuarios autorizados y una copia cifrada de la base existente. No se han creado cuentas en Firebase ni publicado esta versión.

El contenido siguiente se conserva como historial de la versión 1.1.0. Su descripción de carga local, mapas y ausencia de usuarios ya no corresponde a la aplicación actual. No siga sus instrucciones de publicación.

---

# Historial: versión local corregida 1.1.0

Esta carpeta contiene la versión corregida del sitio `ste2026-app`. No se ha publicado ni modificado el proyecto original.

**Para actualizar Firebase, siga [ACTUALIZACION.md](ACTUALIZACION.md).** El proyecto de destino está configurado como `ste2026-app`.

## Comportamiento de esta versión

El sitio abre sin datos de beneficiarios. Cada usuario carga los Excel autorizados mediante «Datos cargados / actualizar»; se procesan y guardan en su navegador. No se distribuye una base común con la página y no se añadió un sistema de usuarios. La dirección web seguirá siendo pública, pero su publicación no contendrá registros individuales.

El mapa solicita imágenes a Mapas Bogotá. Use perfiles de navegador y equipos de confianza. No coloque archivos personales, HTML antiguos con datos ni Excel en `sitio_firebase/public`.

## Desarrollo y comprobación

Requiere Node.js 20 o posterior; probado con Node.js 24.18.0 y npm 11.16.0. Desde esta carpeta:

```powershell
npm.cmd ci --ignore-scripts
npm.cmd run check
npm.cmd run preview
```

La vista local está en `http://127.0.0.1:5178`. Detenga el servidor con Ctrl+C. Use HTTP local o HTTPS; no abra `index.html` mediante doble clic, porque las rutas de recursos parten de la raíz del sitio.

Para pruebas de interfaz con datos ficticios:

```powershell
node scripts/test-fixtures.cjs
```

Los ejemplos se crean en `test-output`, fuera del directorio publicado. El ejemplo de visitas contiene cuatro personas ficticias y distancias 1, 3, 5 y 9 km; la mediana esperada es 4 km. No cargue esos ejemplos en un perfil que esté usando para trabajo real sin separar previamente los datos.

## Estructura

- `src/template.html`: estructura de la interfaz.
- `src/styles.css`: estilos propios.
- `src/app.js`: navegación, presentación, mapas, importación y persistencia local.
- `src/extract.js`: interpretación de las columnas de Excel.
- `src/core.js`: validación, fechas, mediana y sustitución de lotes; compartido con las pruebas.
- `src/sedes.json`: catálogo de coordenadas de sedes educativas.
- `scripts/build.cjs`: construcción portable, sin datos personales ni rutas de otro equipo.
- `scripts/verify.cjs`: control de archivos, hashes, ausencia del paquete de datos y CSP antes de publicar.
- `scripts/preview.cjs`: servidor local limitado a 127.0.0.1, con la CSP de Hosting.
- `test/regression.test.cjs`: pruebas automatizadas con Excel generados en memoria.
- `sitio_firebase/public`: única salida publicable, generada automáticamente.
- `build-manifest.json`: inventario e integridad de la salida.
- `package-lock.json`: versiones e integridades fijadas.
- `licenses`: licencias de las bibliotecas distribuidas.

No edite manualmente los archivos de `public`: modifique `src` y ejecute `npm.cmd run check`. El build no lee libros de beneficiarios. Los módulos duplicados y el constructor Python anterior no forman parte de esta versión.

## Cambios frente al diagnóstico

| Hallazgo | Resultado local |
|---|---|
| D01 | Se eliminó el paquete de beneficiarios del build público; inicio vacío y guardián previo a publicación. La exposición del sitio actual solo cesará al actualizarlo. |
| D02 | SheetJS 0.20.3 oficial, versión fijada y lockfile; Leaflet 1.9.4 fijado. |
| D03 | Sustitución por lote que conserva registros ajenos, incluso al reutilizar un nombre de archivo. |
| D04 | Validación de esquema, documentos, fechas, registros y tamaño antes de sustituir datos. Cargas serializadas. |
| D05 | Mediana correcta para tamaños pares e impares. |
| D06 | Build Node.js portable, sin rutas absolutas ni lectura obligatoria de bases privadas. |
| D07 | Una fuente por componente; no quedan copias de app.js en la plantilla. |
| D08 | Suite automatizada y verificación de la salida antes del despliegue. |
| D09 | Página pequeña; bibliotecas y código separados, con nombres por hash y caché para recursos públicos. |
| D10 | Calendario estricto y mensaje visible para intervalos invertidos. |
| D11 | CSP `script-src 'self'` sin permiso de scripts inline. Los estilos dinámicos siguen permitidos. |
| D12 | Avisos agregados de coordenadas y estados para revisión del archivo original; no se inventan correcciones de datos. |

Además se unificó la selección de última visita por fecha, se normalizan tildes en localidades y se protegen las celdas CSV de fórmulas de texto. Se retiró la consulta por documento en la URL para evitar propagar identificadores en enlaces.

## Límites

La validación de Excel es más estricta: puede pedir corregir columnas faltantes, fechas imposibles, filas con contenido sin documento o formatos distintos. El archivo previo se conserva si la nueva carga falla. Límite de 50 MB por archivo y 200.000 registros; el parseo sigue ejecutándose en el navegador y no se garantiza ausencia de bloqueo con archivos complejos.

No se revisaron ni cambiaron reglas normativas del subsidio, tarifas ni decisiones de pago. Los textos de negocio heredados necesitan validación del responsable del programa. No se alteraron registros originales, historial Git, versiones anteriores de Firebase ni permisos de la cuenta.

Fuentes de dependencia y Hosting: [SheetJS oficial](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/), [configuración de Firebase Hosting](https://firebase.google.com/docs/hosting/full-config).
