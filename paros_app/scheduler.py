from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from django_apscheduler.jobstores import DjangoJobStore
from django.core.management import call_command
import logging

logger = logging.getLogger(__name__)


def respaldar():
    try:
        call_command('respaldar_bd')
    except Exception as e:
        logger.error(f'Error en respaldo automático: {e}')


def iniciar_scheduler():
    scheduler = BackgroundScheduler()
    scheduler.add_jobstore(DjangoJobStore(), 'default')

    scheduler.add_job(
        respaldar,
        #trigger=CronTrigger(day_of_week='mon', hour=2, minute=0),  # Lunes 2 AM
        trigger=CronTrigger(minute='*/2'),  # cada 2 minutos
        id='respaldo_semanal',
        name='Respaldo semanal de BD',
        jobstore='default',
        replace_existing=True,
    )

    scheduler.start()
    logger.info('Scheduler de respaldos iniciado.')