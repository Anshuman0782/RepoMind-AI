from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings


client = AsyncIOMotorClient(settings.mongodb_uri, serverSelectionTimeoutMS=2000)
db = client[settings.mongodb_db]
