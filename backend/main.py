from __future__ import annotations

import io
import json
import os
import secrets
import uuid
from datetime import date, datetime, timedelta
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Literal

import pandas as pd
from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import Boolean, Float, Integer, String, Text, create_engine, inspect, or_, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker


BASE_DIR = Path(__file__).resolve().parent
DATABASE_URL = f"sqlite:///{(BASE_DIR / 'store.db').as_posix()}"
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "ElectroMart2026!")
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "em_pro_secret_token_998877")
MAX_UPLOAD_SIZE = 5 * 1024 * 1024
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    sku: Mapped[str] = mapped_column(String(80), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(240), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    brand: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    price: Mapped[int] = mapped_column(Integer, nullable=False)
    old_price: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    discount_percent: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    stock_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    in_stock: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    rating: Mapped[float] = mapped_column(Float, nullable=False, default=4.5)
    specs: Mapped[str] = mapped_column(Text, nullable=False, default="")
    image_url: Mapped[str] = mapped_column(String(1000), nullable=False, default="")
    is_promo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class Promotion(Base):
    __tablename__ = "promotions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    subtitle: Mapped[str] = mapped_column(String(500), nullable=False)
    discount_text: Mapped[str] = mapped_column(String(100), nullable=False)
    end_date: Mapped[str] = mapped_column(String(40), nullable=False)
    banner_color: Mapped[str] = mapped_column(String(40), nullable=False)


class News(Base):
    __tablename__ = "news"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    summary: Mapped[str] = mapped_column(String(1000), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    date: Mapped[str] = mapped_column(String(40), nullable=False)
    image_url: Mapped[str] = mapped_column(String(1000), nullable=False)


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    customer_name: Mapped[str] = mapped_column(String(240), nullable=False)
    phone: Mapped[str] = mapped_column(String(80), nullable=False)
    address: Mapped[str] = mapped_column(String(1000), nullable=False)
    items_json: Mapped[str] = mapped_column(Text, nullable=False)
    total_price: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(80), nullable=False, default="Новый")
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    sender: Mapped[str] = mapped_column(String(20), nullable=False)
    client_name: Mapped[str] = mapped_column(String(240), nullable=False)
    client_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ProductCreate(BaseModel):
    sku: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=240)
    category: str = Field(min_length=1, max_length=120)
    brand: str = Field(min_length=1, max_length=100)
    price: int = Field(ge=0)
    old_price: int = Field(default=0, ge=0)
    discount_percent: int = Field(default=0, ge=0, le=100)
    stock_count: int = Field(default=0, ge=0)
    in_stock: bool | None = None
    rating: float = Field(default=4.5, ge=0, le=5)
    specs: str = ""
    image_url: str = ""
    is_promo: bool = False

    @field_validator("sku", "name", "category", "brand", "specs", "image_url", mode="before")
    @classmethod
    def sanitize_text_fields(cls, value: Any) -> Any:
        return sanitize_text(value) if isinstance(value, str) else value


class ProductUpdate(BaseModel):
    sku: str | None = Field(default=None, min_length=1, max_length=80)
    name: str | None = Field(default=None, min_length=1, max_length=240)
    category: str | None = Field(default=None, min_length=1, max_length=120)
    brand: str | None = Field(default=None, min_length=1, max_length=100)
    price: int | None = Field(default=None, ge=0)
    old_price: int | None = Field(default=None, ge=0)
    discount_percent: int | None = Field(default=None, ge=0, le=100)
    stock_count: int | None = Field(default=None, ge=0)
    in_stock: bool | None = None
    rating: float | None = Field(default=None, ge=0, le=5)
    specs: str | None = None
    image_url: str | None = None
    is_promo: bool | None = None

    @field_validator("sku", "name", "category", "brand", "specs", "image_url", mode="before")
    @classmethod
    def sanitize_text_fields(cls, value: Any) -> Any:
        return sanitize_text(value) if isinstance(value, str) else value


class ProductRead(ORMModel):
    id: int
    sku: str
    name: str
    category: str
    brand: str
    price: int
    old_price: int
    discount_percent: int
    stock_count: int
    in_stock: bool
    rating: float
    specs: str
    image_url: str
    is_promo: bool


class PromotionCreate(BaseModel):
    title: str
    subtitle: str
    discount_text: str
    end_date: str
    banner_color: str

    @field_validator("title", "subtitle", "discount_text", "end_date", "banner_color", mode="before")
    @classmethod
    def sanitize_text_fields(cls, value: Any) -> Any:
        return sanitize_text(value) if isinstance(value, str) else value


