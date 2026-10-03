# Pestaña «Visitas IED»

Agrega la categoría de carga **Visitas a IED** (casilla 4 de «Datos cargados / actualizar») y la pestaña **Visitas IED**.

## Archivo de entrada

`Visitas_IED_2026.xlsx` u otro con la misma estructura. El cargador busca entre las hojas:

- **PROGRAMACION** (obligatoria): NOMBRE IED, CODIGO DANE, #VISITA / #STICKER, FECHA_PROGRAMADA, ESTADO, LOCALIDAD, además de semana, mes, equipo e integrantes.
- **MATRIZ** (opcional): resultado de cada visita y aspectos validados. Se une con la programación por el número de sticker.

Un archivo nuevo reemplaza el anterior sin tocar liquidaciones, visitas domiciliarias ni pagos. Se rechaza si hay stickers repetidos, filas sin sticker, columnas faltantes o fechas imposibles.

## Pestaña

Indicadores (programadas, efectivas, pendientes, reprogramadas, no efectivas, colegios, beneficiarios base), gráficos por localidad, mes, integrante y semana (clic para filtrar), mapa de colegios, tabla de aspectos validados, listado con detalle y descarga CSV filtrada. El «% efectivas» se calcula sobre visitas ya realizadas (excluye las pendientes).

## Archivos

- `src/extract.js`: lectura de PROGRAMACION y MATRIZ.
- `src/core.js`: validación de la carga.
- `src/ied.js` (nuevo): interfaz de la pestaña.
- `src/app.js`, `src/secure.js`, `src/template.html`, `src/styles.css`: pestaña, casilla de carga, selección de hoja y conexión con la API.
- `functions/data.cjs`, `functions/handler.cjs` y su copia en `sitio_firebase/functions`: almacenamiento cifrado y nueva acción privada `ied`.
- `scripts/build.cjs`, `scripts/verify.cjs`: incluyen `ied.js` y el logo `src/consorcio.png`.
- `test/ied.test.cjs` (nuevo): pruebas.

## Correcciones incluidas

El commit anterior editó a mano `sitio_firebase/public` (logo en la pantalla de acceso y mapa en la consulta) sin pasar esos cambios a `src`, por lo que `verify.cjs` fallaba antes de publicar. Ambos cambios quedaron en `src` y la salida se regeneró. Se retiraron los archivos sobrantes `app.72539206b11d2911.js` y `styles.db58dd790fea320a.css`.

## Publicación

Requiere desplegar **Functions y Hosting**: la API tiene la acción nueva `ied`. Siga la sección 5 de `ACTUALIZACION-SEGURA.md`.
