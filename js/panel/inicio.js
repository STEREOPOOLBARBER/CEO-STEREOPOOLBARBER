/* ---------- inicio ---------- */
(async function(){
 if(!API.remote)seed();else $('#pinBox').style.display='none';
 const _hc=API.remote&&new URLSearchParams(location.search).get('huella');if(_hc)return activarHuella(_hc.slice(0,40));
 let pc={};if(API.remote){try{pc=(await API.req('GET','/publico')).cfg||{}}catch(e){}}else pc=lsGet('cfg',{});
 const cfg=mergeCfg(pc);applyTheme(cfg);$('#lgNombre').textContent=cfg.nombre;logoHTML($('#lgLogo'),cfg);
 $('#lgHint').innerHTML=API.remote?'':'Modo local · PIN admin: <b>1234</b><br>Barberos de ejemplo: 1111, 2222, 3333…<br>Cámbialos en ⚙️ Config.';
 if(S.ses){$('#login').style.display='none';await boot()}else if(API.remote)initLoginNube();else setTimeout(()=>$('#pin').focus(),200);
})();
