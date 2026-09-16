---
name: desenvolvimento_web
description: Padrões e boas práticas para desenvolvimento web e código frontend.
---

# Skill: Desenvolvimento Web (Padrão de Código do Site)

Esta Skill define os padrões e boas práticas para edição dos arquivos localizados na pasta `site/`.

## 1. Padrão de Estilos e Layout
* **Cores**: Use as variáveis CSS definidas no arquivo `style.css` (ex: `var(--bg-primary)`, `var(--accent-yellow)`). Não declare cores absolutas como `#ff0000`.
* **Glassmorphism**: Aplique o padrão de painel transparente usando:
  ```css
  background: var(--card-bg);
  backdrop-filter: blur(12px);
  border: 1px solid var(--border-color);
  ```
* **Responsividade**: Todo novo container de grid deve ter regras de fallback responsivas usando CSS Grid ou Flexbox:
  ```css
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
  ```

## 2. Padrão JavaScript (Single Page Application)
* **Rotas SPA**: Toda nova tela deve ser inserida como uma tag `<section>` dentro de `index.html` com a classe `section`, e a navegação deve ser gerenciada em `app.js` alterando a classe `.active`.
* **Renderização Dinâmica**: Os dados obtidos da planilha (ou mock data) devem ser injetados usando Template Literals com escapes adequados para evitar XSS.
* **Fallback de Dados**: O site NUNCA deve ficar quebrado caso a requisição para a planilha falhe. O `app.js` deve utilizar o objeto `MOCK_DATA` como fallback caso o carregamento do Sheets lance um erro.