class PromotionRead(ORMModel):
    id: int
    title: str
    subtitle: str
    discount_text: str
    end_date: str
    banner_color: str


class NewsCreate(BaseModel):
    title: str
    summary: str
    content: str
    date: str
    image_url: str

    @field_validator("title", "summary", "content", "date", "image_url", mode="before")
    @classmethod
    def sanitize_text_fields(cls, value: Any) -> Any:
        return sanitize_text(value) if isinstance(value, str) else value


class NewsRead(ORMModel):
    id: int
    title: str
    summary: str
    content: str
    date: str
    image_url: str


class OrderCreate(BaseModel):
    customer_name: str = Field(min_length=1, max_length=240)
    phone: str = Field(min_length=1, max_length=80)
    address: str = Field(min_length=1, max_length=1000)
    items_json: str | list[dict[str, Any]]
    total_price: int = Field(ge=0)
    status: str = "Новый"

    @field_validator("customer_name", "phone", "address", "status", mode="before")
    @classmethod
    def sanitize_text_fields(cls, value: Any) -> Any:
        return sanitize_text(value) if isinstance(value, str) else value

    @field_validator("items_json", mode="before")
    @classmethod
    def sanitize_items(cls, value: Any) -> Any:
        if isinstance(value, str):
            try:
                value = json.loads(value)
            except json.JSONDecodeError:
                return sanitize_text(value)
        return sanitize_nested_text(value)


class OrderRead(ORMModel):
    id: int
    customer_name: str
    phone: str
    address: str
    items_json: str
    total_price: int
    status: str
    created_at: datetime


class OrderStatusUpdate(BaseModel):
    status: str = Field(min_length=1, max_length=80)


class ChatCreate(BaseModel):
    sender: Literal["client", "admin"]
    client_name: str = Field(min_length=1, max_length=240)
    message: str = Field(min_length=1)
    client_id: str | None = Field(default=None, min_length=36, max_length=36)

    @field_validator("client_name", "message", mode="before")
    @classmethod
    def sanitize_text_fields(cls, value: Any) -> Any:
        return sanitize_text(value) if isinstance(value, str) else value

    @field_validator("client_id")
    @classmethod
    def validate_client_id(cls, value: str | None) -> str | None:
        if value is None:
            return value
        try:
            return str(uuid.UUID(value))
        except ValueError as exc:
            raise ValueError("client_id must be a UUID.") from exc


class ChatRead(ORMModel):
    id: int
    sender: str
    client_name: str
    client_id: str | None
    message: str
    created_at: datetime
    is_read: bool


class ChatMarkRead(BaseModel):
    ids: list[int] | None = None


class AdminLogin(BaseModel):
    username: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=256)


