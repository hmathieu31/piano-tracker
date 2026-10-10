use std::sync::Mutex;
use serde::Serialize;
use tauri::{ipc::Channel, AppHandle, State, Url};
use tauri_plugin_updater::{Update, UpdaterExt};

// Rolling release that the PR prerelease workflow points at the most recent PR build.
const PRERELEASE_ENDPOINT: &str =
    "https://github.com/hmathieu31/piano-tracker/releases/download/prerelease-channel/latest.json";

#[derive(Default)]
pub struct PendingUpdate(Mutex<Option<Update>>);

#[derive(Serialize)]
pub struct UpdateInfo {
    version: String,
    body: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data")]
pub enum DownloadEvent {
    #[serde(rename_all = "camelCase")]
    Started { content_length: Option<u64> },
    #[serde(rename_all = "camelCase")]
    Progress { chunk_length: usize },
    Finished,
}

async fn check_stable(app: &AppHandle) -> Result<Option<Update>, String> {
    app.updater().map_err(|e| e.to_string())?
        .check().await.map_err(|e| e.to_string())
}

async fn check_prerelease(app: &AppHandle) -> Result<Option<Update>, String> {
    let url = Url::parse(PRERELEASE_ENDPOINT).map_err(|e| e.to_string())?;
    app.updater_builder()
        .endpoints(vec![url]).map_err(|e| e.to_string())?
        .build().map_err(|e| e.to_string())?
        .check().await.map_err(|e| e.to_string())
}

/// Picks the higher version of two candidate updates.
fn newest(a: Option<Update>, b: Option<Update>) -> Option<Update> {
    match (a, b) {
        (Some(a), Some(b)) => {
            let b_is_newer = matches!(
                (semver::Version::parse(&a.version), semver::Version::parse(&b.version)),
                (Ok(va), Ok(vb)) if vb > va
            );
            Some(if b_is_newer { b } else { a })
        }
        (a, b) => a.or(b),
    }
}

/// In prerelease mode both the stable and the prerelease channel are checked, so a
/// stable release that supersedes the last PR build is still offered. A missing or
/// broken prerelease channel never blocks stable updates.
#[tauri::command]
pub async fn check_for_update(
    app: AppHandle,
    pending: State<'_, PendingUpdate>,
    prerelease: bool,
) -> Result<Option<UpdateInfo>, String> {
    let stable = check_stable(&app).await;
    let update = if prerelease {
        match (stable, check_prerelease(&app).await) {
            (Ok(s), Ok(p)) => newest(s, p),
            (Ok(s), Err(e)) => {
                eprintln!("Prerelease update check failed: {e}");
                s
            }
            (Err(_), Ok(p)) => p,
            (Err(e), Err(_)) => return Err(e),
        }
    } else {
        stable?
    };

    let info = update.as_ref().map(|u| UpdateInfo { version: u.version.clone(), body: u.body.clone() });
    *pending.0.lock().unwrap() = update;
    Ok(info)
}

#[tauri::command]
pub async fn install_update(
    pending: State<'_, PendingUpdate>,
    on_event: Channel<DownloadEvent>,
) -> Result<(), String> {
    let update = pending.0.lock().unwrap().take().ok_or("No update is pending")?;
    let mut started = false;
    update
        .download_and_install(
            |chunk_length, content_length| {
                if !started {
                    let _ = on_event.send(DownloadEvent::Started { content_length });
                    started = true;
                }
                let _ = on_event.send(DownloadEvent::Progress { chunk_length });
            },
            || {
                let _ = on_event.send(DownloadEvent::Finished);
            },
        )
        .await
        .map_err(|e| e.to_string())
}
