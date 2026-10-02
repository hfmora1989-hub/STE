# Evidencia de validación — STE 2.0

Preparación local del 2 de octubre de 2026. No se crearon usuarios reales ni se publicaron cambios. Se conservaron los documentos anteriores como historial.

## Comprobaciones automatizadas

- `npm run check`: build, 33 pruebas Node y verificación de archivos/hashes públicos.
- `test/security.test.cjs`: cifrado y tamper, clave equivocada/rotación, anónimos, tokens inválidos/revocados, allowlist/claims, proveedor incorrecto, verificación/cambio inicial, política de contraseña, consulta exacta, ausencia de exportación, minimización de tablero, cuotas entre instancias, CAS, fallo cerrado, orígenes/métodos/tipos/tamaños y logs sin PII.
- `test/regression.test.cjs`: mediana, calendario/rangos, selección por fecha, sustitución parcial por lote, Excel inválido sin reemplazo, límites, importación secuencial, empaquetado y guardián de publicación.
- `npm audit` en raíz y `npm audit --omit=dev` en `functions`: cero vulnerabilidades conocidas después de fijar gRPC/uuid. Es un resultado del escáner, no prueba de ausencia total de vulnerabilidades.
- Carga del módulo real `functions/index.cjs` con Admin/Functions instalados: sin errores de carga. Runtime desplegable Node 22; pruebas locales Node 24.18.0. La validación de Firebase real queda pendiente.

## Prueba de navegador aislada

`scripts/test-browser.cjs` usa Chrome headless, Playwright, la interfaz construida y el handler real de la API con adaptadores de Auth/Storage simulados. Inicia su propio servidor en loopback y bloquea todas las solicitudes externas.

Se verificaron: acceso cerrado, obligación de verificación, cambio inicial, ingreso, carga Excel ficticia, almacenamiento cifrado, cuatro visitas compartidas, mediana 4 km, consulta individual, limpieza al salir, lectura de la misma base desde otra página y pérdida de sesión al recargar. Sin errores JavaScript ni solicitudes externas. No sustituye la prueba del proveedor Firebase real ni la validación IAM.

Capturas: [acceso-seguro.png](test-output/acceso-seguro.png), [tablero-seguro.png](test-output/tablero-seguro.png). Contienen datos ficticios.

## Migración real local

La base se leyó del HTML original en memoria, sin crear una copia en texto plano. Se cifró con AES-256-GCM y se verificó igualdad exacta al descifrar. Los scripts no imprimieron registros, identificadores ni claves.

| Métrica | Resultado |
|---|---:|
| Liquidaciones | 78.461 |
| Visitas | 21.281 |
| Pagos | 78.451 |
| Tamaño cifrado | 8.205.193 bytes |

SHA-256 del origen: `ff7ee65101eaa9d7245e99331cf09b1058ae593d896acd01023cf6805f2d53ff`.

SHA-256 del cifrado: `8b4b2e4fc13ad2d1cbfd131a5e01425b4fc9c1302aeb58ef2d184117819c1080`.

Se verificó además el tablero y una consulta individual de la base migrada sin emitir PII. Resultado agregado en `test-output/migration-validation.json`; duración local observada 724 ms para descifrado y comprobaciones, sin ser una prueba de capacidad en nube.

El cifrado y las claves DPAPI quedan en `.private/migration`, fuera de Hosting, ZIP y Git. Los originales permanecen intactos.

## Pendiente en producción

Configuración y entrega real de correos de Authentication, política de contraseña, creación de cuentas, facturación, IAM, secretos, bucket/reglas, cuotas efectivas distribuidas en Google Cloud, revocación real, despliegue y retirada de publicaciones anteriores. Siga la sección de validación posterior en [ACTUALIZACION-SEGURA.md](ACTUALIZACION-SEGURA.md).
