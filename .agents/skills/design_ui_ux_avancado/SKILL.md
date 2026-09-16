---
name: design_ui_ux_avancado
description: Regras de UI, UX e design responsivo para o site da Liga Atlântica.
---

# Skill: UI, UX e Responsividade Avançada (Design System da Liga)

Esta Skill define os padrões de design, usabilidade (UX), interface visual (UI) e adaptação móvel avançada para o site da Liga Atlântica.

---

## 1. Princípios de UI (Interface Visual)

### 1.1 Hierarquia Visual e Cores
* **Tema Escuro de Alto Contraste:** A base visual deve usar o gradiente obsidian com glows azuis/roxos sutis. Textos importantes devem ser brancos (`#ffffff`), e textos de apoio devem usar cinza médio (`#94a3b8`) para não competir pela atenção.
* **Glows Temáticos (Energias):** Os cards e badges de jogadores devem usar a cor da sua energia principal como uma sombra de brilho sutil (box-shadow com blur de 8px a 15px e opacidade de 0.15 a 0.3) para reforçar o tema do deck sem poluir a tela.
* **Holografia:** Elementos campeões ou em 1º lugar no pódio devem usar gradientes lineares animados (`background-size: 200%` com animação suave de `background-position`) simulando o efeito foil das cartas raras de Pokémon TCG.

### 1.2 Efeitos de Feedback e Estado (Interatividade)
* **Hover (Passar o Mouse):** Todo elemento clicável deve reagir de forma sutil e fluida (`transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)`):
  * **Cards:** Devem subir levemente (`transform: translateY(-4px)`), aumentar o brilho da borda e ganhar uma sombra projetada mais forte.
  * **Links e Botões:** Devem ter transição de col para amarelo Pokémon (`#ffcb05`) ou ganhar um sublinhado expansivo a partir do centro.
  * **Linhas da Tabela:** Devem ganhar um fundo levemente iluminado (`rgba(255, 255, 255, 0.02)`) e cursor do tipo `pointer`.
* **Active (Clique):** Ao clicar em botões, tabelas ou cards, adicione um micro-efeito de compressão (`transform: scale(0.98) translateY(-2px)`) para dar retorno tátil virtual ao usuário.

---

## 2. Diretrizes de UX (Experiência do Usuário)

### 2.1 Modais e Lightbox (Foco e Fechamento)
* **Lock Scroll:** Sempre que um modal (detalhes do jogador) ou lightbox (galeria de fotos) estiver ativo, aplique `overflow: hidden` na tag `<body>` para evitar que a página role por trás do modal.
* **Facilidade de Fechamento:** O usuário deve conseguir fechar qualquer modal de 3 formas intuitivas:
  1. Clicando no botão visível de fechar (✕).
  2. Clicando em qualquer área escura fora do modal (overlay).
  3. Pressionando a tecla `Escape (ESC)` no teclado.
* **Foco Visual:** O fundo (overlay) de modais deve ter efeito `backdrop-filter: blur(8px)` além de cor semi-transparente para desfocar o conteúdo secundário e direcionar a atenção ao modal.

### 2.2 Carregamento e Estados Vazios (Feedback do Sistema)
* **Loading State:** Durante o carregamento da planilha do Google Sheets, exiba spinners animados e evite que a tabela apareça vazia ou com erros de código.
* **Empty State:** Se uma busca no ranking não trouxer resultados, exiba uma linha especial centralizada explicando amigavelmente que nenhum treinador foi encontrado com aquele termo, em vez de deixar a tabela em branco.

---

## 3. Responsividade Avançada (Mobile-First)

### 3.1 Alvos de Toque (Touch Targets)
* Botões, links de menu, accordions e linhas clicáveis da tabela devem ter uma área de toque mínima de **44px x 44px** em dispositivos móveis, evitando cliques acidentais e facilitando o uso em celulares de todos os tamanhos.

### 3.2 Tabelas Responsivas em Telas Pequenas
As tabelas de dados costumam quebrar em telas de celulares. Siga estas diretrizes:
* **Scroll Horizontal:** Coloque a tabela dentro de um contêiner com `overflow-x: auto` e `width: 100%`.
* **Preservação de Layout:** Impeça que textos de nomes ou decks quebrem em duas linhas usando `white-space: nowrap` nas células críticas (`td`), garantindo leitura em linha reta.
* **Ocultação Seletiva:** Em telas muito estreitas (abaixo de 480px), utilize classes utilitárias ou CSS media queries para ocultar colunas secundárias de estatísticas e priorizar apenas as colunas vitais: `Posição`, `Treinador` e `Pontos`.

### 3.3 Menu Sanduíche Mobile
* O menu mobile deve deslizar suavemente a partir da lateral ou topo (`transition: left 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)`) em vez de aparecer bruscamente.
* O botão hambúrguer deve animar suas barrinhas para se transformar em um "X" quando o menu estiver ativo, indicando claramente como fechá-lo.
* Ao clicar em qualquer link de navegação do menu móvel, o menu deve se fechar automaticamente para exibir o conteúdo da seção selecionada imediatamente.