app = FastAPI(title="ElectroMart Pro API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

class _PlainTextSanitizer(HTMLParser):
    _blocked_tags = {"script", "style", "iframe", "object", "embed", "svg", "math"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.blocked_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() in self._blocked_tags:
            self.blocked_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in self._blocked_tags and self.blocked_depth:
            self.blocked_depth -= 1

    def handle_data(self, data: str) -> None:
        if not self.blocked_depth:
            self.parts.append(data)


def sanitize_text(value: str) -> str:
    parser = _PlainTextSanitizer()
    parser.feed(value)
    parser.close()
    return "".join(parser.parts).replace("\x00", "").strip()


def sanitize_nested_text(value: Any) -> Any:
    if isinstance(value, str):
        return sanitize_text(value)
    if isinstance(value, list):
        return [sanitize_nested_text(item) for item in value]
    if isinstance(value, dict):
        return {key: sanitize_nested_text(item) for key, item in value.items()}
    return value


def is_admin_token_valid(token: str | None) -> bool:
    return bool(token) and secrets.compare_digest(token.encode("utf-8"), ADMIN_TOKEN.encode("utf-8"))


def secure_compare(candidate: str, expected: str) -> bool:
    return secrets.compare_digest(candidate.encode("utf-8"), expected.encode("utf-8"))


def verify_admin(x_admin_token: str | None = Header(default=None)) -> None:
    if not is_admin_token_valid(x_admin_token):
        raise HTTPException(status_code=401, detail="Требуется вход администратора.")


@app.post("/api/admin/login")
def admin_login(payload: AdminLogin, response: Response) -> dict[str, str]:
    response.headers["Cache-Control"] = "no-store"
    if not (
        secure_compare(payload.username, ADMIN_USERNAME)
        and secure_compare(payload.password, ADMIN_PASSWORD)
    ):
        raise HTTPException(status_code=401, detail="Неверное имя пользователя или пароль.")
    return {"token": ADMIN_TOKEN}


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


APPLIANCE_CATALOG: dict[str, dict[str, Any]] = {
    "Холодильники": {
        "prefix": "FR",
        "base_price": 25990,
        "brands": ["Samsung", "LG", "Bosch", "Haier", "Indesit"],
        "names": [
            "Холодильник с верхней морозильной камерой", "Двухкамерный холодильник No Frost",
            "Холодильник Side-by-Side", "Встраиваемый холодильник", "Холодильник с зоной свежести",
            "Компактный холодильник для дома", "Холодильник с диспенсером воды", "Многокамерный холодильник",
            "Холодильник с инверторным компрессором", "Холодильник с нижней морозильной камерой",
            "Двухдверный холодильник No Frost", "Встраиваемый холодильник с морозильником",
            "Холодильник с технологией свежести", "Холодильник большого объёма", "Холодильник с металлической полкой",
            "Холодильник с электронным управлением", "Холодильник с системой Multi Air Flow",
            "Холодильник с режимом отпуска", "Холодильник с быстрой заморозкой", "Холодильник для большой семьи",
        ],
        "specs": ["Общий объём 340 л; No Frost; класс A+; уровень шума 38 дБ",
                  "Общий объём 410 л; инверторный компрессор; зона свежести; класс A++"],
        "image": "photo-1584568694244-14fbdf83bd30",
    },
    "Стиральные машины": {
        "prefix": "WM",
        "base_price": 21990,
        "brands": ["Samsung", "LG", "Bosch", "Haier", "Indesit"],
        "names": [
            "Стиральная машина с фронтальной загрузкой", "Узкая стиральная машина автомат",
            "Стиральная машина с паровой обработкой", "Встраиваемая стиральная машина",
            "Стиральная машина с инверторным двигателем", "Стиральная машина с дозагрузкой белья",
            "Стиральная машина с обработкой паром", "Стиральная машина с цифровым дисплеем",
            "Стиральная машина с защитой от протечек", "Стиральная машина с быстрой стиркой",
            "Стиральная машина с загрузкой 8 кг", "Стиральная машина с загрузкой 9 кг",
            "Компактная стиральная машина", "Стиральная машина с функцией сушки",
            "Стиральная машина с интеллектуальной стиркой", "Стиральная машина с тихим режимом",
            "Стиральная машина с очисткой барабана", "Стиральная машина с программой для шерсти",
            "Стиральная машина с пузырьковой стиркой", "Стиральная машина для большой семьи",
        ],
        "specs": ["Загрузка 8 кг; 1200 об/мин; 14 программ; класс энергопотребления A",
                  "Загрузка 9 кг; инверторный двигатель; обработка паром; защита от протечек"],
        "image": "photo-1626806787461-102c1bfaaea1",
    },
    "Телевизоры": {
        "prefix": "TV",
        "base_price": 24990,
        "brands": ["Samsung", "LG", "Haier", "Xiaomi", "Philips"],
        "names": [
            "Смарт-телевизор 4K UHD", "Телевизор QLED с диагональю 55 дюймов",
            "OLED-телевизор с тонкой рамкой", "Телевизор с Android TV", "Смарт-телевизор с HDR10+",
            "Телевизор 4K с голосовым управлением", "Телевизор с технологией Ambilight",
            "Телевизор с диагональю 43 дюйма", "Телевизор с диагональю 65 дюймов",
            "Телевизор с частотой обновления 120 Гц", "Телевизор с квантовыми точками",
            "Компактный смарт-телевизор", "Телевизор с Dolby Vision", "Телевизор с локальным затемнением",
            "Телевизор с игровым режимом", "Телевизор с безрамочным экраном",
            "Телевизор с Wi-Fi и Bluetooth", "Телевизор с голосовым помощником",
            "Телевизор с объёмным звуком", "Телевизор для домашнего кинотеатра",
        ],
        "specs": ["Диагональ 55 дюймов; разрешение 4K UHD; Smart TV; HDR; Wi-Fi",
                  "Диагональ 65 дюймов; QLED; 4K UHD; частота 120 Гц; Dolby Atmos"],
        "image": "photo-1593359677879-a4bb92f829d1",
    },
    "Пылесосы": {
        "prefix": "VC",
        "base_price": 10990,
        "brands": ["Dyson", "Philips", "Xiaomi", "Bosch", "LG"],
        "names": [
            "Вертикальный беспроводной пылесос", "Робот-пылесос с влажной уборкой",
            "Пылесос с контейнером для пыли", "Моющий пылесос для дома", "Компактный ручной пылесос",
            "Робот-пылесос с лазерной навигацией", "Пылесос с циклонным фильтром",
            "Беспроводной пылесос с турбощёткой", "Пылесос с HEPA-фильтром",
            "Робот-пылесос с самоочисткой", "Пылесос для сухой и влажной уборки",
            "Пылесос с регулировкой мощности", "Пылесос с большим пылесборником",
            "Лёгкий вертикальный пылесос", "Пылесос с насадкой для мебели",
            "Робот-пылесос с построением карты", "Пылесос для уборки шерсти животных",
            "Пылесос с низким уровнем шума", "Пылесос с длинным сетевым кабелем",
            "Мощный пылесос для большой квартиры",
        ],
        "specs": ["Мощность всасывания 220 Вт; контейнер 0,6 л; до 60 минут работы",
                  "Лазерная навигация; сухая и влажная уборка; аккумулятор 5200 мА·ч"],
        "image": "photo-1558317374-067fb5f30001",
    },
    "Кухонная техника": {
        "prefix": "KT",
        "base_price": 10990,
        "brands": ["Bosch", "Philips", "Xiaomi", "LG", "Haier"],
        "names": [
            "Кофемашина автоматическая", "Мультиварка с программами приготовления",
            "Планетарный кухонный комбайн", "Электрический чайник с терморегулятором",
            "Блендер с насадкой-венчиком", "Аэрогриль с цифровым управлением",
            "Микроволновая печь с грилем", "Встраиваемая электрическая духовка",
            "Посудомоечная машина узкая", "Индукционная варочная панель",
            "Тостер с автоматическим отключением", "Кухонный комбайн с мясорубкой",
            "Кофемолка с регулировкой помола", "Хлебопечь с диспенсером",
            "Соковыжималка шнековая", "Электрический гриль с антипригарным покрытием",
            "Миксер с чашей", "Компактная посудомоечная машина",
            "Встраиваемая микроволновая печь", "Мясорубка с реверсом",
        ],
        "specs": ["Мощность 1200 Вт; 12 автоматических программ; чаша 5 л; дисплей",
                  "Мощность 1500 Вт; сенсорное управление; автоматические режимы; защита от перегрева"],
        "image": "photo-1556911220-bff31c812dba",
    },
    "Климатическая техника": {
        "prefix": "CL",
        "base_price": 14990,
        "brands": ["Xiaomi", "Philips", "Haier", "LG", "Samsung"],
        "names": [
            "Сплит-система с инверторным компрессором", "Очиститель воздуха с HEPA-фильтром",
            "Увлажнитель воздуха с гигростатом", "Мобильный кондиционер для квартиры",
            "Осушитель воздуха для дома", "Очиститель воздуха с датчиком качества",
            "Настенный кондиционер с обогревом", "Увлажнитель воздуха ультразвуковой",
            "Очиститель воздуха для аллергиков", "Сплит-система с тихим режимом",
            "Компактный климатический комплекс", "Вентилятор с дистанционным управлением",
            "Кондиционер с Wi-Fi управлением", "Очиститель-увлажнитель воздуха",
            "Увлажнитель воздуха с верхним заливом", "Тепловентилятор с термостатом",
            "Конвектор электрический настенный", "Мойка воздуха для квартиры",
            "Сплит-система с режимом сна", "Климатический комплекс для большой комнаты",
        ],
        "specs": ["Площадь помещения до 25 м²; инвертор; режимы охлаждения и обогрева; Wi-Fi",
                  "Площадь до 40 м²; HEPA-фильтр H13; датчик PM2.5; тихий ночной режим"],
        "image": "photo-1585771724684-38269d6639fd",
    },
}


def catalog_products() -> list[dict[str, Any]]:
    products: list[dict[str, Any]] = []
    for category, data in APPLIANCE_CATALOG.items():
        for index, name in enumerate(data["names"]):
            brand = data["brands"][index % len(data["brands"])]
            price = data["base_price"] + index * 4870 + (index % 3) * 1190
            price = min(price, 150000)
            discount = (index % 5) * 5 if index % 3 != 0 else 0
            old_price = round(price / (1 - discount / 100)) if discount else price
            stock_count = 4 + (index * 7) % 35
            products.append(
                {
                    "sku": f"{data['prefix']}-{index + 1:03d}",
                    "name": f"{brand} {name} {index + 1:02d}",
                    "category": category,
                    "brand": brand,
                    "price": price,
                    "old_price": old_price,
                    "discount_percent": discount,
                    "stock_count": stock_count,
                    "in_stock": stock_count > 0,
                    "rating": round(4.1 + ((index * 7) % 9) / 10, 1),
                    "specs": data["specs"][index % len(data["specs"])],
                    "image_url": f"https://images.unsplash.com/{data['image']}?auto=format&fit=crop&w=900&q=80",
                    "is_promo": discount > 0,
                }
            )
    return products


def create_sample_workbook(products: list[dict[str, Any]]) -> None:
    sample_path = BASE_DIR / "sample_products_200.xlsx"
    if sample_path.exists():
        return
    columns = [
        "sku", "name", "category", "brand", "price", "old_price",
        "discount_percent", "stock_count", "specs", "image_url", "is_promo",
    ]
    frame = pd.DataFrame(products[:50], columns=columns)
    frame.to_excel(sample_path, index=False, engine="openpyxl")


def seed_database() -> None:
    Base.metadata.create_all(bind=engine)
    chat_columns = {column["name"] for column in inspect(engine).get_columns("chat_messages")}
    if "client_id" not in chat_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE chat_messages ADD COLUMN client_id VARCHAR(36)"))
    with engine.begin() as connection:
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_chat_messages_client_id ON chat_messages (client_id)")
        )
    db = SessionLocal()
    try:
        if db.query(Product).count() == 0:
            products = catalog_products()
            if len(products) != 120:
                raise RuntimeError("The starter catalog must contain exactly 120 products.")
            db.add_all(Product(**product) for product in products)
            db.commit()
        else:
            products = catalog_products()
        if db.query(Promotion).count() == 0:
            db.add_all(
                [
                    Promotion(
                        title="Большая распродажа техники",
                        subtitle="Скидки на популярную бытовую технику для вашего дома",
                        discount_text="до −30%",
                        end_date=(date.today() + timedelta(days=14)).isoformat(),
                        banner_color="#2563eb",
                    ),
                    Promotion(
                        title="Комфортный климат",
                        subtitle="Подготовьте дом к любому сезону с выгодой",
                        discount_text="до −20%",
                        end_date=(date.today() + timedelta(days=21)).isoformat(),
                        banner_color="#0891b2",
                    ),
                    Promotion(
                        title="Умная кухня",
                        subtitle="Техника для быстрых и вкусных домашних блюд",
                        discount_text="−15%",
                        end_date=(date.today() + timedelta(days=30)).isoformat(),
                        banner_color="#7c3aed",
                    ),
                ]
            )
        if db.query(News).count() == 0:
            today = date.today()
            articles = [
                ("Как выбрать холодильник для семьи", "Разбираемся в объёме, системах охлаждения и полезных функциях.",
                 "При выборе холодильника учитывайте размер семьи, доступное пространство и привычки хранения продуктов. No Frost упрощает уход, а зона свежести помогает дольше сохранять продукты.", "photo-1584568694244-14fbdf83bd30"),
                ("Пять советов для экономичной стирки", "Простые настройки помогут беречь воду, электричество и одежду.",
                 "Загружайте барабан в соответствии с рекомендациями производителя, выбирайте подходящую температуру и регулярно очищайте фильтр. Экономичная программа подходит для повседневной стирки.", "photo-1626806787461-102c1bfaaea1"),
                ("Домашний кинотеатр: выбираем телевизор", "На что обратить внимание при выборе экрана для гостиной.",
                 "Сопоставьте диагональ с расстоянием до дивана, проверьте поддержку HDR и удобство Smart TV. Для динамичных игр пригодится высокая частота обновления экрана.", "photo-1593359677879-a4bb92f829d1"),
                ("Чистый воздух в квартире", "Рассказываем, чем отличаются очистители и увлажнители воздуха.",
                 "Очиститель задерживает частицы пыли подходящими фильтрами, а увлажнитель поддерживает комфортную влажность. Выбирайте устройство по площади комнаты и не забывайте о регулярном обслуживании.", "photo-1631545806609-8a4b7f4e2f5c"),
            ]
            db.add_all(
                News(
                    title=title,
                    summary=summary,
                    content=content,
                    date=(today - timedelta(days=index)).isoformat(),
                    image_url=f"https://images.unsplash.com/{image}?auto=format&fit=crop&w=1200&q=80",
                )
                for index, (title, summary, content, image) in enumerate(articles)
            )
        if db.query(ChatMessage).count() == 0:
            db.add_all(
                [
                    ChatMessage(
                        sender="admin",
                        client_name="Команда ElectroMart Pro",
                        message="Здравствуйте! Добро пожаловать в ElectroMart Pro. Чем можем помочь?",
                        is_read=True,
                    ),
                    ChatMessage(
                        sender="client",
                        client_name="Новый покупатель",
                        message="Здравствуйте! Подскажите, пожалуйста, как оформить заказ?",
                        is_read=False,
                    ),
                ]
            )
        db.commit()
        create_sample_workbook(catalog_products())
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@app.on_event("startup")
def on_startup() -> None:
    is_production = (
        os.getenv("ENVIRONMENT", "").lower() == "production"
        or os.getenv("PORT") is not None
        or os.getenv("RENDER_EXTERNAL_HOSTNAME") is not None
    )
    if is_production:
        if (
            ADMIN_PASSWORD == "ElectroMart2026!"
            or ADMIN_TOKEN == "em_pro_secret_token_998877"
            or len(ADMIN_PASSWORD) < 12
            or len(ADMIN_TOKEN) < 32
        ):
            raise RuntimeError(
                "Production requires custom ADMIN_PASSWORD (12+ characters) and "
                "ADMIN_TOKEN (32+ characters) environment variables."
            )
    seed_database()


@app.get("/api/products", response_model=list[ProductRead])
def list_products(
    category: str | None = None,
    brand: str | None = None,
    search: str | None = None,
    min_price: int | None = None,
    max_price: int | None = None,
    is_promo: bool | None = None,
    sort_by: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(Product)
    if category:
        query = query.filter(Product.category == category)
    if brand:
        query = query.filter(Product.brand == brand)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.filter(or_(Product.name.ilike(pattern), Product.brand.ilike(pattern), Product.sku.ilike(pattern)))
    if min_price is not None:
        query = query.filter(Product.price >= min_price)
    if max_price is not None:
        query = query.filter(Product.price <= max_price)
    if is_promo is not None:
        query = query.filter(Product.is_promo.is_(is_promo))
    sort_options = {
        "price_asc": Product.price.asc(),
        "price_desc": Product.price.desc(),
        "rating": Product.rating.desc(),
        "name": Product.name.asc(),
        "newest": Product.id.desc(),
    }
    if sort_by:
        ordering = sort_options.get(sort_by)
        if ordering is None:
            raise HTTPException(status_code=400, detail="Unsupported sort_by value.")
        query = query.order_by(ordering)
    return query.all()


@app.post("/api/products", response_model=ProductRead, status_code=201)
def create_product(
    payload: ProductCreate,
    db: Session = Depends(get_db),
    _: None = Depends(verify_admin),
):
    values = payload.model_dump()
    if values["in_stock"] is None:
        values["in_stock"] = values["stock_count"] > 0
    product = Product(**values)
    db.add(product)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="A product with this SKU already exists.") from exc
    db.refresh(product)
    return product


@app.put("/api/products/{product_id}", response_model=ProductRead)
def update_product(
    product_id: int,
    payload: ProductUpdate,
    db: Session = Depends(get_db),
    _: None = Depends(verify_admin),
):
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found.")
    values = payload.model_dump(exclude_unset=True)
    for field, value in values.items():
        if value is not None:
            setattr(product, field, value)
    if "stock_count" in values and "in_stock" not in values:
        product.in_stock = product.stock_count > 0
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="A product with this SKU already exists.") from exc
    db.refresh(product)
    return product


