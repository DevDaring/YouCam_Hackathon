from app import auth
from app.auth import hash_password, verify_password


def test_password_hash_roundtrip():
    h = hash_password("TestUser11")
    assert h.startswith("scrypt$") and verify_password("TestUser11", h)
    assert not verify_password("testuser11", h) and not verify_password("x", "garbage")


async def test_demo_login_flow(client, db):
    await auth.seed_demo_user(db)
    auth.limiter.reset("127.0.0.1")
    demo = (await client.get("/api/auth/demo")).json()
    assert demo == {"enabled": True, "username": "TestUser", "password": "TestUser11"}

    assert (await client.get("/api/auth/me")).status_code == 401
    bad = await client.post("/api/auth/login", json={"username": "TestUser", "password": "nope"})
    assert bad.status_code == 401
    ok = await client.post("/api/auth/login", json={"username": "TestUser", "password": "TestUser11"})
    assert ok.status_code == 200 and ok.json()["is_demo"] is True
    cookie = ok.cookies.get(auth.COOKIE_NAME)
    assert cookie and "httponly" in ok.headers["set-cookie"].lower()
    me = await client.get("/api/auth/me")  # client keeps the cookie
    assert me.json()["username"] == "TestUser"
    await client.post("/api/auth/logout")
    client.cookies.set(auth.COOKIE_NAME, cookie)  # replaying the old token must fail
    assert (await client.get("/api/auth/me")).status_code == 401


async def test_login_rate_limited(client, db):
    await auth.seed_demo_user(db)
    auth.limiter.reset("127.0.0.1")
    for _ in range(10):
        await client.post("/api/auth/login", json={"username": "TestUser", "password": "wrong"})
    r = await client.post("/api/auth/login", json={"username": "TestUser", "password": "TestUser11"})
    assert r.status_code == 429
    auth.limiter.reset("127.0.0.1")
