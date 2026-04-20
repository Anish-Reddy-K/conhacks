#!/usr/bin/env python3
"""Simple app selector server. Run from conhacks/selector/"""

import sqlite3
import json
import csv
import io
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

DB_PATH = "/Users/anishreddy/Code/pocketbase/pb_data/data.db"

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/applications":
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT id, created, first_name, last_name, email, phone, age, "
                "school, level_of_study, country, linkedin_url, "
                "dietary_restrictions, dietary_other, "
                "conhacks_college_student, conhacks_in_person, additional_comments "
                "FROM applications ORDER BY first_name, last_name"
            ).fetchall()
            conn.close()
            data = [dict(r) for r in rows]
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(data).encode())
            return

        # Serve index.html by default
        if parsed.path == "/":
            self.path = "/index.html"
        super().do_GET()

if __name__ == "__main__":
    print("Selector running at http://localhost:8888")
    HTTPServer(("", 8888), Handler).serve_forever()
