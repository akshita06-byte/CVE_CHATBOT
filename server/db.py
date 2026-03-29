import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Read connection string from env var or use local SQLite (no external DB needed)
_default_db = 'sqlite:///' + os.path.join(os.path.dirname(__file__), 'activity.db')
DB_URL = os.environ.get('CVE_DB_URL') or _default_db

engine = create_engine(DB_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
