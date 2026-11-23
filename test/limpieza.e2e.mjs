// Limpieza única (migración v12): las citas de antes pierden distrito y foto de referencia; lo demás queda igual.
const B = process.env.BASE || 'http://127.0.0.1:8787';
let ok = 0, bad = 0; const check = (n, c, x = '') => { c ? ok++ : bad++; console.log(`${c ? '✅' : '❌'} ${n} ${c ? '' : x}`) };
const r0 = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: B }, body: JSON.stringify({ pin: '5821' }) });
const adm = (r0.headers.get('set-cookie') || '').split(';')[0];
const get = async p => (await fetch(B + '/api' + p, { headers: { Cookie: adm } })).json();
const v1 = (await get('/citas/buscar?q=VIEJA1')).items?.[0], v2 = (await get('/citas/buscar?q=VIEJA2')).items?.[0];
check('la cita vieja ya no tiene distrito ni foto de referencia', v1 && !v1.refFoto && !('ciudad' in (v1.cliente || {})) && !('ciudad' in (v2?.cliente || {})), JSON.stringify(v1));
check('…y conserva lo demás (nombre, servicio, foto de antes)', v1?.cliente?.nombre === 'Ana Antigua' && v1.servicioNombre === 'Corte' && v1.fotoAntes === 'f_vieja_antes', JSON.stringify(v1));
const ficha = await get('/clientes/955300001/datos');
check('la ficha del cliente ya no guarda distrito', !ficha?.cliente?.ciudad && !JSON.stringify(ficha).includes('Puente Piedra'), JSON.stringify(ficha).slice(0, 300));
check('la limpieza (v12) quedó registrada', (await get('/diagnostico')).db?.migraciones?.includes(12));
console.log(`\n${ok} OK · ${bad} fallos`); process.exit(bad ? 1 : 0);
