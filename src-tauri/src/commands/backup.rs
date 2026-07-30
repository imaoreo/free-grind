//! Native backup/restore for the local chat database.
//!
//! Replaces the old all-JS export (one giant JSON file with photos/videos
//! base64-embedded inline in the rows) with a zip archive built directly in
//! Rust: SQL reads, base64 decode, and compression all happen natively
//! instead of crossing the JS<->WebView IPC bridge as multi-hundred-MB text.
//!
//! Archive layout (version 2):
//!   manifest.json        - { version, exportedAt, ownerUserId, categories }
//!   tables/<name>.jsonl   - one JSON object per row, ORDER BY the table's primary key
//!                           (only present for tables whose category was selected)
//!   media/<n>.bin         - raw bytes for each blob column, referenced from its
//!                           row as { "$mediaRef": "media/<n>.bin" } instead of
//!                           inlining base64 text
//!
//! `categories` lets the caller include/exclude whole groups of tables
//! (chat messages, media/albums, saved phrases, saved locations, settings,
//! sexual health - see `BACKUP_CATEGORY_IDS` in `src/services/backupRestore.ts`)
//! instead of always doing a full all-or-nothing export/import.
//!
//! Blob columns (data_base64 etc.) are stored as base64 TEXT in the sqlite
//! schema itself, so export decodes them once here and stores raw bytes
//! (Stored, uncompressed - photos/video are already compressed); import
//! re-encodes them back to base64 text to match the existing column type.

use std::fs::File;
use std::io::{BufRead, BufReader, BufWriter, Read, Write};

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use serde_json::{json, Map, Value};
use tauri::{AppHandle, Emitter, Manager};
use zip::result::ZipError;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::error::AppError;

const BACKUP_VERSION: i64 = 2;
const EXPORT_PROGRESS_EVENT: &str = "backup-export-progress";
const IMPORT_PROGRESS_EVENT: &str = "backup-import-progress";
const PROGRESS_EVERY_N_ROWS: u64 = 200;

struct TableSpec {
    name: &'static str,
    primary_key: &'static str,
    /// One of the user-facing backup categories (see `BACKUP_CATEGORIES` in
    /// `src/services/backupRestore.ts`) - lets export/import include or skip
    /// whole groups of tables together instead of always doing all-or-nothing.
    category: &'static str,
    columns: &'static [&'static str],
    blob_columns: &'static [&'static str],
}

