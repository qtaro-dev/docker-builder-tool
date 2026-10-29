# 利用者追加の接続確認用Flask。開発用途のみ。
import os
from flask import Flask, jsonify

app = Flask(__name__)
@app.get('/')
def check():
    try:
        value = 42
        return jsonify(ok=value == 42, value=value)
    except Exception:
        return jsonify(ok=False, error='dependency-not-ready'), 503
