import requests
import os
from dotenv import load_dotenv

load_dotenv()

access_token = os.getenv('ACCESS_TOKEN')
endpoint = "https://graph.microsoft.com/v1.0/me/drive/root/children"
folder_endpoint = "https://graph.microsoft.com/v1.0/me/drive/root:/Documents/MyFolder:/children"
headers = {'Authorization': f'Bearer {access_token}'}

response = requests.get(endpoint, headers=headers)

# Check if the request actually failed
if response.status_code != 200:
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.json()}")
else:
    items = response.json().get('value', [])
    if not items:
        print("Success, but no files found in this specific location.")
    else:
        for item in items:
            print(f"Name: {item['name']} | ID: {item['id']}")

# Testar se eu consigo ler os documentos
# Pensar em como integrar isso com a aplicacao
# Pedir acesso a minha conta pessoal
# Fazer as atualizacoes necessarias no codigo
# Colocar no ar