# 利用者追加の接続確認用Flask。開発用途のみ。
import os
from flask import Flask, jsonify
import psycopg
app = Flask(__name__)
@app.get('/')
def check():
    try:
        with psycopg.connect(host=os.environ['DB_HOST'], port=5432, dbname=os.environ['DB_NAME'], user=os.environ['DB_USER'], password=os.environ['DB_PASSWORD'], connect_timeout=3) as conn:
            value = conn.execute('SELECT 42').fetchone()[0]
        return jsonify(ok=value == 42, value=value)
    except Exception:
        return jsonify(ok=False, error='dependency-not-ready'), 503
