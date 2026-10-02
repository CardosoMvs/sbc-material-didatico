# Teste 9: o modo topo deve travar a maquete (arraste nao pode movela)
. (Join-Path $PSScriptRoot "cdp-lib.ps1")
Iniciar-CDP
try {
    Enviar-CDP "Page.navigate" @{ url = "file:///D:/Marcos/Github/sbc-material-didatico/jogo5.html" } | Out-Null
    Start-Sleep -Seconds 7

    $m = Evalua @"
(async function(){
  var cv = document.querySelector('#cena3d canvas');
  var R = {};
  function cam() { return Maquete3D.visao().cam.map(function(n){return Math.round(n*1000)/1000;}); }
  function frame() { return new Promise(function(r){ requestAnimationFrame(function(){ requestAnimationFrame(r); }); }); }
  function drag(fx, fy, dx, dy) {
    var b = cv.getBoundingClientRect();
    var x = b.left + b.width*fx, y = b.top + b.height*fy;
    cv.dispatchEvent(new PointerEvent('pointerdown', {clientX: x, clientY: y, pointerId: 1, button: 0, buttons: 1, bubbles: true}));
    for (var i = 1; i <= 5; i++) {
      cv.dispatchEvent(new PointerEvent('pointermove', {clientX: x + dx*i/5, clientY: y + dy*i/5, pointerId: 1, buttons: 1, bubbles: true}));
    }
    cv.dispatchEvent(new PointerEvent('pointerup', {clientX: x + dx, clientY: y + dy, pointerId: 1, button: 0, buttons: 0, bubbles: true}));
  }
  R.centro = { ativo: Maquete3D.topoAtivo(), cam: null };
  Maquete3D.setVisaoTopo(true, true);
  R.centro.cam = cam();
  drag(0.5, 0.5, -60, 40); await frame();
  R.depoisArraste = cam();
  // agora com o botao pan em modo inspecao (caminho suspeito)
  document.getElementById('btn-pan').click();
  await frame();
  R.panAtivo = Maquete3D.topoAtivo();
  drag(0.5, 0.5, -60, 40); await frame();
  R.depoisPan = cam();
  document.getElementById('btn-pan').click(); // desliga pan
  Maquete3D.setVisaoTopo(false, true);
  drag(0.5, 0.5, -60, 40); await frame();
  R.depoisArrasteSemTopo = cam(); // controle: sem topo o arraste DEVE mover
  return JSON.stringify(R);
})()
"@ -aguardar $true
    Write-Host "TRAVAR: $($m.value)"
} finally { Parar-CDP }