# Teste 8: vista superior em tela cheia com placas ampliadas
. (Join-Path $PSScriptRoot "cdp-lib.ps1")
Iniciar-CDP
try {
    Enviar-CDP "Page.navigate" @{ url = "file:///D:/Marcos/Github/sbc-material-didatico/jogo5.html" } | Out-Null
    Start-Sleep -Seconds 7

    $m = Evalua @"
(async function(){
  var c3 = document.querySelector('#cena3d');
  c3.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:100;border-radius:0;overflow:hidden';
  Maquete3D.redimensionar();
  Maquete3D.setVisaoTopo(true, true);
  var b = document.querySelector('#cena3d canvas').getBoundingClientRect();
  document.querySelector('#cena3d canvas').dispatchEvent(new PointerEvent('pointermove', {clientX: b.left + b.width*0.5, clientY: b.top + b.height*0.5, bubbles: true}));
  await new Promise(function(r){ requestAnimationFrame(function(){ requestAnimationFrame(r); }); });
  var l = document.querySelector('.sbc-lente');
  var lr = l ? l.getBoundingClientRect() : null;
  return JSON.stringify({lente: lr ? [Math.round(lr.left), Math.round(lr.top), Math.round(lr.width), Math.round(lr.height)] : 'AUSENTE',
                         disp: l ? l.style.display : '-', cursor: 'nao-exposto'});
})()
"@ -aguardar $true -gesto $true
    Write-Host "TOPO-PLOCAS: $($m.value)"
    Start-Sleep -Milliseconds 300
    Salvar-Foto "_nao-usado\foto-placas-topo.png"
} finally { Parar-CDP }