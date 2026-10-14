# Daily Log 🗓️

แอปจดบันทึกงานบนเดสก์ท็อป (Tauri v2 + TypeScript + React) — ทุกงานคือไฟล์ `.md` หนึ่งไฟล์ จัดการผ่านหน้าปฏิทิน

## คุณสมบัติ

- **หน้าแรกเป็นปฏิทินรายเดือน** — แต่ละวันแสดงงาน (chip สีตามประเภท) ที่มีอยู่ในวันนั้น
- **กดเข้าไปในวัน** → แสดงการ์ดงานทุกงานของวันนั้น
- **Add** = สร้างไฟล์ `.md` ใหม่, **Edit** = แก้ไขไฟล์, **Delete** = ลบไฟล์ (มี dialog ยืนยัน)
- **กดเข้าการ์ดงาน** → ดู preview ของ Markdown + metadata + ปุ่มแก้ไข/ลบ
- **ดาวน์โหลด .md** — ส่งออกงานเป็นไฟล์ (ในแอปใช้ native save dialog, ในเบราว์เซอร์เป็น blob download) มีปุ่มทั้งบนการ์ดงานและหน้า preview
- **นำเข้า (upload) ไฟล์ .md** — เลือกไฟล์ .md หลายไฟล์เข้ามาเป็นงานได้เลย ถ้าไฟล์ไม่มี Name/Date ระบบเติมให้อัตโนมัติ (ชื่อจากชื่อไฟล์, วันที่จากวันที่กำลังดูอยู่) มีปุ่มทั้งบนปฏิทินและหน้ารายการงานของวัน
- **วันที่ได้หลายวัน** — งานหนึ่งงานเพิ่มวันที่ได้หลายวัน (เช่น งาน A ทำวันที่ 18, 21, 22, 25) แล้วงานจะขึ้นบนปฏิทินทุกวันที่เลือก เก็บในไฟล์เป็น `Date: 2026-09-18,2026-09-21,2026-09-22,2026-09-25`
- กำหนด **หัวข้อ (Name), Date, Description, Type, Tag** ผ่านฟอร์ม และเขียนเนื้อหาเป็น Markdown ได้ โดย Type เป็นประเภทให้เลือกจาก dropdown: **ทำงานปกติ (น้ำเงิน), วันหยุด (แดง), ลา (ส้ม)** แต่ละประเภทมีสีประจำบน badge และ chip ของปฏิทิน
- **สถิติรายเดือนตามประเภท** — แถบใต้ปฏิทินสรุปจำนวนงานแต่ละประเภทในเดือนนั้น (ทำงานปกติ/วันหยุด/ลา อื่น ๆ)
- **ค้นหาและกรอง** — ช่องค้นหาค้นจากชื่อ คำอธิบาย แท็ก และเนื้อหา · ตัวกรองตามประเภท (dropdown) · กดแท็กในผลค้นหาเพื่อกรองด้วยแท็กนั้น
- **Drag & drop ไฟล์ .md** มาที่หน้าต่างเพื่อนำเข้า (เติม Name/Date ที่ขาดให้อัตโนมัติเหมือนปุ่มนำเข้า)
- **ถังขยะ** — การลบคือย้ายไปถังขยะ (`notes/.trash`) กู้คืนได้ หรือลบถาวร/ล้างทั้งหมดได้จากหน้าถังขยะ (ปุ่มใน toolbar ของปฏิทิน)
- **วันที่ได้หลายวัน + Status/Environment ต่อวัน** — งานหนึ่งงานเพิ่มวันที่ได้หลายวัน และแต่ละวันตั้ง **Status** (เช่น develop, support) และ **Environment** (เช่น develop, sit, pvt, release) ของตัวเองได้ หน้ารายการงานของวันจะแสดง badge ของวันนั้น ๆ เก็บในไฟล์แบบ:
  ```md
  Date: 2026-09-18,2026-09-21
  Status: develop,support
  Environment: develop,pvt
  ```
