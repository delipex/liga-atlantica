---
name: integracao_sheets
description: Validações e padrões de dados para integração com o Google Sheets.
---

# Skill: Integração com Google Sheets (Padrão de Dados)

Esta Skill define os padrões e validações para a estrutura de dados da planilha e scripts de integração.

## 1. Padrões de Formatação de Dados
Ao ler ou atualizar dados da planilha, siga rigorosamente as regras abaixo:
* **Historico**: Deve possuir exatamente o padrão de colocações separadas por ponto e vírgula `;`. Exemplo: `5;-;1` (onde 5 representa a 5ª colocação, hífen indica ausência, e 1 representa a 1ª colocação).
* **TipoEnergia**: O valor de deck da planilha deve coincidir com as classes de energia definidas no CSS. Escolha exclusivamente um valor em minúsculo:
  * `grass` (Grama / Verde)
  * `fire` (Fogo / Vermelho)
  * `water` (Água / Azul)
  * `lightning` (Elétrico / Amarelo)
  * `psychic` (Psíquico / Roxo)
  * `fighting` (Luta / Laranja)
  * `darkness` (Escuridão / Cinza Escuro)
  * `metal` (Metal / Prateado)
  * `dragon` (Dragão / Dourado)
  * `colorless` (Incolor / Branco)
* **Data**: Sempre no formato ISO `AAAA-MM-DD` para eventos (`Calendario`, `etapas/`) e `Mês/Ano` para campeões (`Campeoes`).
* **Jogador (Nome e Sobrenome)**: Os nomes de todos os jogadores devem ser salvos com a primeira letra de cada nome e sobrenome em maiúscula (ex: `Gabriel Seixas`, `João Pedro Oliveira`). Preposições de ligação curtas (como `de`, `da`, `do`, `dos`, `das`) devem ser mantidas em minúscula (ex: `Caio da Silva`, `Enzo dos Anjos`). Evite letras totalmente maiúsculas ou minúsculas.

## 2. Padrões de Integração da Planilha
* **Validação de Linhas vazias**: Ao ler ou gravar, ignore linhas que estejam totalmente vazias para evitar erros de índice ou XSS.
* **Mapeamento de Planilha**: A planilha serve como cadastro centralizado de jogadores (`Jogadores` para nomes, IDs e categorias oficiais) e decks (`Decks` para mapeamento de archetipos e imagens/ícones).
