<?php
// routes/web.phpへ追加する断片。既存ルートを上書きしない。
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
Route::get('/recipe-health', function () {
    $row = DB::selectOne('SELECT 42 AS value');
    return response()->json(['ok' => (int)$row->value === 42]);
});
