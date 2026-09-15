import sys
import os
import requests
from markitdown import MarkItDown

def ingest_paper(doi, pdf_url, title):
    print(f"[*] Starting ingestion process for: {title}")
    
    # Path setup
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    incoming_dir = os.path.join(base_dir, "incoming")
    vault_dir = os.path.join(base_dir, "vault")
    
    os.makedirs(incoming_dir, exist_ok=True)
    os.makedirs(vault_dir, exist_ok=True)
    
    safe_title = "".join([c if c.isalnum() else "_" for c in title])
    pdf_path = os.path.join(incoming_dir, f"{safe_title}.pdf")
    mdx_path = os.path.join(vault_dir, f"{safe_title}.mdx")
    
    # 1. Download PDF
    if pdf_url and pdf_url != "no_url":
        print(f"[1/3] Downloading PDF from: {pdf_url}")
        try:
            response = requests.get(pdf_url, stream=True, timeout=30)
            with open(pdf_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            print(f"[+] PDF saved to {pdf_path}")
        except Exception as e:
            print(f"[!] Error downloading PDF: {e}")
            sys.exit(1)
    else:
        print("[!] No PDF URL provided. Ingestion aborted.")
        sys.exit(1)
        
    # 2. Run MarkItDown conversion
    print(f"[2/3] Converting PDF to AI-native Markdown...")
    try:
        md = MarkItDown()
        result = md.convert(pdf_path)
        
        with open(mdx_path, 'w', encoding='utf-8') as f:
            f.write(f"---\ndoi: {doi}\ntitle: {title}\ningested_at: {requests.get('https://worldtimeapi.org/api/timezone/Etc/UTC').json()['datetime'] if doi != 'no_doi' else 'now'}\n---\n\n")
            f.write(result.text_content)
        print(f"[+] Markdown saved to {mdx_path}")
    except Exception as e:
        print(f"[!] MarkItDown conversion failed: {e}")
        # Clean up PDF even on failure to avoid clutter
        if os.path.exists(pdf_path): os.remove(pdf_path)
        sys.exit(1)
        
    # 3. Cleanup
    print(f"[3/3] Finalizing and cleaning up...")
    if os.path.exists(pdf_path):
        os.remove(pdf_path)
        print("[+] Raw PDF removed from incoming.")

    # 4. Trigger Logician
    print("[*] Handing off to Logician for verification...")
    try:
        logician_script = os.path.join(base_dir, "nanobots", "logician.py")
        os.system(f"python3 {logician_script} {mdx_path}")
    except Exception as e:
        print(f"[!] Logician handoff failed: {e}")
        
    print(f"[*] Ingestion of \"{title}\" complete. Vault is healthy.")

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python ingestor.py <doi> <pdf_url> <title>")
        sys.exit(1)
        
    doi_arg = sys.argv[1]
    url_arg = sys.argv[2]
    title_arg = sys.argv[3]
    
    ingest_paper(doi_arg, url_arg, title_arg)
