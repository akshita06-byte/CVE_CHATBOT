from datetime import datetime
try:
    from models import UserActivityLog
    from db import SessionLocal, engine
except ImportError:
    from server.models import UserActivityLog
    from server.db import SessionLocal, engine

def ensure_tables():
    UserActivityLog.metadata.create_all(bind=engine)

def write_log_direct(cve_id: str, user_name: str, meta: dict = None):
    now = datetime.utcnow()
    session = SessionLocal()
    try:
        row = UserActivityLog(
            cve_id=cve_id,
            user_name=user_name,
            event_timestamp=now,
            event_date=now.date(),
            meta=meta
        )
        session.add(row)
        session.commit()
        return row.id
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
