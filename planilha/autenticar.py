import os
import sys
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
import pickle

# Escopos necessários: Acesso completo para ler e gravar nas planilhas e Drive
SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive'
]

def main():
    print("=== Inicializando Autenticação do Google Sheets API ===")
    
    # Caminhos dos arquivos
    base_dir = os.path.dirname(os.path.abspath(__file__))
    credentials_path = os.path.join(base_dir, 'credentials.json')
    token_path = os.path.join(base_dir, 'token.pickle')
    
    # Verificar se o credentials.json existe
    if not os.path.exists(credentials_path):
        print("\n[ERRO] O arquivo 'credentials.json' nao foi encontrado na pasta 'planilha/'!")
        print("Por favor, siga as instrucoes no guia 'planilha/COMO_OBTER_CREDENCIAIS.md' para baixa-lo.")
        sys.exit(1)
        
    creds = None
    # O arquivo token.pickle armazena os tokens de acesso e atualizacao do usuario
    if os.path.exists(token_path):
        with open(token_path, 'rb') as token:
            creds = pickle.load(token)
            
    # Se nao houver credenciais validas disponiveis, solicita o login do usuario
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            print("Atualizando token de acesso expirado...")
            try:
                creds.refresh(Request())
            except Exception as e:
                print(f"Erro ao atualizar token: {e}. Iniciando novo login...")
                creds = None
                
        if not creds:
            print("\nIniciando fluxo de login no navegador...")
            print("Uma janela de login do Google devera abrir automaticamente.")
            print("Caso nao abra, clique no link exibido no console.\n")
            
            try:
                flow = InstalledAppFlow.from_client_secrets_file(credentials_path, SCOPES)
                creds = flow.run_local_server(port=0)
            except Exception as e:
                print(f"\n[ERRO] Ocorreu uma falha durante o login: {e}")
                sys.exit(1)
                
        # Salva as credenciais para a proxima execucao
        with open(token_path, 'wb') as token:
            pickle.dump(creds, token)
            
    print("\n[SUCESSO] Autenticado com sucesso!")
    print("O arquivo de acesso 'token.pickle' foi salvo com sucesso na pasta 'planilha/'.")

if __name__ == '__main__':
    main()
