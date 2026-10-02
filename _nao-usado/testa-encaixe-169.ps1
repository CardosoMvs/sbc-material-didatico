# Teste 6: encaixe da maquete em uma janela 16:9 real (1920x1080), fullscreen simulado
. (Join-Path $PSScriptRoot "cdp-lib.ps1")
Iniciar-CDP
try {
    Enviar-CDP "Page.navigate" @{ url = "file:///D:/Marcos/Github/sbc-material-didatico/jogo5.html" } | Out-Null
    Start-Sleep -Seconds 7

    Enviar-CDP "Emulation.setDeviceMetricsOverride" @{ width = 1920; height = 1080; deviceScaleFactor = 1; mobile = $false } | Out-Null
    Start-Sleep -Seconds 1

    $m = Evalua @"
(function(){
  var c3 = document.querySelector('#cena3d');
  c3.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:100;border-radius:0;overflow:hidden';
  Maquete3D.redimensionar();
  Maquete3D.setVisaoTopo(true, true);
  Maquete3D.renderUmaVez();
  return JSON.stringify({ visao: Maquete3D.visao().cam.map(function(n){return Math.round(n*100)/100;}) });
})()
"@ -gesto $true
    Write-Host "CAM-16x9: $($m.value)"
    Start-Sleep -Seconds 1
    Salvar-Foto "_nao-usado\foto-encaixe-169.png"
} finally { Parar-CDP }