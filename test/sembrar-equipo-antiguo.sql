-- Simula una instalación de antes de la migración v7 (test/equipo.e2e.mjs): barberos y usuarios en listas separadas,
-- el dueño con PIN/clave aparte, permisos de barbero en la configuración, claves y huellas con los sujetos antiguos.
DELETE FROM _migraciones WHERE v = 7;
DELETE FROM kv WHERE k = 'equipo';
INSERT OR REPLACE INTO kv(k, v) VALUES('cfg', '{"nombre":"Stereo Barber Pool","adminPin":"5821","permBarbero":{"verTel":false,"dash":true}}');
INSERT OR REPLACE INTO kv(k, v) VALUES('barberos', '[{"id":"b1","nombre":"Jhon","esp":"Fades","foto":"","color":"#ff3fd2","comision":40,"dias":[1,2,3],"activo":true,"email":"jhon@gmail.com","pin":"4826"},{"id":"b2","nombre":"Leandro","esp":"Diseños","foto":"f_leo","color":"#8a3ffc","comision":50,"dias":[1,2,3,4,5,6],"activo":true}]');
INSERT OR REPLACE INTO kv(k, v) VALUES('usuarios', '[{"id":"u1","nombre":"Leandro","rol":"encargado","permisos":{"verTodas":true,"crear":true,"verMontos":true},"barberoId":"b2","email":"leo@gmail.com","activo":true},{"id":"u2","nombre":"Kiara","rol":"recepcion","permisos":{"verTodas":true,"crear":true},"email":"kiara@gmail.com","activo":true,"pin":"7391"}]');
INSERT INTO claves(sujeto, salt, hash, v, upd) VALUES('b_b1', 's', 'h-jhon', 1, 0), ('b_b2', 's', 'h-leandro-barbero', 3, 0), ('u_u1', 's', 'h-leandro-usuario', 1, 0), ('admin', 's', 'h-dueno', 1, 0);
INSERT INTO passkeys(id, sujeto, jwk, alg, cnt, etiqueta, creada) VALUES('pk-leo', 'u_u1', '{}', -7, 0, 'Celular de Leandro', 0);
INSERT INTO sesiones(id, data, exp) VALUES('sesion-antigua', '{"via":"clave","sujeto":"b_b1","cv":1}', 9999999999999);
