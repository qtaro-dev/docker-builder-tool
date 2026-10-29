-- 新規ボリュームの初回起動時に実行。再実行しても既存の値は上書きしない。
CREATE TABLE IF NOT EXISTS recipe_values (
    name text PRIMARY KEY,
    value integer NOT NULL CHECK (value >= 0 AND value <= 1000000)
);
INSERT INTO recipe_values(name,value) VALUES ('demo',42) ON CONFLICT(name) DO NOTHING;