@app.delete("/api/products/{product_id}")
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(verify_admin),
):
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found.")
    db.delete(product)
    db.commit()
    return {"deleted": True, "id": product_id}


PRODUCT_COLUMNS = [
    "sku", "name", "category", "brand", "price", "old_price",
    "discount_percent", "stock_count", "specs", "image_url", "is_promo",
]


def _cell_text(value: Any) -> str:
    if pd.isna(value):
        return ""
    return str(value).strip()


def _cell_int(row: pd.Series, column: str, default: int, row_number: int) -> int:
    value = row.get(column)
    if pd.isna(value) or value == "":
        return default
    try:
        number = float(value)
        if not number.is_integer() or number < 0:
            raise ValueError
        return int(number)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f"Invalid {column} value in spreadsheet row {row_number}.")


def _cell_bool(row: pd.Series, column: str, default: bool, row_number: int) -> bool:
    value = row.get(column)
    if pd.isna(value) or value == "":
        return default
    if isinstance(value, bool):
        return value
    normalized = str(value).strip().lower()
    if normalized in {"true", "1", "yes", "да", "истина"}:
        return True
    if normalized in {"false", "0", "no", "нет", "ложь"}:
        return False
    raise HTTPException(status_code=400, detail=f"Invalid {column} value in spreadsheet row {row_number}.")


