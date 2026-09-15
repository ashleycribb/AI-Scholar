import sys
import os
import json
import duckdb

def query_audit_trail(doi):
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    db_path = os.path.join(base_dir, "tensor_lrs.duckdb")
    
    if not os.path.exists(db_path):
        print(json.dumps({"error": "Database not found"}))
        return

    con = duckdb.connect(db_path)
    try:
        # Search for statements where object.id matches doi
        # DuckDB's JSON support allows querying into the payload
        query = """
            SELECT xapi_payload 
            FROM xapi_audit_trail 
            WHERE CAST(json_extract(xapi_payload, '$.object.id') AS VARCHAR) = ?
            ORDER BY timestamp DESC
            LIMIT 1
        """
        result = con.execute(query, [f"doi:{doi}"]).fetchone()
        
        if result:
            payload = json.loads(result[0])
            print(json.dumps(payload))
        else:
            print(json.dumps({"status": "not_found"}))
            
    except Exception as e:
        print(json.dumps({"error": str(e)}))
    finally:
        con.close()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing DOI"}))
        sys.exit(1)
        
    doi_arg = sys.argv[1]
    query_audit_trail(doi_arg)
