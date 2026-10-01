# -*- coding: utf-8 -*-
# Gera versoes/vN/ — fotos do site em marcos do git (o canto esquerdo do menu
# leva a elas; a versão atual continua na raiz e sempre abre por padrão).
#
# Cada pasta recebe as páginas HTML e os arquivos CSS/JS que tinham o formato
# daquela época. Recursos pesados idênticos aos de hoje (three.min.js,
# OrbitControls, modelos .glb, logos) NÃO são copiados: um script reescreve as
# referências para apontar para a raiz (../../), sem duplicar 4 MB de modelos.
import os, re, subprocess, io, sys

REPO = os.getcwd()

def git(*args, binary=False):
    out = subprocess.run(["git"] + list(args), capture_output=True)
    if out.returncode != 0:
        return None
    return out.stdout if binary else out.stdout.decode("utf-8", "replace")

def tree(commit):
    linhas = git("ls-tree", "-r", "--name-only", commit).split("\n")
    return [l for l in linhas if l]

def show(commit, path):
    return git("show", "%s:%s" % (commit, path), binary=True)

def ler(path):
    with io.open(os.path.join(REPO, path), "rb") as f:
        return f.read()

PAGINAS_RE = re.compile(r"^(index|jogo[1-5]|registro|painel)\.html$")
# o que vale como recurso (para decidir copiar vs. usar o da raiz)
ASSET_RE = re.compile(r"^([A-Za-z0-9_\-.]+\.(?:css|js|png|webp|glb)|modelos/[A-Za-z0-9_\-.]+\.(?:js|glb|png))$")
EXCLUIR = (".bak", "maquete3d.js.bak")

# (versão, commit, data curta, descrição)
VERSOES = [
    ("v1", "c5d9eb1", "11 set", "jogos originais"),
    ("v2", "b16e551", "26 set", "chegada da maquete 3D"),
    ("v3", "b170a53", "29 set", "modo TV"),
    ("v4", "dc9dde6", "1 out", "sem emojis · visual do site oficial"),
]

# arquivos "vivos" do site (evoluem a cada versão): sempre copiam, nunca
# apontam para a raiz — senão a próxima mudança de design altera as versões
# antigas congeladas. Só recursos estáveis (modelos, three.js, logos, fonte,
# imagens) ficam compartilhados via ../../
SEMPRE_COPIAR = ("estilo-sbc.css", "jogos-sbc.js", "modo-tela.js", "maquete3d")

def sempreCopiar(r):
    return any(r.startswith(p) for p in SEMPRE_COPIAR)

REF_ATRIBUTO = re.compile(r"""(?:src|href)=(["'])([^"']+?)\1""")

def referencias(texto):
    refs = set()
    for _, r in REF_ATRIBUTO.findall(texto):
        refs.add(r)
    refs |= set(re.findall(r'''["'](modelos/[^"']+?)["']''', texto))
    return refs

BANNER = u"""
    <style>
        #sbc-versao{position:fixed;top:8px;left:8px;z-index:81;display:flex;align-items:center;gap:9px;
            background:rgba(255,255,255,0.93);border:2px solid #bcd9c2;border-radius:999px;padding:5px 12px;
            box-shadow:0 2px 0 rgba(27,77,42,0.18);font-family:inherit;font-size:0.72em;line-height:1.2;}
        #sbc-versao b{font-weight:900;color:#14522e;white-space:nowrap;}
        #sbc-versao span{color:#5c6b60;white-space:nowrap;}
        #sbc-versao a{color:#123a5f;font-weight:800;white-space:nowrap;text-decoration:underline;}
    </style>
    <div id="sbc-versao">
        <b>{rotulo}</b><span>versão antiga</span>
        <a href="../../index.html">abrir a versão atual</a>
    </div>
"""

