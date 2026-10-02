# Teste 5: diagnostico - por que a cena fica so de ceu na tela cheia
. (Join-Path $PSScriptRoot "cdp-lib.ps1")
Iniciar-CDP
try {
    Enviar-CDP "Page.navigate" @{ url = "file:///D:/Marcos/Github/sbc-material-didatico/jogo5.html" } | Out-Null
    Start-Sleep -Seconds 7

    $m = Evalua @"
(async function(){
  var c3 = document.querySelector('#cena3d');
  await c3.requestFullscreen();
  await new Promise(function(r){ setTimeout(r, 500); });
  Maquete3D.setVisaoTopo(true, true);
  await new Promise(function(r){ requestAnimationFrame(function(){ requestAnimationFrame(r); }); });
  // acessa o internal: usa a visao() e o estado do canvas p/ deduzir
  return JSON.stringify({
    visao: Maquete3D.visao(),
    innerW: innerWidth, innerH: innerHeight,
    canvasStr: document.querySelector('#cena3d canvas').style.width + ' x ' + document.querySelector('#cena3d canvas').style.height,
    canvasRect: (function(){ var b = document.querySelector('#cena3d canvas').getBoundingClientRect();
                    return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; })(),
    sceneInfo: Maquete3D.info()
  });
})()
"@ -aguardar $true -gesto $true
    Write-Host "DIAG: $($m.value)"
    Salvar-Foto "_nao-usado\foto-diag.png"
} finally { Parar-CDP }