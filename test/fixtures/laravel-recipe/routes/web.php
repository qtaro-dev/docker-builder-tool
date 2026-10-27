<?php
// 生成機能とは独立した検査用ルート。DBへ書き込み、合計値を読み戻す。
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
Route::get('/', fn () => response()->json(['fixture' => 'laravel-recipe-ci', 'framework' => app()->version()]));
Route::get('/recipe-health', function () {
    return DB::transaction(function () {
        DB::statement('CREATE TEMPORARY TABLE recipe_probe (value INTEGER)');
        DB::insert('INSERT INTO recipe_probe (value) VALUES (?), (?)', [19, 23]);
        $value = (int) DB::selectOne('SELECT SUM(value) AS total FROM recipe_probe')->total;
        return response()->json(['ok' => $value === 42, 'value' => $value, 'driver' => DB::connection()->getDriverName(), 'framework' => app()->version()]);
    });
});
