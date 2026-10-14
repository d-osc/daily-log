use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::Path;
use std::thread;
use std::time::Duration;

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

/// Write note contents to a user-chosen path (picked via the save dialog).
/// A command is used instead of the fs plugin so any path the user picks works
/// without widening the fs permission scope.
#[tauri::command]
fn export_markdown(path: String, contents: String) -> Result<(), String> {
    fs::write(&path, contents).map_err(err)
}

// ---- Custom notes-folder commands (arbitrary paths, app-trusted) ----

#[tauri::command]
fn fs_read_dir_md(folder: String) -> Result<Vec<String>, String> {
    let mut names = Vec::new();
    for entry in fs::read_dir(&folder).map_err(err)? {
        let entry = entry.map_err(err)?;
        let name = entry.file_name().to_string_lossy().to_string();
        if entry.file_type().map_err(err)?.is_file() && name.to_lowercase().ends_with(".md") {
            names.push(name);
        }
    }
    names.sort();
    Ok(names)
}

#[tauri::command]
fn fs_read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(err)
}

#[tauri::command]
fn fs_write_file(path: String, contents: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    fs::write(&path, contents).map_err(err)
}

#[tauri::command]
fn fs_rename_file(old_path: String, new_path: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&new_path).parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    fs::rename(&old_path, &new_path).map_err(err)
}

#[tauri::command]
fn fs_remove_file(path: String) -> Result<(), String> {
    fs::remove_file(&path).map_err(err)
}

#[tauri::command]
fn fs_path_exists(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).exists())
}

// ---- Google OAuth loopback receiver ----

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out: Vec<u8> = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                if let Ok(hex) = std::str::from_utf8(&bytes[i + 1..i + 3]) {
                    if let Ok(byte) = u8::from_str_radix(hex, 16) {
                        out.push(byte);
                        i += 3;
                        continue;
                    }
                }
                out.push(bytes[i]);
                i += 1;
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).to_string()
}

fn extract_query_param(req: &str, key: &str) -> Option<String> {
    let first_line = req.lines().next()?;
    let query = first_line.split_once('?')?.1;
    for pair in query.split(&[' ', '&'][..]) {
        if let Some((k, v)) = pair.split_once('=') {
            if k == key {
                return Some(percent_decode(v));
            }
        }
    }
    None
}

const OAUTH_SUCCESS_PAGE: &str = concat!(
    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n",
    "<html><body style=\"font-family:sans-serif;text-align:center;padding:48px\">",
    "<h2>&#10004; เชื่อมต่อสำเร็จ</h2>",
    "<p>ปิดหน้านี้แล้วกลับไปที่แอป Daily Log ได้เลย</p></body></html>"
);

/// Bind a loopback listener and wait (up to 5 minutes) for the OAuth redirect
/// carrying ?code=..., then hand the code back to the frontend.
#[tauri::command]
async fn oauth_wait_for_code(port: u16) -> Result<String, String> {
    let (tx, rx) = std::sync::mpsc::channel::<Result<String, String>>();
    thread::spawn(move || {
        let result = (|| -> Result<String, String> {
            let listener = TcpListener::bind(("127.0.0.1", port)).map_err(err)?;
            for _ in 0..5 {
                let (mut stream, _) = listener.accept().map_err(err)?;
                let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
                let mut buf = [0u8; 8192];
                let n = stream.read(&mut buf).map_err(err)?;
                let req = String::from_utf8_lossy(&buf[..n]).to_string();
                let _ = stream.write_all(OAUTH_SUCCESS_PAGE.as_bytes());
                let _ = stream.flush();
                if let Some(code) = extract_query_param(&req, "code") {
                    return Ok(code);
                }
                if extract_query_param(&req, "error").is_some() {
                    return Err("การอนุญาตถูกปฏิเสธ".into());
                }
            }
            Err("ไม่พบรหัสยืนยันในคำขอ".into())
        })();
        let _ = tx.send(result);
    });
    rx.recv_timeout(Duration::from_secs(300))
        .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            export_markdown,
            fs_read_dir_md,
            fs_read_file,
            fs_write_file,
            fs_rename_file,
            fs_remove_file,
            fs_path_exists,
            oauth_wait_for_code
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
