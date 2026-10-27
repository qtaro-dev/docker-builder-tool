<?php
return [
    'name' => 'Laravel recipe CI fixture', 'env' => 'testing', 'debug' => false,
    'url' => env('APP_URL', 'http://localhost'), 'timezone' => 'UTC',
    'locale' => 'en', 'fallback_locale' => 'en', 'cipher' => 'AES-256-CBC',
    // 公開可能な固定テスト値。秘密鍵として使わない。
    'key' => 'base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
];
