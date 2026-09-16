# Liga Atlântica de Pokémon TCG

Este é o repositório oficial da **Liga Atlântica de Pokémon TCG**. O projeto consiste em um site moderno e responsivo para acompanhar o ranking, pontuação, calendário de encontros, regulamento e fotos da liga, com sincronização automática a partir de uma planilha do Google Sheets.

---

## 📂 Estrutura do Projeto (Ecosystem)

Para manter o desenvolvimento organizado, separamos as responsabilidades do projeto em diretórios distintos:

### 🌐 Código da Aplicação (Produção)
* **`site/`**: Contém o código-fonte visível do site (HTML, CSS e JavaScript). É a pasta que deve ser enviada para a internet no deploy do **Netlify** ou **GitHub Pages**.
* **`planilha/`**: Scripts Python auxiliares para autenticação (`autenticar.py`) e população automatizada de dados na planilha do Google Drive (`popular_planilha.py`). A estrutura padrão usa as abas `Ranking`, `Partidas`, `Calendario`, `Campeoes`, `Regras` e `Galeria`.

### 🧠 Ecossistema de Inteligência Artificial (AI Workspace)
* **`agents/`**: Perfis de atuação de IA (definição de tarefas para o Agente do Site e o Agente da Planilha).
* **`skills/`**: Manuais de regras procedimentais e checklists que a IA lê e valida ao programar (padrão de CSS, padrões de UI/UX responsivo e estrutura de banco de dados).
* **`system/`**: Pasta reservada para configurações técnicas de ambiente e prompts básicos de sistema.

### 📖 Documentação e Guias
* **`docs/`**: Documentos estáticos de ajuda e especificações para humanos (desenvolvedores e organizadores).
  * [COMO_CONFIGURAR_PLANILHA.md](file:///d:/DELIPE/LigaAtl%C3%A2ntica/docs/COMO_CONFIGURAR_PLANILHA.md) (Guia de abas e colunas do Google Sheets)
  * [COMO_OBTER_CREDENCIAIS.md](file:///d:/DELIPE/LigaAtl%C3%A2ntica/docs/COMO_OBTER_CREDENCIAIS.md) (Guia de API do Google Cloud)
  * **`acoes-eventos/`**: Manuais de ações operacionais e diretrizes dos eventos da liga.
    * [README.md](file:///d:/DELIPE/LigaAtl%C3%A2ntica/docs/acoes-eventos/README.md) (Apresentação da pasta)
    * [acoes.md](file:///d:/DELIPE/LigaAtl%C3%A2ntica/docs/acoes-eventos/acoes.md) (Diretrizes administrativas, penalidades e suporte)
    * [eventos.md](file:///d:/DELIPE/LigaAtl%C3%A2ntica/docs/acoes-eventos/eventos.md) (Formatos de torneios, estrutura e premiações)

---

## 🚀 Como Executar o Site

1. Abra a pasta `site/` no seu explorador de arquivos.
2. Dê um duplo clique no arquivo **`index.html`** para abrir o site no navegador.
3. Para colocar na internet, faça o upload da pasta `site/` no **GitHub** ou no **Netlify**.
