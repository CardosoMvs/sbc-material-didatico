# Teste 1: visao superior em janela NORMAL (nao fullscreen), com zoom TV
. (Join-Path $PSScriptRoot "cdp-lib.ps1")
Iniciar-CDP
try {
    Enviar-CDP "Page.navigate" @{ url = "file:///D:/Marcos/Github/sbc-material-didatico/jogo5.html" } | Out-Null
    Start-Sleep -Seconds 7

    # medidas iniciais
    $m1 = Evalua @"
JSON.stringify({
  innerW: innerWidth, innerH: innerHeight,
  dpr: devicePixelRatio,
  zoomBody: getComputedStyle(document.body).zoom,
  webglOk: !document.querySelector('.aviso-webgl'),
  canvas: (function(){ var c = document.querySelector('#cena3d canvas'); if(!c) return null; var b = c.getBoundingClientRect(); return {left: b.left, top: b.top, w: b.width, h: b.height, cssW: c.style.width, cssH: c.style.height}; })()
})
"@
    Write-Host "ANTES: $($m1.value)"

    # ativa visao topo instantanea + pointer no meio do canvas
    $m2 = Evalua @"
(async function(){
  document.body.classList.add('modo-tv');
  Maquete3D.setVisaoTopo(true, true);
  Maquete3D.renderUmaVez();
  var cv = document.querySelector('#cena3d canvas');
  var b = cv.getBoundingClientRect();
  var cx = b.left + b.width*0.5, cy = b.top + b.height*0.5;
  cv.dispatchEvent(new PointerEvent('pointermove', {clientX: cx, clientY: cy, bubbles: true}));
  await new Promise(function(r){ requestAnimationFrame(function(){ requestAnimationFrame(r); }); });
  var lente = document.querySelector('.sbc-lente');
  var dados = {
    visao: Maquete3D.visao(),
    zoomBody: getComputedStyle(document.body).zoom,
    canvasRect: {left: b.left, top: b.top, w: b.width, h: b.height},
    lente: null
  };
  if (lente) {
    var lb = lente.getBoundingClientRect();
    dados.lente = { display: lente.style.display, left: lente.style.left, top: lente.style.top,
      offsetW: lente.offsetWidth, offsetH: lente.offsetHeight,
      visLeft: lb.left, visTop: lb.top, visW: lb.width, visH: lb.height,
      zoomLente: getComputedStyle(lente).zoom, pai: lente.parentNode.id || lente.parentNode.tagName };
  }
  return JSON.stringify(dados);
})()
"@ -aguardar $true
    Write-Host "TOPO: $($m2.value)"
    Salvar-Foto "foto-topo-normal.png"
} finally { Parar-CDP }