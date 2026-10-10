#!/usr/bin/env python3
"""Print the live YouCam unit balance (free call). Usage: backend/.venv/bin/python scripts/probe/balance.py"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

from app.youcam.service import get_credit_balance  # noqa: E402

if __name__ == "__main__":
    print(f"YouCam unit balance: {asyncio.run(get_credit_balance()):g}")
