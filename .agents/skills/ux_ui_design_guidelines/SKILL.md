---
name: ux_ui_design_guidelines
description: Diretrizes de UX/UI, Material Design e Glassmorphism.
---

# UX/UI, Material Design & Glassmorphism Guidelines

Esta "skill" contém as regras de ouro para produção de interface, garantindo usabilidade, legibilidade e compatibilidade perfeita entre os modos Claro e Escuro.

## 1. Variáveis de Design System (CSS Tokens)
- **Regra Absoluta:** NUNCA utilize cores "hardcoded" (ex: `rgba(0,0,0,0.8)` ou `#333`) soltas no código CSS.
- Sempre utilize as variáveis do `:root` (como `var(--bg-dark-card)`, `var(--text-primary)`, `var(--border-color)`). Isso garante que quando o tema for alterado para `[data-theme="light"]`, o elemento se adapte instantaneamente.

## 2. Contraste e Legibilidade (Acessibilidade UX)
- O texto deve sempre ter alto contraste com o fundo. Textos secundários ou de rodapé não podem "sumir" contra fundos escuros/claros.
- Evite caixas escuras opacas no Modo Claro. Um widget dentro de uma página clara deve usar um tom ligeiramente mais escuro que o fundo branco/gelo, e não um bloco cinza chumbo ou preto.

## 3. Estética Premium e Glassmorphism
- **Sombras Múltiplas:** Para criar profundidade, use sombras compostas (ex: `var(--shadow-lg)`) em vez de bordas duras de 1px sólidas.
- **Transparência e Blur:** Utilize `backdrop-filter: blur(24px) saturate(150%)` aliado a cores de fundo com pouca opacidade (ex: `rgba(255,255,255,0.6)` no claro, ou `rgba(15,23,42,0.4)` no escuro) para criar o efeito vidro real.
- **Clean UI:** "Menos é mais". Se você puder separar dois elementos por espaçamento (margin/padding) ou por uma leve sombra, evite colocar uma linha de borda separando-os.

## 4. Coerência Visual (UI)
- Todos os componentes, desde o Cabeçalho até o Rodapé, passando por modais e botões, devem pertencer à mesma família visual. Se o site adota cantos arredondados (`var(--radius-lg)`), não utilize botões totalmente quadrados.
