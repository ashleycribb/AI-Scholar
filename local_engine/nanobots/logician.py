import sys
import os
import json
import duckdb
import uuid
from datetime import datetime

def analyze_markdown(file_path):
    print(f"[*] Logician starting analysis on: {file_path}")
    
    # Load knowledge base
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    kb_path = os.path.join(base_dir, "knowledge_base", "edtech", "manual.json")
    
    with open(kb_path, 'r') as f:
        rules = json.load(f)
        
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Extract DOI from frontmatter if possible
    doi = "unknown"
    if "doi: " in content:
        doi = content.split("doi: ")[1].split("\n")[0].strip()

    # Verification Logic
    violations = []
    for term in rules['prohibited_terms']:
        if term.lower() in content.lower():
            violations.append(f"Prohibited term found: {term}")
            
    has_methodology = rules['required_methodology'].lower() in content.lower()
    if not has_methodology:
        violations.append(f"Missing required methodology: {rules['required_methodology']}")

    status = "Verified" if not violations else "Disputed"
    print(f"[!] Logician Status: {status}")
    if violations:
        for v in violations:
            print(f"    - Violation: {v}")

    # Generate xAPI Payload
    xapi_payload = {
        "id": str(uuid.uuid4()),
        "actor": {
            "name": "Logician Nanobot",
            "mbox": "mailto:logician@scholar-explorer.local"
        },
        "verb": {
            "id": "http://adlnet.gov/expapi/verbs/verified" if status == "Verified" else "http://adlnet.gov/expapi/verbs/disputed",
            "display": {"en-US": status.lower()}
        },
        "object": {
            "id": f"doi:{doi}",
            "definition": {
                "name": {"en-US": os.path.basename(file_path)},
                "type": "http://adlnet.gov/expapi/activities/scholarly-article"
            }
        },
        "result": {
            "success": status == "Verified",
            "extensions": {
                "https://scholar-explorer.com/violations": violations
            }
        },
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }

    # Log to DuckDB
    log_to_lrs(xapi_payload)
    return status

def log_to_lrs(payload):
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    db_path = os.path.join(base_dir, "tensor_lrs.duckdb")
    
    print(f"[*] Logging to Tensor LRS at {db_path}...")
    
    con = duckdb.connect(db_path)
    try:
        # Mock embedding (768 zeros)
        mock_embedding = [0.0] * 768
        
        con.execute(
            "INSERT INTO xapi_audit_trail (statement_id, xapi_payload, embedding_tensor) VALUES (?, ?, ?)",
            [payload['id'], json.dumps(payload), mock_embedding]
        )
        print("[+] Statement successfully committed to DuckDB Table.")
    except Exception as e:
        print(f"[!] Error writing to DuckDB: {e}")
    finally:
        con.close()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python logician.py <mdx_path>")
        sys.exit(1)
        
    mdx_file = sys.argv[1]
    if os.path.exists(mdx_file):
        analyze_markdown(mdx_file)
    else:
        print(f"[!] File not found: {mdx_file}")
        sys.exit(1)
