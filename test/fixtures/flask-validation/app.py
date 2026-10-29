# Docker生成物の起動検証専用fixture。利用者のアプリは生成しない。
from flask import Flask, jsonify

app = Flask(__name__)

@app.get("/")
def index():
    return jsonify(fixture="docker-builder-ci-flask")
