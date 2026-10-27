<?php
$common = [
    'host' => env('DB_HOST'), 'database' => env('DB_DATABASE'),
    'username' => env('DB_USERNAME'), 'password' => env('DB_PASSWORD'),
    'prefix' => '', 'prefix_indexes' => true,
];
return [
    'default' => env('DB_CONNECTION'),
    'connections' => [
        'mysql' => array_merge($common, ['driver' => 'mysql', 'port' => env('DB_PORT', '3306'), 'charset' => 'utf8mb4', 'collation' => 'utf8mb4_unicode_ci', 'strict' => true]),
        'pgsql' => array_merge($common, ['driver' => 'pgsql', 'port' => env('DB_PORT', '5432'), 'charset' => 'utf8', 'search_path' => 'public', 'sslmode' => 'prefer']),
    ],
];
