import json
import asyncio
from app.workers.celery_app import celery_app
from app.core.database import get_task_session
from app.services.llm import llm_service
from sqlalchemy import text


def run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(bind=True, max_retries=3)
def process_analytics(self, org_schema: str, event_type: str, user_id: str, session_id: str, metadata: dict):
    async def _run():
        session = await get_task_session(org_schema)
        try:
            await session.execute(
                text(f"""
                    INSERT INTO "{org_schema}".analytics_events (event_type, user_id, session_id, metadata)
                    VALUES (:event_type, CAST(:user_id AS uuid), CAST(:session_id AS uuid), CAST(:metadata AS jsonb))
                """),
                {
                    "event_type": event_type,
                    "user_id": user_id,
                    "session_id": session_id,
                    "metadata": json.dumps(metadata),
                },
            )
            await session.commit()
        finally:
            await session.close()

    run_async(_run())


@celery_app.task(bind=True, max_retries=3)
def generate_suggestions(self, org_schema: str, session_id: str, user_id: str, vertical: str = "general", doc_context: str = ""):
    async def _run():
        session = await get_task_session(org_schema)
        try:
            result = await session.execute(
                text(f'SELECT role, content FROM "{org_schema}".messages WHERE session_id = CAST(:sid AS uuid) ORDER BY created_at DESC LIMIT 10'),
                {"sid": session_id},
            )
            messages = [dict(r._mapping) for r in result]
            if not messages:
                return

            org_context = f"Industry vertical: {vertical}."
            if doc_context:
                org_context += f"\n{doc_context[:1000]}"

            suggestions = await llm_service.generate_suggestions(messages, org_context=org_context)

            for suggestion in suggestions:
                await session.execute(
                    text(f"""
                        INSERT INTO "{org_schema}".analytics_events (event_type, user_id, session_id, metadata)
                        VALUES ('suggestion_generated', CAST(:uid AS uuid), CAST(:sid AS uuid), CAST(:meta AS jsonb))
                    """),
                    {"uid": user_id, "sid": session_id, "meta": json.dumps({"suggestion": suggestion})},
                )
            await session.commit()
        finally:
            await session.close()

    run_async(_run())


@celery_app.task
def generate_session_title(org_schema: str, session_id: str):
    async def _run():
        session = await get_task_session(org_schema)
        try:
            result = await session.execute(
                text(f'SELECT role, content FROM "{org_schema}".messages WHERE session_id = CAST(:sid AS uuid) ORDER BY created_at LIMIT 4'),
                {"sid": session_id},
            )
            messages = [dict(r._mapping) for r in result]
            if not messages:
                return

            title = await llm_service.summarize_session(messages)
            await session.execute(
                text(f'UPDATE "{org_schema}".sessions SET title = :title WHERE id = CAST(:sid AS uuid)'),
                {"title": title, "sid": session_id},
            )
            await session.commit()
        finally:
            await session.close()

    run_async(_run())
