# 学習用のキャッシュ制御。外部サービスを渡せるので、制御部分だけでもテストできる。
class CacheService:
    KEY = 'recipe:value'
    TTL = 10

    def __init__(self, read_db, write_db, cache):
        self.read_db, self.write_db, self.cache = read_db, write_db, cache

    def get_value(self):
        available = True
        try:
            cached = self.cache.get(self.KEY)
            if cached is not None and str(cached).isdigit():
                return {'value': int(cached), 'source': 'cache'}
        except Exception:
            available = False
        value = self.read_db()
        try:
            self.cache.setex(self.KEY, self.TTL, str(value))
        except Exception:
            available = False
        return {'value': value, 'source': 'database', 'cache': 'available' if available else 'unavailable'}

    def set_value(self, value):
        if type(value) is not int or not 0 <= value <= 1000000:
            raise ValueError('value-must-be-integer-0-to-1000000')
        self.write_db(value)
        invalidated = True
        try:
            self.cache.delete(self.KEY)
        except Exception:
            invalidated = False
        return {'value': value, 'cache': 'invalidated' if invalidated else 'invalidation-failed'}
