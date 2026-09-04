"""Measure the service's memory against the free-tier ceiling.

The deployment target is a 512MB instance and torch alone takes most of the
budget before a row is generated, so MAX_ROWS is a memory decision rather than
a product one. This prints the numbers behind the value set in render.yaml.

Run:  python -m scripts.measure_memory
"""

from __future__ import annotations

import gc
import os
import threading
import time
import warnings

warnings.filterwarnings("ignore")

LIMIT_MB = 512
ROW_COUNTS = (1000, 3000, 6000)


def main() -> None:
    import psutil

    proc = psutil.Process(os.getpid())
    rss = lambda: proc.memory_info().rss / 1024 / 1024  # noqa: E731

    peak = [0.0]
    stop = [False]

    def watch() -> None:
        while not stop[0]:
            peak[0] = max(peak[0], rss())
            time.sleep(0.05)

    threading.Thread(target=watch, daemon=True).start()

    print(f"{'baseline python':<28}{rss():7.1f} MB")
    import torch  # noqa: F401
    print(f"{'+ torch':<28}{rss():7.1f} MB")
    import pandas  # noqa: F401,E401
    print(f"{'+ sklearn, pandas, scipy':<28}{rss():7.1f} MB")
    import fastapi  # noqa: F401,E401
    print(f"{'+ fastapi, uvicorn':<28}{rss():7.1f} MB")

    from app.service import SynthFinService

    service = SynthFinService()
    gc.collect()
    print(f"{'model loaded, idle':<28}{rss():7.1f} MB")

    for n in ROW_COUNTS:
        peak[0] = rss()
        out = service.generate(None, num_rows=n)
        gc.collect()
        head = 512 - peak[0]
        flag = "" if head > 0 else "  OVER LIMIT"
        print(f"{'peak during ' + str(n) + ' rows':<28}{peak[0]:7.1f} MB"
              f"   {head:6.1f} MB under {LIMIT_MB}{flag}")
        del out

    stop[0] = True


if __name__ == "__main__":
    main()