/// Mirrors `FULL_EXPORT_TABLES` in `src/services/chatDb.ts` exactly, including
/// the deliberate omission of `album_media.position` (a real schema column
/// that the JS export has never included) - keep behavior identical.
const EXPORT_TABLES: &[TableSpec] = &[
    TableSpec {
        name: "conversations",
        primary_key: "conversation_id",
        category: "chat_messages",
        columns: &[
            "conversation_id",
            "other_profile_id",
            "name",
            "participants_json",
            "last_activity_timestamp",
            "unread_count",
            "pinned",
            "muted",
            "favorite",
            "preview_json",
            "archived",
            "archived_reason",
            "archived_at",
            "hidden",
            "last_seen_in_inbox_at",
            "created_at",
            "updated_at",
        ],
        blob_columns: &[],
    },
    TableSpec {
        name: "conversation_meta",
        primary_key: "conversation_id",
        category: "chat_messages",
        columns: &["conversation_id", "last_read_timestamp"],
        blob_columns: &[],
    },
    TableSpec {
        name: "messages",
        primary_key: "message_id",
        category: "chat_messages",
        columns: &[
            "message_id",
            "conversation_id",
            "sender_id",
            "timestamp",
            "type",
            "chat1_type",
            "body_json",
            "unsent",
            "local_history",
            "reply_to_message_id",
            "reply_preview_json",
            "reactions_json",
            "created_at",
            "updated_at",
        ],
        blob_columns: &[],
    },
    TableSpec {
        name: "media_files",
        primary_key: "media_key",
        category: "media_albums",
        columns: &[
            "media_key",
            "conversation_id",
            "message_id",
            "kind",
            "mime_type",
            "data_base64",
            "view_once",
            "size_bytes",
            "fetch_status",
            "fetched_at",
        ],
        blob_columns: &["data_base64"],
    },
    TableSpec {
        name: "albums",
        primary_key: "album_id",
        category: "media_albums",
        columns: &[
            "album_id",
            "owner_profile_id",
            "album_name",
            "conversation_id",
            "shared_via_message_id",
            "preview_cover_base64",
            "preview_cover_mime_type",
            "created_at",
            "updated_at",
        ],
        blob_columns: &["preview_cover_base64"],
    },
    TableSpec {
        name: "album_media",
        primary_key: "content_id",
        category: "media_albums",
        columns: &[
            "content_id",
            "album_id",
            "content_type",
            "data_base64",
            "thumb_data_base64",
            "remaining_views",
            "is_viewable",
            "fetched_at",
        ],
        blob_columns: &["data_base64", "thumb_data_base64"],
    },
    TableSpec {
        name: "avatars",
        primary_key: "media_hash",
        category: "media_albums",
        columns: &["media_hash", "data_base64", "mime_type", "fetched_at"],
        blob_columns: &["data_base64"],
    },
    TableSpec {
        name: "settings",
        primary_key: "key",
        category: "settings",
        columns: &["key", "value"],
        blob_columns: &[],
    },
    TableSpec {
        name: "saved_phrases",
        primary_key: "phrase",
        category: "saved_phrases",
        columns: &["phrase", "created_at"],
        blob_columns: &[],
    },
    TableSpec {
        name: "saved_locations",
        primary_key: "id",
        category: "saved_locations",
        columns: &["id", "name", "geohash", "lat", "lon", "created_at"],
        blob_columns: &[],
    },
    TableSpec {
        name: "sexual_health_prep_doses",
        primary_key: "id",
        category: "sexual_health",
        columns: &["id", "taken_at", "scheme", "dose_role", "note", "created_at"],
        blob_columns: &[],
    },
    TableSpec {
        name: "sexual_health_encounters",
        primary_key: "id",
        category: "sexual_health",
        columns: &[
            "id",
            "occurred_at",
            "profile_id",
            "display_name",
            "tags_json",
            "note",
            "conversation_id",
            "created_at",
        ],
        blob_columns: &[],
    },
    TableSpec {
        name: "sexual_health_appointments",
        primary_key: "id",
        category: "sexual_health",
        columns: &[
            "id",
            "title",
            "scheduled_at",
            "kind",
            "location",
            "note",
            "completed_at",
            "created_at",
        ],
        blob_columns: &[],
    },
    TableSpec {
        name: "sexual_health_sti_tests",
        primary_key: "id",
        category: "sexual_health",
        columns: &["id", "tested_at", "test_type", "result", "note", "created_at"],
        blob_columns: &[],
    },
];

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportProgress<'a> {
    table: &'a str,
    table_index: usize,
    table_count: usize,
    rows_done: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportProgress<'a> {
    table: &'a str,
    table_index: usize,
    table_count: usize,
    rows_done: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOutcome {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    rows_imported: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<&'static str>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInspection {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    categories: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    exported_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<&'static str>,
}

/// Falls back to this if an archive's manifest predates the `categories`
/// field (shouldn't happen in practice - export always writes it now - but
/// costs nothing to handle gracefully rather than hide every table).
const ALL_CATEGORY_IDS: &[&str] =
    &["chat_messages", "media_albums", "saved_phrases", "saved_locations", "settings", "sexual_health"];

