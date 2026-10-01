# Consulta y seguimiento STE

Herramienta del Subsidio de Transporte Escolar (Movi Escolar 25): información general, tablero de visitas y consulta por documento con mapa de la vivienda.

- `src/` fuentes: `template.html`, `extract.js` (lectura de los Excel), `build.js` (paquete de datos para la versión local), `mk.py` (genera la versión local y la web), `sedes.json` (coordenadas de sedes, Mapas Bogotá).
- `sitio_firebase/` sitio listo para `firebase deploy` (sin datos: cada usuario carga sus archivos en su navegador).

Los archivos Excel con datos de beneficiarios no se versionan.
