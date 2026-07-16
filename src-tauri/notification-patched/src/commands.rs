// Copyright 2019-2023 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT

use serde::Deserialize;
use tauri::{command, plugin::PermissionState, AppHandle, Runtime, State};

use crate::{ActiveNotification, Notification, NotificationData, Result};

#[command]
pub(crate) async fn is_permission_granted<R: Runtime>(
    _app: AppHandle<R>,
    notification: State<'_, Notification<R>>,
) -> Result<Option<bool>> {
    let state = notification.permission_state()?;
    match state {
        PermissionState::Granted => Ok(Some(true)),
        PermissionState::Denied => Ok(Some(false)),
        PermissionState::Prompt | PermissionState::PromptWithRationale => Ok(None),
    }
}

#[command]
pub(crate) async fn request_permission<R: Runtime>(
    _app: AppHandle<R>,
    notification: State<'_, Notification<R>>,
) -> Result<PermissionState> {
    notification.request_permission()
}

#[command]
pub(crate) async fn notify<R: Runtime>(
    _app: AppHandle<R>,
    notification: State<'_, Notification<R>>,
    options: NotificationData,
) -> Result<()> {
    let mut builder = notification.builder();
    builder.data = options;
    builder.show()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ActiveNotificationRef {
    id: i32,
    #[cfg_attr(mobile, allow(dead_code))]
    tag: Option<String>,
}

#[command]
pub(crate) async fn get_active<R: Runtime>(
    _app: AppHandle<R>,
    notification: State<'_, Notification<R>>,
) -> Result<Vec<ActiveNotification>> {
    notification.active()
}

// mobile's `Notification` keeps its own long-standing `remove_active(Vec<i32>)`
// / `remove_all_active()` split (tied to its `run_mobile_plugin` JSON shape);
// desktop's newer history-backed implementation unifies both into one
// `remove_active(Option<Vec<(id, tag)>>)` call — bridged here per-platform
// rather than reshaping either `Notification` impl to match the other.
#[cfg(desktop)]
#[command]
pub(crate) async fn remove_active<R: Runtime>(
    _app: AppHandle<R>,
    notification: State<'_, Notification<R>>,
    notifications: Option<Vec<ActiveNotificationRef>>,
) -> Result<()> {
    notification.remove_active(
        notifications.map(|items| items.into_iter().map(|item| (item.id, item.tag)).collect()),
    )
}

#[cfg(mobile)]
#[command]
pub(crate) async fn remove_active<R: Runtime>(
    _app: AppHandle<R>,
    notification: State<'_, Notification<R>>,
    notifications: Option<Vec<ActiveNotificationRef>>,
) -> Result<()> {
    match notifications {
        Some(items) => {
            notification.remove_active(items.into_iter().map(|item| item.id).collect())
        }
        None => notification.remove_all_active(),
    }
}