enum ManifestCheck {
    Valid { categories: Vec<String>, exported_at: i64 },
    Invalid(&'static str),
}

/// Shared by `inspect_backup_file` and `import_backup_from_file` so the
/// version/owner validation rules can't drift between the two.
fn read_and_validate_manifest(
    archive: &mut ZipArchive<BufReader<File>>,
    owner_user_id: i64,
) -> Result<ManifestCheck, AppError> {
    let manifest: Value = {
        let mut manifest_file = archive
            .by_name("manifest.json")
            .map_err(|_| AppError::Backup("archive is missing manifest.json".into()))?;
        let mut text = String::new();
        manifest_file.read_to_string(&mut text)?;
        match serde_json::from_str(&text) {
            Ok(value) => value,
            Err(_) => return Ok(ManifestCheck::Invalid("invalid_format")),
        }
    };

    let version = manifest.get("version").and_then(Value::as_i64);
    if version != Some(BACKUP_VERSION) {
        return Ok(ManifestCheck::Invalid("invalid_format"));
    }
    let manifest_owner = manifest.get("ownerUserId").and_then(Value::as_i64);
    if manifest_owner != Some(owner_user_id) {
        return Ok(ManifestCheck::Invalid("wrong_owner"));
    }

    let exported_at = manifest.get("exportedAt").and_then(Value::as_i64).unwrap_or(0);
    let categories = manifest
        .get("categories")
        .and_then(Value::as_array)
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(str::to_string)).collect())
        .unwrap_or_else(|| ALL_CATEGORY_IDS.iter().map(|s| s.to_string()).collect());

    Ok(ManifestCheck::Valid { categories, exported_at })
}

fn resolve_db_path(app: &AppHandle, db_file_name: &str) -> Result<std::path::PathBuf, AppError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Backup(format!("failed to resolve app data dir: {e}")))?;
    Ok(dir.join(db_file_name))
}

fn sql_value_to_json(row: &rusqlite::Row, idx: usize) -> Result<Value, AppError> {
    use rusqlite::types::ValueRef;
    let value_ref = row.get_ref(idx)?;
    Ok(match value_ref {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => json!(i),
        ValueRef::Real(f) => json!(f),
        ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).into_owned()),
        ValueRef::Blob(b) => Value::String(BASE64.encode(b)),
    })
}

fn json_to_rusqlite(value: &Value) -> Result<rusqlite::types::Value, AppError> {
    Ok(match value {
        Value::Null => rusqlite::types::Value::Null,
        Value::Bool(b) => rusqlite::types::Value::Integer(if *b { 1 } else { 0 }),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                rusqlite::types::Value::Integer(i)
            } else if let Some(u) = n.as_u64() {
                rusqlite::types::Value::Integer(u as i64)
            } else if let Some(f) = n.as_f64() {
                rusqlite::types::Value::Real(f)
            } else {
                return Err(AppError::Backup("unsupported number value in row".into()));
            }
        }
        Value::String(s) => rusqlite::types::Value::Text(s.clone()),
        Value::Array(_) | Value::Object(_) => {
            return Err(AppError::Backup("unsupported nested value in row".into()));
        }
    })
}

fn build_upsert_sql(table: &TableSpec) -> String {
    let cols_csv = table.columns.join(", ");
    let placeholders = (1..=table.columns.len())
        .map(|i| format!("?{i}"))
        .collect::<Vec<_>>()
        .join(", ");
    let update_set = table
        .columns
        .iter()
        .copied()
        .filter(|&c| c != table.primary_key)
        .map(|c| format!("{c} = excluded.{c}"))
        .collect::<Vec<_>>()
        .join(", ");
    format!(
        "INSERT INTO {} ({cols_csv}) VALUES ({placeholders}) ON CONFLICT({}) DO UPDATE SET {update_set}",
        table.name, table.primary_key
    )
}

