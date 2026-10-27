# 利用者追加の接続確認用Flask。開発用途のみ。
import os
from flask import Flask, jsonify
import redis
app = Flask(__name__)
@app.get('/')
def check():
    try:
        client = redis.Redis.from_url(os.environ['REDIS_URL'], socket_connect_timeout=3, socket_timeout=3)
        try:
            client.set('recipe:check', '42', ex=60)
            value = int(client.get('recipe:check'))
        finally:
            client.close()
        return jsonify(ok=value == 42, value=value)
    except Exception:
        return jsonify(ok=False, error='dependency-not-ready'), 503
