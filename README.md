# sbc-material-didatico

Material didático do Programa SBC – Soja Baixo Carbono (Embrapa Soja) para o estande.

## Identidade visual

Cores e botões seguem o site oficial do Programa SBC (sojabaixocarbono.com.br): verde `#176545`,
verde-oliva `#669933`, amarelo `#FFCC33`, azuis-água `#5FB0D1`/`#E7F5FF`. A fonte **Roboto** está
embutida em `fonte/` (woff2 variável, offline) — carregada por `estilo-sbc.css`; não usar CDN externo.

## Versionamento

O menu (`index.html`) tem um seletor de versão no canto superior esquerdo — ele sempre abre
na versão mais atual (a própria raiz do site). As versões antigas ficam congeladas em `versoes/`:
- `versoes/v1/` — 11 set · jogos originais (commit `c5d9eb1`)
- `versoes/v2/` — 26 set · chegada da maquete 3D (commit `b16e551`)
- `versoes/v3/` — 29 set · modo TV (commit `b170a53`)
- `versoes/v4/` — 1 out · sem emojis · visual do site oficial (commit `dc9dde6`)

Recursos pesados idênticos entre as versões (modelos `.glb`, `three.min.js`, logos) não são
duplicados — as páginas antigas apontam para os da raiz (`../../`).

Para criar uma versão nova (quando a atual virar "antiga"), edite a lista `VERSOES` em
`.claude/_build-versoes.py` e rode `python -X utf8 .claude/_build-versoes.py`.