from sqlalchemy import Column, Integer, String, DateTime, Date, JSON
from sqlalchemy.orm import declarative_base

Base = declarative_base()

class UserActivityLog(Base):
    __tablename__ = 'user_activity_logs'
    id = Column(Integer, primary_key=True, autoincrement=True)
    cve_id = Column(String, nullable=False, index=True)
    user_name = Column(String, nullable=False, index=True)
    event_timestamp = Column(DateTime, nullable=False)
    event_date = Column(Date, nullable=False, index=True)
    meta = Column(JSON, nullable=True)