@app.post("/api/products/upload-excel")
async def upload_products(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: None = Depends(verify_admin),
):
    extension = Path(file.filename or "").suffix.lower()
    if extension not in {".xlsx", ".xls"}:
        raise HTTPException(status_code=400, detail="Upload an .xlsx or .xls file.")
    contents = await file.read(MAX_UPLOAD_SIZE + 1)
    if len(contents) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="The uploaded file exceeds the 5 MB limit.")
    if not contents:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    try:
        if extension == ".xlsx":
            frame = pd.read_excel(io.BytesIO(contents), engine="openpyxl")
        else:
            frame = pd.read_excel(io.BytesIO(contents), engine="xlrd")
    except (ValueError, OSError, pd.errors.ParserError, ImportError) as exc:
        raise HTTPException(status_code=400, detail=f"Could not read the uploaded file: {exc}") from exc
    frame.columns = [str(column).strip().lower() for column in frame.columns]
    required = {"sku", "name", "category", "brand", "price"}
    missing = sorted(required - set(frame.columns))
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required columns: {', '.join(missing)}.")
    added = 0
    updated = 0
    try:
        for row_index, row in frame.iterrows():
            row_number = int(row_index) + 2
            sku = sanitize_text(_cell_text(row.get("sku")))
            name = sanitize_text(_cell_text(row.get("name")))
            category = sanitize_text(_cell_text(row.get("category")))
            brand = sanitize_text(_cell_text(row.get("brand")))
            if not all((sku, name, category, brand)):
                raise HTTPException(status_code=400, detail=f"Missing required product data in spreadsheet row {row_number}.")
            stock_count = _cell_int(row, "stock_count", 0, row_number)
            values = {
                "sku": sku,
                "name": name,
                "category": category,
                "brand": brand,
                "price": _cell_int(row, "price", 0, row_number),
                "old_price": _cell_int(row, "old_price", 0, row_number),
                "discount_percent": _cell_int(row, "discount_percent", 0, row_number),
                "stock_count": stock_count,
                "in_stock": stock_count > 0,
                "rating": 4.5,
                "specs": sanitize_text(_cell_text(row.get("specs"))),
                "image_url": sanitize_text(_cell_text(row.get("image_url"))),
                "is_promo": _cell_bool(row, "is_promo", False, row_number),
            }
            product = db.query(Product).filter(Product.sku == sku).first()
            if product is None:
                product = db.query(Product).filter(Product.name == name).first()
            if product is None:
                db.add(Product(**values))
                added += 1
            else:
                for key, value in values.items():
                    setattr(product, key, value)
                updated += 1
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Spreadsheet contains conflicting product SKUs.") from exc
    except Exception:
        db.rollback()
        raise
    return {"added": added, "updated": updated, "total_processed": added + updated}


