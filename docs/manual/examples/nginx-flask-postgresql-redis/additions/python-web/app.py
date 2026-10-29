# 利用者が追加する学習用Flask。DB・RedisはComposeのサービス名で接続する。
import os
import psycopg
import redis
from flask import Flask, request, jsonify
from cache_service import CacheService
app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 1024
cache = redis.Redis.from_url(os.environ['REDIS_URL'], decode_responses=True, socket_connect_timeout=2, socket_timeout=2)

def connect():
    return psycopg.connect(host=os.environ['DB_HOST'], port=5432, dbname=os.environ['DB_NAME'], user=os.environ['DB_USER'], password=os.environ['DB_PASSWORD'], connect_timeout=3, options='-c statement_timeout=3000')

def read_db():
    with connect() as conn:
        row = conn.execute('SELECT value FROM recipe_values WHERE name = %s', ('demo',)).fetchone()
        if row is None:
            raise RuntimeError('initialize database')
        return row[0]

def write_db(value):
    with connect() as conn:
        conn.execute('INSERT INTO recipe_values(name,value) VALUES(%s,%s) ON CONFLICT(name) DO UPDATE SET value=EXCLUDED.value', ('demo', value))

service = CacheService(read_db, write_db, cache)

@app.get('/health')
def health():
    try:
        read_db()
        if not cache.ping():
            raise RuntimeError('cache unavailable')
        return jsonify(ok=True)
    except Exception:
        return jsonify(error='dependency-unavailable'), 503

@app.get('/value')
def get_value():
    try:
        return jsonify(service.get_value())
    except Exception:
        return jsonify(error='dependency-unavailable'), 503

@app.post('/value')
def set_value():
    body = request.get_json(silent=True)
    try:
        return jsonify(service.set_value(body.get('value') if isinstance(body, dict) else None))
    except ValueError as error:
        return jsonify(error=str(error)), 400
    except Exception:
        return jsonify(error='dependency-unavailable'), 503
