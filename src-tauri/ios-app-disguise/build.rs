fn main() {
    tauri_plugin::Builder::new(&["set_alternate_icon"])
        .ios_path("ios")
        .build();
}
