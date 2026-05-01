from celery import Celery
from celery.schedules import crontab
from app.core.config import settings

celery_app = Celery(
    "aigateway",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.workers.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
)

celery_app.conf.beat_schedule = {
    "assess-usage-levels-daily": {
        "task": "app.workers.tasks.dispatch_usage_assessment",
        "schedule": crontab(hour="*/12", minute=0),  # every 12 hours
    },
    "check-agent-schedules": {
        "task": "app.workers.tasks.check_agent_schedules",
        "schedule": crontab(minute="*"),  # every minute
    },
}