def _excel_response(frame: pd.DataFrame, filename: str) -> StreamingResponse:
    buffer = io.BytesIO()
    frame.to_excel(buffer, index=False, engine="openpyxl")
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/products/export-excel")
def export_products(
    db: Session = Depends(get_db),
    _: None = Depends(verify_admin),
):
    products = db.query(Product).order_by(Product.id).all()
    rows = [
        {column: getattr(product, column) for column in PRODUCT_COLUMNS}
        for product in products
    ]
    return _excel_response(pd.DataFrame(rows, columns=PRODUCT_COLUMNS), "electromart_products.xlsx")


@app.get("/api/products/template-excel")
def product_template():
    return _excel_response(pd.DataFrame(columns=PRODUCT_COLUMNS), "electromart_products_template.xlsx")


@app.get("/api/promotions", response_model=list[PromotionRead])
def list_promotions(db: Session = Depends(get_db)):
    return db.query(Promotion).order_by(Promotion.id).all()


@app.post("/api/promotions", response_model=PromotionRead, status_code=201)
def create_promotion(
    payload: PromotionCreate,
    db: Session = Depends(get_db),
    _: None = Depends(verify_admin),
):
    promotion = Promotion(**payload.model_dump())
    db.add(promotion)
    db.commit()
    db.refresh(promotion)
    return promotion


