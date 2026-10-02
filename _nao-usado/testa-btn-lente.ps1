# Teste 10: botao da lente + lente por cima na tela cheia de verdade
. (Join-Path $PSScriptRoot "cdp-lib.ps1")
Iniciar-CDP
try {
    Enviar-CDP "Page.navigate" @{ url = "file:///D:/Marcos/Github/sbc-material-didatico/jogo5.html" } | Out-Null
    Start-Sleep -Seconds 7

    $m = Evalua @"
(async function(){
  var cv = document.querySelector('#cena3d canvas');
  var R = {};
  await document.querySelector('#cena3d').requestFullscreen();
  await new Promise(function(r){ setTimeout(r, 400); });
  // fluxo REAL do usuario: tela cheia primeiro, depois o botao da vista de cima
  document.getElementById('btn-decima').click();
  await new Promise(function(r){ setTimeout(r, 1300); }); // o voo da tomada
  var bl = document.getElementById('btn-lente');
  R.lenteBtn = {visivel: getComputedStyle(bl).display !== 'none', texto: bl.textContent};
  var b = cv.getBoundingClientRect();
  cv.dispatchEvent(new PointerEvent('pointermove', {clientX: b.left + b.width*0.45, clientY: b.top + b.height*0.30, bubbles: true}));
  await new Promise(function(r){ requestAnimationFrame(function(){ requestAnimationFrame(r); }); });
  var l = document.querySelector('.sbc-lente');
  R.lente = l ? {visivel: l.style.display === 'block', dentroDeFullscreen: !!l.closest('#cena3d')} : 'AUSENTE';
  bl.click();
  R.depoisDoClick = {texto: bl.textContent, modo: Maquete3D.lenteModo()};
  await new Promise(function(r){ requestAnimationFrame(function(){ requestAnimationFrame(r); }); });
  return JSON.stringify(R);
})()
"@ -aguardar $true -gesto $true
    Write-Host "BTN-LENTE: $($m.value)"
    Start-Sleep -Milliseconds 400
    Salvar-Foto "_nao-usado\foto-lente-cheia.png"
} finally { Parar-CDP }