"""Typed MCP façade over the same deterministic domain services.

Run with: python -m backend.app.mcp_server
"""

from mcp.server.fastmcp import FastMCP
from sqlalchemy import select

from .database import SessionLocal
from .models import Department
from .policy_rag import retrieve_policy
from .services import search_slots

mcp = FastMCP("AgentCare Hospital Administration")


@mcp.tool()
def lookup_departments() -> list[dict]:
    """Return active administrative departments."""
    with SessionLocal() as db:
        return [
            {"id": item.id, "code": item.code, "name": item.name}
            for item in db.scalars(select(Department).where(Department.active.is_(True)))
        ]


@mcp.tool()
def retrieve_approved_policy(query: str) -> list[dict]:
    """Retrieve active, versioned hospital policy evidence."""
    with SessionLocal() as db:
        return retrieve_policy(db, query)


@mcp.tool()
def find_available_slots(department_id: int, limit: int = 5) -> list[dict]:
    """Read available appointment slots. Write actions stay behind API authorization."""
    with SessionLocal() as db:
        return [
            {
                "id": slot.id,
                "doctor": slot.doctor.name,
                "start_time": slot.start_time.isoformat(),
            }
            for slot in search_slots(db, department_id, limit)
        ]


if __name__ == "__main__":
    mcp.run()

