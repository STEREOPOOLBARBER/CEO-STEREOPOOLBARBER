-- Citas «de antes» con distrito y foto de referencia, para probar la limpieza única (migración v12).
DELETE FROM _migraciones WHERE v = 12;
UPDATE kv SET v = json_set(v, '$[0].pin', '5821') WHERE k = 'equipo';
INSERT INTO citas(id, codigo, fecha, hora, barbero_id, estado, expira, creada, upd, data) VALUES
 ('vieja1', 'VIEJA1', '2026-01-10', '10:00', 'b1', 'atendida', NULL, 1, 1, '{"servicioId":"s1","servicioNombre":"Corte","precio":25,"cliente":{"nombre":"Ana Antigua","tel":"955300001","ciudad":"Puente Piedra"},"refFoto":"f_vieja_ref","fotoAntes":"f_vieja_antes"}'),
 ('vieja2', 'VIEJA2', '2026-01-11', '11:00', 'b2', 'confirmada', NULL, 1, 1, '{"servicioId":"s1","servicioNombre":"Corte","precio":25,"cliente":{"nombre":"Beto Antiguo","tel":"955300002","ciudad":"Comas"}}');
INSERT OR REPLACE INTO clientes(tel, nombre, ciudad) VALUES ('955300001', 'Ana Antigua', 'Puente Piedra');
