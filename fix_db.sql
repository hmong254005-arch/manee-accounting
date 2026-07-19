-- 1. ลบข้อมูลทดสอบเก่าทิ้งก่อน (เพราะข้อมูลเก่าไม่มีเจ้าของ ทำให้เพิ่มระบบ Login ไม่ได้)
TRUNCATE TABLE transactions;
TRUNCATE TABLE products;

-- 2. เพิ่มคอลัมน์ user_id ให้ตาราง
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS user_id uuid references auth.users;
ALTER TABLE products ADD COLUMN IF NOT EXISTS user_id uuid references auth.users;

-- 3. บังคับว่าข้อมูลใหม่ต้องมีเจ้าของเสมอ
ALTER TABLE transactions ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE products ALTER COLUMN user_id SET NOT NULL;

-- 4. เปิดระบบรักษาความปลอดภัย (แยกข้อมูลใครข้อมูลมัน)
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- 5. ลบนโยบายเก่า
DROP POLICY IF EXISTS "Users can only access their own transactions" ON transactions;
DROP POLICY IF EXISTS "Users can only access their own products" ON products;

-- 6. สร้างนโยบายใหม่
CREATE POLICY "Users can only access their own transactions" ON transactions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can only access their own products" ON products FOR ALL USING (auth.uid() = user_id);
