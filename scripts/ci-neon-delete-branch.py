#!/usr/bin/env python3
"""Delete this run's Neon branch. A branch that was never created is already clean."""

import json
import os
import sys
import time
import urllib.error
import urllib.request

API = "https://console.neon.tech/api/v2"


def env(name):
    value = os.environ.get(name, "").strip()
    if not value:
        sys.exit(f"missing {name}")
    return value


def call(method, path):
    req = urllib.request.Request(
        API + path,
        method=method,
        headers={
            "Authorization": "Bearer " + env("NEON_API_KEY"),
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            raw = res.read().decode()
            return res.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as err:
        raw = err.read().decode()
        try:
            payload = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            payload = {}
        return err.code, payload


def main():
    project = env("NEON_PROJECT_ID")
    name = env("NEON_BRANCH")
    status, payload = call("GET", f"/projects/{project}/branches?limit=100")
    if status != 200:
        sys.exit(f"could not list branches ({status})")
    branch = next((item for item in payload.get("branches") or [] if item.get("name") == name), None)
    if not branch:
        print(f"{name} was not created")
        return
    delay = 2
    for attempt in range(6):
        status, _payload = call("DELETE", f"/projects/{project}/branches/{branch['id']}")
        if status in (200, 202, 204, 404):
            print(f"deleted {name}" if status != 404 else f"{name} was already gone")
            return
        if status != 423 or attempt == 5:
            sys.exit(f"could not delete {name} ({status})")
        time.sleep(delay)
        delay = min(delay * 2, 20)


if __name__ == "__main__":
    main()
