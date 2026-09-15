import duckdb
import os

def init_db():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    db_path = os.path.join(base_dir, "tensor_lrs.duckdb")
    
    print(f"[*] Initializing DuckDB Tensor LRS at {db_path}")
    
    # Connect (creates file if not exists)
    con = duckdb.connect(db_path)
    
    try:
        # Load VSS extension
        print("[*] Loading VSS (Vector Similarity Search) extension...")
        con.execute("INSTALL vss;")
        con.execute("LOAD vss;")
        
        # Create xAPI audit trail table
        print("[*] Creating xapi_audit_trail table...")
        con.execute("""
            CREATE TABLE IF NOT EXISTS xapi_audit_trail (
                statement_id VARCHAR PRIMARY KEY,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                xapi_payload JSON,
                embedding_tensor FLOAT[768]
            )
        """)
        
        print("[+] Audit Trail initialized.")
        
        # Create a simple index on timestamp for performance
        con.execute("CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON xapi_audit_trail (timestamp)")
        
        print("[*] Database schema finalized.")
        
    except Exception as e:
        print(f"[!] Initialization error: {e}")
    finally:
        con.close()
        print("[*] Connection closed.")

if __name__ == "__main__":
    init_db()
