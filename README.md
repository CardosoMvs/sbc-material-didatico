# sbc-material-didatico

Material didático do Programa SBC – Soja Baixo Carbono (Embrapa Soja) para o estande.

## Identidade visual

O padrão visual e o layout seguem o site oficial do Programa SBC (sojabaixocarbono.com.br), mas
**nenhuma cor foge da paleta oficial** de `PALETA DE CORES EMBRAPA.ai`: verde escura `#003c17`,
verde padrão `#007f47`, verde positivo `#00ac6c`, verde-limão `#bed747`, amarelo `#ffcc31`,
verde-água `#6dc067`, petróleo `#149c9e`, azuis `#4495d1`/`#00529c`/`#001a4b`, laranja `#f79433`,
marrom `#8a4d1f`, vinho (placas BRS) `#86124c`. Tintas claras e sombras são derivações (alfa)
dessas cores. A fonte **Roboto** está embutida em `fonte/` (woff2 variável, offline) — carregada
por `estilo-sbc.css`; não usar CDN externo.

Os recursos gráficos oficiais (selo branco e colorido, banner do hero, logo Embrapa,
ícones das práticas SPD/MIP/MID/FBN/ILPF, faixa de apoiadores e favicon) estão em `logos-oficiais/`,
baixados do site oficial; a capa do menu, o rodapé de todas as páginas e o favicon os usam.
Os **selos 2026** foram extraídos dos arquivos Illustrator compartilhados (`SELOS BAIXO CARBONO -
curvas_2026.ai` e `propostas ... apoiadoras_2026.ai`) para PNG transparente 300dpi e têm
prioridade: capa (`selo-2026-branco`), cabeçalho das páginas (`selo-2026-cor`) e rodapé
do menu (`lockup-apoiadoras-2026`).

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