# Teste 4: fullscreen (modo estande) com as correcoes - cam + lente nas bordas
. (Join-Path $PSScriptRoot "cdp-lib.ps1")
Iniciar-CDP
try {
    Enviar-CDP "Page.navigate" @{ url = "file:///D:/Marcos/Github/sbc-material-didatico/jogo5.html" } | Out-Null
    Start-Sleep -Seconds 7

    $m = Evalua @"
(async function(){
  var R = {passos: []};
  var c3 = document.querySelector('#cena3d');
  var cv = document.querySelector('#cena3d canvas');
  // emula resolucao do estande antes do fullscreen
  EmulationNada = null;
  document.body.classList.add('modo-tv');
  await c3.requestFullscreen();
  await new Promise(function(r){ setTimeout(r, 500); });

  Maquete3D.setVisaoTopo(true, true);

  function frame() { return new Promise(function(r){ requestAnimationFrame(function(){ requestAnimationFrame(r); }); }); }
  function ponte(fx, fy) {
    var b = cv.getBoundingClientRect();
    cv.dispatchEvent(new PointerEvent('pointermove', {clientX: b.left + b.width*fx, clientY: b.top + b.height*fy, bubbles: true}));
    return b;
  }
  function leLente() {
    var l = document.querySelector('.sbc-lente'); if (!l) return 'AUSENTE';
    var r = l.getBoundingClientRect();
    return {disp: l.style.display, zoom: l.style.zoom, left: l.style.left, top: l.style.top,
            vLeft: Math.round(r.left), vTop: Math.round(r.top), vR: Math.round(r.right), vB: Math.round(r.bottom), vW: Math.round(r.width)};
  }

  var b = ponte(0.5, 0.5); await frame();
  R.passos.push({fase: 'cheia-centro', tela: [innerWidth, innerHeight], cam: Maquete3D.visao().cam.map(function(n){return Math.round(n*100)/100;}), lente: leLente()});

  var b2 = ponte(0.5, 0.995); await frame();
  R.passos.push({fase: 'cheia-baixo', lente: leLente()});

  var b3 = ponte(0.995, 0.5); await frame();
  R.passos.push({fase: 'cheia-direita', lente: leLente()});

  var b4 = ponte(0.995, 0.995); await frame();
  R.passos.push({fase: 'cheia-canto', lente: leLente()});

  var b5 = ponte(0.005, 0.005); await frame();
  R.passos.push({fase: 'cheia-canto-sup-esq', lente: leLente()});

  R.fs = !!document.fullscreenElement;
  return JSON.stringify(R);
})()
"@ -aguardar $true -gesto $true
    Write-Host "CHEIA: $($m.value)"
    Salvar-Foto "_nao-usado\foto-verif-cheia.png"
} finally { Parar-CDP }