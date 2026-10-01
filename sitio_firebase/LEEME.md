# Consulta de beneficiarios STE – sitio para Firebase Hosting

Este sitio no incluye ningún dato de beneficiarios. Cada usuario carga los archivos Excel
desde su propio equipo con el botón "Datos cargados / actualizar":

- liquidaciones por ciclo (CICLO1_1B.xlsx, CICLO2.xlsx, CICLO3.xlsx…),
- consolidado de visitas domiciliarias,
- consolidado de pagos.

Los archivos se procesan en el navegador y quedan guardados solo en ese equipo
(IndexedDB). Nada se envía al servidor.

## Publicar

1. Instale Node.js (versión LTS) y luego Firebase CLI:
   `npm install -g firebase-tools`
2. Inicie sesión: `firebase login`
3. En la consola de Firebase cree un proyecto (o use uno existente) y copie su ID.
4. Abra `.firebaserc` y reemplace `ID-DE-SU-PROYECTO-FIREBASE` por el ID del proyecto.
5. Desde esta carpeta ejecute: `firebase deploy --only hosting`
6. La CLI muestra la URL publicada (https://ID.web.app).

Para probar antes de publicar: `firebase emulators:start --only hosting`
(o `firebase serve`) y abra http://localhost:5000.

## Actualizar

Reemplace `public/index.html` por la nueva versión y vuelva a ejecutar
`firebase deploy --only hosting`.

## Seguridad

- El sitio envía cabeceras para que no sea indexado por buscadores (`X-Robots-Tag`,
  `robots.txt`) y una política de contenido que impide enviar datos a otros servidores
  (`connect-src 'self'`).
- La URL es pública: cualquiera que la conozca puede abrir la herramienta, pero solo
  verá los datos que él mismo cargue desde su equipo.
- No suba los Excel a la carpeta `public`: todo lo que esté ahí queda publicado.
