"""Shared generation prompts for the 3-vendor AI corpus (GPT / Gemini / DeepSeek+Qwen).

Used IDENTICALLY by every vendor generator so the classifier learns each
vendor's writing *style*, not differences in how we prompted them.

Persona is generalized (plain Thai news editor, no tech/foreign skew) because
the source corpus spans diverse topics (Sanook general news + The Standard).

Two modes per article:
  - polish : rewrite/clean the human article  -> needs {human_text}
  - pure   : write a fresh article from a headline -> needs {title}
"""

POLISHED_PROMPT_TMPL = """คุณคือบรรณาธิการข่าวมืออาชีพระดับสำนักข่าวชั้นนำของไทย
ภารกิจ: เรียบเรียงและขัดเกลาข่าวต่อไปนี้ใหม่ ให้กระชับ อ่านง่าย และมีโทนเป็นทางการมากขึ้น

ข้อกำหนด:
- คงข้อเท็จจริง ตัวเลข วันเวลา ชื่อบุคคล ชื่อสถานที่ และรายละเอียดสำคัญให้ตรงกับต้นฉบับทุกประการ
- ห้ามเพิ่มข้อมูลใหม่ที่ไม่ได้อยู่ในต้นฉบับ
- ใช้ภาษาไทยที่เป็นธรรมชาติของผู้สื่อข่าวมืออาชีพ
- ห้ามใส่คำนำหน้า เช่น "นี่คือข่าวที่เรียบเรียงใหม่" หรือคำอธิบายใดๆ ส่งคืนเฉพาะเนื้อข่าวที่ขัดเกลาแล้ว
- ห้ามใช้สัญลักษณ์ Markdown ในการจัดรูปแบบข้อความเด็ดขาด (เช่น ห้ามใช้ ** หรือ *)

ต้นฉบับ:
\"\"\"
{human_text}
\"\"\"
"""

PURE_PROMPT_TMPL = """คุณคือผู้สื่อข่าวมืออาชีพชาวไทย
ภารกิจ: เขียนบทความข่าวขึ้นใหม่ทั้งหมดเป็นภาษาไทย โดยใช้เพียงหัวข้อข่าวด้านล่างเป็นแรงบันดาลใจ

ข้อกำหนด:
- เขียนเป็นภาษาไทยธรรมชาติแบบสำนักข่าว
- โครงสร้างแบบข่าว: ย่อหน้าเปิด สรุปประเด็นหลัก รายละเอียดเพิ่มเติม และย่อหน้าปิด
- ความยาวประมาณ 200-400 คำ
- ห้ามใส่หัวข้อซ้ำ ห้ามใส่คำนำหน้าหรือคำอธิบายนอกตัวบทข่าว ส่งคืนเฉพาะเนื้อข่าว
- ห้ามใช้สัญลักษณ์ Markdown ในการจัดรูปแบบข้อความเด็ดขาด (เช่น ห้ามใช้ ** หรือ *)

หัวข้อข่าว: {title}
"""

GENERATION_TEMPERATURE = 0.8


def build_prompt(mode: str, title: str, human_text: str) -> str:
    """Return the filled prompt for the given mode ('polish' or 'pure')."""
    if mode == "polish":
        return POLISHED_PROMPT_TMPL.format(human_text=human_text)
    if mode == "pure":
        return PURE_PROMPT_TMPL.format(title=title)
    raise ValueError(f"unknown mode: {mode!r} (expected 'polish' or 'pure')")
