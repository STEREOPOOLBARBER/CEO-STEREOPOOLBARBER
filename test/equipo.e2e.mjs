// Migración v7 (worker/datos.js → unirEquipo): una instalación con barberos y usuarios separados pasa a un solo «equipo».
// Datos antiguos: test/sembrar-equipo-antiguo.sql (el Worker se reinicia después de sembrarlos para que corra la migración).
const B = process.env.BASE || 'http://127.0.0.1:8787';
let ok = 0, bad = 0; const check = (n, c, x = '') => { c ? ok++ : bad++; console.log(`${c ? '✅' : '❌'} ${n} ${c ? '' : x}`) };
const call = async (m, p, b, c) => { const r = await fetch(B + '/api' + p, { method: m, headers: { ...(b ? { 'Content-Type': 'application/json' } : {}), ...(c ? { Cookie: c } : {}), Origin: B }, body: b ? JSON.stringify(b) : undefined }); const tx = await r.text(); let j; try { j = JSON.parse(tx) } catch { j = tx } return { s: r.status, j, cookie: (r.headers.get('set-cookie') || '').split(';')[0] } };

const pub = (await call('GET', '/publico')).j;
check('el formulario sigue mostrando a quienes atienden (Jhon y Leandro, no Kiara)', pub.barberos.map(b => b.nombre).join() === 'Jhon,Leandro', JSON.stringify(pub.barberos.map(b => b.nombre)));
check('la configuración ya no tiene PIN de administrador ni permisos de barbero aparte', !('adminPin' in pub.cfg) && !('permBarbero' in pub.cfg));
const adm = (await call('POST', '/auth/login', { pin: '5821' })).cookie;
const pn = (await call('GET', '/panel', null, adm)).j, eq = pn.equipo || [], p = id => eq.find(x => x.id === id);
check('el dueño queda como una persona más del equipo', p('dueno')?.rol === 'dueno' && pn.yo?.rol === 'dueno', JSON.stringify(pn.yo));
check('cada persona aparece una sola vez (Leandro ya no está repetido)', eq.filter(x => x.nombre === 'Leandro').length === 1 && eq.length === 4, eq.map(x => x.nombre).join());
check('Leandro: barbero y usuario ligados se juntan (atiende, rol y permisos del usuario, foto y correo)', p('b2')?.atiende && p('b2').rol === 'encargado' && p('b2').permisos.verMontos && !p('b2').permisos.config && p('b2').foto === 'f_leo' && p('b2').email === 'leo@gmail.com', JSON.stringify(p('b2')));
check('Jhon: los permisos de barbero de la configuración pasan a su persona', p('b1')?.rol === 'barbero' && p('b1').permisos.dash && !p('b1').permisos.verTel && p('b1').permisos.crear && p('b1').comision === 40, JSON.stringify(p('b1')));
check('Kiara (recepción, sin barbero) queda como persona que no atiende', p('u2')?.rol === 'recepcion' && p('u2').atiende === false && p('u2').email === 'kiara@gmail.com');
const acc = (await call('GET', '/acceso', null, adm)).j;
check('las claves pasan a la persona (sin repetir ni sujetos antiguos)', acc.claves.sort().join() === 'p_b1,p_b2,p_dueno', acc.claves.join());
check('la huella del usuario Leandro pasa a la persona Leandro', acc.huellas.length === 1 && acc.huellas[0].sujeto === 'p_b2', JSON.stringify(acc.huellas));
const exp = (await call('GET', '/exportar', null, adm)).j;
check('las listas antiguas (barberos y usuarios) ya no se guardan', Array.isArray(exp.equipo) && !('usuarios' in exp), Object.keys(exp).join());
const k = await call('POST', '/auth/login', { pin: '7391' });
check('Kiara entra con su identidad nueva (recepción, sin agenda propia)', k.s === 200 && k.j.sujeto === 'p_u2' && k.j.rol === 'recepcion' && k.j.barberoId === '', JSON.stringify(k.j));
const pk = (await call('GET', '/panel', null, k.cookie)).j;
check('y con sus permisos (ve todo, sin configuración ni montos)', pk.yo?.perm?.verTodas && !pk.yo.perm.config && !pk.yo.perm.verMontos && pk.equipo.length === 0);
const d = (await call('GET', '/diagnostico', null, adm)).j;
check('la migración v7 quedó registrada', d.db?.migraciones?.includes(7), JSON.stringify(d.db));
console.log(`\n${ok} OK · ${bad} fallos`); process.exit(bad ? 1 : 0);
