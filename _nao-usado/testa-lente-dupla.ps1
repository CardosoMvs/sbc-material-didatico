# Teste 13: lente dupla (grande + medalhao menor do outro modo) + seletor de modo so no index
. (Join-Path $PSScriptRoot "cdp-lib.ps1")
Iniciar-CDP
try {
    Enviar-CDP "Page.navigate" @{ url = "file:///D:/Marcos/Github/sbc-material-didatico/jogo5.html" } | Out-Null
    Start-Sleep -Seconds 7
    Enviar-CDP "Page.bringToFront" @{} | Out-Null

    $m = Evalua @"
(async function(){
  document.body.classList.add('modo-tv');
  Maquete3D.setVisaoTopo(true, true);
  var cv = document.querySelector('#cena3d canvas');
  var b = cv.getBoundingClientRect();
  var seletor = document.getElementById('sbc-modos');
  var R = {seletorNoJogo: seletor ? getComputedStyle(seletor).display : 'sem-barra'};
  function ponta(fx, fy) {
    cv.dispatchEvent(new PointerEvent('pointermove', {clientX: b.left + b.width*fx, clientY: b.top + b.height*fy, bubbles: true}));
  }
  function frame() { return new Promise(function(r){ requestAnimationFrame(function(){ requestAnimationFrame(r); }); }); }
  function leDois() {
    var a = document.querySelector('.sbc-lente'), i = document.querySelector('.sbc-lente-inseto');
    var ra = a.getBoundingClientRect(), ri = i ? i.getBoundingClientRect() : null;
    return {grande: [Math.round(ra.left), Math.round(ra.top), Math.round(ra.width)], medalhao: ri ? [Math.round(ri.left), Math.round(ri.top), Math.round(ri.width)] : 'AUSENTE'};
  }
  ponta(0.45, 0.30); await frame();
  R.cima = leDois();
  SalvarFotoDepois = true;
  Maquete3D.setLenteModo('frente'); await frame();
  R.frente = leDois();
  return JSON.stringify(R);
})()
"@ -aguardar $true
    Write-Host "DUPLO: $($m.value)"

    # volta a lente pra cima pra foto mostrar os dois juntos
    Evalua "Maquete3D.setLenteModo('zoom'); document.querySelector('#cena3d canvas').dispatchEvent(new PointerEvent('pointermove', {clientX: 700 + document.querySelector('#cena3d canvas').getBoundingClientRect().left + 800*0.45, clientY: document.querySelector('#cena3d canvas').getBoundingClientRect().top + 800*0.30, bubbles: true})); 'ok'" -aguardar $false | Out-Null
    Start-Sleep -Milliseconds 400
    Salvar-Foto "_nao-usado\foto-lente-dupla.png"

    # seletor na tela inicial
    Enviar-CDP "Page.navigate" @{ url = "file:///D:/Marcos/Github/sbc-material-didatico/index.html" } | Out-Null
    Start-Sleep -Seconds 4
    $m2 = Evalua "(function(){ var s = document.getElementById('sbc-modos'); return JSON.stringify({seletorNoIndex: s ? getComputedStyle(s).display : 'inexistente'}); })()"
    Write-Host "SELETOR: $($m2.value)"
} finally { Parar-CDP }