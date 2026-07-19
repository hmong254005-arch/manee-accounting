-- สร้างตารางสำหรับรายการบัญชี (transactions)
CREATE TABLE transactions (
  id text PRIMARY KEY,
  date text NOT NULL,
  amount numeric NOT NULL,
  category text,
  type text,
  note text
);

-- สร้างตารางสำหรับเมนูสินค้า (products)
CREATE TABLE products (
  id text PRIMARY KEY,
  name text NOT NULL,
  price numeric NOT NULL,
  category text,
  color text
);

-- ปิด Row Level Security (RLS) ชั่วคราวเพื่อให้ใช้งานได้เลยง่ายๆ (สำหรับแอปส่วนตัว)
-- *หากเปิดเป็นสาธารณะ ควรต้องสร้างระบบ Login และ RLS Policy เพิ่มเติม*
ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
