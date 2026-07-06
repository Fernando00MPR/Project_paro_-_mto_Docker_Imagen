
"""
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
"""

import time
import logging

logger = logging.getLogger('timing')

class TimingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        t0 = time.perf_counter()
        response = self.get_response(request)
        ms = (time.perf_counter() - t0) * 1000

        if ms > 10:  # solo loguea requests lentos
            logger.warning(f'[SLOW] {request.method} {request.path} → {ms:.1f} ms')

        return response