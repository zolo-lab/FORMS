#!/usr/bin/env python3
"""Create this run's Neon branch and print its connection string to GITHUB_OUTPUT.

The GitHub action hides the API's error body and sends suspend_timeout 0, which
this plan rejects. An archived parent also answers 423 until it is awake, so
this waits for that and retries only that lock.
"""

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://console.neon.tech/api/v2"


def env(name):
    value = os.environ.get(name, "").strip()
    if not value:
        sys.exit(f"missing {name}")
    return value


def call(method, path, body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        API + path,
        data=data,
        method=method,
        headers={
            "Authorization": "Bearer " + env("NEON_API_KEY"),
            "Accept": "application/json",
            "Content-Type": "application/json",
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
            payload = {"message": "unreadable response"}
        return err.code, payload


def public_error(payload):
    message = str(payload.get("message") or "")
    if "://" in message or "password" in message.lower():
        message = "redacted"
    code = str(payload.get("code") or "")
    request_id = str(payload.get("request_id") or "")
    return f"{code} {message[:240]} {request_id}".strip()


def fail(status, payload):
    print(f"neon {status} {public_error(payload)}", file=sys.stderr)
    sys.exit(1)


def find_named(items, name):
    for item in items:
        if item.get("name") == name or item.get("id") == name:
            return item
    return None


def branches(project):
    status, payload = call("GET", f"/projects/{project}/branches?limit=100")
    if status != 200:
        fail(status, payload)
    return payload.get("branches") or []


def endpoints(project):
    status, payload = call("GET", f"/projects/{project}/endpoints")
    if status != 200:
        fail(status, payload)
    return payload.get("endpoints") or []


def main():
    project = env("NEON_PROJECT_ID")
    parent_name = env("NEON_PARENT")
    branch_name = env("NEON_BRANCH")
    database = env("NEON_DATABASE")
    role = env("NEON_ROLE")
    expires_at = env("NEON_EXPIRES_AT")

    parent = find_named(branches(project), parent_name)
    if not parent:
        sys.exit(f"parent branch {parent_name} not found")
    parent_id = parent["id"]

    def parent_endpoint():
        for endpoint in endpoints(project):
            if endpoint.get("branch_id") == parent_id and endpoint.get("type") == "read_write":
                return endpoint
        return None

    endpoint = parent_endpoint()
    if endpoint and endpoint.get("current_state") != "active":
        status, payload = call("POST", f"/projects/{project}/endpoints/{endpoint['id']}/start")
        if status not in (200, 201, 202, 409, 423):
            fail(status, payload)
        if status not in (200, 201, 202, 409):
            print(f"neon {status} {public_error(payload)}", file=sys.stderr)
        for _ in range(6):
            current = parent_endpoint()
            if current and current.get("current_state") == "active":
                break
            time.sleep(5)

    existing = find_named(branches(project), branch_name)
    branch_id = existing["id"] if existing else None
    if not branch_id:
        body = {
            "branch": {"name": branch_name, "parent_id": parent_id, "expires_at": expires_at},
            # 0 is rejected on this plan ("suspend interval is too short"). Five minutes covers the job.
            "endpoints": [{"type": "read_write", "suspend_timeout_seconds": 300}],
        }
        delay = 2
        status, payload = 0, {}
        for attempt in range(6):
            status, payload = call("POST", f"/projects/{project}/branches", body)
            if status in (200, 201):
                branch_id = (payload.get("branch") or {}).get("id")
                break
            if status == 409:
                again = find_named(branches(project), branch_name)
                branch_id = again["id"] if again else None
                break
            print(f"neon {status} {public_error(payload)}", file=sys.stderr)
            if status != 423 or attempt == 5:
                sys.exit(1)
            time.sleep(delay)
            delay = min(delay * 2, 20)
        if not branch_id:
            fail(status, payload)

    query = urllib.parse.urlencode({"branch_id": branch_id, "database_name": database, "role_name": role})
    status, payload = call("GET", f"/projects/{project}/connection_uri?{query}")
    uri = payload.get("uri") if status == 200 else None
    if not uri or not str(uri).startswith("postgresql:"):
        fail(status, {"message": "connection string was not returned"})
    print(f"::add-mask::{uri}")
    with open(env("GITHUB_OUTPUT"), "a", encoding="utf-8") as out:
        out.write(f"db_url<<NEON_URI\n{uri}\nNEON_URI\n")
    print(f"branch {branch_name} is ready")


if __name__ == "__main__":
    main()
