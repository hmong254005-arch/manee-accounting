-- อัปเดตตาราง Transactions ให้รองรับระบบ Login
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS user_id uuid references auth.users not null;

-- อัปเดตตาราง Products ให้รองรับระบบ Login
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS user_id uuid references auth.users not null;

-- เปิดใช้งาน Row Level Security (RLS) เพื่อป้องกันไม่ให้ข้อมูลปะปนกัน
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- ลบนโยบาย (Policy) เก่าถ้ามี (กัน error)
DROP POLICY IF EXISTS "Users can only access their own transactions" ON transactions;
DROP POLICY IF EXISTS "Users can only access their own products" ON products;

-- สร้างนโยบายให้ Transactions: มองเห็นและแก้ไขได้เฉพาะข้อมูลของตัวเองเท่านั้น
CREATE POLICY "Users can only access their own transactions" 
ON transactions 
FOR ALL 
USING (auth.uid() = user_id);

-- สร้างนโยบายให้ Products: มองเห็นและแก้ไขได้เฉพาะข้อมูลของตัวเองเท่านั้น
CREATE POLICY "Users can only access their own products" 
ON products 
FOR ALL 
USING (auth.uid() = user_id);
