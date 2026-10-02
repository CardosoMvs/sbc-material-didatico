# lib CDP minima: inicia chrome headless, conecta e expoe helpers.
# Uso: $r = Evalua "1+1"   ; Salvar-Foto "arq.png"
$ErrorActionPreference = "Stop"

function Salvar-Png($b64, $arq) {
    [IO.File]::WriteAllBytes($arq, [Convert]::FromBase64String($b64))
}

function Iniciar-CDP {
    $script:chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
    $script:ud = Join-Path $env:TEMP "cdp-maquete-ud"
    if (Test-Path $ud) { Remove-Item -Recurse -Force $ud -ErrorAction SilentlyContinue }
    $script:proc = Start-Process -FilePath $chrome -ArgumentList @(
        "--headless=new", "--remote-debugging-port=9223", "--user-data-dir=$ud",
        "--window-size=1920,1080", "--use-gl=angle", "--use-angle=swiftshader",
        "--disable-gpu-sandbox", "--no-first-run", "--hide-scrollbars", "about:blank"
    ) -PassThru
    Start-Sleep -Seconds 3

    $alvo = $null
    for ($i = 0; $i -lt 12; $i++) {
        try {
            $abas = Invoke-RestMethod "http://127.0.0.1:9223/json"
            $alvo = $abas | Where-Object { $_.type -eq "page" } | Select-Object -First 1
            if ($alvo) { break }
        } catch { Start-Sleep -Milliseconds 600 }
    }

    $script:ws = New-Object System.Net.WebSockets.ClientWebSocket
    $script:ct = [System.Threading.CancellationToken]::None
    $script:ws.ConnectAsync([Uri]$alvo.webSocketDebuggerUrl, $ct).Wait(10000)
    $script:seq = 0
}

function Enviar-CDP($method, $params = @{}) {
    $script:seq++
    $id = $script:seq
    $msg = @{ id = $id; method = $method; params = $params } | ConvertTo-Json -Depth 8 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($msg)
    $seg = New-Object System.ArraySegment[byte] (,$bytes)
    $script:ws.SendAsync($seg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $script:ct).Wait()
    $buf = New-Object byte[] (256KB)
    $ms = New-Object IO.MemoryStream
    while ($true) {
        $r = New-Object System.ArraySegment[byte] (,$buf)
        $resp = $script:ws.ReceiveAsync($r, $script:ct).Result
        if ($resp.Count -gt 0) { $ms.Write($buf, 0, $resp.Count) }
        if ($resp.EndOfMessage) { break }
    }
    $txt = [Text.Encoding]::UTF8.GetString($ms.ToArray())
    $j = $txt | ConvertFrom-Json
    if ($j.id -eq $id) { return $j } else { Write-Host "evento ignorado"; return $null }
}

function Evalua($expr, $aguardar = $false, $gesto = $false) {
    $r = Enviar-CDP "Runtime.evaluate" @{ expression = $expr; returnByValue = $true; awaitPromise = $aguardar; userGesture = $gesto }
    if ($r.result.exceptionDetails) {
        Write-Host ("ERRO JS: " + ($r.result.exceptionDetails.exception.description) )
    }
    return $r.result.result
}

function Salvar-Foto($arq) {
    $r = Enviar-CDP "Page.captureScreenshot" @{ format = "jpeg"; quality = 75 }
    Salvar-Png $r.result.data $arq
    Write-Host "foto: $arq"
}

function Parar-CDP {
    try {
        if ($script:proc -and -not $script:proc.HasExited) { $script:proc.Kill() }
    } catch {}
}