# Teste 12: investigar por que o clique nao ativa o topo nessa sessao
. (Join-Path $PSScriptRoot "cdp-lib.ps1")
Iniciar-CDP
try {
    Enviar-CDP "Page.navigate" @{ url = "file:///D:/Marcos/Github/sbc-material-didatico/jogo5.html" } | Out-Null
    Start-Sleep -Seconds 10

    $m = Evalua @"
(async function(){
  for (var i = 0; i < 40 && !(window.Maquete3D && Maquete3D.setVisaoTopo); i++) {
    await new Promise(function(r){ setTimeout(r, 500); });
  }
  var R = {antes: null, depois: null, erro: null};
  R.antes = Maquete3D.topoAtivo();
  try { document.getElementById('btn-decima').click(); } catch (e) { R.erro = '' + e; }
  await new Promise(function(r){ setTimeout(r, 1200); });
  R.depois = Maquete3D.topoAtivo();
  try { Maquete3D.setVisaoTopo(true, true); } catch (e) { R.erroApi = '' + e; }
  var v = Maquete3D.visao();
  R.camApi = v.cam.map(function(n){return Math.round(n*100)/100;});
  return JSON.stringify(R);
})()
"@ -aguardar $true
    Write-Host "INVESTIGA: $($m.value)"
} finally { Parar-CDP }