def montar(versao, commit, data, desc):
    pasta = os.path.join(REPO, "versoes", versao)
    os.makedirs(pasta)
    arvores = tree(commit)
    # páginas desta época
    paginas = [p for p in arvores if PAGINAS_RE.match(p)]
    # coleta referências das páginas
    refs_total = set()
    conteudo_paginas = {}
    for p in paginas:
        b = show(commit, p)
        conteudo_paginas[p] = b
        refs_total |= referencias(b.decode("utf-8", "replace"))
    refs_assets = sorted(r for r in refs_total if ASSET_RE.match(r) and not r.startswith(".."))
    # decide copiar vs. compartilhar com a raiz
    compartilhados, copiados = [], []
    copiados_conteudo = {}
    for r in refs_assets:
        alvo = os.path.join(REPO, r)
        if not os.path.isfile(alvo):
            sys.stdout.buffer.write(("  AVISO: ref %s não existe nem na raiz\n" % r).encode("utf-8"))
            compartilhados.append(r)  # tentar pela raiz mesmo assim
            continue
        da_epoca = show(commit, r)
        if da_epoca is not None and da_epoca == ler(r) and not sempreCopiar(r):
            compartilhados.append(r)          # igual à raiz: usa ../../
        else:
            copiados.append(r)                # diferente/ausente: copia a da época
            if da_epoca is not None:
                copiados_conteudo[r] = da_epoca
    # JS copiado pode apontar outros recursos (modelos .glb etc.) — varre também
    fila = [r for r in copiados if r.endswith(".js")]
    vistos = set(refs_assets)
    while fila:
        js = fila.pop()
        txt = copiados_conteudo[js].decode("utf-8", "replace")
        for r in referencias(txt):
            if r in vistos or not ASSET_RE.match(r) or r.startswith(".."):
                continue
            vistos.add(r)
            alvo = os.path.join(REPO, r)
            if not os.path.isfile(alvo):
                sys.stdout.buffer.write(("  AVISO: ref %s não existe nem na raiz\n" % r).encode("utf-8"))
                compartilhados.append(r)
                continue
            da_epoca = show(commit, r)
            if da_epoca is not None and da_epoca == ler(r) and not sempreCopiar(r):
                compartilhados.append(r)
            else:
                copiados.append(r)
                if da_epoca is not None:
                    copiados_conteudo[r] = da_epoca
                    if r.endswith(".js"):
                        fila.append(r)
    # escreve os recursos da época (com refs compartilhadas reescritas)
    for r in copiados:
        dados = copiados_conteudo.get(r)
        caminho = os.path.join(pasta, r.replace("/", os.sep))
        os.makedirs(os.path.dirname(caminho), exist_ok=True)
        if dados is None:
            sys.stdout.buffer.write(("  AVISO: %s não existe no commit %s — omitida\n" % (r, versao)).encode("utf-8"))
            continue
        if r.endswith((".js", ".html")):
            txt = dados.decode("utf-8", "replace")
            para_raiz = list(compartilhados)
            # glb/pesados referenciados podem ter entrado depois; reescreve tudo não-copiado
            for s in list(vistos):
                if s not in copiados and s not in para_raiz:
                    para_raiz.append(s)
            for s in para_raiz:
                txt = txt.replace('"%s"' % s, '"../../%s"' % s)
                txt = txt.replace("'%s'" % s, "'../../%s'" % s)
            with io.open(caminho, "w", encoding="utf-8", newline="\n") as f:
                f.write(txt)
        else:
            with io.open(caminho, "wb") as f:
                f.write(dados)
    # grava páginas com referências reescritas + faixa de versão antiga
    for p in paginas:
        texto = conteudo_paginas[p].decode("utf-8", "replace")
        for r in vistos:
            if r in copiados:
                continue
            texto = texto.replace('"%s"' % r, '"../../%s"' % r)
            texto = texto.replace("'%s'" % r, "'../../%s'" % r)
        # o link "atual" do seletor de versão, copiado da raiz, apontava para
        # ele mesmo — dentro da versão antiga ele volta para a raiz
        texto = texto.replace('href="index.html" class="atual"', 'href="../../index.html" class="atual"')
        # e os links do seletor para outras versões descerem um nível
        texto = re.sub(r'(href=")(?:versoes/)', r'\1../../versoes/', texto)
        texto = re.sub(r"(href=')(?:versoes/)", r"\1../../versoes/", texto)
        rotulo = "%s · %s" % (versao, data)
        texto = texto.replace("</body>", BANNER.replace(u"{rotulo}", rotulo) + u"\n</body>")
        with io.open(os.path.join(pasta, p), "w", encoding="utf-8", newline="\n") as f:
            f.write(texto)
    sys.stdout.buffer.write(("  %s: %d páginas, %d arquivos da época, %d recursos da raiz\n"
        % (versao, len(paginas), len(copiados), len(compartilhados))).encode("utf-8"))

if os.path.isdir(os.path.join(REPO, "versoes")):
    raise SystemExit("versoes/ já existe — apague antes de rodar de novo")

v_listas = {}
for versao, commit, data, desc in VERSOES:
    sys.stdout.buffer.write(("Gerando %s (%s — %s)\n" % (versao, commit, desc)).encode("utf-8"))
    montar(versao, commit, data, desc)

# índice de versões p/ o seletor do menu (a raiz é sempre a mais atual)
for versao, commit, data, desc in VERSOES:
    v_listas[versao] = (data, desc)
import json
with io.open(os.path.join(REPO, "versoes", "indice.json"), "w", encoding="utf-8") as f:
    json.dump(v_listas, f, ensure_ascii=False, indent=2, sort_keys=True)
print("ok")