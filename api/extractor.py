import json
from http.server import BaseHTTPRequestHandler
import urllib.parse
import requests
import pandas as pd

API_URL = "https://api.messefrankfurt.com/service/esb_api/exhibitor-service/api/2.1/public/exhibitor/search"
# This API KEY was extracted from the public JS bundle. 
# It's highly likely to be reused across ar.messefrankfurt.com events.
API_KEY = "LXnMWcYQhipLAS7rImEzmZ3CkrU033FMha9cwVSngG4vbufTsAOCQQ=="

def get_event_variable(url: str) -> str:
    """Extrae la variable del evento (ej. HOTELGA) a partir de la URL."""
    try:
        parsed = urllib.parse.urlparse(url)
        host = parsed.hostname
        if not host:
            return "HOTELGA"
        # hotelga.ar.messefrankfurt.com -> hotelga -> HOTELGA
        subdomain = host.split(".")[0]
        # Si por alguna razon el subdomain no parece un evento, aplicamos predeterminado
        if subdomain in ["www", "ar", "messefrankfurt"]:
            return "HOTELGA"
        return subdomain.upper()
    except:
        return "HOTELGA"

def fetch_page(event_variable: str, page_number: int, page_size: int = 90) -> dict:
    headers = {
        "apikey": API_KEY,
        "Accept": "application/json",
        "Origin": f"https://{event_variable.lower()}.ar.messefrankfurt.com", 
    }
    params = {
        "findEventVariable": event_variable,
        "pageNumber": page_number,
        "pageSize": page_size,
    }
    resp = requests.get(API_URL, headers=headers, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()

def extract_emails(data: dict) -> list[dict]:
    results = []
    for hit in data.get("hits", []):
        exhibitor = hit.get("exhibitor", {})
        address = exhibitor.get("address", {})
        # Solo agregar a los que tienen email o todos
        results.append({
            "expositor": exhibitor.get("displayName", "N/A"),
            "email": address.get("email", ""),
            "stand": hit.get("boothId", ""),
            "website": address.get("website", "")
        })
    return results

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)
        
        try:
            body = json.loads(post_data.decode('utf-8'))
            url = body.get('url', '')
            
            if not url or 'messefrankfurt.com' not in url:
                self.send_error_response(400, "Por favor incluye un enlace válido de Messe Frankfurt.")
                return

            event_variable = get_event_variable(url)
            
            all_records = []
            page = 1
            while page <= 10:  # Safety limit of 10 pages to avoid infinite loops
                data = fetch_page(event_variable, page, 90)
                records = extract_emails(data)
                all_records.extend(records)
                
                total = data.get("totalCount", 0)
                if len(all_records) >= total or not records:
                    break
                page += 1

            # Filtrar los resultados
            df = pd.DataFrame(all_records)
            if not df.empty:
                # Opcional: limpiar filas sin email para priorizar el objetivo principal
                # df = df[df["email"].str.strip() != ""]
                df = df.fillna("")
                final_results = df.to_dict('records')
            else:
                final_results = []
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                "success": True,
                "data": final_results,
                "total": len(final_results),
                "event": event_variable
            }).encode('utf-8'))
            
        except requests.exceptions.RequestException as e:
            self.send_error_response(502, f"Error técnico (HTTP: {e.response.status_code if e.response else 'Desconocido'}): No pudimos comunicarnos con el servidor de la exposición. Tal vez cerraron el acceso.")
        except Exception as e:
            self.send_error_response(500, f"Oh no, algo salió mal internamente: {str(e)}")

    def send_error_response(self, code, message):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({
            "success": False,
            "error": message
        }).encode('utf-8'))
