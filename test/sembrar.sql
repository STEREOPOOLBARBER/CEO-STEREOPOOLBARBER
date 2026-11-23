-- Datos de prueba para test/api.e2e.mjs (solo base local de wrangler dev).
-- Equipo: [0] = Dueño (PIN 5821 de pruebas), [1] = Jhon (b1, PIN 4826).
UPDATE kv SET v = json_set(v, '$.yapeNum', '987654321', '$.modAdelanto', json('true'), '$.adelanto', 10) WHERE k = 'cfg';
UPDATE kv SET v = json_set(v, '$[0].pin', '5821', '$[1].pin', '4826', '$[1].email', 'jhon@example.com') WHERE k = 'equipo';
UPDATE kv SET v = json_set(v, '$[0].nombre', 'Fade', '$[0].precio', 30) WHERE k = 'servicios';