- **Markdown editor ในฟอร์มเนื้อหา** — toolbar จัดรูปแบบ (หัวข้อ/ตัวหนา/ตัวเอียง/ขีดฆ่า/รายการ/เช็คลิสต์/อ้างอิง/โค้ด/ลิงก์/ตาราง/เส้นคั่น) ทำงานกับข้อความที่เลือก, กดซ้ำเพื่อถอดรูปแบบ, รองรับ Ctrl+Z, กด Tab = ย่อหน้า และมีปุ่มดูตัวอย่างสดแบบแยกหน้าจอ
- **เลือกโฟลเดอร์เก็บไฟล์เองได้** (Settings → โฟลเดอร์เก็บไฟล์) — ชี้ไปที่โฟลเดอร์ Google Drive for Desktop / Dropbox / OneDrive ก็ sync ข้ามเครื่องได้เลย ไม่ต้องตั้งค่าอะไรเพิ่ม
- **Google Drive (สำรอง/กู้คืน)** — login บัญชี Google ในแอปแล้วสำรองโน้ตขึ้นโฟลเดอร์ "Daily Log" บน Drive หรือกู้คืนกลับเครื่อง ต้องสร้าง OAuth credential ก่อนครั้งเดียว:
  1. เปิด [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials) (สร้าง/เลือก project ใดก็ได้)
  2. ที่ **OAuth consent screen** เลือก External → กรอกชื่อแอป + อีเมล → หน้า Test users ให้ **Add users** เพิ่มอีเมล Google ตัวเอง
  3. ที่ **Credentials → Create credentials → OAuth client ID** เลือกประเภท **Desktop app** → สร้าง
  4. คัดลอก **Client ID** และ **Client Secret** มาวางใน Settings ของแอป แล้วกด "เชื่อมต่อบัญชี Google"
  (Desktop client รองรับ redirect ไป `http://localhost` อัตโนมัติ ไม่ต้องตั้งค่า redirect URI)
- **หน้าตั้งค่า** (ปุ่มเฟืองในแถบซ้าย) — เพิ่ม/ลบ **ประเภทงาน, สถานะ (Status) และ Environment** เองได้
- **Dark mode** — ปุ่มพระจันทร์/พระอาทิตย์มุมขวาบน จำค่าที่เลือกไว้ ครั้งแรกตามธีมของระบบ
- **Keyboard shortcuts** — `Esc` ปิด dialog, `Ctrl+S` บันทึกในหน้าแก้ไข, `←`/`→` เปลี่ยนเดือน, `t` กลับเดือนปัจจุบัน (บนหน้าปฏิทิน)
- ชื่อไฟล์สร้างอัตโนมัติจากวันที่ + ชื่องาน เช่น `2026-09-18-example.md` (แก้ชื่อ/วันที่แล้วระบบ rename ไฟล์ให้)

## รูปแบบไฟล์ .md

```md
---
Name: Example
Description: Example
Type:
Tag: test,job
Date: 2026-09-18,2026-09-21
---

เนื้อหา markdown ของงาน...
```

## การรัน

ต้องมี [Node.js](https://nodejs.org) 18+ และ [Rust](https://rustup.rs) (Tauri ต้องใช้ toolchain Rust)

```bash
npm install

# รันแอป desktop (dev)
npm run tauri dev

# build ตัวติดตั้ง (ผลลัพธ์อยู่ใน src-tauri/target/release/bundle/)
npm run tauri build
```

> ระหว่างพัฒนา UI ฝ่ายหน้า สามารถรัน `npm run dev` ในเบราว์เซอร์ได้เลย
> (โหมดนี้เก็บไฟล์ใน localStorage แทนดิสก์ เพื่อให้ทดสอบ UI โดยไม่ต้องเปิด Tauri)

## ที่เก็บไฟล์ .md

แอปเก็บโน้ตไว้ที่โฟลเดอร์ `notes` ใน AppData ของแอป:

- **Windows:** `%APPDATA%\com.ondev.daily-log\notes`
- **macOS:** `~/Library/Application Support/com.ondev.daily-log/notes`
- **Linux:** `~/.config/com.ondev.daily-log/notes`

หยิบไฟล์ไปแชร์/แก้ด้วย editor อื่นได้เลย แอปอ่านทุกไฟล์ `.md` ในโฟลเดอร์นี้ตอนเปิด

## โครงสร้างโปรเจกต์

```
src/                  # frontend (React + TypeScript)
  lib/frontmatter.ts  # parse/serialize ส่วนหัวของไฟล์ .md
  lib/notes.ts        # storage: Tauri fs plugin (+ fallback localStorage ตอน dev ในเบราว์เซอร์)
  components/         # Calendar, DayView, NoteView, NoteEditor, ...
src-tauri/            # backend Tauri v2 (Rust) + capabilities
```
