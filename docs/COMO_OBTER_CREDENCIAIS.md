# Como Obter o arquivo `credentials.json` do Google Cloud

Para permitir que os scripts Python se conectem e editem a sua planilha diretamente no seu Google Drive, precisamos de um arquivo de autorização fornecido pelo Google Cloud. 

Siga os passos abaixo para obtê-lo (leva cerca de 3 a 5 minutos):

---

## Passo 1: Criar um Projeto no Google Cloud

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/).
2. Faça login com a mesma conta de e-mail que é dona da planilha do Google Sheets.
3. No topo esquerdo, clique no seletor de projetos e depois em **Novo Projeto** (New Project).
4. Dê o nome de `Liga Atlantica` e clique em **Criar** (Create).
5. Certifique-se de que o novo projeto está selecionado no seletor de projetos no topo da página.

---

## Passo 2: Ativar as APIs do Sheets e do Drive

Precisamos dar permissão ao projeto para usar as ferramentas de planilhas e arquivos:

1. No menu lateral esquerdo (ou na barra de pesquisa no topo), clique em **APIs e Serviços** (APIs & Services) e depois em **Biblioteca** (Library).
2. Procure por `Google Sheets API`, clique nela e clique em **Ativar** (Enable).
3. Volte à biblioteca, procure por `Google Drive API`, clique nela e clique em **Ativar** (Enable).

---

## Passo 3: Configurar a Tela de Consentimento OAuth (Tela de Login)

O Google precisa saber quem está tentando se conectar:

1. No menu lateral esquerdo, vá em **APIs e Serviços** -> **Tela de consentimento OAuth** (OAuth consent screen).
2. Escolha o tipo de usuário **Externo** (External) e clique em **Criar** (Create).
3. Preencha apenas os campos obrigatórios:
   * **Nome do app**: `Liga Atlantica App`
   * **E-mail de suporte ao usuário**: (Seu próprio e-mail)
   * **Dados de contato do desenvolvedor**: (Seu próprio e-mail)
4. Clique em **Salvar e Continuar** (Save and Continue).
5. Na aba de **Escopos** (Scopes), clique em **Salvar e Continuar** sem alterar nada.
6. Na aba de **Usuários de teste** (Test users), clique em **Add Users** e adicione o seu próprio e-mail (o mesmo que você usará para logar e que é dono da planilha). *Este passo é obrigatório para projetos em desenvolvimento.*
7. Clique em **Salvar e Continuar** e finalize.

---

## Passo 4: Criar a Credencial de Desktop

1. No menu lateral esquerdo, clique em **Credenciais** (Credentials).
2. No topo, clique em **+ Criar Credenciais** (+ Create Credentials) e escolha **ID do cliente OAuth** (OAuth client ID).
3. No campo **Tipo de aplicativo** (Application type), selecione **App de Desktop** (Desktop App).
4. No campo **Nome**, digite `Liga Desktop` e clique em **Criar** (Create).
5. Uma janela aparecerá confirmando a criação. Feche-a.
6. Na lista de IDs de cliente OAuth, localize a credencial que você acabou de criar. Clique no ícone de **Download** (Baixar JSON) no lado direito da linha.
7. O arquivo baixado terá um nome longo (ex: `client_secret_xxxxxx.json`). Renomeie este arquivo exatamente para:
   `credentials.json`
8. Coloque este arquivo `credentials.json` dentro da pasta `planilha/` no diretório do seu projeto.

---

## Próximo Passo

Assim que o arquivo estiver na pasta `planilha/`, avise-me aqui no chat para rodarmos o script de autenticação!
