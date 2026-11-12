from pathlib import Path
import zipfile,json
base=Path(r'C:/Users/SAMANDAR/Desktop/zavodlar-app/backend')
output=Path(r'C:/Users/SAMANDAR/Desktop/zavodlar-app/tmp/deploy-backend/backend-ahost.zip')
files=[base/name for name in ['passenger.cjs','server.js','package.json','package-lock.json']]
files+=sorted((base/'src').rglob('*.js'))
files+=sorted((base/'sql').glob('*.sql'))
files+=sorted((base/'scripts').glob('*.js'))
assert all(p.is_file() for p in files)
assert not any(p.name.startswith('.env') or 'node_modules' in p.parts or 'backup' in p.name for p in files)
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as z:
 for p in files:z.write(p,p.relative_to(base).as_posix())
with zipfile.ZipFile(output) as z:
 assert z.testzip() is None
 assert all(name in z.namelist() for name in ['passenger.cjs','server.js','package.json','src/app.js','sql/012_personnel_signed_pdf.sql'])
 assert not any(name.startswith('/') or '..' in Path(name).parts for name in z.namelist())
 assert not any('.env' in name or 'node_modules' in name for name in z.namelist())
 print(json.dumps({'files':len(z.namelist()),'size':output.stat().st_size,'valid':True}))
