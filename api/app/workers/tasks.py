import json
import asyncio
from datetime import datetime, timezone
from uuid import uuid4
from app.workers.celery_app import celery_app
from app.core.database import get_task_session
from app.services.llm import llm_service
from app.services.agent_runner import (
    AGENT_SYSTEM_PROMPT, call_llm_with_tools, execute_tool,
    build_messages_from_steps, HUMAN_ACTION_SENTINEL,
)
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


@celery_app.task
def assess_all_user_levels(org_schema: str):
    """Periodically rate every user's AI usage level in this org schema."""
    async def _run():
        session = await get_task_session(org_schema)
        try:
            # Get all users
            users_result = await session.execute(
                text(f'SELECT id, email FROM "{org_schema}".users')
            )
            users = [dict(r._mapping) for r in users_result]

            for user in users:
                uid = str(user["id"])
                email = user.get("email", "")

                # Count total messages
                count_row = await session.execute(
                    text(f'SELECT COUNT(*) FROM "{org_schema}".messages m JOIN "{org_schema}".sessions s ON s.id = m.session_id WHERE s.user_id = CAST(:uid AS uuid) AND m.role = \'user\''),
                    {"uid": uid},
                )
                message_count = count_row.scalar() or 0

                # Get recent messages for context
                msgs_result = await session.execute(
                    text(f'''
                        SELECT m.role, m.content
                        FROM "{org_schema}".messages m
                        JOIN "{org_schema}".sessions s ON s.id = m.session_id
                        WHERE s.user_id = CAST(:uid AS uuid)
                          AND m.was_blocked = FALSE
                        ORDER BY m.created_at DESC
                        LIMIT 40
                    '''),
                    {"uid": uid},
                )
                messages = [dict(r._mapping) for r in msgs_result]

                level = await llm_service.assess_usage_level(email, messages, message_count)

                await session.execute(
                    text(f'UPDATE "{org_schema}".users SET usage_level = :level WHERE id = CAST(:uid AS uuid)'),
                    {"level": level, "uid": uid},
                )

            await session.commit()
        finally:
            await session.close()

    run_async(_run())


@celery_app.task
def dispatch_usage_assessment():
    """Dispatch per-org usage level assessment tasks."""
    async def _run():
        from app.core.database import engine
        from sqlalchemy import text as sa_text
        async with engine.connect() as conn:
            result = await conn.execute(
                sa_text("SELECT schema_name FROM public.organizations")
            )
            schemas = [r[0] for r in result]
        for schema in schemas:
            assess_all_user_levels.delay(schema)
    run_async(_run())


def _compute_next_run_from_sched(sched: dict):
    """Compute the next UTC datetime for a schedule dict."""
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    stype = sched.get("schedule_type", "interval")

    if stype == "interval":
        val = int(sched.get("interval_value") or 1)
        unit = sched.get("interval_unit") or "hours"
        if unit == "minutes":
            return now + timedelta(minutes=val)
        elif unit == "hours":
            return now + timedelta(hours=val)
        else:
            return now + timedelta(days=val)

    # cron-style
    hour = int(sched.get("cron_hour") or 9)
    minute = int(sched.get("cron_minute") or 0)
    dow_str = sched.get("cron_day_of_week") or "*"
    candidate = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if candidate <= now:
        candidate += timedelta(days=1)
    if dow_str != "*":
        allowed = {int(d) for d in dow_str.split(",")}
        for _ in range(7):
            if candidate.weekday() in allowed:
                break
            candidate += timedelta(days=1)
    return candidate