@app.delete("/api/promotions/{promotion_id}")
def delete_promotion(
    promotion_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(verify_admin),
):
    promotion = db.get(Promotion, promotion_id)
    if promotion is None:
        raise HTTPException(status_code=404, detail="Promotion not found.")
    db.delete(promotion)
    db.commit()
    return {"deleted": True, "id": promotion_id}


@app.get("/api/news", response_model=list[NewsRead])
def list_news(db: Session = Depends(get_db)):
    return db.query(News).order_by(News.date.desc(), News.id.desc()).all()


@app.post("/api/news", response_model=NewsRead, status_code=201)
def create_news(
    payload: NewsCreate,
    db: Session = Depends(get_db),
    _: None = Depends(verify_admin),
):
    article = News(**payload.model_dump())
    db.add(article)
    db.commit()
    db.refresh(article)
    return article


@app.delete("/api/news/{news_id}")
def delete_news(
    news_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(verify_admin),
):
    article = db.get(News, news_id)
    if article is None:
        raise HTTPException(status_code=404, detail="News article not found.")
    db.delete(article)
    db.commit()
    return {"deleted": True, "id": news_id}


@app.get("/api/orders", response_model=list[OrderRead])
def list_orders(
    db: Session = Depends(get_db),
    _: None = Depends(verify_admin),
):
    return db.query(Order).order_by(Order.created_at.desc(), Order.id.desc()).all()


