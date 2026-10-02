# Teste 7: lente nos 2 modos (zoom e frente) + placas legiveis no topo
. (Join-Path $PSScriptRoot "cdp-lib.ps1")
Iniciar-CDP
try {
    Enviar-CDP "Page.navigate" @{ url = "file:///D:/Marcos/Github/sbc-material-didatico/jogo5.html" } | Out-Null
    Start-Sleep -Seconds 7

    # modo zoom com o ponteiro no talhao 1
    $m = Evalua @"
(async function(){
  var cv = document.querySelector('#cena3d canvas');
  document.body.classList.add('modo-tv');
  Maquete3D.setVisaoTopo(true, true);
  var b = cv.getBoundingClientRect();
  cv.dispatchEvent(new PointerEvent('pointermove', {clientX: b.left + b.width*0.45, clientY: b.top + b.height*0.30, bubbles: true}));
  await new Promise(function(r){ requestAnimationFrame(function(){ requestAnimationFrame(r); }); });
  return 'zoom=' + Maquete3D.lenteModo();
})()
"@ -aguardar $true
    Write-Host "FASE1: $($m.value)"
    Salvar-Foto "_nao-usado\foto-lente-zoom.png"

    # troca pra frente no mesmo ponto
    $m = Evalua @"
(async function(){
  var cv = document.querySelector('#cena3d canvas');
  Maquete3D.setLenteModo('frente');
  var b = cv.getBoundingClientRect();
  cv.dispatchEvent(new PointerEvent('pointermove', {clientX: b.left + b.width*0.45, clientY: b.top + b.height*0.30, bubbles: true}));
  await new Promise(function(r){ requestAnimationFrame(function(){ requestAnimationFrame(r); }); });
  return 'frente=' + Maquete3D.lenteModo();
})()
"@ -aguardar $true
    Write-Host "FASE2: $($m.value)"
    Salvar-Foto "_nao-usado\foto-lente-frente.png"

    # frente bem perto da placa do Talhao 1 (borda sul do talhao)
    $m = Evalua @"
(async function(){
  var cv = document.querySelector('#cena3d canvas');
  var b = cv.getBoundingClientRect();
  cv.dispatchEvent(new PointerEvent('pointermove', {clientX: b.left + b.width*0.45, clientY: b.top + b.height*0.24, bubbles: true}));
  await new Promise(function(r){ requestAnimationFrame(function(){ requestAnimationFrame(r); }); });
  return 'placa';
})()
"@ -aguardar $true
    Write-Host "FASE3: $($m.value)"
    Salvar-Foto "_nao-usado\foto-lente-placa.png"
} finally { Parar-CDP }