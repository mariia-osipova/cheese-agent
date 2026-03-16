import os
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
from astrapy import DataAPIClient

load_dotenv()

OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
ASTRA_DB_APPLICATION_TOKEN = os.environ["ASTRA_DB_APPLICATION_TOKEN"]
ASTRA_DB_API_ENDPOINT = os.environ["ASTRA_DB_API_ENDPOINT"]
ASTRA_DB_KEYSPACE = os.environ.get("ASTRA_DB_KEYSPACE", "cheese_db")
ASTRA_DB_COLLECTION = os.environ.get("ASTRA_DB_COLLECTION", "cheeses")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "text-embedding-3-small")

# Comma-separated list of allowed origins, e.g.:
#   ALLOWED_ORIGINS=https://yourname.github.io,http://localhost:5500
# Defaults to localhost only so production must set this env var explicitly.
_raw_origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:8000,http://127.0.0.1:8000,http://localhost:5500,http://127.0.0.1:5500,null")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

openai_client = OpenAI(api_key=OPENAI_API_KEY)

astra_client = DataAPIClient(ASTRA_DB_APPLICATION_TOKEN)
db = astra_client.get_database_by_api_endpoint(ASTRA_DB_API_ENDPOINT, keyspace=ASTRA_DB_KEYSPACE)
collection = db.get_collection(ASTRA_DB_COLLECTION)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["POST", "GET"],
    allow_headers=["Content-Type"],
)

SYSTEM_PROMPT = """You are Cheese Master, a friendly and knowledgeable cheese expert.
Answer questions using the cheese knowledge provided below.
If the context doesn't cover the question, use your general cheese knowledge but stay on topic.
Keep answers concise and engaging.

Cheese knowledge:
{context}"""


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    reply: str


def embed(text: str) -> list[float]:
    response = openai_client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=text,
    )
    return response.data[0].embedding


def search_cheeses(query_vector: list[float], top_k: int = 5) -> list[str]:
    results = collection.find(
        {},
        sort={"$vector": query_vector},
        limit=top_k,
        projection={"text": True, "_id": False},
    )
    return [doc["text"] for doc in results if "text" in doc]


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    query_vector = embed(req.message)
    context_chunks = search_cheeses(query_vector)
    context = "\n\n".join(context_chunks) if context_chunks else "No specific cheese data found."

    completion = openai_client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT.format(context=context)},
            {"role": "user", "content": req.message},
        ],
    )
    return ChatResponse(reply=completion.choices[0].message.content)


@app.get("/health")
def health():
    return {"status": "ok"}
