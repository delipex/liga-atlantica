# Liga Atlântica TCG - Project Agent Guidelines and Rules

This document outlines the rules, constraints, and instructions for AI agents working on this repository.

## 1. Sheet Agent Guidelines (Agente da Planilha)
The sheet agent manages the structure, scripts, and OAuth2 integration in the `planilha/` folder.
* **Abas e Colunas**: A planilha física deve conter abas específicas (`Jogadores`, `Decks`, `Configuracoes`, `Metagame`, `ScoresAntigos`, etc.) com os nomes de colunas exatos.
* **Robustez**: Scripts de carregamento de planilhas e TDFs devem tratar erros de rede amigavelmente.
* **Segurança**: Credenciais locais e tokens de acesso temporários NUNCA devem ser expostos ou versionados no repositório.

## 2. Site Agent Guidelines (Agente do Site)
The site agent manages the frontend code inside the `site/` folder:
* **Design Premium**: Sempre use glassmorphism (`backdrop-filter: blur`), gradientes e transições fluidas.
* **Temas de Energia**: Mapeie cores de badges e pódios conforme as energias Pokémon (grass, fire, water, lightning, psychic, fighting, darkness, metal, dragon, colorless).
* **Responsividade**: Assegurar visualização otimizada em dispositivos móveis, tablets e computadores.
* **SEO & Semântica**: Utilizar HTML5 semântico e tags meta para manter relevância de SEO.

## 3. General Behavioral Rules
* Respeite estritamente as configurações de planilha (como o pódio `congelado` ou `auto`).
* Mantenha backups de ranking e utilize scripts de validação de dados para prevenir commits de dados corrompidos.
