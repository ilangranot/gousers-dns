"""
Quick end-to-end test for the chat pipeline.
Run inside Docker: docker compose exec api python test_chat.py
"""
import asyncio
import os
import sys
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import text

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@db:5432/aigateway")
SCHEMA = "org_personal_user_39owtkrxq84bg3yhdkobsbch3sp"

engine = create_async_engine(DATABASE_URL)
Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def test_db():
    print("\n=== 1. DB connection ===")
    async with Session() as s:
        row = await s.execute(text("SELECT COUNT(*) FROM public.organizations"))
        print(f"  orgs: {row.scalar()}")
        row = await s.execute(text(f'SELECT COUNT(*) FROM "{SCHEMA}".users'))
        print(f"  users: {row.scalar()}")
        row = await s.execute(text(f'SELECT COUNT(*) FROM "{SCHEMA}".gpt_connections'))
        print(f"  gpt_connections: {row.scalar()}")
        row = await s.execute(text(f'SELECT provider, model, is_active FROM "{SCHEMA}".gpt_connections'))
        for r in row:
            print(f"  -> {r.provider} / {r.model} / active={r.is_active}")
    print("  PASS")


async def test_decrypt():
    print("\n=== 2. API key decryption ===")
    from app.core.security import decrypt_api_key
    async with Session() as s:
        row = await s.execute(
            text(f'SELECT encrypted_api_key FROM "{SCHEMA}".gpt_connections WHERE provider = \'openai\'')
        )
        enc = row.scalar()
        if not enc:
            print("  FAIL: no openai connection found")
            return None
        key = decrypt_api_key(enc)
        print(f"  decrypted key starts with: {key[:12]}...")
        print("  PASS")
        return key


async def test_openai(api_key: str):
    print("\n=== 3. OpenAI connectivity ===")
    import httpx
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": "gpt-4o",
                    "messages": [{"role": "user", "content": "Say HELLO in one word."}],
                    "max_tokens": 10,
                },
            )
            if resp.status_code == 200:
                answer = resp.json()["choices"][0]["message"]["content"]
                print(f"  response: {answer}")
                print("  PASS")
            else:
                print(f"  FAIL: status={resp.status_code} body={resp.text[:300]}")
    except Exception as e:
        print(f"  FAIL: {e}")


async def test_filtering():
    print("\n=== 4. Filtering service ===")
    from app.services.filtering import filtering_service
    async with Session() as s:
        # No rules = should allow
        result = await filtering_service.evaluate("Hello world", s, SCHEMA)
        assert result.action == "allow", f"Expected allow, got {result.action}"
        print(f"  empty rules -> action={result.action}  PASS")

        # Add a keyword rule and test
        await s.execute(
            text(f"""
                INSERT INTO "{SCHEMA}".filtering_rules (name, type, pattern, action)
                VALUES ('test-block', 'keyword', 'badword', 'block')
            """)
        )
        await s.commit()

        result = await filtering_service.evaluate("this contains badword here", s, SCHEMA)
        assert result.action == "block", f"Expected block, got {result.action}"
        print(f"  keyword rule hit -> action={result.action}  PASS")

        result = await filtering_service.evaluate("totally clean message", s, SCHEMA)
        assert result.action == "allow", f"Expected allow, got {result.action}"
        print(f"  keyword rule miss -> action={result.action}  PASS")

        # Cleanup test rule
        await s.execute(
            text(f"DELETE FROM \"{SCHEMA}\".filtering_rules WHERE name = 'test-block'")
        )
        await s.commit()


async def test_stream():
    print("\n=== 5. Full streaming proxy ===")
    from app.services.proxy import stream_gpt
    async with Session() as s:
        chunks = []
        try:
            async for chunk in stream_gpt("openai", [{"role": "user", "content": "Say HELLO in one word."}], s, SCHEMA):
                chunks.append(chunk)
                print(f"  chunk: {repr(chunk)}")
                if len(chunks) >= 5:
                    break
            print(f"  received {len(chunks)} chunks  PASS")
        except Exception as e:
            print(f"  FAIL: {e}")


async def main():
    print("Starting AI Gateway tests...")
    await test_db()
    api_key = await test_decrypt()
    if api_key:
        await test_openai(api_key)
    await test_filtering()
    await test_stream()
    print("\n=== Done ===")
    await engine.dispose()


asyncio.run(main())
