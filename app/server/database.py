import psycopg
from psycopg.rows import dict_row
from config import DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME


def get_db_connection():
    return psycopg.connect(
    host=DB_HOST,
    port=DB_PORT,
    user=DB_USER,
    password=DB_PASSWORD,
    dbname=DB_NAME,
    row_factory=dict_row
)

def get_db():
    with get_db_connection() as conn:
        yield conn

def init_db():
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
    """

    CREATE TABLE IF NOT EXISTS users (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        phone TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'customer' CHECK (role IN ('admin', 'pharmacist', 'customer')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS categories (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS brands (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS manufacturers (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS suppliers (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        phone TEXT NOT NULL UNIQUE,
        gstin TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS salts (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS products (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        brand_id BIGINT REFERENCES brands(id),
        category_id BIGINT REFERENCES categories(id),
        manufacturer_id BIGINT REFERENCES manufacturers(id),
        salt_id BIGINT REFERENCES salts(id),
        name TEXT NOT NULL,
        form TEXT NOT NULL CHECK (form IN (
            'Tablet','Capsule','Syrup','Suspension','Injection',
            'Ointment','Cream','Gel','Drops','Powder',
            'Inhaler','Lotion','Other'
        )),
        pack_size TEXT,
        schedule TEXT NOT NULL DEFAULT 'OTC' CHECK (schedule IN ('OTC', 'H', 'H1', 'X')),
        requires_prescription BOOLEAN GENERATED ALWAYS AS (schedule <> 'OTC') STORED,
        gst_percent NUMERIC(4,2) NOT NULL DEFAULT 12,
        hsn_code TEXT,
        storage_condition TEXT,
        description TEXT,
        image_url TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        -- fingerprint of name + form + pack size + salts (see repositories/signature.py)
        signature TEXT NOT NULL,
        CONSTRAINT products_signature_key UNIQUE (signature)
    );

    CREATE TABLE IF NOT EXISTS product_details (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        product_id BIGINT NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
        description_uses TEXT,
        side_effects_warnings TEXT,
        dosage_information TEXT,
        storage_care TEXT,
        information_source TEXT,
        last_reviewed_at DATE
    );

    CREATE TABLE IF NOT EXISTS product_salts (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        salt_id BIGINT NOT NULL REFERENCES salts(id),
        strength TEXT,
        UNIQUE (product_id, salt_id)
    );

    CREATE TABLE IF NOT EXISTS batches (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        product_id BIGINT NOT NULL REFERENCES products(id),
        batch_no TEXT NOT NULL,
        mfg_date DATE,
        expiry_date DATE NOT NULL,
        quantity INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
        purchase_price NUMERIC(10,2) CHECK (purchase_price >= 0 and purchase_price <= mrp),
        mrp NUMERIC(10,2) CHECK (mrp >= 0),
        discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0
            CHECK (discount_percent BETWEEN 0 AND 100),
        supplier_id BIGINT REFERENCES suppliers(id),
        rack_location TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (product_id, batch_no),
        CHECK (mfg_date IS NULL OR expiry_date > mfg_date)
    );

    ALTER TABLE batches
        ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0
        CHECK (discount_percent BETWEEN 0 AND 100);

    CREATE TABLE IF NOT EXISTS addresses (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        line TEXT NOT NULL,
        city TEXT NOT NULL,
        pincode TEXT NOT NULL,
        phone TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cart_items (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        product_id BIGINT NOT NULL REFERENCES products(id),
        quantity INT NOT NULL CHECK (quantity > 0),
        UNIQUE (user_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS orders (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id),
        status TEXT NOT NULL DEFAULT 'pending'
            CHECK (status IN (
                'pending', 'confirmed', 'processing', 'shipped',
                'delivered', 'cancelled'
            )),
        address JSONB NOT NULL,
        total NUMERIC(12, 2) NOT NULL CHECK (total >= 0),
        payment_method TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS order_items (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id BIGINT NOT NULL REFERENCES products(id),
        batch_id BIGINT NOT NULL REFERENCES batches(id),
        quantity INT NOT NULL CHECK (quantity > 0),
        unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
        mrp NUMERIC(10, 2) NOT NULL CHECK (mrp >= 0),
        discount_percent NUMERIC(5, 2) NOT NULL
            CHECK (discount_percent BETWEEN 0 AND 100)
    );

    ALTER TABLE order_items
        ADD COLUMN IF NOT EXISTS mrp NUMERIC(10, 2) NOT NULL DEFAULT 0
            CHECK (mrp >= 0);
    ALTER TABLE order_items
        ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0
            CHECK (discount_percent BETWEEN 0 AND 100);

    CREATE TABLE IF NOT EXISTS prescriptions (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id),
        file_path TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending', 'approved', 'rejected')),
        reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TIMESTAMPTZ,
        reject_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS trigger AS $$
    BEGIN
        NEW.updated_at = now();
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_products_updated_at ON products;

    CREATE TRIGGER trg_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

    CREATE OR REPLACE FUNCTION sync_product_active()
    RETURNS trigger AS $$
    BEGIN
        IF TG_OP IN ('UPDATE', 'DELETE') THEN
            UPDATE products
            SET is_active = EXISTS (
                SELECT 1 FROM batches WHERE product_id = OLD.product_id AND quantity > 0
            )
            WHERE id = OLD.product_id;
        END IF;
        IF TG_OP IN ('INSERT', 'UPDATE') THEN
            UPDATE products
            SET is_active = EXISTS (
                SELECT 1 FROM batches WHERE product_id = NEW.product_id AND quantity > 0
            )
            WHERE id = NEW.product_id;
        END IF;
        RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_batches_sync_active ON batches;

    CREATE TRIGGER trg_batches_sync_active
    AFTER INSERT OR UPDATE OR DELETE ON batches
    FOR EACH ROW
    EXECUTE FUNCTION sync_product_active();
    """
)
 
if __name__ == "__main__":
    init_db()