@app.post("/api/orders", response_model=OrderRead, status_code=201)
def create_order(payload: OrderCreate, db: Session = Depends(get_db)):
    values = payload.model_dump()
    if not isinstance(values["items_json"], str):
        values["items_json"] = json.dumps(values["items_json"], ensure_ascii=False)
    order = Order(**values)
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


@app.put("/api/orders/{order_id}/status", response_model=OrderRead)
@app.put("/api/orders/{order_id}", response_model=OrderRead, include_in_schema=False)
def update_order_status(
    order_id: int,
    payload: OrderStatusUpdate,
    db: Session = Depends(get_db),
    _: None = Depends(verify_admin),
):
    order = db.get(Order, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found.")
    order.status = payload.status
    db.commit()
    db.refresh(order)
    return order


@app.get("/api/chat", response_model=list[ChatRead])
def list_chat(
    x_admin_token: str | None = Header(default=None),
    x_chat_session_id: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    if x_admin_token is not None and not is_admin_token_valid(x_admin_token):
        raise HTTPException(status_code=401, detail="Требуется вход администратора.")
    query = db.query(ChatMessage)
    if is_admin_token_valid(x_admin_token):
        pass
    elif x_chat_session_id is not None:
        try:
            client_id = str(uuid.UUID(x_chat_session_id))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid chat session ID.") from exc
        query = query.filter(ChatMessage.client_id == client_id)
    else:
        raise HTTPException(status_code=401, detail="Требуется идентификатор чата или вход администратора.")
    return query.order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc()).all()


@app.post("/api/chat", response_model=ChatRead, status_code=201)
def create_chat_message(
    payload: ChatCreate,
    x_admin_token: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    if payload.sender == "admin":
        if not is_admin_token_valid(x_admin_token):
            raise HTTPException(status_code=401, detail="Требуется вход администратора.")
    elif payload.client_id is None:
        raise HTTPException(status_code=400, detail="A chat session ID is required.")
    message = ChatMessage(**payload.model_dump(), is_read=False)
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


@app.put("/api/chat/mark-read")
def mark_chat_read(
    payload: ChatMarkRead | None = None,
    db: Session = Depends(get_db),
    _: None = Depends(verify_admin),
):
    query = db.query(ChatMessage).filter(ChatMessage.sender == "client", ChatMessage.is_read.is_(False))
    if payload is not None and payload.ids is not None:
        if not payload.ids:
            return {"updated": 0}
        query = query.filter(ChatMessage.id.in_(payload.ids))
    updated = query.update({ChatMessage.is_read: True}, synchronize_session=False)
    db.commit()
    return {"updated": updated}
