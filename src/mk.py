import sys
t=open('/home/claude/consulta/template.html').read()
x=open('/home/claude/consulta/node_modules/xlsx/dist/xlsx.full.min.js').read()
e=open('/home/claude/consulta/extract.js').read()
L=open('/home/claude/consulta/node_modules/leaflet/dist/leaflet.js').read().replace('//# sourceMappingURL=leaflet.js.map','')
LC=open('/home/claude/consulta/node_modules/leaflet/dist/leaflet.css').read()
SD=open('/home/claude/consulta/sedes.json').read()
def build(data):
    return t.replace('/*__LEAFLETCSS__*/',LC).replace('/*__LEAFLET__*/',L).replace('/*__SEDES__*/{}',SD).replace('/*__XLSX__*/',x).replace('/*__EXTRACT__*/',e).replace('"__DATA__"','"'+data+'"')
open('/mnt/user-data/outputs/Consulta_Beneficiarios_STE.html','w').write(build(open('/home/claude/consulta/data.b64').read()))
w=build('').replace('<meta name="viewport" content="width=device-width, initial-scale=1">','<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta name="robots" content="noindex, nofollow">',1)
open('/tmp/w/fb/public/index.html','w').write(w)
print('ok')
