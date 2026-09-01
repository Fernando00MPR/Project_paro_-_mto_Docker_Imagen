import time
import os
import threading
import logging
from django.db import connection
from django.test.utils import CaptureQueriesContext

logger = logging.getLogger('timing')

class TimingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        t0 = time.perf_counter()
        with CaptureQueriesContext(connection) as ctx:
            response = self.get_response(request)
        ms = (time.perf_counter() - t0) * 1000

        nivel = '[SLOW]' if ms > 50 else '[WARN]' if ms > 20 else None
        if nivel:
            logger.warning(
                f'{nivel} pid={os.getpid()} tid={threading.get_ident()} '
                f'{request.method} {request.path} → {ms:.0f} ms | {len(ctx.captured_queries)} queries'
            )

        return response
