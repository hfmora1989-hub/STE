// Solo datos ficticios para las comprobaciones de interfaz. Nunca se incluyen en public.
const fs=require('node:fs'),path=require('node:path'),XLSX=require('xlsx');
const out=path.resolve(__dirname,'../test-output');fs.mkdirSync(out,{recursive:true});
function write(name,rows){const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'Prueba');XLSX.writeFile(wb,path.join(out,name));}
write('VISITAS_FICTICIAS.xlsx',[
 ['IDENTIFICACIÓN DEL BENEFICIARIO','GEOREFERENCIACIÓN','FECHA VISITA','RECOMENDACIÓN FINAL','NOMBRE DEL BENEFICIARIO','LOCALIDAD RESIDENCIA','LOCALIDAD COLEGIO MATRICULA','RANGO DISTANCIA RESIDENCIA - SEDE COLEGIO (Kilometros)','# VISITA','Tipo de Visita','ESTADO FINAL DE LA(S) VISITA(S) DOMICILIARIA(S)','SEMANA','PERIODO'],
 ...[1,3,5,9].map((distance,i)=>['TEST-'+(i+1),'CUMPLE','26/09/2026','PAGAR','PERSONA FICTICIA '+(i+1),'LA CANDELARIA','LA CANDELARIA',distance,1,'Atendida','EFECTIVA','SEMANA 26','21/09/2026 al 27/09/2026'])
]);
write('PAGOS_INVALIDOS_FICTICIOS.xlsx',[['CICLO EN LIQUIDACION','ESTADO DE PAGO'],['CICLO 1','COBRADO']]);
console.log('Ejemplos ficticios creados en test-output.');
