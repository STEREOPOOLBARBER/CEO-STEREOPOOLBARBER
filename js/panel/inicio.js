/* ---------- inicio ---------- */
(async function(){
 iniciarApp();
 if(!API.remote)seed();else $('#pinBox').style.display='none';
 const _q=new URLSearchParams(location.search),_hc=API.remote&&(_q.get('activar')||_q.get('huella'));if(_hc)return activarCelular(_hc.slice(0,40)); // QR «Activar su celular» (y links viejos ?huella=)
 let pc={};if(API.remote){try{pc=(await API.req('GET','/publico')).cfg||{}}catch(e){}}else pc=lsGet('cfg',{});
 const cfg=mergeCfg(pc);applyTheme(cfg);$('#lgNombre').textContent=cfg.nombre;logoHTML($('#lgLogo'),cfg);
 $('#lgHint').innerHTML=API.remote?'':'Modo local · PIN admin: <b>1234</b><br>Barberos de ejemplo: 1111, 2222, 3333…<br>Cámbialos en ⚙️ Config.';
 if(S.ses){$('#login').style.display='none';await boot()}else if(API.remote)initLoginNube();else setTimeout(()=>$('#pin').focus(),200);
})();
