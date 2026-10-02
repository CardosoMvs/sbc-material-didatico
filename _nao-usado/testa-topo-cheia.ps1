# Teste 2: visao superior em TELA CHEIA (modo do estande), com zoom TV
. (Join-Path $PSScriptRoot "cdp-lib.ps1")
Iniciar-CDP
try {
    Enviar-CDP "Page.navigate" @{ url = "file:///D:/Marcos/Github/sbc-material-didatico/jogo5.html" } | Out-Null
    Start-Sleep -Seconds 7

    # ativa zoom TV + tela cheia (com gesto sintetico do CDP) + visao topo
    $m = Evalua @"
(async function(){
  document.body.classList.add('modo-tv');
  await document.querySelector('#cena3d').requestFullscreen();
  await new Promise(function(r){ setTimeout(r, 400); });
  Maquete3D.setVisaoTopo(true, true);
  var cv = document.querySelector('#cena3d canvas');
  var b = cv.getBoundingClientRect();
  var cx = b.left + b.width*0.5, cy = b.top + b.height*0.5;
  cv.dispatchEvent(new PointerEvent('pointermove', {clientX: cx, clientY: cy, bubbles: true}));
  await new Promise(function(r){ requestAnimationFrame(function(){ requestAnimationFrame(r); }); });
  var lente = document.querySelector('.sbc-lente');
  var d = { fs: !!document.fullscreenElement, visao: Maquete3D.visao(),
    canvas: {left: b.left, top: b.top, w: b.width, h: b.height} };
  if (lente) {
    var lb = lente.getBoundingClientRect();
    d.lente = { display: lente.style.display, left: lente.style.left, top: lente.style.top,
      offsetW: lente.offsetWidth, visLeft: lb.left, visTop: lb.top, visW: lb.width };
  } else { d.lente = 'AUSENTE'; }
  return JSON.stringify(d);
})()
"@ -aguardar $true -gesto $true
    Write-Host "CHEIA: $($m.value)"
    Salvar-Foto "foto-topo-cheia.png"
} finally { Parar-CDP }