# Teste 3: verifica as correcoes - encaixe do enxame + lente nas bordas (normal e cheia)
. (Join-Path $PSScriptRoot "cdp-lib.ps1")
Iniciar-CDP
try {
    Enviar-CDP "Page.navigate" @{ url = "file:///D:/Marcos/Github/sbc-material-didatico/jogo5.html" } | Out-Null
    Start-Sleep -Seconds 7

    $m = Evalua @"
(async function(){
  var R = {passos: []};
  var cv = document.querySelector('#cena3d canvas');
  document.body.classList.add('modo-tv');   // zoom 1.35 (estande)
  Maquete3D.setVisaoTopo(true, true);

  function frame() { return new Promise(function(r){ requestAnimationFrame(function(){ requestAnimationFrame(r); }); }); }
  function ponte(fx, fy) { // f = fracao do canvas
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

  // --- centro do canvas (modo normal) ---
  var b = ponte(0.5, 0.5); await frame();
  R.passos.push({fase: 'normal-centro', tela: [innerWidth, innerHeight], cam: Maquete3D.visao().cam.map(function(n){return Math.round(n*100)/100;}), lente: leLente()});

  // --- perto da borda de baixo ---
  var b2 = ponte(0.5, 0.999); await frame();
  R.passos.push({fase: 'normal-baixo', mira: [b2.left + b2.width*0.5, b2.top + b2.height*0.999], lente: leLente()});

  // --- perto da borda da direita ---
  var b3 = ponte(0.999, 0.5); await frame();
  R.passos.push({fase: 'normal-direita', mira: [b3.left + b3.width*0.999, b3.top + b3.height*0.5], lente: leLente()});

  // --- canto de baixo e direita ---
  var b4 = ponte(0.999, 0.999); await frame();
  R.passos.push({fase: 'normal-canto-baixo-direita', lente: leLente()});

  return JSON.stringify(R);
})()
"@ -aguardar $true
    Write-Host "NORMAL: $($m.value)"
    Salvar-Foto "foto-verif-normal.png"
} finally { Parar-CDP }