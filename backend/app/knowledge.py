"""Knowledge endpoints scoped to the authenticated actor in this single-workspace app."""
import uuid
import sqlalchemy as sa
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel, Field
from ai_service.knowledge import answer
from backend.app.db import metadata
from backend.app.db import read_connection
from backend.app.analytics import dataset_info
from backend.app.dataset_knowledge import active_documents, knowledge_graph

documents = sa.Table('knowledge_documents', metadata,
    sa.Column('id', sa.String(36), primary_key=True),
    sa.Column('actor', sa.String(100), nullable=False, index=True),
    sa.Column('title', sa.String(150), nullable=False),
    sa.Column('content', sa.Text, nullable=False))

class DocumentInput(BaseModel):
    title: str = Field(min_length=1, max_length=150)
    content: str = Field(min_length=10, max_length=100000)

class KnowledgeQuestion(BaseModel):
    question: str = Field(min_length=3, max_length=1000)
    include_documents: bool = False

def router(engine):
    documents.create(engine, checkfirst=True)
    api = APIRouter(prefix='/knowledge')
    @api.get('/graph')
    def graph():
        info, rows = active_documents(engine)
        return knowledge_graph(info, rows)

    @api.get('/documents')
    def listing(request: Request):
        with engine.connect() as conn:
            return {'rows': [dict(r) for r in conn.execute(sa.select(documents.c.id, documents.c.title).where(documents.c.actor == request.state.identity['actor'])).mappings()]}

    @api.post('/documents')
    def upload(body: DocumentInput, request: Request):
        if request.state.identity['role'] not in ('admin', 'analyst'):
            raise HTTPException(403, 'Không có quyền thêm tài liệu.')
        with engine.begin() as conn:
            count = conn.scalar(sa.select(sa.func.count()).select_from(documents).where(documents.c.actor == request.state.identity['actor']))
            if count >= 30:
                raise HTTPException(422, 'Bản MVP hỗ trợ tối đa 30 tài liệu mỗi người dùng.')
            identifier = str(uuid.uuid4())
            conn.execute(documents.insert().values(id=identifier, actor=request.state.identity['actor'], **body.model_dump()))
            return {'id': identifier}

    @api.delete('/documents/{identifier}')
    def remove(identifier: str, request: Request):
        if request.state.identity['role'] not in ('admin', 'analyst'):
            raise HTTPException(403, 'Không có quyền xóa tài liệu.')
        with engine.begin() as conn:
            result = conn.execute(documents.delete().where(documents.c.id == identifier, documents.c.actor == request.state.identity['actor']))
            if not result.rowcount:
                raise HTTPException(404, 'Không tìm thấy tài liệu.')
        return {'deleted': True}

    @api.post('/query')
    def query(body: KnowledgeQuestion, request: Request):
        info, rows = active_documents(engine)
        if body.include_documents:
            with engine.connect() as conn:
                rows.extend(dict(r) for r in conn.execute(sa.select(documents).where(documents.c.actor == request.state.identity['actor'])).mappings())
        result = answer(body.question, rows)
        with read_connection(engine) as conn:
            if dataset_info(conn)['dataset_id'] != info['dataset_id']:
                raise HTTPException(409, 'Dữ liệu vừa thay đổi. Hãy hỏi lại để dùng bộ dữ liệu mới.')
        return dict(result, dataset_id=info['dataset_id'], dataset_title=info.get('title'),
                    evidence_documents=len(rows))
    return api
