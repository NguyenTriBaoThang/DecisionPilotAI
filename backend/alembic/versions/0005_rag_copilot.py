"""Add Advanced RAG Knowledge Store (rag_documents, rag_chunks), AI Copilot Conversations/Messages, and Long-Term Company Memory."""
from alembic import op
import sqlalchemy as sa


revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "rag_documents",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("dataset_id", sa.String(length=64), nullable=True),
        sa.Column("source_file_id", sa.String(length=64), nullable=True),
        sa.Column("source_type", sa.String(length=40), server_default="rag_upload", nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=120), nullable=True),
        sa.Column("document_type", sa.String(length=40), nullable=False),
        sa.Column("domain", sa.String(length=40), server_default="general", nullable=False),
        sa.Column("language", sa.String(length=16), server_default="auto", nullable=False),
        sa.Column("checksum_sha256", sa.String(length=64), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), server_default="indexed", nullable=False),
        sa.Column("chunk_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("char_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("access_permissions_json", sa.JSON(), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.String(length=100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], name=op.f("fk_rag_documents_company_id")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_rag_documents")),
    )
    op.create_index(op.f("ix_rag_documents_checksum_sha256"), "rag_documents", ["checksum_sha256"])
    op.create_index(op.f("ix_rag_documents_company_id"), "rag_documents", ["company_id"])
    op.create_index(op.f("ix_rag_documents_content_hash"), "rag_documents", ["content_hash"])
    op.create_index(op.f("ix_rag_documents_dataset_id"), "rag_documents", ["dataset_id"])
    op.create_index(op.f("ix_rag_documents_source_file_id"), "rag_documents", ["source_file_id"])
    op.create_index("ix_rag_docs_company_dataset", "rag_documents", ["company_id", "dataset_id"])
    op.create_index("ix_rag_docs_company_domain", "rag_documents", ["company_id", "domain"])
    op.create_index("ix_rag_docs_company_doctype", "rag_documents", ["company_id", "document_type"])

    op.create_table(
        "rag_chunks",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("document_id", sa.String(length=64), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("dataset_id", sa.String(length=64), nullable=True),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("token_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("source_file", sa.String(length=255), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=True),
        sa.Column("section", sa.String(length=200), nullable=True),
        sa.Column("document_type", sa.String(length=40), nullable=False),
        sa.Column("domain", sa.String(length=40), server_default="general", nullable=False),
        sa.Column("chunking_strategy", sa.String(length=32), server_default="recursive", nullable=False),
        sa.Column("embedding_provider", sa.String(length=64), nullable=False),
        sa.Column("embedding_dim", sa.Integer(), nullable=False),
        sa.Column("embedding_json", sa.JSON(), nullable=False),
        sa.Column("sparse_terms_json", sa.JSON(), nullable=False),
        sa.Column("access_permissions_json", sa.JSON(), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], name=op.f("fk_rag_chunks_company_id")),
        sa.ForeignKeyConstraint(["document_id"], ["rag_documents.id"], name=op.f("fk_rag_chunks_document_id"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_rag_chunks")),
    )
    op.create_index(op.f("ix_rag_chunks_company_id"), "rag_chunks", ["company_id"])
    op.create_index(op.f("ix_rag_chunks_content_hash"), "rag_chunks", ["content_hash"])
    op.create_index(op.f("ix_rag_chunks_dataset_id"), "rag_chunks", ["dataset_id"])
    op.create_index(op.f("ix_rag_chunks_document_id"), "rag_chunks", ["document_id"])
    op.create_index("ix_rag_chunks_company_dataset", "rag_chunks", ["company_id", "dataset_id"])
    op.create_index("ix_rag_chunks_company_domain", "rag_chunks", ["company_id", "domain"])
    op.create_index("ix_rag_chunks_company_doctype", "rag_chunks", ["company_id", "document_type"])

    op.create_table(
        "chat_conversations",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("dataset_id", sa.String(length=64), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("is_pinned", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("language", sa.String(length=16), server_default="auto", nullable=False),
        sa.Column("session_context_json", sa.JSON(), nullable=False),
        sa.Column("memory_summary", sa.Text(), nullable=True),
        sa.Column("message_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_by", sa.String(length=100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], name=op.f("fk_chat_conversations_company_id")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_chat_conversations")),
    )
    op.create_index(op.f("ix_chat_conversations_company_id"), "chat_conversations", ["company_id"])
    op.create_index(op.f("ix_chat_conversations_dataset_id"), "chat_conversations", ["dataset_id"])
    op.create_index("ix_chat_conv_company_updated", "chat_conversations", ["company_id", "updated_at"])

    op.create_table(
        "chat_messages",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("conversation_id", sa.String(length=64), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("role", sa.String(length=24), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("intent", sa.String(length=64), nullable=True),
        sa.Column("citations_json", sa.JSON(), nullable=True),
        sa.Column("structured_sections_json", sa.JSON(), nullable=True),
        sa.Column("chart_json", sa.JSON(), nullable=True),
        sa.Column("sql_trace_json", sa.JSON(), nullable=True),
        sa.Column("tool_trace_json", sa.JSON(), nullable=True),
        sa.Column("followups_json", sa.JSON(), nullable=True),
        sa.Column("parent_message_id", sa.String(length=64), nullable=True),
        sa.Column("prompt_tokens", sa.Integer(), nullable=True),
        sa.Column("completion_tokens", sa.Integer(), nullable=True),
        sa.Column("latency_ms", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], name=op.f("fk_chat_messages_company_id")),
        sa.ForeignKeyConstraint(["conversation_id"], ["chat_conversations.id"], name=op.f("fk_chat_messages_conversation_id"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_chat_messages")),
    )
    op.create_index(op.f("ix_chat_messages_company_id"), "chat_messages", ["company_id"])
    op.create_index(op.f("ix_chat_messages_conversation_id"), "chat_messages", ["conversation_id"])
    op.create_index("ix_chat_msgs_conv_created", "chat_messages", ["conversation_id", "created_at"])

    op.create_table(
        "company_memories",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("memory_key", sa.String(length=120), nullable=False),
        sa.Column("memory_type", sa.String(length=40), server_default="business_context", nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("source_conversation_id", sa.String(length=64), nullable=True),
        sa.Column("confidence", sa.Float(), server_default="1.0", nullable=False),
        sa.Column("created_by", sa.String(length=100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], name=op.f("fk_company_memories_company_id")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_company_memories")),
    )
    op.create_index(op.f("ix_company_memories_company_id"), "company_memories", ["company_id"])
    op.create_index("ix_company_memories_comp_key", "company_memories", ["company_id", "memory_key"])


def downgrade():
    op.drop_index("ix_company_memories_comp_key", table_name="company_memories")
    op.drop_index(op.f("ix_company_memories_company_id"), table_name="company_memories")
    op.drop_table("company_memories")

    op.drop_index("ix_chat_msgs_conv_created", table_name="chat_messages")
    op.drop_index(op.f("ix_chat_messages_conversation_id"), table_name="chat_messages")
    op.drop_index(op.f("ix_chat_messages_company_id"), table_name="chat_messages")
    op.drop_table("chat_messages")

    op.drop_index("ix_chat_conv_company_updated", table_name="chat_conversations")
    op.drop_index(op.f("ix_chat_conversations_dataset_id"), table_name="chat_conversations")
    op.drop_index(op.f("ix_chat_conversations_company_id"), table_name="chat_conversations")
    op.drop_table("chat_conversations")

    op.drop_index("ix_rag_chunks_company_doctype", table_name="rag_chunks")
    op.drop_index("ix_rag_chunks_company_domain", table_name="rag_chunks")
    op.drop_index("ix_rag_chunks_company_dataset", table_name="rag_chunks")
    op.drop_index(op.f("ix_rag_chunks_document_id"), table_name="rag_chunks")
    op.drop_index(op.f("ix_rag_chunks_dataset_id"), table_name="rag_chunks")
    op.drop_index(op.f("ix_rag_chunks_content_hash"), table_name="rag_chunks")
    op.drop_index(op.f("ix_rag_chunks_company_id"), table_name="rag_chunks")
    op.drop_table("rag_chunks")

    op.drop_index("ix_rag_docs_company_doctype", table_name="rag_documents")
    op.drop_index("ix_rag_docs_company_domain", table_name="rag_documents")
    op.drop_index("ix_rag_docs_company_dataset", table_name="rag_documents")
    op.drop_index(op.f("ix_rag_documents_source_file_id"), table_name="rag_documents")
    op.drop_index(op.f("ix_rag_documents_dataset_id"), table_name="rag_documents")
    op.drop_index(op.f("ix_rag_documents_content_hash"), table_name="rag_documents")
    op.drop_index(op.f("ix_rag_documents_company_id"), table_name="rag_documents")
    op.drop_index(op.f("ix_rag_documents_checksum_sha256"), table_name="rag_documents")
    op.drop_table("rag_documents")

