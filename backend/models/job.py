"""
Data model representation for a job application.

This is a minimal placeholder. You can later replace this
with an ORM model (e.g. SQLAlchemy) or richer validation.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class Job:
    id: Optional[int]
    title: str
    company: str
    status: str
    applied_date: Optional[datetime] = None
    notes: Optional[str] = None