@celery_app.task
def run_agent_schedule(org_schema: str, schedule_id: str):
    """Execute a single agent schedule: send the prompt to target users and save responses."""
    async def _run():
        from datetime import datetime, timezone
        session = await get_task_session(org_schema)
        try:
            # Load schedule + agent info
            row = (await session.execute(
                text(f"""
                    SELECT s.*, a.system_prompt as agent_system_prompt,
                           a.provider as agent_provider, a.model as agent_model
                    FROM "{org_schema}".agent_schedules s
                    JOIN "{org_schema}".agents a ON a.id = s.agent_id
                    WHERE s.id = CAST(:id AS UUID) AND s.is_active = TRUE
                """),
                {"id": schedule_id},
            )).fetchone()
            if not row:
                return

            sched = dict(row._mapping)
            prompt = sched["prompt"]
            system_prompt = sched["agent_system_prompt"]
            provider = sched["agent_provider"]
            target_type = sched.get("target_type", "all")
            target_user_ids = sched.get("target_user_ids") or []

            # Determine target users
            if target_type == "specific" and target_user_ids:
                placeholders = ", ".join([f"CAST(:uid{i} AS UUID)" for i in range(len(target_user_ids))])
                params = {f"uid{i}": uid for i, uid in enumerate(target_user_ids)}
                users_result = await session.execute(
                    text(f'SELECT id FROM "{org_schema}".users WHERE id IN ({placeholders}) AND is_disabled = FALSE'),
                    params,
                )
            else:
                users_result = await session.execute(
                    text(f'SELECT id FROM "{org_schema}".users WHERE is_disabled = FALSE')
                )
            user_ids = [str(r.id) for r in users_result]

            # Run agent for each user
            for uid in user_ids:
                try:
                    # Create a session for this scheduled run
                    sess_res = await session.execute(
                        text(f"""
                            INSERT INTO "{org_schema}".sessions (user_id, title, gpt_target)
                            VALUES (CAST(:uid AS UUID), :title, :provider)
                            RETURNING id
                        """),
                        {"uid": uid, "title": f"Scheduled: {sched['name']}", "provider": provider},
                    )
                    chat_session_id = str(sess_res.fetchone().id)

                    await session.execute(
                        text(f"""
                            INSERT INTO "{org_schema}".messages (session_id, role, content, gpt_target)
                            VALUES (CAST(:sid AS UUID), 'user', :content, :provider)
                        """),
                        {"sid": chat_session_id, "content": prompt, "provider": provider},
                    )
                    await session.commit()

                    # Call AI
                    from app.services.proxy import call_gpt
                    response = await call_gpt(
                        provider,
                        [{"role": "user", "content": prompt}],
                        session,
                        org_schema,
                        system_prompt=system_prompt,
                    )

                    await session.execute(
                        text(f"""
                            INSERT INTO "{org_schema}".messages (session_id, role, content, gpt_target)
                            VALUES (CAST(:sid AS UUID), 'assistant', :content, :provider)
                        """),
                        {"sid": chat_session_id, "content": response, "provider": provider},
                    )
                    await session.commit()
                except Exception:
                    await session.rollback()

            # Update last_run_at / next_run_at
            next_run = _compute_next_run_from_sched(sched)
            await session.execute(
                text(f"""
                    UPDATE "{org_schema}".agent_schedules
                    SET last_run_at = :now, next_run_at = :next_run
                    WHERE id = CAST(:id AS UUID)
                """),
                {"now": datetime.now(timezone.utc), "next_run": next_run, "id": schedule_id},
            )
            await session.commit()
        finally:
            await session.close()

    run_async(_run())


@celery_app.task
def check_agent_schedules():
    """Called by Celery Beat every minute. Finds overdue schedules across all orgs and fires them."""
    async def _run():
        from datetime import datetime, timezone
        from app.core.database import engine
        from sqlalchemy import text as sa_text
        now = datetime.now(timezone.utc)

        async with engine.connect() as conn:
            result = await conn.execute(sa_text("SELECT schema_name FROM public.organizations"))
            schemas = [r[0] for r in result]

        for schema in schemas:
            session = await get_task_session(schema)
            try:
                result = await session.execute(
                    text(f"""
                        SELECT id FROM "{schema}".agent_schedules
                        WHERE is_active = TRUE AND next_run_at <= :now
                    """),
                    {"now": now},
                )
                ids = [str(r.id) for r in result]
            except Exception:
                ids = []
            finally:
                await session.close()

            for sid in ids:
                run_agent_schedule.delay(schema, sid)

    run_async(_run())


# ── Agent task loop ────────────────────────────────────────────────────────────

@celery_app.task(bind=True, max_retries=0)
def run_agent_loop(self, task_id: str, schema_name: str, org_key: str):
    run_async(_run_agent_loop_async(task_id, schema_name, org_key))


