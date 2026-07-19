let CACHED_MODEL_NAME = null;

async function getBestModelName(apiKey) {
    if (CACHED_MODEL_NAME) return CACHED_MODEL_NAME;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (!response.ok) return "models/gemini-2.0-flash";
        
        const data = await response.json();
        const models = data.models || [];
        
        const validModels = models.filter(m => 
            m.supportedGenerationMethods && 
            m.supportedGenerationMethods.includes("generateContent") &&
            m.name.includes("gemini")
        );

        // 2.0 models have limit 0 on some free tier keys, so we prioritize the flash-lite-latest alias which works perfectly and resolves to 3.1-flash-lite
        let bestModel = validModels.find(m => m.name === "models/gemini-flash-lite-latest");
        if (!bestModel) bestModel = validModels.find(m => m.name === "models/gemini-flash-latest");
        if (!bestModel) bestModel = validModels[0];

        CACHED_MODEL_NAME = bestModel ? bestModel.name : "models/gemini-2.0-flash";
        return CACHED_MODEL_NAME;
    } catch (e) {
        return "models/gemini-2.0-flash";
    }
}

async function processUserMessage(message, apiKey, transactions = [], base64Image = null, mimeType = null) {
    const modelName = await getBestModelName(apiKey);
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${apiKey}`;

    const todayStart = new Date();
    todayStart.setHours(0,0,0,0);

    let totalIncome = 0; let totalExpense = 0;
    let storeIncome = 0; let storeExpense = 0;
    let houseIncome = 0; let houseExpense = 0;
    
    let todayIncome = 0; let todayExpense = 0;
    let todayStoreIncome = 0; let todayStoreExpense = 0;
    let todayHouseIncome = 0; let todayHouseExpense = 0;

    const sortedTx = [...transactions].sort((a,b) => new Date(b.date) - new Date(a.date));
    
    sortedTx.forEach(t => {
        const amt = Number(t.amount);
        const txDate = new Date(t.date);
        
        if (t.type === 'income') {
            totalIncome += amt;
            if (t.category === 'store') storeIncome += amt;
            else houseIncome += amt;
        } else {
            totalExpense += amt;
            if (t.category === 'store') storeExpense += amt;
            else houseExpense += amt;
        }
        
        if (txDate >= todayStart) {
            if (t.type === 'income') {
                todayIncome += amt;
                if (t.category === 'store') todayStoreIncome += amt;
                else todayHouseIncome += amt;
            } else {
                todayExpense += amt;
                if (t.category === 'store') todayStoreExpense += amt;
                else todayHouseExpense += amt;
            }
        }
    });

    // Calculate daily summaries for the prompt
    const dailySummaries = {};
    sortedTx.forEach(t => {
        const d = new Date(t.date);
        const dateStr = d.toLocaleDateString('th-TH'); // e.g. "15/7/2569"
        if (!dailySummaries[dateStr]) {
            dailySummaries[dateStr] = {
                storeIncome: 0, storeExpense: 0,
                houseIncome: 0, houseExpense: 0
            };
        }
        const amt = Number(t.amount);
        if (t.category === 'store') {
            if (t.type === 'income') dailySummaries[dateStr].storeIncome += amt;
            else dailySummaries[dateStr].storeExpense += amt;
        } else {
            if (t.type === 'income') dailySummaries[dateStr].houseIncome += amt;
            else dailySummaries[dateStr].houseExpense += amt;
        }
    });

    const dailySummaryText = Object.keys(dailySummaries).slice(0, 30).map(date => {
        const s = dailySummaries[date];
        const storeNet = s.storeIncome - s.storeExpense;
        const houseNet = s.houseIncome - s.houseExpense;
        const totalInc = s.storeIncome + s.houseIncome;
        const totalExp = s.storeExpense + s.houseExpense;
        const totalNet = storeNet + houseNet;
        return `- วันที่ ${date}:
  ร้านค้า: รายรับ ${s.storeIncome}, รายจ่าย ${s.storeExpense}, สุทธิ ${storeNet}
  ครัวเรือน: รายรับ ${s.houseIncome}, รายจ่าย ${s.houseExpense}, สุทธิ ${houseNet}
  รวมสุทธิทั้งวัน: รายรับ ${totalInc}, รายจ่าย ${totalExp}, สุทธิ ${totalNet}`;
    }).join('\n');

    const recentTx = sortedTx.slice(0, 50).map(t => 
        `- ${new Date(t.date).toLocaleString('th-TH')}: [${t.category === 'store' ? 'ร้านค้า' : 'ครัวเรือน'}] ${t.type === 'income' ? 'รายรับ' : 'รายจ่าย'} ${t.amount} บาท (${t.detail})`
    ).join("\n");

    const systemPrompt = `
คุณคือ "มานี" ผู้ช่วย AI อัจฉริยะด้านการเงินและบัญชีของร้านค้าไทย
วิเคราะห์ข้อความ หรือรูปภาพสลิป/ใบเสร็จที่ผู้ใช้ส่งมา แล้วจดบัญชีหรือตอบคำถามให้ถูกต้อง

[ข้อมูลสรุปการเงินปัจจุบัน] (ใช้ตอบเมื่อผู้ใช้ถามถึงยอดรวม/ภาพรวมเท่านั้น)
รายรับร้านค้าวันนี้: ${todayStoreIncome} บาท, รายจ่าย: ${todayStoreExpense} บาท
รายรับครัวเรือนวันนี้: ${todayHouseIncome} บาท, รายจ่าย: ${todayHouseExpense} บาท
ยอดสุทธิรวมทั้งหมด: ${totalIncome - totalExpense} บาท

[สรุปยอดแยกตามวัน] (ดึงตัวเลขจากส่วนนี้ไปตอบคำถามได้เลย ห้ามบวกเลขเองเด็ดขาด)
${dailySummaryText}

[ประวัติรายการล่าสุด] (ไว้อ้างอิงเท่านั้น ห้ามสรุปซ้ำ)
${recentTx}

ให้ตอบกลับเป็น JSON format เท่านั้น ห้ามมีข้อความอื่นปน
{
  "reply": "ข้อความตอบกลับ (ใช้ Markdown ได้และควรใช้ \\n เพื่อขึ้นบรรทัดใหม่ให้อ่านง่าย)",
  "transactions": [
    {
      "date": "${new Date().toISOString()}",
      "category": "store หรือ house",
      "type": "income หรือ expense",
      "detail": "ชื่อรายการ",
      "amount": ตัวเลข
    }
  ]
}

กฎที่ต้องปฏิบัติตามอย่างเคร่งครัด:
1. การจดบัญชีหลายรายการ: ถ้าผู้ใช้บอกมาหลายรายการ (เช่น ขายกาแฟ 8000, ซื้อนม 400, กินข้าว 100) ให้แยกวิเคราะห์และใส่ใน array "transactions" ให้ครบทุกรายการ **ห้ามตกหล่นเด็ดขาด** จำนวนรายการในข้อความตอบกลับต้องตรงกับจำนวน object ใน array
2. การตอบกลับเมื่อจดบันทึกหรือรายงานข้อมูล: **ต้องตอบกลับในรูปแบบตาราง Markdown เสมอ**
   - **กรณีสรุปยอดรวม (เช่น สรุปยอดวันนี้/เมื่อวาน):** ให้ใช้ตารางรูปแบบนี้:
     | ประเภทบัญชี | รายรับ (บาท) | รายจ่าย (บาท) | คงเหลือสุทธิ (บาท) | สถานะ |
     | --- | --- | --- | --- | --- |
     | 🏪 ร้านค้า | [ตัวเลข] | [ตัวเลข] | [ตัวเลข] | [เช่น กำไรดีเยี่ยม/ขาดทุน] |
     | 🏠 ครัวเรือน | [ตัวเลข] | [ตัวเลข] | [ตัวเลข] | [เช่น ปกติ/ใช้จ่ายสูง] |
     | **รวมสุทธิ** | **[ตัวเลข]** | **[ตัวเลข]** | **[ตัวเลข]** | **[เช่น กระแสเงินสดบวก/ติดลบ]** |
   - **กรณีแจ้งรายการที่เพิ่งจดบันทึก หรือ แจ้งรายละเอียดรายการ:** ให้ใช้ตารางรูปแบบนี้:
     | วันที่ | รายการ | รายรับ | รายจ่าย | หมวดหมู่ | หมายเหตุ (วิเคราะห์โดย AI) |
     | --- | --- | --- | --- | --- | --- |
     | [วันที่] | [ชื่อรายการ] | [ตัวเลข หรือ -] | [ตัวเลข หรือ -] | [ร้านค้า/ครัวเรือน] | [สั้นๆ เช่น รายได้หลัก, วัตถุดิบ, ค่าใช้จ่ายส่วนตัว] |
3. การวิเคราะห์ประเภท: ถ้าไม่แน่ใจ ให้วิเคราะห์จากบริบท (ของขาย/วัตถุดิบ = store (ร้านค้า), ของกินส่วนตัว/ของใช้ส่วนตัว = house (ครัวเรือน))
4. บทบาทที่ปรึกษาและเลขาอัจฉริยะ: หากผู้ใช้ขอคำแนะนำ (เช่น "มีอะไรต้องปรับปรุงไหม", "วิเคราะห์รายจ่ายให้หน่อย")
   - ให้วิเคราะห์ข้อมูลจาก [ประวัติรายการล่าสุด] และ [สรุปยอดแยกตามวัน] อย่างละเอียด
   - ชี้จุดรั่วไหลทางการเงิน (เช่น ค่าใช้จ่ายส่วนตัวสูงเกินไป, ต้นทุนร้านค้าสูง, รายรับน้อยกว่ารายจ่าย)
   - ให้คำแนะนำที่เป็นรูปธรรม เช่น วิธีลดต้นทุน, การทำโปรโมชั่น, หรือการแยกกระเป๋าเงินให้ชัดเจน
   - ใช้ภาษาที่ให้กำลังใจ เป็นมืออาชีพ และน่าเชื่อถือเหมือนเลขาคู่ใจ
[คำแนะนำพิเศษสำหรับรูปภาพสลิป/ใบเสร็จ]
ถ้าผู้ใช้ส่งรูปภาพมาด้วย:
- ให้อ่านข้อมูลจากรูปภาพ เช่น วันที่ ชื่อร้าน รายการสินค้า ยอดเงิน
- สลิปโอนเงิน (เงินเข้า) = รายรับ (income)
- ใบเสร็จซื้อของ / บิลค่าใช้จ่าย = รายจ่าย (expense)
- แจ้งผู้ใช้ว่าอ่านได้ข้อมูลอะไรบ้าง และจดบัญชีอะไรไปบ้าง
`;

    // Build user parts (text + optional image)
    const userParts = [];
    if (message) userParts.push({ text: message });
    if (base64Image && mimeType) {
        userParts.push({ inlineData: { mimeType: mimeType, data: base64Image } });
    }
    if (userParts.length === 0) userParts.push({ text: 'วิเคราะห์รูปภาพที่แนบมาให้หน่อย' });

    const requestBody = {
        contents: [
            { role: "user", parts: [{ text: systemPrompt }] },
            { role: "user", parts: userParts }
        ],
        generationConfig: {
            temperature: 0.2
        }
    };

    let maxRetries = 5;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errData = await response.json();
                const errMsg = errData.error?.message || "";
                
                // Handle 503 or overloaded errors by retrying
                if (response.status === 503 || response.status === 429 || errMsg.toLowerCase().includes("high demand") || errMsg.toLowerCase().includes("overloaded")) {
                    if (attempt < maxRetries) {
                        console.warn(`เซิร์ฟเวอร์ AI ทำงานหนัก กำลังลองใหม่... (ครั้งที่ ${attempt}/${maxRetries})`);
                        await new Promise(resolve => setTimeout(resolve, attempt * 2000)); // wait 2s, 4s, 6s...
                        continue;
                    } else {
                        throw new Error("เซิร์ฟเวอร์ AI ของ Google ทำงานหนักเกินไปในขณะนี้ โปรดรอสักครู่แล้วพิมพ์ใหม่อีกครั้งครับ");
                    }
                }
                
                console.error("API Error:", errData);
                throw new Error(errMsg || "เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI");
            }

            const data = await response.json();
            let textResponse = data.candidates[0].content.parts[0].text;
            
            // Remove markdown backticks if AI included them
            textResponse = textResponse.replace(/^```json\n?/, '').replace(/```$/, '').trim();
            
            try {
                return JSON.parse(textResponse);
            } catch (parseError) {
                console.error("Failed to parse JSON from AI:", textResponse);
                throw new Error("AI ตอบกลับมาในรูปแบบที่ไม่ถูกต้อง");
            }
        } catch (error) {
            // If it's the last attempt, or it's a specific logical error, throw it immediately
            if (attempt === maxRetries || error.message.includes("รูปแบบที่ไม่ถูกต้อง") || error.message.includes("เกิดข้อผิดพลาด") || error.message.includes("ทำงานหนักเกินไป")) {
                console.error("processUserMessage error:", error);
                throw error;
            }
            // For general fetch network errors, retry
            await new Promise(resolve => setTimeout(resolve, attempt * 1500));
        }
    }
}

window.aiAPI = {
    processUserMessage
};