#[tauri::command]
pub fn export_backup_to_file(
    app: AppHandle,
    db_file_name: String,
    owner_user_id: i64,
    dest_path: String,
    categories: Vec<String>,
) -> Result<(), AppError> {
    let db_path = resolve_db_path(&app, &db_file_name)?;
    let conn = Connection::open_with_flags(&db_path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;

    let selected_tables: Vec<&TableSpec> = EXPORT_TABLES
        .iter()
        .filter(|t| categories.iter().any(|c| c == t.category))
        .collect();

    let file = File::create(&dest_path)?;
    let mut zip = ZipWriter::new(BufWriter::new(file));
    let text_options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    let blob_options = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);

    zip.start_file("manifest.json", text_options)?;
    let manifest = json!({
        "version": BACKUP_VERSION,
        "exportedAt": chrono::Utc::now().timestamp_millis(),
        "ownerUserId": owner_user_id,
        "categories": categories,
    });
    zip.write_all(manifest.to_string().as_bytes())?;

    let mut media_counter: u64 = 0;
    let table_count = selected_tables.len();

    for (table_index, table) in selected_tables.into_iter().enumerate() {
        let entry_name = format!("tables/{}.jsonl", table.name);
        zip.start_file(&entry_name, text_options)?;

        let select_sql = format!(
            "SELECT {} FROM {} ORDER BY {}",
            table.columns.join(", "),
            table.name,
            table.primary_key
        );
        let mut stmt = conn
            .prepare(&select_sql)
            .map_err(|e| AppError::Backup(format!("failed to query {}: {e}", table.name)))?;
        let mut rows = stmt
            .query([])
            .map_err(|e| AppError::Backup(format!("failed to query {}: {e}", table.name)))?;

        let mut rows_done: u64 = 0;
        while let Some(row) = rows
            .next()
            .map_err(|e| AppError::Backup(format!("failed to read row from {}: {e}", table.name)))?
        {
            let mut obj = Map::new();
            for (col_index, col) in table.columns.iter().copied().enumerate() {
                let is_blob = table.blob_columns.contains(&col);
                if is_blob {
                    let value: Option<String> = row
                        .get(col_index)
                        .map_err(|e| AppError::Backup(format!("failed to read {}.{col}: {e}", table.name)))?;
                    match value {
                        Some(b64_text) => {
                            let bytes = BASE64.decode(b64_text.as_bytes()).map_err(|e| {
                                AppError::Backup(format!("invalid base64 in {}.{col}: {e}", table.name))
                            })?;
                            let media_path = format!("media/{media_counter}.bin");
                            media_counter += 1;
                            zip.start_file(&media_path, blob_options)?;
                            zip.write_all(&bytes)?;
                            obj.insert(col.to_string(), json!({ "$mediaRef": media_path }));
                        }
                        None => {
                            obj.insert(col.to_string(), Value::Null);
                        }
                    }
                } else {
                    obj.insert(col.to_string(), sql_value_to_json(row, col_index)?);
                }
            }

            zip.write_all(Value::Object(obj).to_string().as_bytes())?;
            zip.write_all(b"\n")?;

            rows_done += 1;
            if rows_done % PROGRESS_EVERY_N_ROWS == 0 {
                let _ = app.emit(
                    EXPORT_PROGRESS_EVENT,
                    ExportProgress { table: table.name, table_index, table_count, rows_done },
                );
            }
        }

        let _ = app.emit(
            EXPORT_PROGRESS_EVENT,
            ExportProgress { table: table.name, table_index, table_count, rows_done },
        );
    }

    zip.finish()?;
    Ok(())
}

#[tauri::command]
pub fn inspect_backup_file(src_path: String, owner_user_id: i64) -> Result<BackupInspection, AppError> {
    let file = File::open(&src_path)?;
    let mut archive = ZipArchive::new(BufReader::new(file))?;

    Ok(match read_and_validate_manifest(&mut archive, owner_user_id)? {
        ManifestCheck::Invalid(error) => BackupInspection { ok: false, categories: None, exported_at: None, error: Some(error) },
        ManifestCheck::Valid { categories, exported_at } => {
            BackupInspection { ok: true, categories: Some(categories), exported_at: Some(exported_at), error: None }
        }
    })
}

