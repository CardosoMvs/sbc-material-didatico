# Teste 14: nome do evento (ranking por evento) + X no modal de nome
. (Join-Path $PSScriptRoot "cdp-lib.ps1")
Iniciar-CDP
try {
    Enviar-CDP "Page.navigate" @{ url = "file:///D:/Marcos/Github/sbc-material-didatico/index.html" } | Out-Null
    Start-Sleep -Seconds 5

    # 1) registra pontos no ranking LEGADO (sem evento) e ve o que aparece
    $m = Evalua @"
(function(){
  SBCH.registrar('iegee','Marcos / Itatiaia',15,true);
  SBCH.registrar('quiz','Ana',8,true);
  var bar = document.querySelector('.evento .evt-label').textContent.trim();
  var camp = document.getElementById('campeoes').hidden ? 'escondido' : document.getElementById('campeoes-linha').textContent;
  var evtBar = document.querySelector('.evento').getBoundingClientRect();
  var sobre = document.querySelector('.sobre').getBoundingClientRect();
  return JSON.stringify({barra: bar, campeoes: camp, eventoSobreSobrem: Math.round(sobre.top - evtBar.bottom), corBarra: getComputedStyle(document.querySelector('.evento')).backgroundColor});
})()
"@ -aguardar $true
    Write-Host "LEGADO: $($m.value)"

    # 2) abre o modal do evento e cria "Feira de Londrina 2026"
    $m = Evalua @"
(function(){
  document.getElementById('btn-evento').click();
  document.getElementById('evt-campo').value = 'Feira de Londrina 2026';
  var mod = document.querySelector('.modal-fundo');
  var caixa = mod.querySelector('.modal-caixa').getBoundingClientRect();
  return JSON.stringify({modalVisivel: getComputedStyle(mod).display, caixa: [Math.round(caixa.left), Math.round(caixa.top), Math.round(caixa.width)]});
})()
"@ -aguardar $true
    Write-Host "MODAL: $($m.value)"
    Start-Sleep -Milliseconds 300
    Salvar-Foto "_nao-usado\foto-evento-modal.png"

    # aplicar (dispara definirEvento + reload); depois conferir estado
    Evalua "document.querySelector('.modal-fundo #evt-ok').click(); 'ok'" -aguardar $false | Out-Null
    Start-Sleep -Seconds 4
    $m = Evalua @"
(function(){
  var bar = document.querySelector('.evento .evt-label').textContent.trim();
  var camp = document.getElementById('campeoes').hidden ? 'escondido' : document.querySelector('.campeoes strong').textContent + ' | ' + document.getElementById('campeoes-linha').textContent;
  var chip = document.querySelector('.chip.record[data-jogo="iegee"]');
  var chaves = Object.keys(localStorage).filter(function(k){return k.indexOf('sbc_ranking')===0;});
  return JSON.stringify({barra: bar, campeoes: camp, chipIegee: chip ? chip.textContent : 'ausente', chaves: chaves});
})()
"@ -aguardar $true
    Write-Host "COM EVENTO: $($m.value)"

    # 3) jogo1: modal de nome com X clicavel
    Enviar-CDP "Page.navigate" @{ url = "file:///D:/Marcos/Github/sbc-material-didatico/jogo1.html" } | Out-Null
    Start-Sleep -Seconds 4
    $m = Evalua @"
(function(){
  SBCH.pedirNomeESalvar('iegee', 42, true, function(){ window.__salvou = true; });
  var x = document.getElementById('sbc-nome-x');
  var caixa = x.closest('.modal-caixa').getBoundingClientRect();
  x.click(); // nao quer informar
  var ficou = Object.keys(localStorage).filter(function(k){return k.indexOf('sbc_ranking')===0;});
  return JSON.stringify({xExiste: !!x, pos: [Math.round(x.getBoundingClientRect().cx||0)], dentroDaCaixa: !!x.offsetParent, modalFechou: !document.querySelector('.modal-fundo'), semNovoRegistro: ficou.filter(function(k){return k.indexOf('42')>=0;}).length===0, aoSalvarIgnorado: !window.__salvou, caixaTop: Math.round(caixa.left)});
})()
"@ -aguardar $true
    Write-Host "X-NOME: $($m.value)"
    Start-Sleep -Milliseconds 300
    Salvar-Foto "_nao-usado\foto-x-nome.png"
} finally { Parar-CDP }