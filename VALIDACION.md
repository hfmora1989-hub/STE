# Evidencia anterior de la versión 1.1

**La validación vigente está en [VALIDACION-SEGURA.md](VALIDACION-SEGURA.md).** La evidencia siguiente corresponde a la versión anterior sin usuarios ni base compartida.

---

# Validación local — 1 de octubre de 2026

Se trabajó en una copia nueva. El repositorio original y sus archivos publicados permanecen sin cambios. No se ejecutó Firebase deploy, no se alteraron permisos y no se subieron bases de beneficiarios.

## Evidencia

- 15 pruebas automatizadas aprobadas en la comprobación final: cálculos, fechas, extracción, importación real de Excel sintéticos, concurrencia, escape, CSV, calidad y guardián de publicación.
- Sintaxis comprobada al construir todos los scripts que se entregan al navegador.
- SheetJS 0.20.3 descargado de su fuente oficial; Leaflet 1.9.4. Versiones e integridades registradas en `package-lock.json`.
- Navegador local bajo CSP `script-src 'self'`: inicio vacío, carga de cuatro visitas ficticias, persistencia confirmada tras recargar la página, tablero, mediana 4 km y alerta de rango invertido comprobados.
- Dos construcciones consecutivas produjeron el mismo manifiesto: salida determinista. Tamaño total sin compresión: 1.326.306 bytes en nueve archivos; HTML inicial de 30.532 bytes. El sitio anterior entregaba 9.267.273 bytes en un único HTML.
- La corrección también se calculó en memoria sobre las 34 visitas originales de La Candelaria: 6,0805 km. No se copiaron esos registros a esta versión ni a los ejemplos.
- Verificador rechaza archivos inesperados en public y modificaciones del HTML generado.
- Sin errores ni avisos de consola capturados en el arranque y la carga local comprobados.

## Límites y pendientes operativos

- No se ha verificado la publicación corregida en Firebase: continúa pendiente de que el usuario ejecute la guía.
- El evento de descarga CSV no fue capturado por la herramienta de navegador; generación, delimitadores, comillas y neutralización de fórmulas sí se prueban automáticamente. La guía incluye la comprobación manual.
- No se cargaron bases reales completas en el navegador ni se probaron todos los formatos históricos. Las nuevas validaciones pueden pedir correcciones de esquema o fechas antes de aceptar un archivo.
- No se midieron Core Web Vitals ni dispositivos móviles físicos. El peso se redujo eliminando el paquete de datos y separando recursos públicos cacheables.
- Los avisos de calidad no sustituyen la conciliación de los dos registros observados en el diagnóstico. No se inventaron coordenadas, estados ni reglas de negocio.
- Contener versiones históricas o copias ya distribuidas requiere revisión del administrador; no se hicieron borrados administrativos.

La carpeta `test-output` contiene únicamente ejemplos y capturas ficticias locales; no se publica ni forma parte del ZIP de distribución.
# Evidencia anterior de la versión 1.1

**La validación vigente está en [VALIDACION-SEGURA.md](VALIDACION-SEGURA.md).** La evidencia siguiente corresponde a la versión anterior sin usuarios ni base compartida.

---
