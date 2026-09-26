# Plano de melhorias — Maquete da Fazenda 3D (jogo5)

## Objetivo
Deixar a maquete digital mais refinada, com elementos melhor desenhados e alinhada ao briefing "Maquete interativa – Evolução do manejo em 3 talhões", mantendo a leitura visual intuitiva e o estilo arcade-fazenda do SBC.

## 1. Terreno e relevo (base da paisagem integrada)
- Aumentar a resolução da malha do terreno (`PlaneGeometry` de 120×80 para 180×120) para suavizar morros, margens de rio e transições.
- Reforçar o relevo do Talhão 2: morros mais altos e com vertentes claras, deixando o contraste entre linhas retas (Ano 1) e curvas de nível (Anos 2/3) mais visível.
- Adicionar micro-relevo procedural (pequenas ondulações) para que o solo não pareça uma superfície lisa.
- Criar transições de cor mais suaves entre talhões, caminhos, margens de APP e leito dos rios.
- Melhorar o corte de terra da ilha: bordas com camadas de solo mais nítidas e textura de grama/terra na borda superior.

## 2. Vegetação nativa e áreas de proteção (APPs e RL)
- **Árvores refinadas**: troncos com geometria de cilindro + raízes visuais, copas com múltiplas esferas irregulares em tons variados de verde.
- **APP preservada**: faixa densa e contínua de árvores e arbustos baixos entre o Talhão 3 e o rio direito, sem invadir a área produtiva.
- **APP degradada**: árvores secas/ralas, pequenas e poucas, com galhos aparentes; solo mais exposto; lavoura visualmente próxima ao rio.
- **Reserva Legal**: fragmento florestal mais denso ao fundo direito, com árvores maiores, sub-bosque e variação de altura.
- Adicionar arbustos e capim nas bordas de todas as áreas nativas para integrar talhões + floresta.

## 3. Culturas e palhada (foco do briefing)
- Criar geometrias distintas para cada cultura:
  - **Soja**: plantas baixas com 3 folhas arredondadas por touceira.
  - **Milho**: canas altas com folhas longas e espigas amarelas no topo.
  - **Trigo/aveia**: hastes finas com pontas douradas, dispostas em fileiras.
  - **Braquiária**: toufas altas e densas, em verde escuro.
  - **Crotalária**: hastes com flores amarelas pequenas.
- **Palhada volumétrica**: substituir os planos simples por cilindros finos/talos amarronzados espalhados no solo, com densidade progressiva por ano:
  - Talhão 1: ~10 %, ~40 %, >90 %.
  - Talhões 2 e 3: bastante palhada visível a partir do Ano 2.
- Garantir que o Ano 1 de cada talhão tenha solo visível, e o Ano 3 fique praticamente coberto.

## 4. Rios, margens e água
- Adicionar **pedras e seixos** ao longo das margens dos dois rios.
- Criar faixa de **areia/terra molhada** na transição entre água e campo.
- Manter o contraste de cor da água: rio esquerdo barrento no Ano 1 e clareando até o Ano 3; rio direito sempre mais limpo.
- Refinar a espuma: partículas menores e mais brancas no rio direito, partículas mais escuras no esquerdo.
- Suavizar as bordas da água para não parecerem “cortadas” no terreno.

## 5. Elementos complementares e animação
- **Drone**: manter hélices girando, adicionar luzes piscantes e câmera mais visível.
- **Vacas**: melhorar o modelo com cabeça mais definida, orelhas, rabo pequeno e manchas mais realistas.
- **Biodiversidade**: borboletas coloridas, abelhas amarelo-preto e pássaros voando em círculos, com formas simples mas reconhecíveis.
- Adicionar pequenos detalhes: poças na lagoa do gado, grama mais densa no pasto.

## 6. Sinalização 3D na maquete
- Adicionar **placas informativas 3D** de madeira em cada talhão com o nome resumido:
  - “Talhão 1 – Evolução da palhada”
  - “Talhão 2 – Plantio em contorno”
  - “Talhão 3 – Manejo avançado”
- Adicionar placas nas APPs (“APP degradada” / “APP preservada”) e na RL (“RL preservada e excedente”), conforme o briefing.

## 7. Iluminação, céu e atmosfera
- Refinar o céu com gradiente mais rico (azul → horizonte claro).
- Adicionar **névoa sutil** (fog) no fundo para dar profundidade e integrar a paisagem.
- Pequenas partículas de pólen/poeira flutuando perto das culturas floridas.
- Ajustar luz direcional para sombras mais suaves e realçar o relevo.

## 8. Performance e compatibilidade
- Manter o uso de `InstancedMesh` para vegetação, culturas e palhada.
- Cachear geometrias compartilhadas (já existe via `GE.*`).
- Reduzir contagem de instâncias automaticamente em telas pequenas ou quando WebGL reporta pouca memória.
- Garantir que a troca de ano continue rápida (< 300 ms).

## Arquivos que serão alterados
- `maquete3d.js` — principal melhoria visual do diorama.
- `jogo5.html` — pequenos ajustes de texto/HUD, se necessário.

## Ordem de implementação sugerida
1. Terreno + relevo + cores de transição.
2. Vegetação (APPs, RL, árvores soltas, arbustos).
3. Culturas e palhada por ano.
4. Rios, margens e elementos complementares.
5. Placas 3D, céu, névoa e polimento final.
6. Teste de performance e ajustes finos.
