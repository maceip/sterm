use std::sync::atomic::{AtomicU32, Ordering};

// The shared buffer and control index
// In a 2GB app, we keep this static to avoid fragmentation
static mut SHARED_BUFFER: [u8; 1024 * 1024] = [0; 1024 * 1024];
static CONTROL_INDEX: AtomicU32 = AtomicU32::new(0);

#[no_mangle]
pub unsafe extern "C" fn get_shared_buffer_ptr() -> *const u8 {
    SHARED_BUFFER.as_ptr()
}

#[no_mangle]
pub unsafe extern "C" fn get_control_ptr() -> *const AtomicU32 {
    &CONTROL_INDEX
}

#[no_mangle]
pub unsafe extern "C" fn process_command(ptr: *const u8, len: usize) {
    let input = std::slice::from_raw_parts(ptr, len);
    
    // Simulate some "Elite" processing
    let response = format!("WASM_EXEC: processed {} bytes\r\n", input.len());
    let resp_bytes = response.as_bytes();

    // Zero-copy write into the shared buffer
    let current_idx = CONTROL_INDEX.load(Ordering::SeqCst) as usize;
    let end_idx = current_idx + resp_bytes.len();
    
    if end_idx < 1024 * 1024 {
        SHARED_BUFFER[current_idx..end_idx].copy_from_slice(resp_bytes);
        // Signal to JS that 'end_idx' bytes are now ready
        CONTROL_INDEX.store(end_idx as u32, Ordering::SeqCst);
    }
}