#[tauri::command]
pub fn import_backup_from_file(
    app: AppHandle,
    db_file_name: String,
    owner_user_id: i64,
    src_path: String,
    categories: Vec<String>,
) -> Result<ImportOutcome, AppError> {
    let db_path = resolve_db_path(&app, &db_file_name)?;

    let file = File::open(&src_path)?;
    let mut archive = ZipArchive::new(BufReader::new(file))?;

    match read_and_validate_manifest(&mut archive, owner_user_id)? {
        ManifestCheck::Invalid(error) => {
            return Ok(ImportOutcome { ok: false, rows_imported: None, error: Some(error) });
        }
        ManifestCheck::Valid { .. } => {}
    }

    let selected_tables: Vec<&TableSpec> = EXPORT_TABLES
        .iter()
        .filter(|t| categories.iter().any(|c| c == t.category))
        .collect();

    let mut conn = Connection::open(&db_path)?;
    conn.execute_batch("PRAGMA busy_timeout = 5000;")?;
    let tx = conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;

    let mut total_rows_imported: u64 = 0;
    let table_count = selected_tables.len();

    for (table_index, table) in selected_tables.into_iter().enumerate() {
        let entry_name = format!("tables/{}.jsonl", table.name);
        let lines: Vec<String> = match archive.by_name(&entry_name) {
            Ok(entry) => BufReader::new(entry).lines().collect::<std::io::Result<Vec<_>>>()?,
            Err(ZipError::FileNotFound) => Vec::new(),
            Err(e) => return Err(e.into()),
        };

        let upsert_sql = build_upsert_sql(table);
        let mut rows_done: u64 = 0;

        for line in lines {
            if line.trim().is_empty() {
                continue;
            }
            let row_value: Value = serde_json::from_str(&line)
                .map_err(|e| AppError::Backup(format!("corrupt row in {}: {e}", table.name)))?;
            let Value::Object(mut row_map) = row_value else {
                continue;
            };

            let pk_present = row_map.get(table.primary_key).map(|v| !v.is_null()).unwrap_or(false);
            if !pk_present {
                continue;
            }

            for blob_col in table.blob_columns.iter().copied() {
                let resolved = match row_map.get(blob_col) {
                    Some(Value::Object(ref_obj)) => {
                        let media_path = ref_obj.get("$mediaRef").and_then(Value::as_str).ok_or_else(|| {
                            AppError::Backup(format!("missing $mediaRef in {}.{blob_col}", table.name))
                        })?;
                        let mut media_file = archive.by_name(media_path)?;
                        let mut bytes = Vec::new();
                        media_file.read_to_end(&mut bytes)?;
                        Value::String(BASE64.encode(bytes))
                    }
                    Some(Value::Null) | None => Value::Null,
                    Some(_) => {
                        return Err(AppError::Backup(format!(
                            "unexpected value for blob column {}.{blob_col}",
                            table.name
                        )));
                    }
                };
                row_map.insert(blob_col.to_string(), resolved);
            }

            let params = table
                .columns
                .iter()
                .copied()
                .map(|c| json_to_rusqlite(row_map.get(c).unwrap_or(&Value::Null)))
                .collect::<Result<Vec<_>, AppError>>()?;

            tx.execute(&upsert_sql, rusqlite::params_from_iter(params.iter()))?;

            rows_done += 1;
            total_rows_imported += 1;
            if rows_done % PROGRESS_EVERY_N_ROWS == 0 {
                let _ = app.emit(
                    IMPORT_PROGRESS_EVENT,
                    ImportProgress { table: table.name, table_index, table_count, rows_done },
                );
            }
        }

        let _ = app.emit(
            IMPORT_PROGRESS_EVENT,
            ImportProgress { table: table.name, table_index, table_count, rows_done },
        );
    }

    tx.commit()?;

    Ok(ImportOutcome { ok: true, rows_imported: Some(total_rows_imported), error: None })
}
