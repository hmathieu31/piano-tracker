# Piano Tracker — Production build launcher
# Ensures the correct Rust toolchain (rustup 1.94) is used, not the old Chocolatey cargo.
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
npm run tauri build
