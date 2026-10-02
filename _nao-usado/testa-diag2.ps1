# Teste 11b: fluxo cheia -> topo com a janela em primeiro plano
. (Join-Path $PSScriptRoot "cdp-lib.ps1")
Iniciar-CDP
try {
    Enviar-CDP "Page.navigate" @{ url = "file:///D:/Marcos/Github/sbc-material-didatico/jogo5.html" } | Out-Null
    Start-Sleep -Seconds 7
    Enviar-CDP "Page.bringToFront" @{} | Out-Null
    Start-Sleep -Seconds 1

    $m = Evalua @"
(async function(){
  for (var i = 0; i < 40 && !(window.Maquete3D && Maquete3D.setVisaoTopo); i++) {
    await new Promise(function(r){ setTimeout(r, 500); });
  }
  if (!(window.Maquete3D && Maquete3D.setVisaoTopo)) return 'MAQUETE NAO CARREGOU';
  var R = {erros: []};
  window.onerror = function (msg) { R.erros.push('' + msg); };
  await document.querySelector('#cena3d').requestFullscreen();
  await new Promise(function(r){ setTimeout(r, 400); });
  document.getElementById('btn-decima').click();
  await new Promise(function(r){ setTimeout(r, 1500); });
  var v1 = Maquete3D.visao();
  await new Promise(function(r){ setTimeout(r, 400); });
  var v2 = Maquete3D.visao();
  R.cam1 = [Math.round(v1.cam[0]*100)/100, Math.round(v1.cam[1]*100)/100];
  R.cam2 = [Math.round(v2.cam[0]*100)/100, Math.round(v2.cam[1]*100)/100];
  R.topo = Maquete3D.topoAtivo();
  R.tela = [innerWidth, innerHeight];
  return JSON.stringify(R);
})()
"@ -aguardar $true -gesto $true
    Write-Host "DIAG2: $($m.value)"
    Start-Sleep -Milliseconds 400
    Salvar-Foto "_nao-usado\foto-diag2.png"
} finally { Parar-CDP }