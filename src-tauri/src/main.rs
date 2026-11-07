// Prevents an extra console window on Windows release builds; harmless on Linux.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if let Some(code) = tempo_lib::run_claude_hook(&args) {
        std::process::exit(code);
    }
    tempo_lib::run()
}
