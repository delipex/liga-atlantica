# 🎨 Liga Atlântica - Design System

Este documento centraliza as diretrizes visuais, tokens e componentes do ecossistema do site da **Liga Atlântica**. 
Nossa nova linguagem visual é fundamentada na estética **Glassmorphism**, combinada com uma atmosfera "Dark Premium" e acentos vibrantes inspirados no universo Pokémon competitivo.

---

## 1. Princípios de Design

- **Profundidade e Camadas:** Utilizamos fundos translúcidos com desfoque (*blur*) para criar a sensação de "vidro fumê". A interface inteira flutua sobre um fundo reativo.
- **Contraste Direcionado:** O fundo é quase preto, fazendo com que as cores primárias (Amarelo, Verde, Vermelho, Azul) saltem aos olhos quando necessário.
- **Dinamismo Suave:** Os elementos interagem com animações e transições naturais (ex: Pokébolas gigantes se movendo no fundo).

---

## 2. Tipografia

- **Fonte de Títulos (Headings & Números):** `'Outfit', sans-serif`
  - Utilizada para criar impacto, exibir o *Rank* dos jogadores e os títulos principais das abas.
  - Variações: Extra-Bold (800), Bold (700).
- **Fonte de Corpo (Body Text):** `'Inter', sans-serif`
  - Focada em altíssima legibilidade nas tabelas, textos longos e descrições técnicas.
  - Variações: Regular (400), Semi-Bold (600).

---

## 3. Paleta de Cores (Design Tokens)

### 3.1 Cores Base (Fundo e Estrutura)
- `--bg-dark`: `#090a0f` *(Preto azulado muito escuro - Fundo Principal)*
- `--bg-dark-card`: `rgba(18, 20, 31, 0.65)` *(Preenchimento de cartões)*
- `--border-color`: `rgba(255, 255, 255, 0.08)` *(Bordas sutis das tabelas e vidros)*

### 3.2 Cores de Texto
- `--text-primary`: `#ffffff` *(Branco puro para alta legibilidade)*
- `--text-secondary`: `#9ca3af` *(Cinza claro para descrições, headers de tabela e subtítulos)*

### 3.3 Cores de Acento (Semântica)
- `--accent-yellow`: `#ffcb05` *(Amarelo Pokémon - Ação Primária, Destaque, Hover, Solrock)*
- `--accent-blue`: `#3b82f6` *(Azul Pokémon - Ação Secundária, Links, Botão de Pódios)*
- `--accent-green`: `#10b981` *(Verde - Sucesso, Vitórias, WhatsApp)*
- `--accent-red`: `#ef4444` *(Vermelho - Perigo, Derrotas)*

---

## 4. Efeitos Especiais (Glassmorphism)

O efeito de vidro é o coração visual do site. Ele é aplicado usando duas classes principais:

### `glass-card`
- **Fundo:** Translúcido (`rgba(18, 20, 31, 0.65)`)
- **Desfoque:** `backdrop-filter: blur(12px)`
- **Sombra interna e externa:** `box-shadow` combinando um leve brilho no topo da borda para imitar a refração da luz no vidro cortado.

### Animação de Fundo (`.bg-blobs`)
- **Conceito:** "Pokébolas Móveis". 3 círculos massivos (Vermelho, Branco, Azul) ficam girando em ciclo infinito por trás da camada de vidro.
- **Desfoque (Blur):** `90px`, o que torna impossível distinguir a forma geométrica, criando apenas auréolas dinâmicas de luz passando pelo site.

---

## 5. Componentes Principais

### 5.1 Tabelas de Ranking (`.ranking-table`)
A estrutura central do site.
- Sem bordas laterais para manter o design limpo.
- Espaçamento interno de `1rem`.
- Linhas que reagem ao mouse com um efeito de `.hover` destacando o fundo e aplicando transparência na borda.
- **Top 3:** Recebe as classes exclusivas `.rank-1`, `.rank-2`, `.rank-3` que não têm bordas comuns, e sim marcações sutis na margem para focar estritamente no contraste.

### 5.2 Botões (`.btn`)
- Sem bordas quadradas, usando `border-radius: var(--radius)`.
- Todos possuem transições `0.3s ease` em Background, Color e Transform.
- **Hover State:** Os botões principais (`.btn-whatsapp`, `.btn-primary`) "acendem" ao receber o mouse, subindo `-2px` (`translateY`) e emitindo um brilho (`box-shadow` com cor de acento).

### 5.3 Controles de Navegação (Tabs)
As abas do menu de navegação do App (`.nav-link`).
- O estado inativo mescla com o fundo escuro.
- O estado `.active` adquire um background luminoso (`rgba(255, 203, 5, 0.1)`) e texto amarelo sólido.

### 5.4 Ícones e SVG (Solrock / Lunatone)
- Utilizados como âncoras temáticas no toggle do site.
- Desenhados no código para escalabilidade perfeita, sem bordas/strokes rígidos. O efeito visual é chapado (Flat Design), permitindo a herança do `currentColor`.

---

## 6. Responsividade (Mobile First Adapations)

- Em telas menores que `768px`, as tabelas permitem scroll horizontal seguro (`.table-responsive`).
- Em telas menores que `500px`, os avatares dos jogadores na tabela (`.player-avatar`) são ocultados para focar nos dados rígidos (Pontos/V/E/D).
- O grid do administrador muda automaticamente de 2 colunas para 1 coluna empilhada.
