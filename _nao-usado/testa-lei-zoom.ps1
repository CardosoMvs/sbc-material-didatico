# Teste de lei: como o zoom proprio + zoom do body afetam left/top/size de um div fixo
. (Join-Path $PSScriptRoot "cdp-lib.ps1")
Iniciar-CDP
try {
    Enviar-CDP "Page.navigate" @{ url = "about:blank" } | Out-Null
    Start-Sleep -Seconds 1
    $m = Evalua @"
(function(){
  var d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:600px;top:400px;width:200px;height:200px;zoom:1;';
  document.body.appendChild(d);
  function le() { var r = d.getBoundingClientRect();
    return {left: r.left, top: r.top, w: Math.round(r.width*10)/10}; }
  var passos = {};
  // 1) sem zoom nenhum
  d.style.zoom = '1'; passos.zoom1 = le();
  // 2) zoom do body 1.35
  document.body.style.zoom = '1.35'; passos.zoomBody135 = le();
  // 3) contra-zoom no div
  d.style.zoom = '0.74074'; passos.contra = le();
  // 4) body 1 e div 0.74
  document.body.style.zoom = '1'; passos.body1div74 = le();
  return JSON.stringify(passos);
})()
"@
    Write-Host "LEI DO ZOOM: $($m.value)"
} finally { Parar-CDP }