async def _run_agent_loop_async(task_id: str, schema_name: str, org_key: str):
    MAX_STEPS = 30
    tenant = await get_task_session(schema_name)
    try:
        # Load task
        row = (await tenant.execute(
            text(f'SELECT * FROM "{schema_name}".agent_tasks WHERE id = CAST(:id AS UUID)'),
            {"id": task_id},
        )).fetchone()
        if not row:
            return
        task = dict(row._mapping)

        # Load agent (may be None)
        agent = None
        if task.get("agent_id"):
            agent_row = (await tenant.execute(
                text(f'SELECT * FROM "{schema_name}".agents WHERE id = CAST(:id AS UUID)'),
                {"id": str(task["agent_id"])},
            )).fetchone()
            if agent_row:
                agent = dict(agent_row._mapping)

        # Build system prompt
        system_prompt = AGENT_SYSTEM_PROMPT
        if agent and agent.get("system_prompt"):
            system_prompt = AGENT_SYSTEM_PROMPT + "\n\n" + agent["system_prompt"]

        # Resolve provider and model
        provider = (agent or {}).get("provider", "openai")
        model = (agent or {}).get("model") or ("gpt-4o" if provider == "openai" else "claude-3-5-sonnet-20241022")

        # Load API key from gpt_connections
        conn_row = (await tenant.execute(
            text(f'SELECT * FROM "{schema_name}".gpt_connections WHERE provider = :p AND is_active = TRUE'),
            {"p": provider},
        )).fetchone()
        if not conn_row:
            await _update_task_db(tenant, schema_name, task_id, status="failed", error=f"No active API key for provider: {provider}")
            return

        conn = dict(conn_row._mapping)
        from app.core.security import decrypt_api_key
        api_key = decrypt_api_key(conn["encrypted_api_key"])

        # Mark running
        await _update_task_db(tenant, schema_name, task_id, status="running")

        # Rebuild message history from steps
        steps = task.get("steps") or []
        messages = build_messages_from_steps(task["goal"], steps, system_prompt)

        for _ in range(MAX_STEPS):
            response = await call_llm_with_tools(messages, provider, model, api_key)

            if response["type"] == "final":
                final_step = {
                    "id": str(uuid4()), "type": "final",
                    "output": response["content"],
                    "status": "done",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
                await _append_step_db(tenant, schema_name, task_id, final_step)
                await _update_task_db(tenant, schema_name, task_id, status="completed", result=response["content"])
                return

            # --- Save all tool_call steps for this LLM response ---
            call_steps = []
            for call in response["calls"]:
                step = {
                    "id": str(uuid4()),
                    "type": "tool_call",
                    "tool": call["name"],
                    "tool_call_id": call["id"],
                    "input": call["input"],
                    "status": "running",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
                await _append_step_db(tenant, schema_name, task_id, step)
                call_steps.append((call, step))

            # Build one assistant message with ALL tool_calls from this response
            assistant_tool_calls = [
                {
                    "id": call["id"],
                    "type": "function",
                    "function": {"name": call["name"], "arguments": json.dumps(call["input"])},
                }
                for call, _ in call_steps
            ]
            messages.append({"role": "assistant", "content": None, "tool_calls": assistant_tool_calls})

            # --- Execute each tool and collect results ---
            hit_human_action = False
            for call, step in call_steps:
                if call["name"] == "human_action":
                    await _update_step_db(
                        tenant, schema_name, task_id, step["id"],
                        type="human_action", status="waiting",
                    )
                    await _update_task_db(tenant, schema_name, task_id, status="waiting_human")
                    hit_human_action = True
                    # Still need a tool result so the LLM history is consistent on resume
                    # (handled by confirm endpoint + build_messages_from_steps)
                    break

                result_text = await execute_tool(call["name"], call["input"], task_id, schema_name, tenant)
                await _update_step_db(tenant, schema_name, task_id, step["id"], output=result_text, status="done")
                messages.append({"role": "tool", "tool_call_id": call["id"], "content": result_text})

            if hit_human_action:
                return

        await _update_task_db(tenant, schema_name, task_id, status="failed", error="Max steps reached without completion")

    except Exception as e:
        try:
            await _update_task_db(tenant, schema_name, task_id, status="failed", error=str(e))
        except Exception:
            pass
    finally:
        await tenant.close()


async def _update_task_db(tenant, schema_name: str, task_id: str, status: str = None, result: str = None, error: str = None):
    sets = ["updated_at = NOW()"]
    params = {"task_id": task_id}
    if status is not None:
        sets.append("status = :status")
        params["status"] = status
    if result is not None:
        sets.append("result = :result")
        params["result"] = result
    if error is not None:
        sets.append("error = :error")
        params["error"] = error
    await tenant.execute(
        text(f'UPDATE "{schema_name}".agent_tasks SET {", ".join(sets)} WHERE id = CAST(:task_id AS UUID)'),
        params,
    )
    await tenant.commit()


async def _append_step_db(tenant, schema_name: str, task_id: str, step: dict):
    await tenant.execute(
        text(f"""
            UPDATE "{schema_name}".agent_tasks
            SET steps = steps || CAST(:step AS JSONB),
                updated_at = NOW()
            WHERE id = CAST(:task_id AS UUID)
        """),
        {"step": json.dumps([step]), "task_id": task_id},
    )
    await tenant.commit()


async def _update_step_db(tenant, schema_name: str, task_id: str, step_id: str, **kwargs):
    """Patch a specific step in the steps JSONB array by its id."""
    row = (await tenant.execute(
        text(f'SELECT steps FROM "{schema_name}".agent_tasks WHERE id = CAST(:id AS UUID)'),
        {"id": task_id},
    )).fetchone()
    if not row:
        return
    steps = list(row.steps or [])
    updated = []
    for s in steps:
        if s.get("id") == step_id:
            s = dict(s)
            for k, v in kwargs.items():
                if v is not None:
                    s[k] = v
        updated.append(s)
    await tenant.execute(
        text(f"""
            UPDATE "{schema_name}".agent_tasks
            SET steps = CAST(:steps AS JSONB), updated_at = NOW()
            WHERE id = CAST(:task_id AS UUID)
        """),
        {"steps": json.dumps(updated), "task_id": task_id},
    )
    await tenant.commit()
