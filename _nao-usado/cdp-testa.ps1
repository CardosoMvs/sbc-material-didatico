# Harness CDP minimo p/ testar a maquete no Chrome headless
param(
    [string]$url = "file:///D:/Marcos/Github/sbc-material-didatico/jogo5.html",
    [int]$porta = 9223
)
$ErrorActionPreference = "Stop"

# funcao base64 -> arquivo
function Salvar-Png($b64, $arq) {
    [IO.File]::WriteAllBytes($arq, [Convert]::FromBase64String($b64))
}

# inicia chrome
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$ud = Join-Path $env:TEMP "cdp-maquete-ud"
if (Test-Path $ud) { Remove-Item -Recurse -Force $ud }
$proc = Start-Process -FilePath $chrome -ArgumentList @(
    "--headless=new", "--remote-debugging-port=$porta", "--user-data-dir=$ud",
    "--window-size=1400,900", "--use-gl=angle", "--use-angle=swiftshader",
    "--disable-gpu-sandbox", "--no-first-run", "--hide-scrollbars", "about:blank"
) -PassThru
Start-Sleep -Seconds 3

# pega o alvo
$alvo = $null
for ($i = 0; $i -lt 10; $i++) {
    try {
        $abas = Invoke-RestMethod "http://127.0.0.1:$porta/json"
        $alvo = $abas | Where-Object { $_.type -eq "page" } | Select-Object -First 1
        if ($alvo) { break }
    } catch { Start-Sleep -Milliseconds 500 }
}

# websocket
$ws = New-Object System.Net.WebSockets.ClientWebSocket
$ct = [System.Threading.CancellationToken]::None
$ws.ConnectAsync([Uri]$alvo.webSocketDebuggerUrl, $ct).Wait("00:00:10")

$script:seq = 0
function Enviar-CDP($method, $params = @{}) {
    $script:seq++
    $id = $script:seq
    $msg = @{ id = $id; method = $method; params = $params } | ConvertTo-Json -Depth 8 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($msg)
    $seg = New-Object System.ArraySegment[byte] (,$bytes)
    $ws.SendAsync($seg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).Wait()
    $buf = New-Object byte[] (4MB)
    while ($true) {
        $r = New-Object System.ArraySegment[byte] (,$buf)
        $resp = $ws.ReceiveAsync($r, $ct).Result
        $txt = [Text.Encoding]::UTF8.GetString($buf, 0, $resp.Count)
        $j = $txt | ConvertFrom-Json
        if ($j.id -eq $id) { return $j }
    }
}

function Evalua($expr, $aguardar = $false) {
    $r = Enviar-CDP "Runtime.evaluate" @{ expression = $expr; returnByValue = $true; awaitPromise = $aguardar }
    return $r.result.result
}

# viewport grande tipo estande
Enviar-CDP "Emulation.setDeviceMetricsOverride" @{ width = 1920; height = 1080; deviceScaleFactor = 1; mobile = $false } | Out-Null

# navega
Enviar-CDP "Page.navigate" @{ url = $url } | Out-Null
Start-Sleep -Seconds 6

Write-Host "=== pronto; use as variaveis `$ws (CDP via Enviar-CDP/Evalua) ==="