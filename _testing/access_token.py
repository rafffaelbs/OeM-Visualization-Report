import os
from dotenv import load_dotenv
import msal
import webbrowser

load_dotenv()

CLIENT_ID = os.getenv('AZURE_CLIENT_ID')
TENANT_ID = os.getenv('AZURE_TENANT_ID')
AUTHORITY = f"https://login.microsoftonline.com/{TENANT_ID}"
SCOPES = ["Files.ReadWrite"]

app = msal.PublicClientApplication(CLIENT_ID, authority=AUTHORITY)

accounts = app.get_accounts()
result = None

if accounts:
    print("Theres accounts", accounts)
    result = app.acquire_token_silent(SCOPES, account=accounts[0])

if not result:
    print("No valid token found. Opening browser for login")
    result = app.acquire_token_interactive(scopes=SCOPES)

if "access_token" in result:
    print("Authentication Sucessfull")
    access_token = result['access_token']
    print(result['access_token'])

else:
    print(f"Error: {result.get('error_description')}")

