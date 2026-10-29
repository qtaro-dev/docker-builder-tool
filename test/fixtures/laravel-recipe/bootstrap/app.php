<?php
// 検証専用の最小Laravel。HTTP/DB検査だけを実行する。
return Illuminate\Foundation\Application::configure(basePath: dirname(__DIR__))
    ->withRouting(using: function () { require __DIR__.'/../routes/web.php'; })
    ->withExceptions(function (Illuminate\Foundation\Configuration\Exceptions $exceptions) {})
    ->create();
