import pandas as pd
import requests
import json
from tqdm import tqdm

# Load your human dataset
df = pd.read_csv('pantip_dataset.csv')

def generate_from_ollama(prompt_text):
    url = "http://localhost:11434/api/generate"
    # ปรับ Prompt ให้เจนภาษาไทยปนอังกฤษ (Code-switching) ตามงานวิจัยของคุณ
    full_prompt = f"""
    คุณคือ User ใน Pantip ที่ชอบพิมพ์ไทยสลับอังกฤษแบบธรรมชาติ ห้ามแปลข้อความ และห้ามมีส่วนเกริ่นนำ
    
    ตัวอย่างสไตล์ที่ต้องการ:
    "สวัสดี gang! วันนี้ผมมาแชร์ประสบการณ์ WFH 100% ครับ จริงๆ อยากไป office มากๆ เพราะอยากเรียนรู้ culture ของบริษัท Anyway, ผมว่าเรื่อง Environment สำคัญมาก มันคือ keys to success เลยครับ"
    
    จงเขียนโพสต์ใหม่ในหัวข้อนี้ (ห้ามแปลต้นฉบับ ให้แต่งเรื่องใหม่ที่เกี่ยวข้อง):
    หัวข้อ: {prompt_text}
    
    กฎ:
    1. ห้ามเขียนคำว่า "Here is your post" หรือ "Translation"
    2. ต้องเป็นภาษาไทย 80% และมีศัพท์อังกฤษปนแค่บางคำ (Code-switching)
    3. ห้ามแปลข้อความต้นฉบับเป็นภาษาอังกฤษ
    """
    
    payload = {
        "model": "llama3",
        "prompt": full_prompt,
        "stream": False,
        "options": {
            "temperature": 0.9, # เพิ่มความสร้างสรรค์ไม่ให้มันลอกต้นฉบับ
            "top_p": 0.9
        }
    }
    
    try:
        response = requests.post(url, json=payload)
        return response.json().get('response', "").strip()
    except Exception as e:
        return f"Error: {e}"

# สร้าง List เก็บข้อมูลใหม่
ai_data = []

print(f"Starting AI generation for {len(df)} topics...")

for index, row in tqdm(df.iterrows(), total=len(df)):
    ai_text = generate_from_ollama(row['text'])
    
    # สร้าง DataFrame แถวเดียวสำหรับข้อมูลที่เพิ่งได้มา
    new_row = pd.DataFrame([{
        'topic_id': row['topic_id'],
        'text': ai_text,
        'label': 'AI'
    }])
    
    # บันทึกต่อท้ายไฟล์ (Append) ไปเรื่อยๆ
    # ถ้าเป็นแถวแรก (index 0) ให้เขียน Header ด้วย ถ้าไม่ใช่ไม่ต้องเขียน
    new_row.to_csv('ai_generated_dataset_full.csv', 
                   mode='a' if index > 0 else 'w', 
                   header=True if index == 0 else False, 
                   index=False, 
                   encoding='utf-8-sig')

print("\nProcess completed or stopped. Check 'ai_generated_dataset_full.csv'")