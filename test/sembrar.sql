-- Datos de prueba para test/api.e2e.mjs (solo base local de wrangler dev).
UPDATE kv SET v = json_set(v, '$.adminPin', '5821', '$.yapeNum', '987654321', '$.modAdelanto', json('true'), '$.adelanto', 10) WHERE k = 'cfg';
UPDATE kv SET v = json_set(v, '$[0].pin', '4826', '$[0].email', 'jhon@example.com') WHERE k = 'barberos';
UPDATE kv SET v = json_set(v, '$[0].nombre', 'Fade', '$[0].precio', 30) WHERE k = 'servicios';
