# docker-builder-tool

Docker / docker-compose の設定ファイルを GUI 操作で生成するための **Electron 製デスクトップツール** です。

複数のミドルウェア（Web / DB / Cache / 管理ツール等）を選択し、docker-compose.yml を組み立てる用途を想定しています。

次期開発版v0.3.0のイメージ選択・オンライン更新・サービス別保存の使い方と未検証事項は、[開発記録](docs/v0.3.0-development.md)を参照してください。公開済みの安定版はv0.2.2です。

生成した6構成をGitHub-hosted runnerでビルド・起動・HTTP/DB確認する[Docker検証CI](docs/docker-validation-ci.md)と、[UI操作・生成物の再現手順](docs/docker-validation-manual.md)を用意しています。ローカルDockerは不要です。実際のActions結果は手順書の実行記録を参照してください。

アプリ本体にはGitHub認証・トークン管理・生成物の送信・Actions起動を追加しません。[GitHub非連携方針と調査結果](docs/github-integration-policy.md)を参照してください。開発用CIとDocker Hub更新は維持します。

---

## 概要

Docker 構成ファイルを手動で記述する手間を削減し、
GUI 操作で再利用可能な docker-compose.yml を生成できることを目的としたツールです。

Docker 初学者や検証環境を素早く構築したいユーザー向けに、
モジュール選択方式で構成を組み立てられる設計になっています。

---

## 主な機能

* Electron によるクロスプラットフォーム対応デスクトップアプリ
* モジュール選択式 UI

  * Nginx / Apache
  * MySQL / MariaDB / PostgreSQL
  * Redis / Memcached
  * WordPress / Redmine / Jenkins
  * Portainer / phpMyAdmin
  * Ollama など
* 選択したモジュール構成から docker-compose.yml を自動生成
* UI 設定（テーマ切り替えなど）
* モジュールは JS ファイル単位で追加・管理可能（拡張性を考慮した設計）

---

## 設計思想

* 手動で docker-compose を記述する負担を軽減
* 検証環境の迅速な立ち上げを支援
* モジュール単位で構成を管理し、拡張しやすいアーキテクチャを採用
* GUI ベースで視覚的に構成を理解できる設計

---

## 技術構成

* Electron
* JavaScript (ES6)
* HTML / CSS
* Node.js
* Docker / docker-compose（生成対象）

---

## ディレクトリ構成（抜粋）

```
app/
├─ index.html
├─ src/
│  ├─ renderer/
│  ├─ modules/
│  └─ img/
├─ style.css
main.js
preload.js
package.json
settings.json
```

---

## 起動方法（開発用）

```bash
npm install
npm start
```

---

## Screenshots

### モジュール選択

![Module Selection](docs/screenshots/main.png)

### モジュール設定入力画面

![Configuration Input](docs/screenshots/generate_setting.png)

### 生成結果画面

![Generated Result](docs/screenshots/generate_files.png)

---

## 今後の拡張予定（例）

* テンプレート保存機能
* バリデーション強化
* 生成前の構成プレビュー表示
* クラウド環境向け設定プリセット対応

---

## 開発背景

Docker 構成を GUI で生成できるツールがあれば、
検証環境構築や学習用途に有用であると考え開発。

当初はC#で開発を試みたが、UI変更の柔軟性や試行錯誤の速度を重視し、Electronへ移行。
フロントエンド技術を活かしたレイヤー設計を採用した。

個人開発プロジェクトとして設計・実装を行っています。
