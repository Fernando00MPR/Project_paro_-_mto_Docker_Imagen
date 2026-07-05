import time
from django.db import connection


class TimingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        queries_antes = len(connection.queries)
        t0 = time.perf_counter()

        response = self.get_response(request)

        ms      = (time.perf_counter() - t0) * 1000
        queries = len(connection.queries) - queries_antes

        print(
            f"[TIMING] {request.method} {request.path}"
            f"  →  {ms:.1f} ms  |  {queries} queries"
        )

        return response