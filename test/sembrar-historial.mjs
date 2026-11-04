// Genera ~6300 citas antiguas (2 años, 3 barberos) para las pruebas de paginación. Una se llama «Zacarías Antiguo».
// Uso: node test/sembrar-historial.mjs > archivo.sql
const hoy = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date()) + 'T12:00:00Z');
const horas = ['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'];
const nombres = ['Luis', 'Carlos', 'Pedro', 'Jorge', 'Miguel', 'Andrés', 'Diego', 'Kevin', 'Bruno', 'Iván'], ap = ['Rojas', 'Pérez', 'Díaz', 'Torres', 'Flores', 'Vargas', 'Castro', 'Ramos', 'Silva', 'Mendoza'];
let semilla = 1; const azar = () => (semilla = (semilla * 16807) % 2147483647) / 2147483647;
const rows = []; let n = 0;
for (let d = -700; d < 0; d++) {
  const f = new Date(hoy.getTime() + d * 864e5).toISOString().slice(0, 10);
  for (const b of ['b1', 'b2', 'b3']) {
    const hs = [...horas].sort(() => azar() - .5).slice(0, 3);
    for (const h of hs) {
      n++; const data = { cliente: { nombre: n === 5 ? 'Zacarías Antiguo' : nombres[Math.floor(azar() * 10)] + ' ' + ap[Math.floor(azar() * 10)], tel: '9' + String(n % 400).padStart(8, '0'), dni: String(40000000 + n % 400), ciudad: 'Lima' }, servicioNombre: 'Corte clásico', precio: 30, origen: 'panel' };
      rows.push(`('h${n}','H${String(n).padStart(5, '0')}','${f}','${h}','${b}','atendida',NULL,${1700000000000 + n},NULL,'${JSON.stringify(data).replace(/'/g, "''")}')`);
    }
  }
}
let sql = ''; for (let i = 0; i < rows.length; i += 200) sql += `INSERT INTO citas(id,codigo,fecha,hora,barbero_id,estado,expira,creada,upd,data) VALUES${rows.slice(i, i + 200).join(',')};\n`;
process.stdout.write(sql);
