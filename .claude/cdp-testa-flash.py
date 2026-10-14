# Dispara um erro e um acerto no jogo2 via Chrome DevTools Protocol e tira "frames" do flash.
import subprocess, time, json, base64, shutil, os
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
PORT = 9339
outdir = r'.claude\ai-render'
p = subprocess.Popen([CHROME, '--headless=new', '--disable-gpu', '--remote-debugging-port=' + str(PORT),
                      '--window-size=800,900', '--user-data-dir=' + os.environ['TEMP'] + r'\cdp-perfil-j2',
                      'about:blank'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
time.sleep(2.5)
try:
    import urllib.request
    tab = json.load(urllib.request.urlopen('http://127.0.0.1:%d/json' % PORT))[0]
    sid = tab['id']

    def send(cmd, params=None, wait=True):
        msg = json.dumps({'id': json.dumps(cmd)[1:8], 'method': cmd, 'params': params or {}})
        # via websocket manual (sem biblioteca): usar simple-websocket? fallback: HTTP PUT do CDP
        raise SystemExit('sem websocket')
except SystemExit:
    pass
p.kill()
print('CDP-WS-AUSENTE')